import type { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { newId, type Principal, type Role } from '@ja/domain';
import { recordAuditEvent } from '../../core/audit.ts';

export const CANONICAL_OWNER_EMAIL = 'antonny.luty@j-aautomation.com';
export const CORPORATE_MAIL_DOMAIN = 'j-aautomation.com';

// Better Auth expects a non-null scrypt-shaped credential row. Webmail-only
// users receive a unique, random and never-issued surrogate so the custom
// verifier can resolve exactly one linked identity without storing a Webmail
// password (or a value derived from it).
function webmailSurrogatePassword(): string {
  return `${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`;
}

export type MailboxIdentityInput = Readonly<{
  stalwartAccountId: string;
  email: string;
  name: string;
}>;

export type MailIdentityRow = Readonly<{
  userId: string;
  stalwartAccountId: string;
  email: string;
  authMode: 'webmail' | 'hybrid';
  status: 'active' | 'archived';
}>;

export type ProvisionResult = Readonly<{
  created: number;
  updated: number;
  unchanged: number;
  userIds: readonly string[];
}>;

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?@j-aautomation\.com$/u.test(email))
    throw new Error('MAILBOX_EMAIL_INVALID');
  return email;
}

function requireCanonicalOwner(sqlite: DatabaseSync, principal: Principal): void {
  const actor = sqlite
    .prepare('SELECT email,role,status FROM user WHERE id=?')
    .get(principal.userId) as { email: string; role: string; status: string } | undefined;
  const session = principal.sessionId
    ? (sqlite
        .prepare('SELECT step_up_at,expires_at FROM session WHERE id=? AND user_id=?')
        .get(principal.sessionId, principal.userId) as
        | { step_up_at: string | null; expires_at: string }
        | undefined)
    : undefined;
  const steppedAt = session?.step_up_at ? Date.parse(session.step_up_at) : Number.NaN;
  const expiresAt = session?.expires_at ? Date.parse(session.expires_at) : Number.NaN;
  if (
    !actor ||
    actor.status !== 'active' ||
    actor.role !== 'owner_admin' ||
    actor.email.toLowerCase() !== CANONICAL_OWNER_EMAIL ||
    principal.role !== 'owner_admin' ||
    !session ||
    !Number.isFinite(steppedAt) ||
    Date.now() - steppedAt > 10 * 60_000 ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  )
    throw new Error('CANONICAL_OWNER_REQUIRED');
}

function transaction<T>(sqlite: DatabaseSync, work: () => T): T {
  sqlite.exec('BEGIN IMMEDIATE');
  let committed = false;
  try {
    const result = work();
    sqlite.exec('COMMIT');
    committed = true;
    return result;
  } finally {
    if (!committed) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        // Preserve the original failure.
      }
    }
  }
}

