import { createDatabase } from '@ja/database';
import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { createHash } from 'node:crypto';

const STEP_UP_WINDOW_MS = 10 * 60_000;
const STEP_UP_MAX_ATTEMPTS = 5;

type StepUpBucket = Readonly<{ window_started_at: string; request_count: number }>;

function stepUpBucketKey(userId: string, sessionId: string, clientAddress: string): string {
  // The bucket is deliberately namespaced away from login/public-form buckets.
  // Hashing keeps user/session/IP identifiers out of the SQLite key at rest.
  return createHash('sha256')
    .update(`step-up:${userId}:${sessionId}:${clientAddress}`)
    .digest('hex');
}

function retryAfterSeconds(windowStartedAt: string, now: number): number {
  const startedAt = Date.parse(windowStartedAt);
  if (!Number.isFinite(startedAt)) return Math.ceil(STEP_UP_WINDOW_MS / 1000);
  return Math.max(1, Math.ceil((STEP_UP_WINDOW_MS - (now - startedAt)) / 1000));
}

function consumeStepUpAttempt(bucketKey: string, now = Date.now()): number | null {
  const database = createDatabase();
  let committed = false;
  try {
    database.sqlite.exec('BEGIN IMMEDIATE');
    const row = database.sqlite
      .prepare('SELECT window_started_at,request_count FROM rate_limit_bucket WHERE bucket_key=?')
      .get(bucketKey) as StepUpBucket | undefined;
    const windowStartedAt = row ? Date.parse(row.window_started_at) : Number.NaN;
    if (!row || !Number.isFinite(windowStartedAt) || now - windowStartedAt >= STEP_UP_WINDOW_MS) {
      database.sqlite
        .prepare(
          'INSERT INTO rate_limit_bucket(bucket_key,window_started_at,request_count) VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET window_started_at=excluded.window_started_at,request_count=1',
        )
        .run(bucketKey, new Date(now).toISOString());
      database.sqlite.exec('COMMIT');
      committed = true;
      return null;
    }
    if (row.request_count >= STEP_UP_MAX_ATTEMPTS) {
      database.sqlite.exec('COMMIT');
      committed = true;
      return retryAfterSeconds(row.window_started_at, now);
    }
    database.sqlite
      .prepare('UPDATE rate_limit_bucket SET request_count=request_count+1 WHERE bucket_key=?')
      .run(bucketKey);
    database.sqlite.exec('COMMIT');
    committed = true;
    return null;
  } finally {
    if (!committed) {
      try {
        database.sqlite.exec('ROLLBACK');
      } catch {
        // Preserve the original throttle failure.
      }
    }
    database.sqlite.close();
  }
}

function markStepUpSuccess(userId: string, sessionId: string, bucketKey: string): boolean {
  const database = createDatabase();
  let committed = false;
  try {
    database.sqlite.exec('BEGIN IMMEDIATE');
    const steppedAt = new Date().toISOString();
    const updated = database.sqlite
      .prepare(
        'UPDATE session SET step_up_at=?,updated_at=? WHERE id=? AND user_id=? AND expires_at>?',
      )
      .run(steppedAt, steppedAt, sessionId, userId, steppedAt);
    if (updated.changes !== 1) {
      database.sqlite.exec('ROLLBACK');
      committed = true;
      return false;
    }
    // A successful step-up is the only path that clears the dedicated failure
    // bucket. Failed and throttled attempts never touch step_up_at.
    database.sqlite.prepare('DELETE FROM rate_limit_bucket WHERE bucket_key=?').run(bucketKey);
    database.sqlite.exec('COMMIT');
    committed = true;
    return true;
  } finally {
    if (!committed) {
      try {
        database.sqlite.exec('ROLLBACK');
      } catch {
        // Preserve the original session-update failure.
      }
    }
    database.sqlite.close();
  }
}

function clientAddress(getClientAddress: () => string): string {
  try {
    const value = getClientAddress();
    return typeof value === 'string' && value.length > 0 ? value.slice(0, 255) : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const minimumPasswordLength = process.env.NODE_ENV === 'production' ? 12 : 1;
  if (!body || typeof body.password !== 'string' || body.password.length < minimumPasswordLength)
    return json({ error: 'A valid password is required' }, { status: 400 });

  const bucketKey = stepUpBucketKey(
    locals.user.id,
    locals.session.id,
    clientAddress(getClientAddress),
  );
  const retryAfter = consumeStepUpAttempt(bucketKey);
  if (retryAfter !== null)
    return json(
      { error: 'Password verification failed' },
      { status: 429, headers: { 'retry-after': String(retryAfter) } },
    );

  try {
    const result = await auth.api.verifyPassword({
      body: { password: body.password },
      headers: request.headers,
    });
    if (!result.status) return json({ error: 'Password verification failed' }, { status: 401 });
    if (!markStepUpSuccess(locals.user.id, locals.session.id, bucketKey))
      return json({ error: 'Password verification failed' }, { status: 401 });
    return json({ steppedUp: true });
  } catch {
    return json({ error: 'Password verification failed' }, { status: 401 });
  }
};
