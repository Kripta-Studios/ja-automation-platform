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

export function assertRecentStepUp(
  sqlite: DatabaseSync,
  principal: Principal,
  AccessError: AccessErrorConstructor,
): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (principal.isServiceActor) return;
  if (!principal.sessionId) throw new AccessError('Recent step-up authentication is required');
  const session = sqlite
    .prepare('SELECT step_up_at FROM session WHERE id=? AND user_id=? AND expires_at>?')
    .get(principal.sessionId, principal.userId, new Date().toISOString()) as
    | { step_up_at: string | null }
    | undefined;
  if (!session?.step_up_at || Date.now() - Date.parse(session.step_up_at) > 10 * 60_000)
    throw new AccessError('Recent step-up authentication is required');
}
