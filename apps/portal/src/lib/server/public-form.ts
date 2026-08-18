import { createHash, createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDatabase } from '@ja/database';
import { newId } from '@ja/domain';
import type { ZodType } from 'zod';
import { json, type RequestEvent } from '@sveltejs/kit';

const requests = new Map<string, number[]>();
const allowedOrigins = () =>
  new Set(
    (
      process.env.JA_ALLOWED_ORIGINS ??
      'http://localhost:5173,http://localhost:5174,https://gex-dashboard.hopto.org'
    )
      .split(',')
      .map((value) => value.trim()),
  );

export async function acceptPublicForm(event: RequestEvent, kind: string, schema: ZodType) {
  const origin = event.request.headers.get('origin');
  if (!origin || !allowedOrigins().has(origin))
    return json({ error: 'Origin denied' }, { status: 403 });
  const length = Number(event.request.headers.get('content-length') ?? 0);
  if (length > 32_768) return json({ error: 'Payload too large' }, { status: 413 });
  const client = event.getClientAddress();
  const now = Date.now();
  const recent = (requests.get(client) ?? []).filter((time) => now - time < 10 * 60_000);
  if (recent.length >= 5)
    return json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'retry-after': '600' } },
    );
  recent.push(now);
  requests.set(client, recent);
  const result = schema.safeParse(await event.request.json().catch(() => null));
  if (!result.success)
    return json(
      {
        error: 'Invalid form data',
        fields: result.error.issues.map((issue) => issue.path.join('.')),
      },
      { status: 400 },
    );
  const value = result.data as Record<string, unknown>;
  if (value.website) return json({ accepted: true }, { status: 202 });
  delete value.website;
  const id = newId();
  const createdAt = new Date().toISOString();
  const secret = process.env.JA_AUTH_SECRET ?? 'development-source-hash';
  const sourceHash = createHmac('sha256', secret).update(client).digest('hex');
  const payload = JSON.stringify(value);
  const path = process.env.JA_DATABASE_PATH ?? './data/app.db';
  mkdirSync(dirname(path), { recursive: true });
  const { sqlite } = createDatabase(path);
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite
      .prepare(
        'INSERT INTO public_inquiry(id,kind,payload_json,source_hash,created_at) VALUES(?,?,?,?,?)',
      )
      .run(id, kind, payload, sourceHash, createdAt);
    sqlite
      .prepare(
        'INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        'public-inquiry.received',
        id,
        createHash('sha256').update(`${kind}:${id}`).digest('hex'),
        JSON.stringify({ inquiryId: id, kind }),
        createdAt,
        createdAt,
      );
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  } finally {
    sqlite.close();
  }
  return json({ accepted: true, inquiryId: id }, { status: 202 });
}
