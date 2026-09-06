import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';

type AccessErrorConstructor = new (message: string) => Error;

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

export function assertLiveSession(
  sqlite: DatabaseSync,
  principal: Principal,
  AccessError: AccessErrorConstructor,
  nowMs = Date.now(),
): void {
  const sessionId = principal.sessionId?.trim() ?? '';
  if (!sessionId) throw new AccessError('Live authenticated session required');
  const session = sqlite
    .prepare('SELECT expires_at FROM session WHERE user_id=? AND (id=? OR token=?) LIMIT 1')
    .get(principal.userId, sessionId, sessionId) as { expires_at: string } | undefined;
  const expiresAt = session ? Date.parse(session.expires_at.replace(' ', 'T')) : Number.NaN;
  if (!session || !Number.isFinite(expiresAt) || expiresAt <= nowMs)
    throw new AccessError('Live authenticated session required');
}
