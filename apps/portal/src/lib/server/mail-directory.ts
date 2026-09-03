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
      `SELECT u.id,u.email,u.role,u.status,mi.stalwart_account_id stalwartAccountId
     FROM user u JOIN mail_identity mi ON mi.user_id=u.id AND mi.status='active'`,
    )
    .all() as Array<{
    id: string;
    email: string;
    role: string;
    status: string;
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
      ...(user ? { portalRole: user.role, portalUserId: user.id, portalStatus: user.status } : {}),
    };
  });
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
