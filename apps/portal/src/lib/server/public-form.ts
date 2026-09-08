import { createHash, createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDatabase } from '@ja/database';
import { newId } from '@ja/domain';
import type { ZodType } from 'zod';
import { json, type RequestEvent } from '@sveltejs/kit';

const allowedOrigins = () =>
  new Set(
    (
      process.env.JA_ALLOWED_ORIGINS ??
      'http://localhost:5173,http://localhost:5174,https://gex-dashboard.hopto.org'
    )
      .split(',')
      .map((value) => value.trim()),
  );

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
};

const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value));

const readIdempotencyKey = (event: RequestEvent, kind: string): string | undefined => {
  if (kind !== 'aquarex') return undefined;
  const value = event.request.headers.get('idempotency-key')?.trim();
  if (!value) return undefined;
  if (value.length < 16 || value.length > MAX_IDEMPOTENCY_KEY_LENGTH || /[\0\r\n]/u.test(value))
    throw new Error('Invalid idempotency key');
  return value;
};

export async function acceptPublicForm(event: RequestEvent, kind: string, schema: ZodType) {
  const origin = event.request.headers.get('origin');
  if (!origin || !allowedOrigins().has(origin))
    return json({ error: 'Origin denied' }, { status: 403 });
  const length = Number(event.request.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > 32_768)
    return json({ error: 'Payload too large' }, { status: 413 });
  const client = event.getClientAddress();
  const rawBody = await event.request.text().catch(() => '');
  if (new TextEncoder().encode(rawBody).byteLength > 32_768)
    return json({ error: 'Payload too large' }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }
  const result = schema.safeParse(body);
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
  let clientRequestKey: string | undefined;
  try {
    clientRequestKey = readIdempotencyKey(event, kind);
  } catch {
    return json({ error: 'Invalid idempotency key' }, { status: 400 });
  }
  const id = newId();
  const createdAt = new Date().toISOString();
  const secret = process.env.JA_AUTH_SECRET ?? 'development-source-hash';
  const sourceHash = createHmac('sha256', secret).update(client).digest('hex');
  const bucketKey = createHmac('sha256', secret).update(`public:${kind}:${client}`).digest('hex');
  const payload = JSON.stringify(value);
  const payloadHash = createHash('sha256').update(canonicalJson(value)).digest('hex');
  const scopedIdempotencyKey = clientRequestKey
    ? createHmac('sha256', secret)
        .update(`public-idempotency:${kind}:${sourceHash}:${clientRequestKey}`)
        .digest('hex')
    : undefined;
  const path = process.env.JA_DATABASE_PATH ?? './data/app.db';
  mkdirSync(dirname(path), { recursive: true });
  const { sqlite } = createDatabase(path);
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    if (scopedIdempotencyKey) {
      const existing = sqlite
        .prepare(
          `SELECT o.aggregate_id,pi.payload_json
             FROM outbox_event o
             JOIN public_inquiry pi ON pi.id=o.aggregate_id
            WHERE o.topic='public-inquiry.received' AND o.idempotency_key=?`,
        )
        .get(scopedIdempotencyKey) as { aggregate_id: string; payload_json: string } | undefined;
      if (existing) {
        const existingPayloadHash = createHash('sha256')
          .update(canonicalJson(JSON.parse(existing.payload_json)))
          .digest('hex');
        if (existingPayloadHash !== payloadHash) {
          sqlite.exec('ROLLBACK');
          return json(
            { error: 'Idempotency key was already used for different form data' },
            { status: 409 },
          );
        }
        sqlite.exec('COMMIT');
        return json(
          { accepted: true, inquiryId: existing.aggregate_id, replayed: true },
          { status: 202 },
        );
      }
    }
    const nowMs = Date.now();
    const bucket = sqlite
      .prepare('SELECT window_started_at,request_count FROM rate_limit_bucket WHERE bucket_key=?')
      .get(bucketKey) as { window_started_at: string; request_count: number } | undefined;
    const windowStarted = bucket ? Date.parse(bucket.window_started_at) : Number.NaN;
    if (
      bucket &&
      Number.isFinite(windowStarted) &&
      nowMs - windowStarted < 10 * 60_000 &&
      bucket.request_count >= 5
    ) {
      sqlite.exec('ROLLBACK');
      return json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'retry-after': '600' } },
      );
    }
    if (!bucket || !Number.isFinite(windowStarted) || nowMs - windowStarted >= 10 * 60_000)
      sqlite
        .prepare(
          'INSERT INTO rate_limit_bucket(bucket_key,window_started_at,request_count) VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET window_started_at=excluded.window_started_at,request_count=1',
        )
        .run(bucketKey, createdAt);
    else
      sqlite
        .prepare('UPDATE rate_limit_bucket SET request_count=request_count+1 WHERE bucket_key=?')
        .run(bucketKey);
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
        scopedIdempotencyKey ?? createHash('sha256').update(`${kind}:${id}`).digest('hex'),
        JSON.stringify({ inquiryId: id, kind, ...(scopedIdempotencyKey ? { payloadHash } : {}) }),
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
