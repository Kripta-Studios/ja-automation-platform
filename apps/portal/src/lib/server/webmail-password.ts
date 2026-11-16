import type { DatabaseSync } from 'node:sqlite';
import { createDatabase, recordAuditEvent } from '@ja/database';
import { newId } from '@ja/domain';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import {
  checkImapCredentials,
  isMailAuthEnabled,
  normalizeCorporateEmail,
  type ImapCredentialOutcome,
} from './imap-auth';
import { createConfiguredStalwartClient, type StalwartClient } from './stalwart-client';
import { verifyTemporaryOwnerPassword } from './temporary-owner-login';

/*
 * One password per person.
 *
 * A portal user linked to a Stalwart mailbox (mail_identity, auth_mode
 * 'webmail' or 'hybrid') has exactly one password: the mailbox password.
 * Stalwart is the source of truth whenever delegated mail authentication is
 * enabled, so a password changed in Webmail works in the portal immediately
 * and the previous one stops working in both. Every portal-initiated change
 * (self-service change or an Owner reset) writes Stalwart first and only then
 * refreshes the local Better Auth hash and revokes the user's sessions.
 */

type Sqlite = DatabaseSync;

export type LinkedIdentity = Readonly<{
  userId: string;
  email: string;
  authMode: 'webmail' | 'hybrid';
  stalwartAccountId: string;
}>;

type MailboxDirectory = Pick<StalwartClient, 'listMailboxes'>;
type MailboxWriter = Pick<StalwartClient, 'listMailboxes' | 'updatePassword'>;

export type PortalPasswordDependencies = Readonly<{
  /** Test seam; production resolves the configured Stalwart JMAP client. */
  stalwart?: MailboxWriter;
  /** Test seam; production uses the IMAPS verifier. */
  checkImap?: (email: string, password: string) => Promise<ImapCredentialOutcome>;
  /** Test seam; production reads JA_MAIL_AUTH_ENABLED. */
  mailAuthEnabled?: boolean;
}>;

export type PasswordChangeFailureCode =
  | 'PASSWORD_INVALID'
  | 'PASSWORD_UNCHANGED'
  | 'CURRENT_PASSWORD_INVALID'
  | 'USER_NOT_FOUND'
  | 'USER_NOT_ACTIVE'
  | 'TARGET_NOT_ALLOWED'
  | 'MAIL_UNAVAILABLE'
  | 'MAILBOX_NOT_FOUND'
  | 'LOCAL_UPDATE_FAILED';

export type PasswordChangeOutcome =
  | Readonly<{ ok: true; linkedMailbox: boolean; sessionsRevoked: number }>
  | Readonly<{ ok: false; code: PasswordChangeFailureCode }>;

function hasMailIdentityTable(sqlite: Sqlite): boolean {
  return Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mail_identity'").get(),
  );
}

function withDatabase<T>(work: (sqlite: Sqlite) => T): T {
  const { sqlite } = createDatabase();
  try {
    return work(sqlite);
  } finally {
    sqlite.close();
  }
}

function mailAuthEnabled(dependencies?: PortalPasswordDependencies): boolean {
  return dependencies?.mailAuthEnabled ?? isMailAuthEnabled();
}

function linkedCredentialForHash(hash: string): LinkedIdentity | null {
  try {
    return withDatabase((sqlite) => {
      if (!hasMailIdentityTable(sqlite)) return null;
      const rows = sqlite
        .prepare(
          `SELECT u.id userId, u.email, mi.auth_mode authMode, mi.stalwart_account_id stalwartAccountId
           FROM account a
           JOIN user u ON u.id=a.user_id
           JOIN mail_identity mi ON mi.user_id=u.id
           WHERE a.password=? AND a.provider_id='credential'
             AND a.issuer='local:credential' AND a.account_id=u.id
             AND u.status='active' AND mi.status='active'
             AND mi.auth_mode IN ('webmail','hybrid')
           LIMIT 2`,
        )
        .all(hash) as LinkedIdentity[];
      if (rows.length !== 1 || !normalizeCorporateEmail(rows[0]!.email)) return null;
      return rows[0]!;
    });
  } catch {
    return null;
  }
}

