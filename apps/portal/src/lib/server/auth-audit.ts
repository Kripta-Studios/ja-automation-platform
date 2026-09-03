import { createDatabase, recordAuditEvent } from '@ja/database';
import { APIError } from 'better-auth';
import type { AuthMiddleware } from 'better-auth/api';
import { parseCookies } from 'better-auth/cookies';
import { constantTimeEqual, makeSignature } from 'better-auth/crypto';

/**
 * Authentication actions which have a reviewed B5 audit contract.  Keep this
 * list closed: a request path must be explicitly mapped before it can produce
 * a trusted audit event.
 */
export const AUTH_AUDIT_ACTIONS = {
  mfaSetupStarted: { action: 'security.mfa.setup_started', entityType: 'user' },
  mfaEnable: { action: 'security.mfa.enable', entityType: 'user' },
  mfaDisable: { action: 'security.mfa.disable', entityType: 'user' },
  mfaRecoveryLogin: { action: 'security.mfa.recovery_login', entityType: 'user' },
  passkeyRegister: { action: 'security.passkey.register', entityType: 'passkey' },
  passkeyRevoke: { action: 'security.passkey.revoke', entityType: 'passkey' },
  passkeyLogin: { action: 'security.passkey.login', entityType: 'user' },
} as const;

/**
 * Internal marker for the SvelteKit MFA facade.  The facade invokes Better
 * Auth as a library and owns the projection/audit transaction itself.  A
 * symbol keeps this contract out of the HTTP body/headers, so a caller cannot
 * opt out of the plugin endpoint audit boundary by submitting a magic field.
 */
export const MANAGED_MFA_AUTH_CALL = Symbol('ja.managed-mfa-auth-call');

type AuthAuditAction = (typeof AUTH_AUDIT_ACTIONS)[keyof typeof AUTH_AUDIT_ACTIONS];

type AuthAuditRecord = Readonly<{
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  details?: Record<string, unknown>;
}>;

type AuthAuditAdapter = Readonly<{
  findOne: (input: {
    model: string;
    where: Array<{ field: string; value: string }>;
  }) => Promise<unknown>;
  create: (input: { model: string; data: Record<string, unknown> }) => Promise<unknown>;
  delete: (input: {
    model: string;
    where: Array<{ field: string; value: string }>;
  }) => Promise<unknown>;
  update: (input: {
    model: string;
    where: Array<{ field: string; value: string }>;
    update: Record<string, unknown>;
  }) => Promise<unknown>;
}>;

type AuthAuditInternalAdapter = Readonly<{
  deleteSession: (token: string) => Promise<void>;
  findUserById: (userId: string) => Promise<unknown>;
  findSession?: (token: string) => Promise<unknown>;
  findVerificationValue: (identifier: string) => Promise<unknown>;
  deleteVerificationByIdentifier?: (identifier: string) => Promise<void>;
}>;

type AuthCookie = Readonly<{ name?: string }>;

type AuthHookContext = {
  path?: string;
  body?: unknown;
  returned?: unknown;
  request?: unknown;
  headers?: Headers;
  context: {
    session?: { session?: { id?: string; token?: string }; user?: { id?: string } } | null;
    newSession?: { session?: { id?: string; token?: string }; user?: { id?: string } } | null;
    returned?: unknown;
    responseStatus?: number;
    responseHeaders?: Headers;
    adapter?: AuthAuditAdapter;
    internalAdapter?: AuthAuditInternalAdapter;
    authCookies?: { sessionToken?: AuthCookie };
    createAuthCookie?: (name: string) => { name: string };
    secret?: string;
  };
  /** Values attached by the before hook are exposed on the next hook context. */
  jaAuthAudit?: AuthAuditBeforeState;
  [MANAGED_MFA_AUTH_CALL]?: true;
};

export type AuthAuditBeforeState = Readonly<{
  path: string;
  action: AuthAuditAction;
  passkeyBefore?: Record<string, unknown>;
  twoFactorBefore?: Record<string, unknown>;
}>;

export class AuthAuditFailure extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AuthAuditFailure';
    this.cause = cause;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function pathWithoutPrefix(path: string | undefined): string {
  if (!path) return '';
  const marker = '/api/auth';
  const index = path.indexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) : path;
}

