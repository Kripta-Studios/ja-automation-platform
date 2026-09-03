import { createDatabase } from '@ja/database';
import { createHash } from 'node:crypto';
import { auth } from './auth';

const STEP_UP_WINDOW_MS = 10 * 60_000;
const STEP_UP_MAX_ATTEMPTS = 5;

type StepUpBucket = Readonly<{ window_started_at: string; request_count: number }>;

export type StepUpConfirmation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; status: 400 | 401 | 429; retryAfter?: number }>;

function stepUpBucketKey(userId: string, sessionId: string, clientAddress: string): string {
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

export function stepUpClientAddress(getClientAddress: () => string): string {
  try {
    const value = getClientAddress();
    return typeof value === 'string' && value.length > 0 ? value.slice(0, 255) : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function stepUpMinimumPasswordLength(): number {
  // This verifies an existing credential. Legacy Stalwart passwords may be
  // shorter than the policy for newly-created passwords, so creation/change
  // boundaries enforce that policy while step-up only rejects an empty value.
  return 1;
}

export async function confirmStepUpPassword(input: {
  userId: string;
  sessionId: string;
  password: string;
  headers: Headers;
  clientAddress: string;
}): Promise<StepUpConfirmation> {
  if (
    input.password.length < stepUpMinimumPasswordLength() ||
    input.password.length > 128 ||
    /[\0\r\n]/u.test(input.password)
  )
    return { ok: false, status: 400 };
  const bucketKey = stepUpBucketKey(input.userId, input.sessionId, input.clientAddress);
  const retryAfter = consumeStepUpAttempt(bucketKey);
  if (retryAfter !== null) return { ok: false, status: 429, retryAfter };
  try {
    const result = await auth.api.verifyPassword({
      body: { password: input.password },
      headers: input.headers,
    });
    if (!result.status) return { ok: false, status: 401 };
    if (!markStepUpSuccess(input.userId, input.sessionId, bucketKey))
      return { ok: false, status: 401 };
    return { ok: true };
  } catch {
    return { ok: false, status: 401 };
  }
}
