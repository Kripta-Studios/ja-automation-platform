import type { DatabaseSync } from 'node:sqlite';
import type { Principal, Role } from '@ja/domain';
import {
  CANONICAL_OWNER_EMAIL,
  MailIdentityRepository,
  type MailboxIdentityInput,
} from '@ja/database';
import {
  createConfiguredStalwartClient,
  type StalwartClient,
  type StalwartMailbox,
} from './stalwart-client.ts';
import { refreshLinkedPortalHash } from './webmail-password.ts';

export type MailboxAccount = Readonly<{
  id: string;
  username: string;
  email: string;
  name: string;
  quotaBytes: number | null;
  usedDiskQuotaBytes: number | null;
  isProvisioned: boolean;
  portalRole?: string;
  portalUserId?: string;
  portalStatus?: string;
  /** When the linked portal access was removed (offboarded/archived). */
  portalOffboardedAt?: string | null;
  /** Stalwart sign-in state; null when the mail server could not be asked. */
  signInBlocked: boolean | null;
}>;

export class MailboxSagaPartialFailureError extends Error {
  constructor(
    public readonly externalOutcome: 'created' | 'password_updated' | 'destroyed',
    public readonly stalwartAccountId: string,
  ) {
    super(`MAILBOX_PARTIAL_FAILURE_${externalOutcome.toUpperCase()}`);
    this.name = 'MailboxSagaPartialFailureError';
  }
}

export type MailDirectoryDependencies = Readonly<{ stalwart?: StalwartClient }>;
type ExternalOperation = 'create' | 'password_update' | 'destroy';
const ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9_-]|\.(?!\.)){0,62}[a-z0-9]$/u;
const PORTAL_ROLES = ['worker', 'project_manager', 'finance_admin', 'auditor_read_only'] as const;

function normalizeAlias(value: string): string {
  const alias = value.trim().toLowerCase();
  if (alias.length < 2 || alias.length > 64 || !ALIAS_PATTERN.test(alias))
    throw new Error('MAILBOX_ALIAS_INVALID');
  return alias;
}

function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 128 || /[\r\n\0]/u.test(password))
    throw new Error('MAILBOX_PASSWORD_INVALID');
}

/** Validate before saving portal access, so invalid mailbox input creates neither account. */
export async function validateLocalAccountMailbox(
  email: string,
  password: string,
): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith('@j-aautomation.com')) throw new Error('MAILBOX_EMAIL_INVALID');
  const username = normalizeAlias(normalized.slice(0, -'@j-aautomation.com'.length));
  validatePassword(password);
  const mailboxes = await (await configuredClient()).listMailboxes();
  if (mailboxes.some((mailbox) => mailbox.email.toLowerCase() === normalized))
    throw new Error('LOCAL_MAILBOX_ALREADY_EXISTS');
  return username;
}

function toQuotaBytes(quotaMb: number): number {
  if (!Number.isSafeInteger(quotaMb) || quotaMb < 0 || quotaMb > 10_485_760)
    throw new Error('MAILBOX_QUOTA_INVALID');
  const bytes = quotaMb * 1_048_576;
  if (!Number.isSafeInteger(bytes)) throw new Error('MAILBOX_QUOTA_INVALID');
  return bytes;
}

async function configuredClient(dependencies?: MailDirectoryDependencies): Promise<StalwartClient> {
  return dependencies?.stalwart ?? createConfiguredStalwartClient();
}

function identity(mailbox: StalwartMailbox): MailboxIdentityInput {
  return { stalwartAccountId: mailbox.id, email: mailbox.email, name: mailbox.name };
}

