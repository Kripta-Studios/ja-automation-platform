import { createHash, randomUUID } from 'node:crypto';
import { createDatabase, recordAuditEvent } from '@ja/database';
import { invitationAcceptSchema } from '@ja/schemas';
import { auth } from '$lib/server/auth';
import { json, type RequestHandler } from '@sveltejs/kit';
import { verifyPassword } from 'better-auth/crypto';

const PENDING_CLAIM_STALE_MS = 15 * 60_000;
const INVITATION_ROLES = new Set([
  'owner_admin',
  'finance_admin',
  'project_manager',
  'worker',
  'auditor_read_only',
]);

type Invitation = Readonly<{
  id: string;
  email: string;
  role: string;
  expires_at: string;
  used_at: string | null;
}>;
type ClaimMode = 'signup' | 'recover_credential';
type ClaimRecovery = 'none' | 'stale_no_identity' | 'stale_credential_identity';

function pendingClaim(now: number): string {
  return `pending:${now}:${randomUUID()}`;
}

function pendingClaimStartedAt(value: string): number | null {
  const match = /^pending:(\d{13}):[0-9a-f-]{36}$/u.exec(value);
  if (match) {
    const startedAt = Number(match[1]);
    return Number.isSafeInteger(startedAt) ? startedAt : null;
  }
  // The preceding implementation wrote claims without a timestamp. They may
  // be recovered as stale, subject to the same token and identity checks.
  if (/^pending:(?:[0-9a-f]{64}|[0-9a-f-]{36})$/u.test(value)) return 0;
  return null;
}