export class MailIdentityRepository {
  private readonly sqlite: DatabaseSync;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
  }

  assertCanonicalOwner(principal: Principal): void {
    requireCanonicalOwner(this.sqlite, principal);
  }

  list(): MailIdentityRow[] {
    return this.sqlite
      .prepare(
        `SELECT user_id userId,stalwart_account_id stalwartAccountId,email,auth_mode authMode,status
         FROM mail_identity ORDER BY email`,
      )
      .all() as MailIdentityRow[];
  }

  findByEmail(email: string): MailIdentityRow | undefined {
    return this.sqlite
      .prepare(
        `SELECT user_id userId,stalwart_account_id stalwartAccountId,email,auth_mode authMode,status
         FROM mail_identity WHERE email=?`,
      )
      .get(normalizeEmail(email)) as MailIdentityRow | undefined;
  }

  provision(
    principal: Principal,
    mailboxes: readonly MailboxIdentityInput[],
    role: Exclude<Role, 'owner_admin'> = 'worker',
    auditAction: 'mailbox.provision' | 'mailbox.bootstrap' = 'mailbox.provision',
  ): ProvisionResult {
    requireCanonicalOwner(this.sqlite, principal);
    if (!['worker', 'project_manager', 'finance_admin', 'auditor_read_only'].includes(role))
      throw new Error('MAILBOX_ROLE_INVALID');
    const unique = new Map<string, MailboxIdentityInput>();
    for (const mailbox of mailboxes) {
      const email = normalizeEmail(mailbox.email);
      const accountId = mailbox.stalwartAccountId.trim();
      if (!accountId || accountId.length > 255) throw new Error('STALWART_ACCOUNT_ID_INVALID');
      if (unique.has(email)) throw new Error('DUPLICATE_MAILBOX_EMAIL');
      unique.set(email, { ...mailbox, email, stalwartAccountId: accountId });
    }

    return transaction(this.sqlite, () => {
      const conflictingOwner = this.sqlite
        .prepare("SELECT id,email FROM user WHERE role='owner_admin' AND lower(email)<>? LIMIT 1")
        .get(CANONICAL_OWNER_EMAIL);
      if (conflictingOwner) throw new Error('NON_CANONICAL_OWNER_CONFLICT');

      let created = 0;
      let updated = 0;
      let unchanged = 0;
      const userIds: string[] = [];
      const now = new Date().toISOString();
      for (const mailbox of unique.values()) {
        const email = mailbox.email;
        const isOwner = email === CANONICAL_OWNER_EMAIL;
        const desiredRole: Role = isOwner ? 'owner_admin' : role;
        const desiredAuthMode = isOwner ? 'hybrid' : 'webmail';
        const existing = this.sqlite
          .prepare('SELECT id,name,role,status,mfa_required FROM user WHERE lower(email)=?')
          .get(email) as
          | { id: string; name: string; role: Role; status: string; mfa_required: number }
          | undefined;
        const userId = existing?.id ?? newId();
        let rowOutcome: 'created' | 'updated_or_linked' | 'linked_or_unchanged';
        userIds.push(userId);

        if (existing && !isOwner && existing.status !== 'active') {
          if (auditAction === 'mailbox.bootstrap') {
            unchanged += 1;
            continue;
          }
          throw new Error('PORTAL_USER_INACTIVE');
        }

        if (!existing) {
          this.sqlite
            .prepare(
              `INSERT INTO user(
                 id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,
                 created_at,updated_at,version
               ) VALUES(?,?,?,1,?,'active',0,1,?,?,1)`,
            )
            .run(
              userId,
              mailbox.name.trim() || email.slice(0, email.indexOf('@')),
              email,
              desiredRole,
              now,
              now,
            );
          created += 1;
          rowOutcome = 'created';
        } else {
          if (!isOwner && existing.role === 'owner_admin')
            throw new Error('NON_CANONICAL_OWNER_CONFLICT');
          // Bootstrap is authoritative only for Antonny. Explicit provisioning
          // may set another role chosen by Antonny but never silently revives a user.
          const nextRole = isOwner
            ? 'owner_admin'
            : auditAction === 'mailbox.bootstrap'
              ? existing.role
              : desiredRole;
          const mustUpdate =
            (isOwner && (existing.status !== 'active' || existing.role !== 'owner_admin')) ||
            (!isOwner && auditAction === 'mailbox.provision' && existing.role !== nextRole) ||
            existing.mfa_required !== 1;
          if (mustUpdate) {
            if (!isOwner && existing.status !== 'active') throw new Error('PORTAL_USER_INACTIVE');
            this.sqlite
              .prepare(
                `UPDATE user SET role=?,status=CASE WHEN lower(email)=? THEN 'active' ELSE status END,
                   email_verified=1,mfa_required=1,offboarded_at=CASE WHEN lower(email)=? THEN NULL ELSE offboarded_at END,
                   updated_at=?,version=version+1 WHERE id=?`,
              )
              .run(nextRole, CANONICAL_OWNER_EMAIL, CANONICAL_OWNER_EMAIL, now, userId);
            this.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(userId);
            updated += 1;
            rowOutcome = 'updated_or_linked';
          } else {
            unchanged += 1;
            rowOutcome = 'linked_or_unchanged';
          }
        }

        const credential = this.sqlite
          .prepare("SELECT id FROM account WHERE user_id=? AND provider_id='credential' LIMIT 1")
          .get(userId);
        if (!credential)
          this.sqlite
            .prepare(
              `INSERT INTO account(
                 id,issuer,account_id,provider_id,user_id,password,created_at,updated_at
               ) VALUES(?,'local:credential',?,'credential',?,?,?,?)`,
            )
            .run(newId(), userId, userId, webmailSurrogatePassword(), now, now);

        const collision = this.sqlite
          .prepare('SELECT user_id,email FROM mail_identity WHERE stalwart_account_id=? OR email=?')
          .all(mailbox.stalwartAccountId, email) as Array<{ user_id: string; email: string }>;
        if (collision.some((row) => row.user_id !== userId))
          throw new Error('MAIL_IDENTITY_COLLISION');
        const existingIdentity = this.sqlite
          .prepare('SELECT stalwart_account_id,email FROM mail_identity WHERE user_id=?')
          .get(userId) as { stalwart_account_id: string; email: string } | undefined;
        if (
          existingIdentity &&
          (existingIdentity.stalwart_account_id !== mailbox.stalwartAccountId ||
            existingIdentity.email !== email)
        )
          throw new Error('MAIL_IDENTITY_RELINK_REQUIRES_EXPLICIT_ACTION');
        this.sqlite
          .prepare(
            `INSERT INTO mail_identity(
               user_id,stalwart_account_id,email,auth_mode,status,linked_by,linked_at,updated_at,version
             ) VALUES(?,?,?,?,'active',?,?,?,1)
             ON CONFLICT(user_id) DO UPDATE SET
               stalwart_account_id=excluded.stalwart_account_id,email=excluded.email,
               auth_mode=excluded.auth_mode,
               status=CASE WHEN ?='mailbox.bootstrap' THEN mail_identity.status ELSE 'active' END,
               archived_at=CASE WHEN ?='mailbox.bootstrap' THEN mail_identity.archived_at ELSE NULL END,
               updated_at=excluded.updated_at,version=mail_identity.version+1`,
          )
          .run(
            userId,
            mailbox.stalwartAccountId,
            email,
            desiredAuthMode,
            principal.userId,
            now,
            now,
            auditAction,
            auditAction,
          );
        recordAuditEvent(this.sqlite, principal, auditAction, 'mail_identity', userId, {
          email,
          stalwartAccountId: mailbox.stalwartAccountId,
          role: desiredRole,
          outcome: rowOutcome,
        });
      }
      return { created, updated, unchanged, userIds };
    });
  }

  bootstrap(principal: Principal, mailboxes: readonly MailboxIdentityInput[]): ProvisionResult {
    requireCanonicalOwner(this.sqlite, principal);
    const ownerMailbox = mailboxes.find(
      (mailbox) => mailbox.email.trim().toLowerCase() === CANONICAL_OWNER_EMAIL,
    );
    if (!ownerMailbox) throw new Error('CANONICAL_OWNER_MAILBOX_MISSING');
    // Antonny is processed first so a fresh installation has the audit actor.
    const ordered = [ownerMailbox, ...mailboxes.filter((mailbox) => mailbox !== ownerMailbox)];
    return this.provision(principal, ordered, 'worker', 'mailbox.bootstrap');
  }

  changePortalRole(
    principal: Principal,
    userId: string,
    emailInput: string,
    role: Exclude<Role, 'owner_admin'>,
    reason: string,
  ): void {
    requireCanonicalOwner(this.sqlite, principal);
    if (!['worker', 'project_manager', 'finance_admin'].includes(role))
      throw new Error('MAILBOX_ROLE_INVALID');
    const email = normalizeEmail(emailInput);
    if (email === CANONICAL_OWNER_EMAIL) throw new Error('CANONICAL_OWNER_PROTECTED');
    if (!reason.trim()) throw new Error('MAILBOX_CHANGE_REASON_REQUIRED');
    transaction(this.sqlite, () => {
      const target = this.sqlite
        .prepare(
          `SELECT u.id,u.role,u.status FROM user u JOIN mail_identity mi ON mi.user_id=u.id
           WHERE u.id=? AND mi.email=? AND mi.status='active'`,
        )
        .get(userId, email) as { id: string; role: Role; status: string } | undefined;
      if (!target) throw new Error('MAIL_IDENTITY_NOT_FOUND');
      if (target.status !== 'active') throw new Error('PORTAL_USER_INACTIVE');
      const timestamp = new Date().toISOString();
      this.sqlite
        .prepare('UPDATE user SET role=?,updated_at=?,version=version+1 WHERE id=?')
        .run(role, timestamp, userId);
      const revoked = Number(
        this.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(userId).changes,
      );
      recordAuditEvent(this.sqlite, principal, 'mailbox.role_change', 'mail_identity', userId, {
        email,
        reason: reason.trim(),
        before: { role: target.role },
        after: { role },
        sessionsRevoked: revoked,
      });
    });
  }

  offboardPortalUser(
    principal: Principal,
    userId: string,
    emailInput: string,
    reason: string,
  ): void {
    requireCanonicalOwner(this.sqlite, principal);
    const email = normalizeEmail(emailInput);
    if (email === CANONICAL_OWNER_EMAIL) throw new Error('CANONICAL_OWNER_PROTECTED');
    if (!reason.trim()) throw new Error('MAILBOX_CHANGE_REASON_REQUIRED');
    transaction(this.sqlite, () => {
      const target = this.sqlite
        .prepare(
          `SELECT u.id,u.status FROM user u JOIN mail_identity mi ON mi.user_id=u.id
           WHERE u.id=? AND mi.email=? AND mi.status='active'`,
        )
        .get(userId, email) as { id: string; status: string } | undefined;
      if (!target) throw new Error('MAIL_IDENTITY_NOT_FOUND');
      const timestamp = new Date().toISOString();
      this.sqlite
        .prepare(
          `UPDATE user SET status='offboarded',offboarded_at=COALESCE(offboarded_at,?),
         updated_at=?,version=version+1 WHERE id=?`,
        )
        .run(timestamp, timestamp, userId);
      const revoked = Number(
        this.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(userId).changes,
      );
      recordAuditEvent(this.sqlite, principal, 'mailbox.portal_offboard', 'mail_identity', userId, {
        email,
        reason: reason.trim(),
        before: { status: target.status },
        after: { status: 'offboarded' },
        sessionsRevoked: revoked,
        mailboxPreserved: true,
      });
    });
  }

  revokeLinkedSessions(principal: Principal, stalwartAccountId: string, reason: string): number {
    requireCanonicalOwner(this.sqlite, principal);
    return transaction(this.sqlite, () => {
      const identity = this.sqlite
        .prepare('SELECT user_id,email FROM mail_identity WHERE stalwart_account_id=?')
        .get(stalwartAccountId) as { user_id: string; email: string } | undefined;
      if (!identity) return 0;
      const result = this.sqlite
        .prepare('DELETE FROM session WHERE user_id=?')
        .run(identity.user_id);
      recordAuditEvent(
        this.sqlite,
        principal,
        'mailbox.sessions_revoke',
        'user',
        identity.user_id,
        {
          email: identity.email,
          reason,
          revokedCount: Number(result.changes),
        },
      );
      return Number(result.changes);
    });
  }

  finalizePasswordUpdate(principal: Principal, stalwartAccountId: string, reason: string): void {
    requireCanonicalOwner(this.sqlite, principal);
    transaction(this.sqlite, () => {
      const identity = this.sqlite
        .prepare('SELECT user_id,email FROM mail_identity WHERE stalwart_account_id=?')
        .get(stalwartAccountId) as { user_id: string; email: string } | undefined;
      const revoked = identity
        ? Number(
            this.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(identity.user_id)
              .changes,
          )
        : 0;
      recordAuditEvent(
        this.sqlite,
        principal,
        'mailbox.password_update',
        'mailbox',
        stalwartAccountId,
        {
          reason,
          outcome: 'password_updated',
          linkedEmail: identity?.email ?? null,
        },
      );
      if (identity)
        recordAuditEvent(
          this.sqlite,
          principal,
          'mailbox.sessions_revoke',
          'user',
          identity.user_id,
          {
            email: identity.email,
            reason: 'mailbox_password_updated',
            revokedCount: revoked,
          },
        );
    });
  }

  finalizeMailboxDestroy(
    principal: Principal,
    stalwartAccountId: string,
    email: string,
    reason: string,
  ): void {
    requireCanonicalOwner(this.sqlite, principal);
    transaction(this.sqlite, () => {
      const identity = this.sqlite
        .prepare('SELECT user_id,email,status FROM mail_identity WHERE stalwart_account_id=?')
        .get(stalwartAccountId) as { user_id: string; email: string; status: string } | undefined;
      const now = new Date().toISOString();
      if (identity)
        this.sqlite
          .prepare(
            `UPDATE mail_identity SET status='archived',archived_at=?,updated_at=?,version=version+1
             WHERE user_id=?`,
          )
          .run(now, now, identity.user_id);
      const revoked = identity
        ? Number(
            this.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(identity.user_id)
              .changes,
          )
        : 0;
      recordAuditEvent(this.sqlite, principal, 'mailbox.destroy', 'mailbox', stalwartAccountId, {
        email,
        reason,
        outcome: 'destroyed',
        portalAccountPreserved: true,
        mailIdentityArchived: Boolean(identity),
      });
      if (identity)
        recordAuditEvent(
          this.sqlite,
          principal,
          'mailbox.sessions_revoke',
          'user',
          identity.user_id,
          {
            email: identity.email,
            reason: 'mailbox_destroyed',
            revokedCount: revoked,
          },
        );
    });
  }

  recordExternalMutation(
    principal: Principal,
    action: 'mailbox.create' | 'mailbox.password_update' | 'mailbox.destroy',
    stalwartAccountId: string,
    details: Record<string, unknown>,
  ): void {
    requireCanonicalOwner(this.sqlite, principal);
    recordAuditEvent(this.sqlite, principal, action, 'mailbox', stalwartAccountId, details);
  }
}