function beginExternalCommand(
  sqlite: DatabaseSync,
  principal: Principal,
  idempotencyKeyInput: string,
  operation: ExternalOperation,
  targetKey: string,
): {
  state: 'new' | 'pending' | 'external_done' | 'complete';
  resultJson: string | null;
  commandKey: string;
} {
  const idempotencyKey = idempotencyKeyInput.trim();
  if (idempotencyKey.length < 16 || idempotencyKey.length > 200)
    throw new Error('MAILBOX_IDEMPOTENCY_KEY_INVALID');
  const existing = sqlite
    .prepare(
      `SELECT actor_id actorId,operation,target_key targetKey,status,result_json resultJson
       FROM mailbox_external_command WHERE idempotency_key=?`,
    )
    .get(idempotencyKey) as
    | {
        actorId: string;
        operation: string;
        targetKey: string;
        status: string;
        resultJson: string | null;
      }
    | undefined;
  if (existing) {
    if (
      existing.actorId !== principal.userId ||
      existing.operation !== operation ||
      existing.targetKey !== targetKey
    )
      throw new Error('MAILBOX_IDEMPOTENCY_KEY_COLLISION');
    return {
      state: existing.status as 'pending' | 'external_done' | 'complete',
      resultJson: existing.resultJson,
      commandKey: idempotencyKey,
    };
  }
  const now = new Date().toISOString();
  try {
    sqlite
      .prepare(
        `INSERT INTO mailbox_external_command(
           idempotency_key,actor_id,operation,target_key,status,created_at,updated_at
         ) VALUES(?,?,?,?,'pending',?,?)`,
      )
      .run(idempotencyKey, principal.userId, operation, targetKey, now, now);
  } catch (error) {
    const unresolved = sqlite
      .prepare(
        `SELECT idempotency_key commandKey,status,result_json resultJson
         FROM mailbox_external_command
         WHERE actor_id=? AND operation=? AND target_key=? AND status<>'complete'`,
      )
      .get(principal.userId, operation, targetKey) as
      | { commandKey: string; status: 'pending' | 'external_done'; resultJson: string | null }
      | undefined;
    if (unresolved)
      return {
        state: unresolved.status,
        resultJson: unresolved.resultJson,
        commandKey: unresolved.commandKey,
      };
    throw error;
  }
  return { state: 'new', resultJson: null, commandKey: idempotencyKey };
}

function markExternalDone(sqlite: DatabaseSync, idempotencyKey: string, result?: unknown): void {
  sqlite
    .prepare(
      "UPDATE mailbox_external_command SET status='external_done',result_json=?,updated_at=? WHERE idempotency_key=? AND status='pending'",
    )
    .run(
      result === undefined ? null : JSON.stringify(result),
      new Date().toISOString(),
      idempotencyKey.trim(),
    );
}

function completeExternalCommand(
  sqlite: DatabaseSync,
  idempotencyKey: string,
  result?: unknown,
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `UPDATE mailbox_external_command SET status='complete',result_json=?,updated_at=?,completed_at=?
       WHERE idempotency_key=? AND status='external_done'`,
    )
    .run(result === undefined ? null : JSON.stringify(result), now, now, idempotencyKey.trim());
}

export async function listMailboxAccounts(
  sqlite: DatabaseSync,
  dependencies?: MailDirectoryDependencies,
): Promise<MailboxAccount[]> {
  const mailboxes = await (await configuredClient(dependencies)).listMailboxes();
  const users = sqlite
    .prepare(
      `SELECT u.id,u.email,u.role,u.status,u.offboarded_at offboardedAt,
              mi.stalwart_account_id stalwartAccountId
     FROM user u JOIN mail_identity mi ON mi.user_id=u.id AND mi.status='active'`,
    )
    .all() as Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    offboardedAt: string | null;
    stalwartAccountId: string;
  }>;
  const userByIdentity = new Map(
    users.map((user) => [`${user.stalwartAccountId}\0${user.email.trim().toLowerCase()}`, user]),
  );
  return mailboxes.map((mailbox) => {
    const user = userByIdentity.get(`${mailbox.id}\0${mailbox.email.toLowerCase()}`);
    return {
      id: mailbox.id,
      username: mailbox.username,
      email: mailbox.email,
      name: mailbox.name,
      quotaBytes: mailbox.quotaBytes,
      usedDiskQuotaBytes: mailbox.usedDiskQuotaBytes,
      isProvisioned: Boolean(user),
      signInBlocked: mailbox.signInBlocked,
      ...(user
        ? {
            portalRole: user.role,
            portalUserId: user.id,
            portalStatus: user.status,
            portalOffboardedAt: user.offboardedAt,
          }
        : {}),
    };
  });
}

/**
 * Degraded directory for when Stalwart cannot be reached: the mailboxes the
 * portal itself knows (active `mail_identity` links). Portal-side actions
 * (reactivate, role) keep working; sign-in state is unknown (null) and
 * unlinked mailboxes cannot be listed.
 */