/** Active mailbox link of an active user, or null for portal-only accounts. */
export function linkedIdentityForUser(sqlite: Sqlite, userId: string): LinkedIdentity | null {
  if (!hasMailIdentityTable(sqlite)) return null;
  const row = sqlite
    .prepare(
      `SELECT u.id userId, u.email, mi.auth_mode authMode, mi.stalwart_account_id stalwartAccountId
       FROM mail_identity mi JOIN user u ON u.id=mi.user_id
       WHERE mi.user_id=? AND mi.status='active' AND u.status='active'
         AND mi.auth_mode IN ('webmail','hybrid')`,
    )
    .get(userId) as LinkedIdentity | undefined;
  return row && normalizeCorporateEmail(row.email) ? row : null;
}

async function mailboxStillLinked(
  linked: LinkedIdentity,
  directory: MailboxDirectory,
): Promise<boolean> {
  const live = await directory.listMailboxes();
  return live.some(
    (mailbox) =>
      mailbox.id === linked.stalwartAccountId && mailbox.email === linked.email.toLowerCase(),
  );
}

/**
 * Ask Stalwart whether this is the current mailbox password. The immutable
 * Stalwart account id must still belong to the linked address, so a deleted and
 * recreated alias never inherits a portal identity.
 */
export async function verifyLinkedMailPassword(
  linked: LinkedIdentity,
  password: string,
  dependencies?: PortalPasswordDependencies,
): Promise<'accepted' | 'rejected' | 'unavailable'> {
  try {
    const directory = dependencies?.stalwart ?? (await createConfiguredStalwartClient());
    if (!(await mailboxStillLinked(linked, directory))) return 'rejected';
  } catch {
    return 'unavailable';
  }
  const outcome = await (dependencies?.checkImap ?? checkImapCredentials)(linked.email, password);
  return outcome === 'accepted' ? 'accepted' : outcome === 'rejected' ? 'rejected' : 'unavailable';
}

async function localHashMatches(hash: string, password: string): Promise<boolean> {
  return verifyPassword({ hash, password }).catch(() => false);
}

/**
 * Keep the Owner's local fallback hash equal to his current mailbox password,
 * so a Stalwart outage never revives an older password. Best effort: the
 * sign-in already succeeded against the authoritative directory.
 */
async function refreshHybridFallbackHash(
  linked: LinkedIdentity,
  previousHash: string,
  password: string,
): Promise<void> {
  if (linked.authMode !== 'hybrid' || (await localHashMatches(previousHash, password))) return;
  try {
    const hash = await hashPassword(password);
    withDatabase((sqlite) =>
      sqlite
        .prepare(
          `UPDATE account SET password=?,updated_at=?
           WHERE user_id=? AND account_id=user_id AND provider_id='credential'
             AND issuer='local:credential' AND password=?`,
        )
        .run(hash, new Date().toISOString(), linked.userId, previousHash),
    );
  } catch {
    // The authoritative sign-in result does not depend on the cached fallback.
  }
}

/** Better Auth password verifier (see auth.ts `emailAndPassword.password.verify`). */
export async function verifyPortalPassword(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const temporary = await verifyTemporaryOwnerPassword(input);
  if (temporary !== null) return temporary;
  const linked = linkedCredentialForHash(input.hash);
  // Portal-only accounts, and every account while delegated mail
  // authentication is switched off, use the local Better Auth hash.
  if (!linked || !mailAuthEnabled()) return localHashMatches(input.hash, input.password);
  const outcome = await verifyLinkedMailPassword(linked, input.password);
  if (outcome === 'accepted') {
    await refreshHybridFallbackHash(linked, input.hash, input.password);
    return true;
  }
  // A definitive Stalwart rejection always wins: the stale local hash of a
  // linked user never authenticates. Only the Owner's hybrid account may use
  // the (portal-synchronized) local hash while Stalwart cannot answer, so a
  // mail outage cannot lock the Owner out of the portal. Webmail-only users
  // fail closed.
  if (outcome === 'unavailable' && linked.authMode === 'hybrid')
    return localHashMatches(input.hash, input.password);
  return false;
}

export const hashPortalPassword = hashPassword;

/** Same policy as the mailbox password policy, so one value is valid for both. */
export function isAcceptablePortalPassword(password: string): boolean {
  return password.length >= 12 && password.length <= 128 && !/[\r\n\0]/u.test(password);
}

