import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@ja/domain';
import {
  HEAD,
  GET,
} from '../../apps/portal/src/routes/app/api/help/owner-tutorial/[asset]/+server.ts';
import { load as helpLoad } from '../../apps/portal/src/routes/app/help/+page.server.ts';
import {
  availableOwnerTutorial,
  parseOwnerTutorialByteRange,
} from '../../apps/portal/src/lib/server/owner-tutorial.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
} from '../fixtures/b5-lifecycle-security-fixture.js';

type Fixture = ReturnType<typeof createB5LifecycleSecurityFixture>;
type TutorialRequestEvent = Parameters<typeof GET>[0];
let fixture: Fixture;
let originalDatabasePath: string | undefined;
let originalTutorialDirectory: string | undefined;
let tutorialDirectory: string;
const videoBytes = Buffer.from('0123456789', 'ascii');

beforeEach(() => {
  fixture = createB5LifecycleSecurityFixture();
  originalDatabasePath = process.env.JA_DATABASE_PATH;
  originalTutorialDirectory = process.env.JA_OWNER_TUTORIAL_DIR;
  process.env.JA_DATABASE_PATH = join(fixture.directory, 'app.db');
  tutorialDirectory = join(fixture.directory, 'tutorial-assets');
  mkdirSync(tutorialDirectory);
  writeFileSync(join(tutorialDirectory, 'owner-tutorial.mp4'), videoBytes);
  writeFileSync(join(tutorialDirectory, 'owner-tutorial.vtt'), 'WEBVTT\n\n');
  writeFileSync(join(tutorialDirectory, 'poster.webp'), Buffer.from('webp-test-image'));
  process.env.JA_OWNER_TUTORIAL_DIR = tutorialDirectory;
});