export function listPortalLinkedMailboxes(sqlite: DatabaseSync): MailboxAccount[] {
  const rows = sqlite
    .prepare(
      `SELECT mi.stalwart_account_id id,mi.email,COALESCE(NULLIF(trim(u.name),''),mi.email) name,
              u.id userId,u.role,u.status,u.offboarded_at offboardedAt
         FROM mail_identity mi JOIN user u ON u.id=mi.user_id
        WHERE mi.status='active'
        ORDER BY mi.email`,
    )
    .all() as Array<{
    id: string;
    email: string;
    name: string;
    userId: string;
    role: string;
    status: string;
    offboardedAt: string | null;
  }>;
  return rows.map((row) => {
    const email = row.email.toLowerCase();
    return {
      id: row.id,
      username: email.split('@')[0] ?? email,
      email,
      name: row.name,
      quotaBytes: null,
      usedDiskQuotaBytes: null,
      isProvisioned: true,
      signInBlocked: null,
      portalRole: row.role,
      portalUserId: row.userId,
      portalStatus: row.status,
      portalOffboardedAt: row.offboardedAt,
    };
  });
}

export type MailboxStatusFilter = 'all' | 'active' | 'offboarded' | 'unlinked' | 'blocked';
export const MAILBOX_STATUS_FILTERS: readonly MailboxStatusFilter[] = [
  'all',
  'active',
  'offboarded',
  'unlinked',
  'blocked',
];
export const MAILBOX_PAGE_SIZE = 25;

export type MailboxDirectoryQuery = Readonly<{
  q: string;
  status: MailboxStatusFilter;
  page: number;
}>;

export type MailboxDirectoryMeta = Readonly<{
  source: 'live' | 'portal';
  q: string;
  status: MailboxStatusFilter;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  filtered: number;
  counts: Record<MailboxStatusFilter, number>;
  /** Offboarded/suspended people whose mailbox still accepts sign-in. */
  stillSigningIn: number;
}>;

