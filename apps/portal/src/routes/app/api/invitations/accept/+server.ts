import { createHash } from 'node:crypto';
import { createDatabase } from '@ja/database';
import { invitationAcceptSchema } from '@ja/schemas';
import { auth } from '$lib/server/auth';
import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
  const parsed = invitationAcceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invitation details are invalid' }, { status: 400 });
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const firstDatabase = createDatabase();
  let invitation: { id: string; email: string; role: string; expires_at: string } | undefined;
  const claim = `pending:${createHash('sha256').update(`${tokenHash}:${Date.now()}`).digest('hex')}`;
  try {
    firstDatabase.sqlite.exec('BEGIN IMMEDIATE');
    invitation = firstDatabase.sqlite
      .prepare(
        'SELECT id,email,role,expires_at FROM invitation WHERE token_hash=? AND used_at IS NULL AND expires_at>? ',
      )
      .get(tokenHash, new Date().toISOString()) as typeof invitation;
    if (!invitation) {
      firstDatabase.sqlite.exec('ROLLBACK');
      return json({ error: 'Invitation is invalid or expired' }, { status: 400 });
    }
    const updated = firstDatabase.sqlite
      .prepare('UPDATE invitation SET used_at=? WHERE id=? AND used_at IS NULL')
      .run(claim, invitation.id);
    if (updated.changes !== 1) {
      firstDatabase.sqlite.exec('ROLLBACK');
      return json({ error: 'Invitation is already being used' }, { status: 409 });
    }
    firstDatabase.sqlite.exec('COMMIT');
  } finally {
    firstDatabase.sqlite.close();
  }
  try {
    const result = await auth.api.signUpEmail({
      body: { name: parsed.data.name, email: invitation.email, password: parsed.data.password },
      headers: request.headers,
    });
    const database = createDatabase();
    try {
      const userId = result.user.id;
      const updated = database.sqlite
        .prepare(
          "UPDATE user SET status='active',role=?,email_verified=1,updated_at=?,version=version+1 WHERE id=? AND status='invited'",
        )
        .run(invitation.role, new Date().toISOString(), userId);
      if (updated.changes !== 1) throw new Error('New account could not be activated');
      database.sqlite
        .prepare('UPDATE invitation SET used_at=? WHERE id=? AND used_at=?')
        .run(new Date().toISOString(), invitation.id, claim);
    } finally {
      database.sqlite.close();
    }
    return json({ accepted: true, email: invitation.email });
  } catch {
    const rollback = createDatabase();
    try {
      rollback.sqlite
        .prepare('UPDATE invitation SET used_at=NULL WHERE id=? AND used_at=?')
        .run(invitation.id, claim);
    } finally {
      rollback.sqlite.close();
    }
    return json({ error: 'Invitation could not be activated' }, { status: 400 });
  }
};