function actionForPath(path: string | undefined): AuthAuditAction | null {
  switch (pathWithoutPrefix(path)) {
    case '/two-factor/enable':
      return AUTH_AUDIT_ACTIONS.mfaSetupStarted;
    case '/two-factor/verify-totp':
      return AUTH_AUDIT_ACTIONS.mfaRecoveryLogin;
    case '/two-factor/verify-backup-code':
      return AUTH_AUDIT_ACTIONS.mfaRecoveryLogin;
    case '/two-factor/disable':
      return AUTH_AUDIT_ACTIONS.mfaDisable;
    case '/passkey/verify-registration':
      return AUTH_AUDIT_ACTIONS.passkeyRegister;
    case '/passkey/generate-register-options':
      return AUTH_AUDIT_ACTIONS.passkeyRegister;
    case '/passkey/generate-authenticate-options':
      return AUTH_AUDIT_ACTIONS.passkeyLogin;
    case '/passkey/delete-passkey':
      return AUTH_AUDIT_ACTIONS.passkeyRevoke;
    case '/passkey/verify-authentication':
      return AUTH_AUDIT_ACTIONS.passkeyLogin;
    case '/two-factor/generate-backup-codes':
      return AUTH_AUDIT_ACTIONS.mfaSetupStarted;
    default:
      return null;
  }
}

function passkeyIdFromBody(body: unknown): string | undefined {
  const record = asRecord(body);
  return stringValue(record?.id);
}

function passkeyCredentialIdFromBody(body: unknown): string | undefined {
  const record = asRecord(body);
  const response = asRecord(record?.response);
  return stringValue(response?.id);
}

function passkeyIdFromReturned(returned: unknown): string | undefined {
  const outer = asRecord(returned);
  const nested = asRecord(outer?.passkey);
  return stringValue(nested?.id) ?? stringValue(outer?.id);
}

function userIdFromReturned(returned: unknown): string | undefined {
  const outer = asRecord(returned);
  const user = asRecord(outer?.user);
  const nested = asRecord(outer?.data);
  const nestedUser = asRecord(nested?.user);
  return stringValue(user?.id) ?? stringValue(nestedUser?.id) ?? stringValue(outer?.userId);
}

export function authUserId(context: AuthHookContext): string | undefined {
  return (
    stringValue(context.context.session?.user?.id) ??
    stringValue(context.context.newSession?.user?.id) ??
    userIdFromReturned(context.context.returned) ??
    userIdFromReturned(context.returned)
  );
}

function getSessionId(context: AuthHookContext): string | undefined {
  return (
    stringValue(context.context.session?.session?.id) ??
    stringValue(context.context.newSession?.session?.id)
  );
}

function auditRegistryReady(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  action: { action: string; entityType: string },
): void {
  const hasRegistry = Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='audit_action_registry'")
      .get(),
  );
  if (!hasRegistry) throw new Error('AUDIT_REGISTRY_UNAVAILABLE');
  const registered = sqlite
    .prepare(
      `SELECT 1 FROM audit_action_registry
       WHERE contract_version='B5-R4' AND action=? AND entity_type=? AND actor_kind='user'`,
    )
    .get(action.action, action.entityType);
  if (!registered) throw new Error('AUDIT_ACTION_NOT_REVIEWED');
  const deployment = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as { tenant_id: string; deployment_id: string } | undefined;
  if (!deployment) throw new Error('DEPLOYMENT_IDENTITY_MISSING');
}

/**
 * Fail closed before Better Auth mutates its tables.  This is deliberately
 * separate from recordAuthAudit: a missing reviewed row must not allow an
 * authentication mutation to happen and only fail when the audit is written.
 */