afterEach(() => {
  if (originalDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = originalDatabasePath;
  if (originalTutorialDirectory === undefined) delete process.env.JA_OWNER_TUTORIAL_DIR;
  else process.env.JA_OWNER_TUTORIAL_DIR = originalTutorialDirectory;
  closeB5LifecycleSecurityFixture(fixture);
});

function event(
  principal: Principal | undefined,
  asset = 'video.mp4',
  method: 'GET' | 'HEAD' = 'GET',
  range?: string,
  displayedRole = principal?.role,
  ifRange?: string,
  signal?: AbortSignal,
): TutorialRequestEvent {
  const headers = new Headers();
  if (range) headers.set('range', range);
  if (ifRange) headers.set('if-range', ifRange);
  const requestInit: RequestInit = { method, headers };
  if (signal) requestInit.signal = signal;
  const request = new Request(
    `http://localhost/j-aautomation/app/api/help/owner-tutorial/${asset}`,
    requestInit,
  );
  return {
    locals: principal
      ? {
          user: {
            id: principal.userId,
            name: principal.userId,
            email: `${principal.userId}@example.test`,
            role: displayedRole,
            status: 'active',
          },
          session: {
            id: principal.sessionId,
            userId: principal.userId,
            expiresAt: new Date(Date.now() + 60_000),
          },
          correlationId: 'owner-tutorial-test',
        }
      : { user: null, session: null, correlationId: 'owner-tutorial-test' },
    params: { asset },
    request,
    url: new URL(request.url),
  } as TutorialRequestEvent;
}

function supplierProfile(userId: string): void {
  const at = new Date().toISOString();
  fixture.sqlite
    .prepare(
      "INSERT OR IGNORE INTO supplier(id,name,status,created_at,updated_at) VALUES('tutorial-supplier','Tutorial Supplier','active',?,?)",
    )
    .run(at, at);
  fixture.sqlite
    .prepare(
      'INSERT INTO supplier_user_profile(user_id,supplier_id,profile,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile=excluded.profile,updated_at=excluded.updated_at',
    )
    .run(userId, 'tutorial-supplier', 'supplier_coordinator', at, at);
}

describe('Owner tutorial protected media boundary', () => {
  it('streams an Owner video, supports byte ranges, and returns equivalent HEAD headers', async () => {
    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'media');

    const full = await GET(event(owner));
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('video/mp4');
    expect(full.headers.get('content-length')).toBe(String(videoBytes.byteLength));
    expect(full.headers.get('accept-ranges')).toBe('bytes');
    expect(full.headers.get('cache-control')).toBe('private, no-store');
    expect(full.headers.get('x-content-type-options')).toBe('nosniff');
    expect(full.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(Buffer.from(await full.arrayBuffer())).toEqual(videoBytes);

    const closed = await GET(event(owner, 'video.mp4', 'GET', 'bytes=2-5'));
    expect(closed.status).toBe(206);
    expect(closed.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(closed.headers.get('content-length')).toBe('4');
    expect(Buffer.from(await closed.arrayBuffer())).toEqual(Buffer.from('2345'));

    const suffix = await GET(event(owner, 'video.mp4', 'GET', 'bytes=-3'));
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get('content-range')).toBe('bytes 7-9/10');
    expect(Buffer.from(await suffix.arrayBuffer())).toEqual(Buffer.from('789'));

    const openEnded = await GET(event(owner, 'video.mp4', 'GET', 'bytes=6-'));
    expect(openEnded.status).toBe(206);
    expect(openEnded.headers.get('content-range')).toBe('bytes 6-9/10');
    expect(Buffer.from(await openEnded.arrayBuffer())).toEqual(Buffer.from('6789'));

    const clamped = await GET(event(owner, 'video.mp4', 'GET', 'bytes=8-99'));
    expect(clamped.status).toBe(206);
    expect(clamped.headers.get('content-range')).toBe('bytes 8-9/10');
    expect(Buffer.from(await clamped.arrayBuffer())).toEqual(Buffer.from('89'));

    const head = await HEAD(event(owner, 'video.mp4', 'HEAD', 'bytes=-3'));
    expect(head.status).toBe(200);
    expect(head.headers.get('content-range')).toBeNull();
    expect(head.headers.get('content-length')).toBe('10');
    expect(await head.text()).toBe('');

    const ifRange = await GET(
      event(owner, 'video.mp4', 'GET', 'bytes=2-5', undefined, '"old-validator"'),
    );
    expect(ifRange.status).toBe(200);
    expect(ifRange.headers.get('content-range')).toBeNull();
    expect(Buffer.from(await ifRange.arrayBuffer())).toEqual(videoBytes);

    const fullHead = await HEAD(event(owner, 'video.mp4', 'HEAD'));
    expect(fullHead.status).toBe(200);
    expect(fullHead.headers.get('content-length')).toBe('10');
    expect(await fullHead.text()).toBe('');
  });

  it('returns 401 for missing, revoked, and inactive sessions, then 404 for other personas', async () => {
    expect((await GET(event(undefined))).status).toBe(401);
    expect((await HEAD(event(undefined, 'poster.webp', 'HEAD'))).status).toBe(401);

    const revoked = stepUpB5Principal(fixture.sqlite, fixture.owner, 'revoked-media');
    fixture.sqlite.prepare('DELETE FROM session WHERE id=?').run(revoked.sessionId);
    expect((await GET(event(revoked))).status).toBe(401);

    const inactive = stepUpB5Principal(fixture.sqlite, fixture.manager, 'inactive-media');
    fixture.sqlite.prepare("UPDATE user SET status='suspended' WHERE id=?").run(inactive.userId);
    expect((await GET(event(inactive))).status).toBe(401);
    fixture.sqlite.prepare("UPDATE user SET status='active' WHERE id=?").run(inactive.userId);

    const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'worker-media');
    expect((await GET(event(worker))).status).toBe(404);
    expect((await GET(event(worker, 'unknown.mp4'))).status).toBe(404);
    expect(
      (await GET(event(worker, '../owner-tutorial.mp4', 'GET', undefined, 'owner_admin'))).status,
    ).toBe(404);

    supplierProfile(fixture.owner.userId);
    const restrictedOwner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'restricted-owner');
    expect((await GET(event(restrictedOwner))).status).toBe(404);
  });

  it('returns a response safely when the request was already aborted before streaming', async () => {
    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'already-aborted-media');
    const controller = new AbortController();
    controller.abort();

    const response = await GET(
      event(owner, 'video.mp4', 'GET', undefined, undefined, undefined, controller.signal),
    );

    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();
    await response.body?.cancel().catch(() => undefined);
  });

  it('blocks unknown and path-like asset names and reports unsatisfiable ranges', async () => {
    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'invalid-assets');
    for (const asset of [
      'missing.mp4',
      '../owner-tutorial.mp4',
      'video.mp4/../../secret',
      '/etc/passwd',
      'owner-tutorial.mp4',
    ]) {
      expect((await GET(event(owner, asset))).status, asset).toBe(404);
    }

    for (const range of ['bytes=10-', 'bytes=-0', 'bytes=9-3', 'bytes=bad', 'bytes=0-1,4-5']) {
      const response = await GET(event(owner, 'video.mp4', 'GET', range));
      expect(response.status, range).toBe(416);
      expect(response.headers.get('content-range')).toBe('bytes */10');
      expect(response.headers.get('content-length')).toBe('0');
      expect(await response.text()).toBe('');
    }

    const unsupportedUnit = await GET(event(owner, 'video.mp4', 'GET', 'items=0-1'));
    expect(unsupportedUnit.status).toBe(200);
    expect(Buffer.from(await unsupportedUnit.arrayBuffer())).toEqual(videoBytes);
  });

  it('exposes chapter metadata only to Owner when all protected assets are available', async () => {
    expect(availableOwnerTutorial()).toMatchObject({
      title: 'Owner tutorial',
      durationSeconds: 5253.7,
      audioLanguage: 'en',
      captionsLanguage: 'en',
      chapters: expect.arrayContaining([
        { id: '01-intro', title: 'Training case and tutorial scope', startSeconds: 0 },
        {
          id: '24-owner-checklist',
          title: 'Owner completion checklist and handoff',
          startSeconds: 5130.166666666667,
        },
      ]),
    });
    expect(availableOwnerTutorial()?.chapters).toHaveLength(24);
    expect(JSON.stringify(availableOwnerTutorial())).not.toContain(tutorialDirectory);

    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'help-metadata');
    const ownerPage = await helpLoad({
      locals: event(owner).locals,
      parent: async () => ({ locale: 'en' }),
    } as never);
    expect(ownerPage.ownerTutorial?.chapters).toHaveLength(24);

    const worker = stepUpB5Principal(fixture.sqlite, fixture.worker, 'help-no-metadata');
    const workerPage = await helpLoad({
      locals: event(worker).locals,
      parent: async () => ({ locale: 'en' }),
    } as never);
    expect(workerPage.ownerTutorial).toBeNull();

    rmSync(join(tutorialDirectory, 'poster.webp'));
    expect(availableOwnerTutorial()).toBeNull();
  });

  it('uses a bounded file stream instead of loading the video into memory', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'apps/portal/src/routes/app/api/help/owner-tutorial/[asset]/+server.ts'),
      'utf8',
    );
    expect(existsSync(join(process.cwd(), 'apps/portal/src/routes/app/help/owner-tutorial'))).toBe(
      false,
    );
    expect(routeSource).toContain('createReadStream');
    expect(routeSource).toContain('Readable.toWeb');
    expect(routeSource).toContain('highWaterMark: 64 * 1024');
    expect(routeSource).toContain('size: (chunk: Uint8Array) => chunk.byteLength');
    expect(routeSource).not.toMatch(/\b(?:readFile|readFileSync)\s*\(/u);
  });

  it('applies byte-based Web backpressure while the client leaves video unread', async () => {
    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'stalled-reader');
    const fileHandle = await open(join(tutorialDirectory, 'owner-tutorial.mp4'), 'r');
    const fileHandlePrototype = Object.getPrototypeOf(fileHandle) as {
      createReadStream: (...args: never[]) => Readable;
    };
    await fileHandle.close();

    const chunkSize = 64 * 1024;
    const chunkCount = 1024;
    const chunk = Buffer.alloc(chunkSize);
    let producedChunks = 0;
    const source = new Readable({
      read() {
        if (producedChunks === chunkCount) {
          this.push(null);
          return;
        }
        producedChunks += 1;
        this.push(chunk);
      },
    });
    const createReadStream = vi
      .spyOn(fileHandlePrototype, 'createReadStream')
      .mockImplementation(
        () => source as unknown as ReturnType<typeof fileHandlePrototype.createReadStream>,
      );

    try {
      const response = await GET(event(owner));
      expect(response.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // With byte-based sizing only a couple of chunks can queue. Treating each
      // 64 KiB Buffer as one item would let all 64 MiB queue before backpressure.
      expect(producedChunks).toBeLessThan(8);
      expect(source.readableEnded).toBe(false);
      await response.body?.cancel();
    } finally {
      createReadStream.mockRestore();
      if (!source.destroyed) source.destroy();
    }
  });
});

describe('Owner tutorial byte range parser', () => {
  it('handles suffix, open-ended, closed, and clamped ranges', () => {
    expect(parseOwnerTutorialByteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(parseOwnerTutorialByteRange('bytes=6-', 10)).toEqual({ start: 6, end: 9 });
    expect(parseOwnerTutorialByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
    expect(parseOwnerTutorialByteRange('bytes=8-99', 10)).toEqual({ start: 8, end: 9 });
    expect(parseOwnerTutorialByteRange('items=0-1', 10)).toBeNull();
  });

  it('marks malformed, multiple, reversed, zero-suffix, and out-of-file ranges unsatisfiable', () => {
    for (const value of ['bytes=bad', 'bytes=0-1,4-5', 'bytes=9-3', 'bytes=-0', 'bytes=10-']) {
      expect(parseOwnerTutorialByteRange(value, 10), value).toBe('unsatisfiable');
    }
  });
});