/** Linked users must change their password through the portal facade, never Better Auth. */
export function isLinkedMailUser(userId: string): boolean {
  return withDatabase((sqlite) => linkedIdentityForUser(sqlite, userId) !== null);
}

export function linkedMailUserIdForEmail(emailInput: string): string | null {
  const email = normalizeCorporateEmail(emailInput);
  if (!email) return null;
  return withDatabase((sqlite) => {
    if (!hasMailIdentityTable(sqlite)) return null;
    const row = sqlite
      .prepare(
        `SELECT u.id FROM mail_identity mi JOIN user u ON u.id=mi.user_id
         WHERE lower(mi.email)=? AND mi.auth_mode IN ('webmail','hybrid')
           AND mi.status='active' AND u.status='active'`,
      )
      .get(email) as { id: string } | undefined;
    return row?.id ?? null;
  });
}

export function linkedMailUserIdForResetToken(token: string): string | null {
  if (!token || /[\0\r\n]/u.test(token)) return null;
  return withDatabase((sqlite) => {
    if (!hasMailIdentityTable(sqlite)) return null;
    const row = sqlite
      .prepare(
        `SELECT mi.user_id userId FROM verification v
         JOIN mail_identity mi ON mi.user_id=v.value JOIN user u ON u.id=mi.user_id
         WHERE v.identifier=? AND mi.auth_mode IN ('webmail','hybrid')
           AND mi.status='active' AND u.status='active'`,
      )
      .get(`reset-password:${token}`) as { userId: string } | undefined;
    return row?.userId ?? null;
  });
}

function transaction<T>(sqlite: Sqlite, work: () => T): T {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    sqlite.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}

/** Store the Better Auth hash of the current password for `userId`. */
export function storeLocalPasswordHash(sqlite: Sqlite, userId: string, hash: string): void {
  const now = new Date().toISOString();
  const updated = sqlite
    .prepare(
      `UPDATE account SET password=?,updated_at=?
       WHERE user_id=? AND account_id=user_id AND provider_id='credential'
         AND issuer='local:credential'`,
    )
    .run(hash, now, userId);
  if (Number(updated.changes) === 0)
    sqlite
      .prepare(
        `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
         VALUES(?,'local:credential',?,'credential',?,?,?,?)`,
      )
      .run(newId(), userId, userId, hash, now, now);
}

type WriteInput = Readonly<{
  userId: string;
  email: string;
  linked: LinkedIdentity | null;
  newPassword: string;
  actorId: string;
  correlationId?: string;
  /** The session that made the change survives a self-service change. */
  keepSessionId: string | null;
  reason: 'self_service_password_change' | 'owner_password_reset';
}>;

/**
 * Stalwart first, then the local hash, session revocation and audit in one
 * local transaction. If Stalwart cannot confirm the change nothing is written,
 * so the old password keeps working everywhere rather than in only one place.
 */
async function writePassword(
  sqlite: Sqlite,
  input: WriteInput,
  dependencies?: PortalPasswordDependencies,
): Promise<PasswordChangeOutcome> {
  if (input.linked) {
    let stalwart: MailboxWriter;
    try {
      stalwart = dependencies?.stalwart ?? (await createConfiguredStalwartClient());
    } catch {
      return { ok: false, code: 'MAIL_UNAVAILABLE' };
    }
    try {
      if (!(await mailboxStillLinked(input.linked, stalwart)))
        return { ok: false, code: 'MAILBOX_NOT_FOUND' };
      await stalwart.updatePassword(input.linked.stalwartAccountId, input.newPassword);
    } catch {
      return { ok: false, code: 'MAIL_UNAVAILABLE' };
    }
  }
  let hash: string;
  try {
    hash = await hashPassword(input.newPassword);
  } catch {
    return { ok: false, code: 'LOCAL_UPDATE_FAILED' };
  }
  try {
    const revoked = transaction(sqlite, () => {
      storeLocalPasswordHash(sqlite, input.userId, hash);
      const deleted = input.keepSessionId
        ? sqlite
            .prepare('DELETE FROM session WHERE user_id=? AND id<>?')
            .run(input.userId, input.keepSessionId)
        : sqlite.prepare('DELETE FROM session WHERE user_id=?').run(input.userId);
      const revokedCount = Number(deleted.changes);
      const actor = { userId: input.actorId, correlationId: input.correlationId };
      if (input.linked)
        recordAuditEvent(
          sqlite,
          actor,
          'mailbox.password_update',
          'mailbox',
          input.linked.stalwartAccountId,
          {
            reason: input.reason,
            outcome: 'password_updated',
            linkedEmail: input.linked.email,
            portalCredentialUpdated: true,
          },
        );
      recordAuditEvent(sqlite, actor, 'mailbox.sessions_revoke', 'user', input.userId, {
        email: input.email,
        reason: input.reason,
        revokedCount,
        mailboxUpdated: Boolean(input.linked),
      });
      return revokedCount;
    });
    return { ok: true, linkedMailbox: Boolean(input.linked), sessionsRevoked: revoked };
  } catch {
    return { ok: false, code: 'LOCAL_UPDATE_FAILED' };
  }
}