export function assertAuthAuditReady(actions: readonly AuthAuditAction[]): void {
  const database = createDatabase();
  try {
    const seen = new Set<string>();
    for (const action of actions) {
      const key = `${action.action}:${action.entityType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      auditRegistryReady(database.sqlite, action);
    }
  } catch (error) {
    throw new AuthAuditFailure('AUTH_AUDIT_UNAVAILABLE', error);
  } finally {
    database.sqlite.close();
  }
}

/**
 * Write through the canonical redacting writer.  Callers may pass a database
 * already inside a transaction so local projections and the audit event share
 * one commit boundary.
 */
export function recordAuthAudit(
  record: AuthAuditRecord,
  sqlite?: ReturnType<typeof createDatabase>['sqlite'],
): void {
  const database = sqlite ? null : createDatabase();
  const connection = sqlite ?? database?.sqlite;
  if (!connection) throw new AuthAuditFailure('AUTH_AUDIT_UNAVAILABLE');
  try {
    auditRegistryReady(connection, {
      action: record.action,
      entityType: record.entityType,
    });
    recordAuditEvent(
      connection,
      { userId: record.userId },
      record.action,
      record.entityType,
      record.entityId,
      {
        ...record.details,
        authAudit: true,
      },
    );
  } catch (error) {
    throw new AuthAuditFailure('AUTH_AUDIT_WRITE_FAILED', error);
  } finally {
    database?.sqlite.close();
  }
}

function passkeyRecordFromAdapter(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = stringValue(record.id);
  return id ? { ...record } : undefined;
}

function inactiveCredentialError(): APIError {
  return APIError.from('UNAUTHORIZED', {
    code: 'INVALID_EMAIL_OR_PASSWORD',
    message: 'Invalid email or password',
  });
}

function authResponseStatus(context: AuthHookContext): number | undefined {
  const status = context.context.responseStatus;
  if (typeof status === 'number') return status;
  const returned = context.context.returned ?? context.returned;
  if (returned instanceof Response) return returned.status;
  const returnedRecord = asRecord(returned);
  return typeof returnedRecord?.statusCode === 'number' ? returnedRecord.statusCode : undefined;
}

function genericWebAuthnFailureResponse(context: AuthHookContext): APIError | Response {
  const error = inactiveCredentialError();
  // auth.handler must receive a concrete Response so the status is normalized
  // even when the failed plugin endpoint originally returned 400.  Direct
  // auth.api callers still receive Better Auth's native APIError contract.
  if (context.request) {
    return new Response(JSON.stringify(error.body), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
  }
  return error;
}

/**
 * Resolve the user carried by Better Auth's MFA challenge without consuming
 * it. The installed two-factor plugin uses the signed `two_factor` cookie as
 * the verification identifier and stores the canonical user id as its value.
 * Mirroring that public endpoint-context lookup here keeps the preflight ahead
 * of challenge consumption, attempt counters, backup-code rotation and
 * session creation.
 */
async function mfaChallengeUserId(context: AuthHookContext): Promise<string | undefined> {
  const sessionUserId = stringValue(context.context.session?.user?.id);
  if (sessionUserId) return sessionUserId;
  const { createAuthCookie, secret, internalAdapter } = context.context;
  if (!createAuthCookie || !secret || !internalAdapter) return;
  const cookie = createAuthCookie('two_factor');
  const encoded = parseCookies(context.headers?.get('cookie') ?? '').get(cookie.name);
  if (!encoded) return;
  const signatureStart = encoded.lastIndexOf('.');
  if (signatureStart < 1) return;
  const identifier = encoded.slice(0, signatureStart);
  const suppliedSignature = encoded.slice(signatureStart + 1);
  const expectedSignature = await makeSignature(identifier, secret);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return;
  const verification = asRecord(await internalAdapter.findVerificationValue(identifier));
  return stringValue(verification?.value);
}

/**
 * Resolve the user behind a signed Better Auth session cookie before the
 * endpoint's own session middleware runs. The global auth hook executes ahead
 * of endpoint middleware, so relying on `context.session` here would leave a
 * suspended identity able to reach a mutating plugin handler.
 */
async function requestSessionUserId(context: AuthHookContext): Promise<string | undefined> {
  const sessionUserId = stringValue(context.context.session?.user?.id);
  if (sessionUserId) return sessionUserId;

  const cookieName = stringValue(context.context.authCookies?.sessionToken?.name);
  const secret = context.context.secret;
  const internalAdapter = context.context.internalAdapter;
  if (!cookieName || !secret || !internalAdapter?.findSession) return;

  const encoded = parseCookies(context.headers?.get('cookie') ?? '').get(cookieName);
  if (!encoded) return;
  const signatureStart = encoded.lastIndexOf('.');
  if (signatureStart < 1) return;
  const token = encoded.slice(0, signatureStart);
  const suppliedSignature = encoded.slice(signatureStart + 1);
  const expectedSignature = await makeSignature(token, secret);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return;

  const session = asRecord(await internalAdapter.findSession(token));
  const sessionRecord = asRecord(session?.session);
  return stringValue(sessionRecord?.userId);
}

/**
 * An inactive identity must be rejected before a credential endpoint mutates
 * protocol state. Missing/invalid identities are left to Better Auth so its
 * normal generic protocol errors remain unchanged.
 */
async function assertCredentialUserIsActive(
  context: AuthHookContext,
  userId: string | undefined,
): Promise<void> {
  if (!userId) return;
  const internalAdapter = context.context.internalAdapter;
  if (!internalAdapter) throw new AuthAuditFailure('AUTH_USER_LOOKUP_UNAVAILABLE');
  const user = asRecord(await internalAdapter.findUserById(userId));
  if (stringValue(user?.status) !== 'active') throw inactiveCredentialError();
}

/**
 * Better Auth's HTTP endpoints are plugin-owned. These hooks add the same
 * audit/compensation boundary to passkey and recovery-code operations without
 * reimplementing Better Auth's WebAuthn or TOTP protocols.
 */
async function authAuditBeforeImplementation(context: AuthHookContext): Promise<void | {
  response: {
    context: {
      jaAuthAudit: AuthAuditBeforeState;
    };
  };
}> {
  // The local MFA facade performs the reviewed preflight and commits the
  // product projection plus canonical audit event.  Better Auth still owns
  // the protocol and its tables, but must not emit a duplicate event here.
  if (context[MANAGED_MFA_AUTH_CALL]) return;
  const path = pathWithoutPrefix(context.path);
  const action = actionForPath(context.path);
  if (!action) return;
  // The same TOTP endpoint is used for both the authenticated enrollment
  // verification and the sign-in/recovery journey.  Preflight both reviewed
  // actions before Better Auth can consume a code or rotate a session; the
  // after hook selects the one that matches the resolved session context.
  assertAuthAuditReady(
    path === '/two-factor/verify-totp'
      ? [AUTH_AUDIT_ACTIONS.mfaRecoveryLogin, AUTH_AUDIT_ACTIONS.mfaEnable]
      : [action],
  );

  // The plugin's session/fresh-session middleware runs after this global
  // hook. Resolve the signed session ourselves so inactive identities are
  // fenced before passkey/MFA management endpoints can mutate state.
  let requestUserId: string | undefined;
  if (
    path === '/passkey/generate-register-options' ||
    path === '/passkey/verify-registration' ||
    path === '/passkey/delete-passkey' ||
    path === '/two-factor/enable' ||
    path === '/two-factor/disable' ||
    path === '/two-factor/generate-backup-codes'
  ) {
    requestUserId = await requestSessionUserId(context);
    await assertCredentialUserIsActive(context, requestUserId);
  } else if (path === '/passkey/generate-authenticate-options') {
    // Passkey authentication options are intentionally available before a
    // user is known. When an old session is present, however, it must still
    // be fenced before the endpoint creates a challenge. Anonymous option
    // generation has no user actor and therefore has no user audit event.
    requestUserId = await requestSessionUserId(context);
    await assertCredentialUserIsActive(context, requestUserId);
    if (!requestUserId) return;
  }

  let passkeyBefore: Record<string, unknown> | undefined;
  let twoFactorBefore: Record<string, unknown> | undefined;
  if (
    (path === '/passkey/delete-passkey' || path === '/passkey/verify-authentication') &&
    context.context.adapter
  ) {
    const id =
      path === '/passkey/delete-passkey'
        ? passkeyIdFromBody(context.body)
        : passkeyCredentialIdFromBody(context.body);
    if (!id) {
      if (path === '/passkey/verify-authentication') throw inactiveCredentialError();
      throw new AuthAuditFailure('PASSKEY_ID_REQUIRED');
    }
    const existing = await context.context.adapter.findOne({
      model: 'passkey',
      where: [
        {
          field: path === '/passkey/delete-passkey' ? 'id' : 'credentialID',
          value: id,
        },
      ],
    });
    passkeyBefore = passkeyRecordFromAdapter(existing);
    if (!passkeyBefore) {
      // Authentication must not reveal whether a credential id belongs to an
      // inactive identity or does not exist. Management/revocation retains
      // its explicit not-found failure behind an authenticated session.
      if (path === '/passkey/verify-authentication') throw inactiveCredentialError();
      throw new AuthAuditFailure('PASSKEY_NOT_FOUND');
    }
  }
  if (path === '/two-factor/generate-backup-codes' && requestUserId) {
    if (!context.context.adapter)
      throw new AuthAuditFailure('TWO_FACTOR_AUDIT_CONTEXT_UNAVAILABLE');
    const existing = await context.context.adapter.findOne({
      model: 'twoFactor',
      where: [{ field: 'userId', value: requestUserId }],
    });
    twoFactorBefore = passkeyRecordFromAdapter(existing);
  }
  if (path === '/passkey/verify-authentication')
    await assertCredentialUserIsActive(context, stringValue(passkeyBefore?.userId));
  else if (path === '/two-factor/verify-totp' || path === '/two-factor/verify-backup-code')
    await assertCredentialUserIsActive(context, await mfaChallengeUserId(context));
  // The Better Auth global-hook dispatcher expects middleware context under
  // `response.context`; returning a bare context object is ignored and would
  // silently disable the after-hook audit/compensation boundary.
  return {
    response: {
      context: { jaAuthAudit: { path, action, passkeyBefore, twoFactorBefore } },
    },
  };
}

async function compensatePasskeyRegistration(
  context: AuthHookContext,
  returned: unknown,
): Promise<void> {
  const id = passkeyIdFromReturned(returned);
  if (!id || !context.context.adapter)
    throw new AuthAuditFailure('PASSKEY_AUDIT_COMPENSATION_UNAVAILABLE');
  await context.context.adapter.delete({ model: 'passkey', where: [{ field: 'id', value: id }] });
  await compensateCreatedSession(context, returned);
}

async function compensatePasskeyRevoke(
  context: AuthHookContext,
  before: Record<string, unknown> | undefined,
): Promise<void> {
  if (!before || !context.context.adapter)
    throw new AuthAuditFailure('PASSKEY_AUDIT_COMPENSATION_UNAVAILABLE');
  await context.context.adapter.create({ model: 'passkey', data: before });
}

async function compensatePasskeyAuthentication(
  context: AuthHookContext,
  before: Record<string, unknown> | undefined,
  returned: unknown,
): Promise<void> {
  const id = stringValue(before?.id);
  const counter = before?.counter;
  if (!id || typeof counter !== 'number' || !context.context.adapter)
    throw new AuthAuditFailure('PASSKEY_AUDIT_COMPENSATION_UNAVAILABLE');
  await context.context.adapter.update({
    model: 'passkey',
    where: [{ field: 'id', value: id }],
    update: { counter },
  });
  await compensateCreatedSession(context, returned);
}

async function compensateCreatedSession(
  context: AuthHookContext,
  returned: unknown,
): Promise<void> {
  const result = asRecord(returned);
  const session = asRecord(result?.session);
  const token =
    stringValue(session?.token) ?? stringValue(context.context.newSession?.session?.token);
  // Registration without createSession does not create a Better Auth session;
  // there is therefore nothing to compensate on that successful path.
  if (!token) return;
  if (!context.context.internalAdapter)
    throw new AuthAuditFailure('AUTH_AUDIT_COMPENSATION_UNAVAILABLE');
  await context.context.internalAdapter.deleteSession(token);
}

async function compensateGeneratedChallenge(context: AuthHookContext): Promise<void> {
  const internalAdapter = context.context.internalAdapter;
  const responseHeaders = context.context.responseHeaders;
  const cookieName = context.context.createAuthCookie?.('better-auth-passkey')?.name;
  if (!internalAdapter?.deleteVerificationByIdentifier || !responseHeaders || !cookieName)
    throw new AuthAuditFailure('AUTH_AUDIT_COMPENSATION_UNAVAILABLE');
  const encoded = parseCookies(responseHeaders.get('set-cookie') ?? '').get(cookieName);
  const signatureStart = encoded?.lastIndexOf('.') ?? -1;
  if (signatureStart < 1 || !encoded)
    throw new AuthAuditFailure('AUTH_AUDIT_COMPENSATION_UNAVAILABLE');
  await internalAdapter.deleteVerificationByIdentifier(encoded.slice(0, signatureStart));
}

async function compensateBackupCodeGeneration(
  context: AuthHookContext,
  before: Record<string, unknown> | undefined,
): Promise<void> {
  const id = stringValue(before?.id);
  const backupCodes = before?.backupCodes;
  if (!id || typeof backupCodes !== 'string' || !context.context.adapter)
    throw new AuthAuditFailure('AUTH_AUDIT_COMPENSATION_UNAVAILABLE');
  await context.context.adapter.update({
    model: 'twoFactor',
    where: [{ field: 'id', value: id }],
    update: { backupCodes },
  });
}

async function compensateSession(context: AuthHookContext, returned: unknown): Promise<void> {
  if (!context.context.internalAdapter)
    throw new AuthAuditFailure('AUTH_AUDIT_COMPENSATION_UNAVAILABLE');
  const result = asRecord(returned);
  const session = asRecord(result?.session);
  const token =
    stringValue(session?.token) ?? stringValue(context.context.newSession?.session?.token);
  if (!token) throw new AuthAuditFailure('AUTH_AUDIT_COMPENSATION_UNAVAILABLE');
  await context.context.internalAdapter.deleteSession(token);
}

async function authAuditAfterImplementation(context: AuthHookContext): Promise<{
  headers?: Headers;
  response?: unknown;
}> {
  const before = context.jaAuthAudit;
  if (!before) return {};
  const responseStatus = authResponseStatus(context);
  if (
    before.path === '/passkey/verify-authentication' &&
    responseStatus !== undefined &&
    responseStatus >= 400 &&
    responseStatus < 500
  ) {
    return { response: genericWebAuthnFailureResponse(context) };
  }
  if (responseStatus !== undefined && responseStatus >= 400) return {};
  const userId = authUserId(context);
  if (!userId) throw new AuthAuditFailure('AUTH_AUDIT_USER_MISSING');
  const returned = context.context.returned ?? context.returned;
  let entityId = userId;
  let action = before.action;
  const details: Record<string, unknown> = {
    endpoint: before.path,
    sessionId: getSessionId(context),
    outcome: 'succeeded',
  };
  if (before.path === '/passkey/verify-registration') {
    entityId = passkeyIdFromReturned(returned) ?? '';
    if (!entityId) throw new AuthAuditFailure('PASSKEY_ID_MISSING');
  } else if (before.path === '/passkey/delete-passkey') {
    entityId = stringValue(before.passkeyBefore?.id) ?? '';
    if (!entityId) throw new AuthAuditFailure('PASSKEY_ID_MISSING');
  } else if (before.path === '/two-factor/verify-totp') {
    // A session-less verification is the recovery/login journey. An already
    // authenticated verification is enrollment and is handled by the
    // dedicated SvelteKit endpoint, which also updates mfa_enrolled.
    if (context.context.session?.user?.id) {
      action = AUTH_AUDIT_ACTIONS.mfaEnable;
      details.outcome = 'enrollment_verified';
    }
  }
  try {
    recordAuthAudit({
      action: action.action,
      entityType: action.entityType,
      entityId,
      userId,
      details,
    });
  } catch (error) {
    try {
      if (before.path === '/passkey/verify-registration')
        await compensatePasskeyRegistration(context, returned);
      else if (before.path === '/passkey/generate-register-options')
        await compensateGeneratedChallenge(context);
      else if (before.path === '/passkey/delete-passkey')
        await compensatePasskeyRevoke(context, before.passkeyBefore);
      else if (before.path === '/passkey/verify-authentication')
        await compensatePasskeyAuthentication(context, before.passkeyBefore, returned);
      else if (
        before.path === '/two-factor/verify-totp' ||
        before.path === '/two-factor/verify-backup-code'
      )
        await compensateSession(context, returned);
      else if (before.path === '/two-factor/generate-backup-codes')
        await compensateBackupCodeGeneration(context, before.twoFactorBefore);
    } catch (compensationError) {
      throw new AuthAuditFailure('AUTH_AUDIT_COMPENSATION_FAILED', {
        auditError: error,
        compensationError,
      });
    }
    throw new AuthAuditFailure('AUTH_AUDIT_FAILED', error);
  }
  // Better Auth's after-hook dispatcher expects an object even when the hook
  // does not alter the response. Returning undefined makes the dispatcher
  // dereference `result.headers` and turns an otherwise successful auth call
  // into a framework error.
  return {};
}

/** Better Auth's middleware input is intentionally open-ended. Keep its
 * public middleware type at the boundary and narrow only inside this module,
 * where the fields supplied by the installed Better Auth version are used. */
export const authAuditBefore: AuthMiddleware = async (rawContext) =>
  authAuditBeforeImplementation(rawContext as unknown as AuthHookContext);

export const authAuditAfter: AuthMiddleware = async (rawContext) =>
  authAuditAfterImplementation(rawContext as unknown as AuthHookContext);