function invitationJson(data: unknown, init?: ResponseInit): Response {
  const response = json(data, init);
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

function genericFailure(): Response {
  return invitationJson({ error: 'Invitation could not be activated' }, { status: 400 });
}

async function verifyInvitedCredential(userId: string, password: string) {
  const database = createDatabase();
  try {
    const identity = database.sqlite
      .prepare(
        `SELECT u.id,u.email,a.password
         FROM user u
         JOIN account a ON a.user_id=u.id AND a.provider_id='credential'
         WHERE u.id=? AND u.status='invited' AND a.password IS NOT NULL`,
      )
      .get(userId) as { id: string; email: string; password: string } | undefined;
    if (!identity || !(await verifyPassword({ hash: identity.password, password })))
      throw new Error('INVITATION_CREDENTIAL_INVALID');
    // Recovery proves possession of the credential but deliberately does not
    // create a session while the canonical account remains non-active.
    return { user: { id: identity.id, email: identity.email } };
  } finally {
    database.sqlite.close();
  }
}

export const POST: RequestHandler = async ({ request }) => {
  const parsed = invitationAcceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return invitationJson({ error: 'Invitation details are invalid' }, { status: 400 });

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const claimStartedAt = Date.now();
  const claim = pendingClaim(claimStartedAt);
  const firstDatabase = createDatabase();
  let invitation: Invitation | undefined;
  let claimMode: ClaimMode = 'signup';
  let claimRecovery: ClaimRecovery = 'none';
  let recoveryUserId: string | undefined;
  let previousStaleClaim: string | undefined;
  try {
    firstDatabase.sqlite.exec('BEGIN IMMEDIATE');
    invitation = firstDatabase.sqlite
      .prepare(
        'SELECT id,email,role,expires_at,used_at FROM invitation WHERE token_hash=? AND expires_at>? ',
      )
      .get(tokenHash, new Date(claimStartedAt).toISOString()) as Invitation | undefined;
    if (!invitation || !INVITATION_ROLES.has(invitation.role)) {
      firstDatabase.sqlite.exec('ROLLBACK');
      return genericFailure();
    }

    if (invitation.used_at === null) {
      const updated = firstDatabase.sqlite
        .prepare('UPDATE invitation SET used_at=? WHERE id=? AND used_at IS NULL')
        .run(claim, invitation.id);
      if (updated.changes !== 1) {
        firstDatabase.sqlite.exec('ROLLBACK');
        return genericFailure();
      }
    } else {
      const pendingStartedAt = pendingClaimStartedAt(invitation.used_at);
      if (pendingStartedAt === null || claimStartedAt - pendingStartedAt < PENDING_CLAIM_STALE_MS) {
        firstDatabase.sqlite.exec('ROLLBACK');
        return genericFailure();
      }

      const identities = firstDatabase.sqlite
        .prepare(
          `SELECT u.id,u.email,u.status,
             EXISTS(
               SELECT 1 FROM account a
               WHERE a.user_id=u.id AND a.provider_id='credential' AND a.password IS NOT NULL
             ) has_credential
           FROM user u WHERE lower(u.email)=lower(?)`,
        )
        .all(invitation.email) as Array<{
        id: string;
        email: string;
        status: string;
        has_credential: number;
      }>;
      if (identities.length === 0) {
        claimRecovery = 'stale_no_identity';
      } else if (
        identities.length === 1 &&
        identities[0]?.status === 'invited' &&
        identities[0].has_credential === 1
      ) {
        claimMode = 'recover_credential';
        claimRecovery = 'stale_credential_identity';
        recoveryUserId = identities[0].id;
      } else {
        firstDatabase.sqlite.exec('ROLLBACK');
        return genericFailure();
      }

      const reclaimed = firstDatabase.sqlite
        .prepare('UPDATE invitation SET used_at=? WHERE id=? AND token_hash=? AND used_at=?')
        .run(claim, invitation.id, tokenHash, invitation.used_at);
      if (reclaimed.changes !== 1) {
        firstDatabase.sqlite.exec('ROLLBACK');
        return genericFailure();
      }
      previousStaleClaim = invitation.used_at;
    }
    firstDatabase.sqlite.exec('COMMIT');
  } catch {
    try {
      firstDatabase.sqlite.exec('ROLLBACK');
    } catch {
      // Closing an uncommitted connection is also fail-closed for the claim.
    }
    return genericFailure();
  } finally {
    firstDatabase.sqlite.close();
  }

  if (!invitation) return genericFailure();

  try {
    const result =
      claimMode === 'signup'
        ? await auth.api.signUpEmail({
            body: {
              name: parsed.data.name,
              email: invitation.email,
              password: parsed.data.password,
            },
            headers: request.headers,
          })
        : await verifyInvitedCredential(recoveryUserId ?? '', parsed.data.password);
    if (
      !result?.user?.id ||
      typeof result.user.email !== 'string' ||
      result.user.email.trim().toLowerCase() !== invitation.email.trim().toLowerCase() ||
      (claimMode === 'recover_credential' && result.user.id !== recoveryUserId)
    )
      throw new Error('INVITATION_IDENTITY_MISMATCH');

    const database = createDatabase();
    try {
      database.sqlite.exec('BEGIN IMMEDIATE');
      let committed = false;
      try {
        const currentClaim = database.sqlite
          .prepare('SELECT 1 FROM invitation WHERE id=? AND token_hash=? AND used_at=?')
          .get(invitation.id, tokenHash, claim);
        if (!currentClaim) throw new Error('INVITATION_CLAIM_LOST');

        const invitedUser = database.sqlite
          .prepare('SELECT id,email,status FROM user WHERE id=?')
          .get(result.user.id) as { id: string; email: string; status: string } | undefined;
        if (
          !invitedUser ||
          invitedUser.status !== 'invited' ||
          invitedUser.email.trim().toLowerCase() !== invitation.email.trim().toLowerCase()
        )
          throw new Error('INVITATION_USER_MISMATCH');

        const now = new Date().toISOString();
        const updated = database.sqlite
          .prepare(
            "UPDATE user SET status='active',role=?,email_verified=1,mfa_required=0,updated_at=?,version=version+1 WHERE id=? AND status='invited' AND lower(email)=lower(?)",
          )
          .run(invitation.role, now, result.user.id, invitation.email);
        if (updated.changes !== 1) throw new Error('INVITATION_ACTIVATION_FAILED');

        const finalized = database.sqlite
          .prepare('UPDATE invitation SET used_at=? WHERE id=? AND token_hash=? AND used_at=?')
          .run(now, invitation.id, tokenHash, claim);
        if (finalized.changes !== 1) throw new Error('INVITATION_FINALIZATION_FAILED');

        recordAuditEvent(database.sqlite, null, 'invitation.accept', 'invitation', invitation.id, {
          userId: result.user.id,
          role: invitation.role,
          status: 'active',
          claimRecovery,
        });
        database.sqlite.exec('COMMIT');
        committed = true;
      } finally {
        if (!committed) {
          try {
            database.sqlite.exec('ROLLBACK');
          } catch {
            // Preserve the activation failure and leave the claim fail-closed.
          }
        }
      }
    } finally {
      database.sqlite.close();
    }
    return invitationJson({ accepted: true, email: invitation.email });
  } catch {
    console.error(
      JSON.stringify({ event: 'invitation.accept.failed', invitationId: invitation.id }),
    );
    try {
      const recovery = createDatabase();
      try {
        recovery.sqlite.exec('BEGIN IMMEDIATE');
        let committed = false;
        try {
          const identityEvidence = recovery.sqlite
            .prepare(
              `SELECT 1
               FROM user u
               LEFT JOIN account a ON a.user_id=u.id
               WHERE lower(u.email)=lower(?)
               LIMIT 1`,
            )
            .get(invitation.email);
          if (!identityEvidence && claimMode === 'signup')
            recovery.sqlite
              .prepare(
                'UPDATE invitation SET used_at=NULL WHERE id=? AND token_hash=? AND used_at=?',
              )
              .run(invitation.id, tokenHash, claim);
          else if (identityEvidence && claimMode === 'recover_credential' && previousStaleClaim)
            recovery.sqlite
              .prepare('UPDATE invitation SET used_at=? WHERE id=? AND token_hash=? AND used_at=?')
              .run(previousStaleClaim, invitation.id, tokenHash, claim);
          recovery.sqlite.exec('COMMIT');
          committed = true;
        } finally {
          if (!committed) {
            try {
              recovery.sqlite.exec('ROLLBACK');
            } catch {
              // A recovery failure leaves the invitation claimed and fail-closed.
            }
          }
        }
      } finally {
        recovery.sqlite.close();
      }
    } catch {
      // Never reopen an invitation when identity evidence cannot be checked safely.
    }
    return genericFailure();
  }
};