type UserCredential = Readonly<{ id: string; email: string; role: string; status: string }>;

function userWithCredential(
  sqlite: Sqlite,
  userId: string,
): (UserCredential & { hash: string | null }) | undefined {
  return sqlite
    .prepare(
      `SELECT u.id,u.email,u.role,u.status,a.password hash FROM user u
       LEFT JOIN account a ON a.user_id=u.id AND a.account_id=u.id
         AND a.provider_id='credential' AND a.issuer='local:credential'
       WHERE u.id=?`,
    )
    .get(userId) as (UserCredential & { hash: string | null }) | undefined;
}

/**
 * Self-service password change from the portal profile. For a linked user the
 * current password is checked against Stalwart (the one password), and the new
 * password is written to Stalwart and the portal together.
 */
export async function changeOwnPassword(
  sqlite: Sqlite,
  input: Readonly<{
    userId: string;
    sessionId: string;
    currentPassword: string;
    newPassword: string;
    correlationId?: string;
  }>,
  dependencies?: PortalPasswordDependencies,
): Promise<PasswordChangeOutcome> {
  const user = userWithCredential(sqlite, input.userId);
  if (!user) return { ok: false, code: 'USER_NOT_FOUND' };
  if (user.status !== 'active') return { ok: false, code: 'USER_NOT_ACTIVE' };
  if (!isAcceptablePortalPassword(input.newPassword))
    return { ok: false, code: 'PASSWORD_INVALID' };
  if (input.newPassword === input.currentPassword) return { ok: false, code: 'PASSWORD_UNCHANGED' };
  const linked = linkedIdentityForUser(sqlite, user.id);
  if (linked && mailAuthEnabled(dependencies)) {
    const outcome = await verifyLinkedMailPassword(linked, input.currentPassword, dependencies);
    if (outcome === 'unavailable') return { ok: false, code: 'MAIL_UNAVAILABLE' };
    if (outcome === 'rejected') return { ok: false, code: 'CURRENT_PASSWORD_INVALID' };
  } else if (!user.hash || !(await localHashMatches(user.hash, input.currentPassword))) {
    return { ok: false, code: 'CURRENT_PASSWORD_INVALID' };
  }
  return writePassword(
    sqlite,
    {
      userId: user.id,
      email: user.email,
      linked,
      newPassword: input.newPassword,
      actorId: user.id,
      correlationId: input.correlationId,
      keepSessionId: input.sessionId,
      reason: 'self_service_password_change',
    },
    dependencies,
  );
}

/**
 * Owner reset of another person's password. The new password replaces the
 * mailbox password (if linked) and the portal password, and signs the person
 * out everywhere. Callers authorize the Owner; this function re-checks the
 * live actor and refuses to reset the Owner account itself (use the profile).
 */