export function mailboxQueryFrom(url: URL): MailboxDirectoryQuery {
  const status = url.searchParams.get('mstatus') as MailboxStatusFilter | null;
  const page = Number.parseInt(url.searchParams.get('mpage') ?? '1', 10);
  return {
    q: (url.searchParams.get('mq') ?? '').trim().slice(0, 120),
    status: status && MAILBOX_STATUS_FILTERS.includes(status) ? status : 'all',
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

function portalInactive(account: MailboxAccount): boolean {
  return account.isProvisioned && (account.portalStatus ?? 'active') !== 'active';
}

function matchesStatus(account: MailboxAccount, status: MailboxStatusFilter): boolean {
  switch (status) {
    case 'active':
      return account.isProvisioned && !portalInactive(account);
    case 'offboarded':
      return portalInactive(account);
    case 'unlinked':
      return !account.isProvisioned;
    case 'blocked':
      return account.signInBlocked === true;
    default:
      return true;
  }
}

/**
 * Server-side search, status filter and pagination for the Mailboxes tab.
 * People who left but can still sign in to Webmail are listed first.
 */
export function pageMailboxDirectory(
  accounts: readonly MailboxAccount[],
  query: MailboxDirectoryQuery,
  source: 'live' | 'portal',
): { rows: MailboxAccount[]; meta: MailboxDirectoryMeta } {
  const needle = fold(query.q);
  const counts = Object.fromEntries(
    MAILBOX_STATUS_FILTERS.map((status) => [
      status,
      accounts.filter((account) => matchesStatus(account, status)).length,
    ]),
  ) as Record<MailboxStatusFilter, number>;
  // Left/suspended people whose mailbox is not known to be blocked come first.
  const attention = (account: MailboxAccount) =>
    portalInactive(account) && account.signInBlocked !== true ? 0 : 1;
  const filtered = accounts
    .filter((account) => matchesStatus(account, query.status))
    .filter(
      (account) =>
        !needle ||
        fold(`${account.email} ${account.username} ${account.name}`).includes(needle),
    )
    .sort((a, b) => attention(a) - attention(b) || a.email.localeCompare(b.email));
  const pageCount = Math.max(1, Math.ceil(filtered.length / MAILBOX_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  return {
    rows: filtered.slice((page - 1) * MAILBOX_PAGE_SIZE, page * MAILBOX_PAGE_SIZE),
    meta: {
      source,
      q: query.q,
      status: query.status,
      page,
      pageSize: MAILBOX_PAGE_SIZE,
      pageCount,
      total: accounts.length,
      filtered: filtered.length,
      counts,
      stillSigningIn: accounts.filter(
        (account) => portalInactive(account) && account.signInBlocked === false,
      ).length,
    },
  };
}

export type MailboxSignInOutcome =
  | 'blocked'
  | 'unblocked'
  | 'already_blocked'
  | 'already_unblocked'
  | 'no_mailbox'
  | 'unavailable'
  | 'rejected'
  | 'not_allowed';

/**
 * Block (or unblock) Webmail/IMAP/POP3 sign-in for one Stalwart mailbox, keep
 * all mail. Canonical Owner only; the Owner mailbox is protected. Audited as
 * an external mailbox mutation with the reviewed `mailbox.sign_in_block` /
 * `mailbox.sign_in_unblock` actions (migration 0079).
 */
export async function setMailboxSignInBlocked(
  sqlite: DatabaseSync,
  principal: Principal,
  input: { stalwartAccountId: string; email: string; blocked: boolean; reason: string },
  dependencies?: MailDirectoryDependencies,
): Promise<'blocked' | 'unblocked' | 'already_blocked' | 'already_unblocked'> {
  const repository = new MailIdentityRepository(sqlite);
  repository.assertCanonicalOwner(principal);
  const email = input.email.trim().toLowerCase();
  const reason = input.reason.trim();
  if (!reason) throw new Error('MAILBOX_CHANGE_REASON_REQUIRED');
  if (!input.stalwartAccountId.trim() || input.stalwartAccountId.length > 254)
    throw new Error('STALWART_ACCOUNT_ID_INVALID');
  if (email === CANONICAL_OWNER_EMAIL) throw new Error('CANONICAL_OWNER_MAILBOX_PROTECTED');
  const linked = repository
    .list()
    .find((row) => row.stalwartAccountId === input.stalwartAccountId && row.status === 'active');
  if (linked && linked.email.toLowerCase() !== email) throw new Error('MAIL_IDENTITY_COLLISION');
  const stalwart = await configuredClient(dependencies);
  const result = await stalwart.setSignInBlocked(input.stalwartAccountId, input.blocked);
  if (result.email !== email) throw new Error('MAILBOX_NOT_FOUND_IN_STALWART');
  const changed = result.wasBlocked !== input.blocked;
  repository.recordExternalMutation(
    principal,
    input.blocked ? 'mailbox.sign_in_block' : 'mailbox.sign_in_unblock',
    input.stalwartAccountId,
    {
    operation: input.blocked ? 'sign_in_block' : 'sign_in_unblock',
    outcome: changed
      ? input.blocked
        ? 'sign_in_blocked'
        : 'sign_in_unblocked'
      : 'unchanged',
    method: 'stalwart_disabled_permissions',
    mailPreserved: true,
    email,
    linkedUserId: linked?.userId ?? null,
    reason,
    before: { signInBlocked: result.wasBlocked },
    after: { signInBlocked: input.blocked },
  });
  if (input.blocked) return changed ? 'blocked' : 'already_blocked';
  return changed ? 'unblocked' : 'already_unblocked';
}

/**
 * Best effort for portal status changes: the portal-side change is already
 * committed; a mail server outage must never undo or block it. Returns what
 * happened so the screen can say it plainly (and offer a retry).
 */
export async function setLinkedMailboxSignIn(
  sqlite: DatabaseSync,
  principal: Principal,
  userId: string,
  blocked: boolean,
  reason: string,
  dependencies?: MailDirectoryDependencies,
): Promise<{ outcome: MailboxSignInOutcome; email?: string }> {
  const identity = sqlite
    .prepare(
      "SELECT stalwart_account_id stalwartAccountId,email FROM mail_identity WHERE user_id=? AND status='active'",
    )
    .get(userId) as { stalwartAccountId: string; email: string } | undefined;
  if (!identity) return { outcome: 'no_mailbox' };
  try {
    const outcome = await setMailboxSignInBlocked(
      sqlite,
      principal,
      { stalwartAccountId: identity.stalwartAccountId, email: identity.email, blocked, reason },
      dependencies,
    );
    return { outcome, email: identity.email };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    console.error(
      JSON.stringify({
        event: 'mailbox.sign_in_change_failed',
        blocked,
        error: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
      }),
    );
    const message = error instanceof Error ? error.message : '';
    return {
      outcome:
        message === 'CANONICAL_OWNER_REQUIRED' || message === 'CANONICAL_OWNER_MAILBOX_PROTECTED'
          ? 'not_allowed'
          : name === 'StalwartOperationRejectedError'
            ? 'rejected'
            : 'unavailable',
      email: identity.email,
    };
  }
}

export async function provisionMailboxUsers(
  sqlite: DatabaseSync,
  principal: Principal,
  input: { emails: readonly string[]; role: Exclude<Role, 'owner_admin'> },
  dependencies?: MailDirectoryDependencies,
) {
  if (!PORTAL_ROLES.includes(input.role)) throw new Error('MAILBOX_ROLE_INVALID');
  const live = await (await configuredClient(dependencies)).listMailboxes();
  const byEmail = new Map(live.map((mailbox) => [mailbox.email.toLowerCase(), mailbox]));
  const selected = input.emails.map((rawEmail) => {
    const mailbox = byEmail.get(rawEmail.trim().toLowerCase());
    if (!mailbox) throw new Error('MAILBOX_NOT_FOUND_IN_STALWART');
    return identity(mailbox);
  });
  return new MailIdentityRepository(sqlite).provision(principal, selected, input.role);
}

export async function bootstrapMailboxUsers(
  sqlite: DatabaseSync,
  principal: Principal,
  dependencies?: MailDirectoryDependencies,
) {
  const live = await (await configuredClient(dependencies)).listMailboxes();
  return new MailIdentityRepository(sqlite).bootstrap(principal, live.map(identity));
}

export async function createMailboxAccount(
  sqlite: DatabaseSync,
  principal: Principal,
  input: {
    username: string;
    name: string;
    password: string;
    quotaMb: number;
    provisionRole?: Exclude<Role, 'owner_admin'>;
    idempotencyKey: string;
  },
  dependencies?: MailDirectoryDependencies,
): Promise<MailboxAccount> {
  const repository = new MailIdentityRepository(sqlite);
  repository.assertCanonicalOwner(principal);
  const username = normalizeAlias(input.username);
  validatePassword(input.password);
  const displayName = input.name.trim();
  if (!displayName || displayName.length > 160) throw new Error('MAILBOX_NAME_INVALID');
  const replay = beginExternalCommand(sqlite, principal, input.idempotencyKey, 'create', username);
  if (replay.state === 'complete') {
    if (!replay.resultJson) throw new Error('MAILBOX_COMMAND_RESULT_MISSING');
    return JSON.parse(replay.resultJson) as MailboxAccount;
  }
  const stalwart = await configuredClient(dependencies);
  let created: StalwartMailbox;
  if (replay.state === 'external_done') {
    if (!replay.resultJson) throw new Error('MAILBOX_COMMAND_RESULT_MISSING');
    created = JSON.parse(replay.resultJson) as StalwartMailbox;
  } else {
    const existingLive =
      replay.state === 'pending'
        ? (await stalwart.listMailboxes()).find((mailbox) => mailbox.username === username)
        : undefined;
    created =
      existingLive ??
      (await stalwart.createMailbox({
        username,
        name: displayName,
        password: input.password,
        quotaBytes: toQuotaBytes(input.quotaMb),
      }));
    markExternalDone(sqlite, replay.commandKey, created);
  }
  try {
    repository.recordExternalMutation(principal, 'mailbox.create', created.id, {
      email: created.email,
      quotaBytes: created.quotaBytes,
      outcome: 'created',
    });
    repository.provision(principal, [identity(created)], input.provisionRole ?? 'worker');
  } catch {
    throw new MailboxSagaPartialFailureError('created', created.id);
  }
  const linked = repository.findByEmail(created.email);
  const result: MailboxAccount = {
    id: created.id,
    username: created.username,
    email: created.email,
    name: created.name,
    quotaBytes: created.quotaBytes,
    usedDiskQuotaBytes: created.usedDiskQuotaBytes,
    isProvisioned: Boolean(linked),
    signInBlocked: false,
    ...(linked
      ? {
          portalRole: input.provisionRole ?? 'worker',
          portalUserId: linked.userId,
          portalStatus: 'active',
        }
      : {}),
  };
  completeExternalCommand(sqlite, replay.commandKey, result);
  return result;
}

export async function updateMailboxPassword(
  sqlite: DatabaseSync,
  principal: Principal,
  input: {
    stalwartAccountId: string;
    password: string;
    reason: string;
    email: string;
    confirmation: string;
    idempotencyKey: string;
  },
  dependencies?: MailDirectoryDependencies,
): Promise<void> {
  const repository = new MailIdentityRepository(sqlite);
  repository.assertCanonicalOwner(principal);
  validatePassword(input.password);
  if (!input.reason.trim()) throw new Error('MAILBOX_CHANGE_REASON_REQUIRED');
  const email = input.email.trim().toLowerCase();
  if (!email || input.confirmation.trim().toLowerCase() !== email)
    throw new Error('MAILBOX_PASSWORD_CONFIRMATION_INVALID');
  const replay = beginExternalCommand(
    sqlite,
    principal,
    input.idempotencyKey,
    'password_update',
    input.stalwartAccountId,
  );
  if (replay.state === 'complete') return;
  const stalwart = await configuredClient(dependencies);
  if (replay.state === 'new' || replay.state === 'pending') {
    const live = await stalwart.listMailboxes();
    if (!live.some((mailbox) => mailbox.id === input.stalwartAccountId && mailbox.email === email))
      throw new Error('MAILBOX_NOT_FOUND_IN_STALWART');
    await stalwart.updatePassword(input.stalwartAccountId, input.password);
    markExternalDone(sqlite, replay.commandKey);
  }
  try {
    // One password per person: the linked portal login takes the same new
    // password, and finalizePasswordUpdate signs the person out everywhere.
    await refreshLinkedPortalHash(sqlite, input.stalwartAccountId, input.password);
    repository.finalizePasswordUpdate(principal, input.stalwartAccountId, input.reason.trim());
  } catch {
    throw new MailboxSagaPartialFailureError('password_updated', input.stalwartAccountId);
  }
  completeExternalCommand(sqlite, replay.commandKey);
}

export async function destroyMailboxAccount(
  sqlite: DatabaseSync,
  principal: Principal,
  input: {
    stalwartAccountId: string;
    email: string;
    confirmation: string;
    reason: string;
    idempotencyKey: string;
  },
  dependencies?: MailDirectoryDependencies,
): Promise<void> {
  const repository = new MailIdentityRepository(sqlite);
  repository.assertCanonicalOwner(principal);
  const submittedEmail = input.email.trim().toLowerCase();
  if (!input.reason.trim()) throw new Error('MAILBOX_CHANGE_REASON_REQUIRED');
  if (input.confirmation.trim().toLowerCase() !== `delete ${submittedEmail}`)
    throw new Error('MAILBOX_DESTROY_CONFIRMATION_INVALID');
  const replay = beginExternalCommand(
    sqlite,
    principal,
    input.idempotencyKey,
    'destroy',
    input.stalwartAccountId,
  );
  if (replay.state === 'complete') return;
  const stalwart = await configuredClient(dependencies);
  const linked = repository
    .list()
    .find((identity) => identity.stalwartAccountId === input.stalwartAccountId);
  const live =
    replay.state === 'new' || replay.state === 'pending' ? await stalwart.listMailboxes() : [];
  const target = live.find((mailbox) => mailbox.id === input.stalwartAccountId);
  const targetEmail =
    replay.state === 'external_done' || (replay.state === 'pending' && !target)
      ? submittedEmail
      : target?.email;
  if (!targetEmail || (target && target.email !== submittedEmail))
    throw new Error('MAILBOX_NOT_FOUND_IN_STALWART');
  if (targetEmail === CANONICAL_OWNER_EMAIL || linked?.email === CANONICAL_OWNER_EMAIL)
    throw new Error('CANONICAL_OWNER_MAILBOX_PROTECTED');
  if (linked && linked.email !== targetEmail) throw new Error('MAIL_IDENTITY_COLLISION');
  if (replay.state === 'new' || (replay.state === 'pending' && target)) {
    await stalwart.destroyMailbox(input.stalwartAccountId);
    markExternalDone(sqlite, replay.commandKey);
  } else if (replay.state === 'pending') {
    markExternalDone(sqlite, replay.commandKey);
  }
  try {
    repository.finalizeMailboxDestroy(
      principal,
      input.stalwartAccountId,
      targetEmail,
      input.reason.trim(),
    );
  } catch {
    throw new MailboxSagaPartialFailureError('destroyed', input.stalwartAccountId);
  }
  completeExternalCommand(sqlite, replay.commandKey);
}
