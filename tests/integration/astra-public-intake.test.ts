import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import { aquarexInquirySchema, contactSchema } from '@ja/schemas';
import type { RequestEvent } from '@sveltejs/kit';
import { acceptPublicForm } from '../../apps/portal/src/lib/server/public-form.ts';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const roots: string[] = [];
const environmentNames = [
  'JA_DATABASE_PATH',
  'JA_AUTH_SECRET',
  'JA_ALLOWED_ORIGINS',
  'NODE_ENV',
] as const;
const previousEnvironment = new Map<string, string | undefined>();
let restoreDeploymentIdentity: (() => void) | undefined;

beforeEach(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
  for (const name of environmentNames) previousEnvironment.set(name, process.env[name]);
  const root = mkdtempSync(join(tmpdir(), 'ja-astra-public-intake-'));
  roots.push(root);
  process.env.JA_DATABASE_PATH = join(root, 'app.db');
  process.env.JA_AUTH_SECRET = 'test-only-public-intake-secret-with-32-bytes';
  process.env.JA_ALLOWED_ORIGINS = 'http://localhost:5173';
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  for (const name of environmentNames) {
    const value = previousEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  previousEnvironment.clear();
  restoreDeploymentIdentity?.();
  restoreDeploymentIdentity = undefined;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const aquarexPayload = (changes: Record<string, unknown> = {}) => ({
  name: 'Aquarex Requester',
  company: 'Example Plant',
  email: 'requester@example.com',
  phone: '',
  site: 'Example Plant, Ohio',
  message: 'Please share the Aquarex technical information for this application.',
  website: '',
  ...changes,
});

const eventFor = (
  payload: unknown,
  options: Readonly<{ key?: string; client?: string }> = {},
): RequestEvent => {
  const headers = new Headers({
    origin: 'http://localhost:5173',
    'content-type': 'application/json',
  });
  if (options.key) headers.set('idempotency-key', options.key);
  return {
    request: new Request('http://localhost/j-aautomation/api/public/aquarex', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }),
    getClientAddress: () => options.client ?? '198.51.100.14',
  } as unknown as RequestEvent;
};

const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

describe('Aquarex public intake durability', () => {
  it('replays the original inquiry for a same-key retry and rejects payload reuse', async () => {
    const key = 'aquarex-browser-request-0001';
    const first = await acceptPublicForm(
      eventFor(aquarexPayload(), { key }),
      'aquarex',
      aquarexInquirySchema,
    );
    const firstBody = await readJson(first);
    expect(first.status).toBe(202);
    expect(firstBody.accepted).toBe(true);
    expect(firstBody.replayed).toBeUndefined();

    const replay = await acceptPublicForm(
      eventFor(aquarexPayload(), { key }),
      'aquarex',
      aquarexInquirySchema,
    );
    const replayBody = await readJson(replay);
    expect(replay.status).toBe(202);
    expect(replayBody).toMatchObject({
      accepted: true,
      inquiryId: firstBody.inquiryId,
      replayed: true,
    });

    const conflict = await acceptPublicForm(
      eventFor(aquarexPayload({ company: 'Different Plant' }), { key }),
      'aquarex',
      aquarexInquirySchema,
    );
    expect(conflict.status).toBe(409);

    const database = createDatabase(process.env.JA_DATABASE_PATH).sqlite;
    try {
      expect(
        database.prepare("SELECT count(*) count FROM public_inquiry WHERE kind='aquarex'").get(),
      ).toEqual({
        count: 1,
      });
      const event = database
        .prepare('SELECT idempotency_key,payload_json FROM outbox_event WHERE topic=?')
        .get('public-inquiry.received') as { idempotency_key: string; payload_json: string };
      expect(event.idempotency_key).toMatch(/^[a-f0-9]{64}$/u);
      expect(JSON.parse(event.payload_json)).toMatchObject({
        inquiryId: firstBody.inquiryId,
        kind: 'aquarex',
        payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
    } finally {
      database.close();
    }
  });

  it('keeps contact submissions independent when no idempotency key is supplied', async () => {
    const payload = {
      name: 'Contact Requester',
      company: 'Example Plant',
      email: 'contact@example.com',
      phone: '',
      site: 'Example Plant, Ohio',
      industry: 'Food and beverage',
      projectType: 'Controls upgrade',
      platform: 'PLC',
      preferredContact: 'email',
      message: 'Please contact us about a controls upgrade.',
      website: '',
    };
    const first = await acceptPublicForm(eventFor(payload), 'project-inquiry', contactSchema);
    const second = await acceptPublicForm(eventFor(payload), 'project-inquiry', contactSchema);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect((await readJson(first)).inquiryId).not.toBe((await readJson(second)).inquiryId);

    const database = createDatabase(process.env.JA_DATABASE_PATH).sqlite;
    try {
      expect(database.prepare('SELECT count(*) count FROM public_inquiry').get()).toEqual({
        count: 2,
      });
    } finally {
      database.close();
    }
  });

  it('scopes Aquarex keys by source and rejects unbounded keys', async () => {
    const key = 'aquarex-browser-request-0002';
    const first = await acceptPublicForm(
      eventFor(aquarexPayload(), { key, client: '198.51.100.14' }),
      'aquarex',
      aquarexInquirySchema,
    );
    const second = await acceptPublicForm(
      eventFor(aquarexPayload(), { key, client: '198.51.100.15' }),
      'aquarex',
      aquarexInquirySchema,
    );
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect((await readJson(first)).inquiryId).not.toBe((await readJson(second)).inquiryId);

    const tooLong = await acceptPublicForm(
      eventFor(aquarexPayload(), { key: 'x'.repeat(201) }),
      'aquarex',
      aquarexInquirySchema,
    );
    expect(tooLong.status).toBe(400);

    const database = createDatabase(process.env.JA_DATABASE_PATH).sqlite;
    try {
      expect(
        database.prepare("SELECT count(*) count FROM public_inquiry WHERE kind='aquarex'").get(),
      ).toEqual({
        count: 2,
      });
    } finally {
      database.close();
    }
  });

  it('returns a controlled rate-limit response without closing the database early', async () => {
    const responses = [] as Response[];
    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await acceptPublicForm(
          eventFor(aquarexPayload({ email: `requester-${index}@example.com` })),
          'aquarex',
          aquarexInquirySchema,
        ),
      );
    }
    expect(responses.slice(0, 5).every((response) => response.status === 202)).toBe(true);
    expect(responses[5].status).toBe(429);
    expect(responses[5].headers.get('retry-after')).toBe('600');

    const database = createDatabase(process.env.JA_DATABASE_PATH).sqlite;
    try {
      expect(database.prepare('SELECT count(*) count FROM public_inquiry').get()).toEqual({
        count: 5,
      });
    } finally {
      database.close();
    }
  });
});