export async function resetUserPassword(
  sqlite: Sqlite,
  input: Readonly<{
    actorId: string;
    targetUserId: string;
    newPassword: string;
    correlationId?: string;
  }>,
  dependencies?: PortalPasswordDependencies,
): Promise<PasswordChangeOutcome> {
  const actor = sqlite.prepare('SELECT role,status FROM user WHERE id=?').get(input.actorId) as
    | { role: string; status: string }
    | undefined;
  if (actor?.role !== 'owner_admin' || actor.status !== 'active')
    return { ok: false, code: 'TARGET_NOT_ALLOWED' };
  const target = userWithCredential(sqlite, input.targetUserId);
  if (!target) return { ok: false, code: 'USER_NOT_FOUND' };
  if (target.id === input.actorId || target.role === 'owner_admin')
    return { ok: false, code: 'TARGET_NOT_ALLOWED' };
  if (target.status !== 'active') return { ok: false, code: 'USER_NOT_ACTIVE' };
  // A directory-only person has no sign-in yet: use "Create user" to grant access.
  if (!target.hash) return { ok: false, code: 'TARGET_NOT_ALLOWED' };
  if (!isAcceptablePortalPassword(input.newPassword))
    return { ok: false, code: 'PASSWORD_INVALID' };
  return writePassword(
    sqlite,
    {
      userId: target.id,
      email: target.email,
      linked: linkedIdentityForUser(sqlite, target.id),
      newPassword: input.newPassword,
      actorId: input.actorId,
      correlationId: input.correlationId,
      keepSessionId: null,
      reason: 'owner_password_reset',
    },
    dependencies,
  );
}

/**
 * After the Owner changes a mailbox password from the Mailboxes tab, keep the
 * linked portal credential equal to it (sessions are revoked by the caller).
 */
export async function refreshLinkedPortalHash(
  sqlite: Sqlite,
  stalwartAccountId: string,
  password: string,
): Promise<void> {
  if (!hasMailIdentityTable(sqlite)) return;
  const identity = sqlite
    .prepare(
      "SELECT user_id userId FROM mail_identity WHERE stalwart_account_id=? AND status='active'",
    )
    .get(stalwartAccountId) as { userId: string } | undefined;
  if (!identity) return;
  const hash = await hashPassword(password);
  storeLocalPasswordHash(sqlite, identity.userId, hash);
}

const passwordChangeProblems: Readonly<
  Record<
    PasswordChangeFailureCode,
    { status: number; key: `problem.${string}`; message: string; field?: string }
  >
> = {
  PASSWORD_INVALID: {
    status: 400,
    key: 'problem.access.passwordInvalid',
    message: 'Use a password with 12–128 characters.',
    field: 'password',
  },
  PASSWORD_UNCHANGED: {
    status: 400,
    key: 'problem.access.passwordUnchanged',
    message: 'Choose a password that is different from the current one.',
    field: 'password',
  },
  CURRENT_PASSWORD_INVALID: {
    status: 400,
    key: 'problem.access.passwordCurrentInvalid',
    message: 'The current password is not correct.',
    field: 'currentPassword',
  },
  USER_NOT_FOUND: {
    status: 404,
    key: 'problem.access.passwordUserInactive',
    message: 'Restore this person’s access before setting a new password.',
  },
  USER_NOT_ACTIVE: {
    status: 409,
    key: 'problem.access.passwordUserInactive',
    message: 'Restore this person’s access before setting a new password.',
  },
  TARGET_NOT_ALLOWED: {
    status: 403,
    key: 'problem.access.passwordTargetNotAllowed',
    message: 'This account’s password can only be changed from its own profile.',
  },
  MAIL_UNAVAILABLE: {
    status: 503,
    key: 'problem.access.passwordMailUnavailable',
    message:
      'The mail server did not confirm the change, so nothing was changed and the old password still works. Try again in a few minutes.',
  },
  MAILBOX_NOT_FOUND: {
    status: 409,
    key: 'problem.access.passwordMailboxMismatch',
    message:
      'This person’s mailbox no longer matches their portal account. Review the Mailboxes tab before resetting the password.',
  },
  LOCAL_UPDATE_FAILED: {
    status: 500,
    key: 'problem.access.passwordLocalPending',
    message:
      'The Webmail password changed, but the portal could not save it yet. Submit the same new password again.',
    field: 'password',
  },
};

/** Problem payload for a failed password change, shared with the profile endpoint. */
export function passwordChangeProblem(code: PasswordChangeFailureCode) {
  const problem = passwordChangeProblems[code];
  return { ...problem, code: `ACCESS_PASSWORD_${code}` };
}
