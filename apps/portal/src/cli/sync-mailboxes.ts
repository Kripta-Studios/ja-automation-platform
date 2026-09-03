import { CANONICAL_OWNER_EMAIL, PortalRepository, createDatabase } from '@ja/database';
import { bootstrapMailboxUsers } from '../lib/server/mail-directory.ts';

const sessionId = process.env.JA_MAIL_SYNC_SESSION_ID?.trim();
if (!sessionId) throw new Error('JA_MAIL_SYNC_SESSION_ID_REQUIRED');

const database = createDatabase();
try {
  const owner = database.sqlite
    .prepare("SELECT id FROM user WHERE lower(email)=? AND role='owner_admin' AND status='active'")
    .get(CANONICAL_OWNER_EMAIL) as { id: string } | undefined;
  if (!owner) throw new Error('CANONICAL_OWNER_REQUIRED');
  const session = database.sqlite
    .prepare('SELECT step_up_at,expires_at FROM session WHERE id=? AND user_id=?')
    .get(sessionId, owner.id) as { step_up_at: string | null; expires_at: string } | undefined;
  const steppedAt = session?.step_up_at ? Date.parse(session.step_up_at) : Number.NaN;
  const expiresAt = session?.expires_at ? Date.parse(session.expires_at) : Number.NaN;
  if (
    !Number.isFinite(steppedAt) ||
    Date.now() - steppedAt > 10 * 60_000 ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  )
    throw new Error('RECENT_OWNER_STEP_UP_REQUIRED');
  const principal = new PortalRepository(database.sqlite).principalFor(owner.id, sessionId);
  const result = await bootstrapMailboxUsers(database.sqlite, principal);
  process.stdout.write(
    `${JSON.stringify({ ok: true, created: result.created, updated: result.updated, unchanged: result.unchanged })}\n`,
  );
} finally {
  database.sqlite.close();
}
