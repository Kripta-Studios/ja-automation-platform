import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';

type AccessErrorConstructor = new (message: string) => Error;

export const STEP_UP_WINDOW_MS = 10 * 60_000;

export type SessionStepUpProof = Readonly<{
  verifiedAt: string;
  expiresAt: string;
}>;

type SessionLookup = Pick<DatabaseSync, 'prepare'>;

type SessionStepUpRow = Readonly<{
  step_up_at: string | null;
  expires_at: string;
  created_at: string;
}>;

export function assertActiveAccount(
  sqlite: DatabaseSync,
  principal: Principal,
  AccessError: AccessErrorConstructor,
): void {
  const user = sqlite.prepare('SELECT status FROM user WHERE id=?').get(principal.userId) as
    | { status: string }
    | undefined;
  if (!user || user.status !== 'active') throw new AccessError('Active account required');
}

function parseSessionInstant(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  return Date.parse(value.replace(' ', 'T'));
}

function readBoundSession(
  sqlite: SessionLookup,
  principal: Principal,
): SessionStepUpRow | undefined {
  const sessionId = principal.sessionId?.trim() ?? '';
  if (!sessionId) return undefined;
  return sqlite
    .prepare(
      'SELECT step_up_at,expires_at,created_at FROM session WHERE user_id=? AND (id=? OR token=?) LIMIT 1',
    )
    .get(principal.userId, sessionId, sessionId) as SessionStepUpRow | undefined;
}

/**
 * A live authenticated session is full authority until it expires.
 * Mid-session password re-authentication (step-up) is not used for any role.
 */
export function readLiveSessionStepUp(
  sqlite: SessionLookup,
  principal: Principal,
  nowMs = Date.now(),
  _windowMs = STEP_UP_WINDOW_MS,
): SessionStepUpProof | null {
  if (!principal.sessionId) return null;
  const session = readBoundSession(sqlite, principal);
  if (!session) return null;
  const sessionExpiresMs = parseSessionInstant(session.expires_at);
  if (Number.isFinite(sessionExpiresMs) && sessionExpiresMs <= nowMs) return null;

  const verifiedAt =
    session.created_at && Number.isFinite(parseSessionInstant(session.created_at))
      ? session.created_at
      : new Date(nowMs).toISOString();
  return { verifiedAt, expiresAt: session.expires_at };
}

export function assertRecentStepUp(
  sqlite: DatabaseSync,
  principal: Principal,
  AccessError: AccessErrorConstructor,
): void {
  if (!readLiveSessionStepUp(sqlite, principal))
    throw new AccessError('Recent step-up authentication is required');
}
