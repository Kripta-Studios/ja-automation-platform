import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const authMocks = vi.hoisted(() => ({
  enableTwoFactor: vi.fn(),
  verifyTOTP: vi.fn(),
}));
const auditMocks = vi.hoisted(() => ({
  assertAuthAuditReady: vi.fn(),
  recordAuthAudit: vi.fn(),
  MANAGED_MFA_AUTH_CALL: Symbol('ja.managed-mfa-auth-call'),
  AuthAuditFailure: class AuthAuditFailure extends Error {
    constructor(message: string, cause?: unknown) {
      super(message);
      this.name = 'AuthAuditFailure';
      this.cause = cause;
    }
  },
  AUTH_AUDIT_ACTIONS: {
    mfaSetupStarted: { action: 'security.mfa.setup_started', entityType: 'user' },
    mfaEnable: { action: 'security.mfa.enable', entityType: 'user' },
    mfaDisable: { action: 'security.mfa.disable', entityType: 'user' },
    mfaRecoveryLogin: { action: 'security.mfa.recovery_login', entityType: 'user' },
    passkeyRegister: { action: 'security.passkey.register', entityType: 'passkey' },
    passkeyRevoke: { action: 'security.passkey.revoke', entityType: 'passkey' },
    passkeyLogin: { action: 'security.passkey.login', entityType: 'user' },
  },
}));

vi.mock('$lib/server/auth', () => ({ auth: { api: authMocks } }));
vi.mock('$lib/server/auth-audit', () => auditMocks);

const { POST } = await import('../../apps/portal/src/routes/app/api/security/mfa/+server.js');

let directory: string;
let restoreDeploymentIdentity: (() => void) | undefined;
const previousDatabasePath = process.env.JA_DATABASE_PATH;
const previousNodeEnv = process.env.NODE_ENV;

function seedUser(): void {
  const database = createDatabase();
  try {
    const now = new Date().toISOString();
    database.sqlite
      .prepare(
        `INSERT INTO user(
           id,name,email,role,status,email_verified,mfa_enrolled,mfa_required,
           two_factor_enabled,created_at,updated_at,version
         ) VALUES(?,?,?,?,?,1,?,?,?, ?,?,1)`,
      )
      .run(
        'owner',
        'Owner',
        'antonny.luty@j-aautomation.com',
        'owner_admin',
        'active',
        0,
        0,
        0,
        now,
        now,
      );
    database.sqlite
      .prepare(
        `INSERT INTO two_factor(
           id,secret,backup_codes,user_id,verified,failed_verification_count,locked_until
         ) VALUES(?,?,?,?,?,?,?)`,
      )
      .run(
        'two-factor-1',
        'encrypted-secret-before',
        'encrypted-codes-before',
        'owner',
        0,
        2,
        null,
      );
  } finally {
    database.sqlite.close();
  }
}

function readIdentity(): Record<string, unknown> {
  const database = createDatabase();
  try {
    return database.sqlite
      .prepare(
        `SELECT u.mfa_enrolled,u.two_factor_enabled,tf.id,tf.secret,tf.backup_codes,
                tf.verified,tf.failed_verification_count,tf.locked_until
         FROM user u LEFT JOIN two_factor tf ON tf.user_id=u.id WHERE u.id='owner'`,
      )
      .get() as Record<string, unknown>;
  } finally {
    database.sqlite.close();
  }
}

function event(action: 'enable' | 'verify' | 'disable', body: Record<string, string>) {
  return {
    locals: {
      user: { id: 'owner', role: 'owner_admin', status: 'active' },
      session: { id: 'owner-session', userId: 'owner' },
      correlationId: 'mfa-correlation',
    },
    request: new Request('http://localhost/j-aautomation/app/api/security/mfa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    }),
  } as unknown as Parameters<typeof POST>[0];
}

async function problem(response: Response) {
  const body = (await response.json()) as Record<string, unknown>;
  expect(body).toMatchObject({
    success: false,
    params: expect.any(Object),
    fieldErrors: expect.any(Object),
    remedies: expect.any(Array),
    correlationId: 'mfa-correlation',
    error: expect.any(String),
  });
  expect(typeof body.code).toBe('string');
  expect(typeof body.messageKey).toBe('string');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  return body;
}

beforeEach(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
  directory = mkdtempSync(join(tmpdir(), 'ja-mfa-audit-'));
  process.env.JA_DATABASE_PATH = join(directory, 'app.db');
  process.env.NODE_ENV = 'test';
  seedUser();
  authMocks.enableTwoFactor.mockReset();
  authMocks.verifyTOTP.mockReset();
  auditMocks.assertAuthAuditReady.mockReset();
  auditMocks.recordAuthAudit.mockReset();
});

afterEach(() => {
  if (previousDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = previousDatabasePath;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  restoreDeploymentIdentity?.();
  restoreDeploymentIdentity = undefined;
  rmSync(directory, { recursive: true, force: true });
});

describe('MFA canonical audit boundary', () => {
  it('records setup, verification and disable through the canonical writer', async () => {
    authMocks.enableTwoFactor.mockImplementation(async () => {
      const database = createDatabase();
      try {
        database.sqlite
          .prepare(
            `UPDATE user SET two_factor_enabled=1,updated_at=?,version=version+1 WHERE id='owner'`,
          )
          .run(new Date().toISOString());
        database.sqlite
          .prepare(
            `UPDATE two_factor SET secret='new-secret',backup_codes='new-codes',verified=0 WHERE user_id='owner'`,
          )
          .run();
      } finally {
        database.sqlite.close();
      }
      return {
        totpURI: 'otpauth://totp/J&A:owner',
        backupCodes: ['one-time-code'],
      };
    });
    authMocks.verifyTOTP.mockImplementation(async () => {
      const database = createDatabase();
      try {
        database.sqlite.prepare(`UPDATE user SET two_factor_enabled=1 WHERE id='owner'`).run();
        database.sqlite.prepare(`UPDATE two_factor SET verified=1 WHERE user_id='owner'`).run();
      } finally {
        database.sqlite.close();
      }
    });
    const enableResponse = await POST(event('enable', {}));
    const verifyResponse = await POST(event('verify', { code: '123456' }));
    const disableResponse = await POST(event('disable', {}));
    expect(enableResponse.status).toBe(200);
    expect(verifyResponse.status).toBe(200);
    expect(disableResponse.status).toBe(200);
    for (const response of [enableResponse, verifyResponse, disableResponse])
      expect(response.headers.get('cache-control')).toBe('private, no-store');

    expect(auditMocks.recordAuthAudit).toHaveBeenCalledTimes(3);
    expect(auditMocks.recordAuthAudit.mock.calls.map(([record]) => record.action)).toEqual([
      'security.mfa.setup_started',
      'security.mfa.enable',
      'security.mfa.disable',
    ]);
    expect(readIdentity()).toMatchObject({
      mfa_enrolled: 0,
      two_factor_enabled: 0,
      id: null,
    });
  });

  it('allows disable for a legacy required-MFA identity and clears the obsolete policy', async () => {
    const database = createDatabase();
    try {
      database.sqlite
        .prepare("UPDATE user SET mfa_enrolled=1,mfa_required=1 WHERE id='owner'")
        .run();
    } finally {
      database.sqlite.close();
    }
    const response = await POST(event('disable', {}));

    expect(response.status).toBe(200);
    const opened = createDatabase();
    try {
      expect(
        opened.sqlite.prepare("SELECT mfa_enrolled,mfa_required FROM user WHERE id='owner'").get(),
      ).toMatchObject({ mfa_enrolled: 0, mfa_required: 0 });
      expect(
        opened.sqlite.prepare("SELECT id FROM two_factor WHERE user_id='owner'").get(),
      ).toBeUndefined();
    } finally {
      opened.sqlite.close();
    }
  });

  it('preserves authentication cookies while making setup secrets uncacheable', async () => {
    authMocks.enableTwoFactor.mockResolvedValue({
      response: {
        totpURI: 'otpauth://totp/J&A:owner',
        backupCodes: ['one-time-code'],
      },
      headers: new Headers({ 'set-cookie': 'session=rotated; HttpOnly; Secure' }),
    });
    const response = await POST(event('enable', {}));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('set-cookie')).toBe('session=rotated; HttpOnly; Secure');
  });

  it('uses the passwordless Better Auth setup contract and rejects another enable after enrollment', async () => {
    authMocks.enableTwoFactor.mockResolvedValue({
      totpURI: 'otpauth://totp/J&A:owner',
      backupCodes: ['one-time-code'],
    });
    expect((await POST(event('enable', {}))).status).toBe(200);
    expect(authMocks.enableTwoFactor).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { method: 'totp', issuer: 'J&A Automation' },
      }),
    );

    const database = createDatabase();
    try {
      database.sqlite.prepare("UPDATE user SET mfa_enrolled=1 WHERE id='owner'").run();
      database.sqlite.prepare("UPDATE two_factor SET verified=1 WHERE user_id='owner'").run();
    } finally {
      database.sqlite.close();
    }
    const response = await POST(event('enable', {}));
    expect(response.status).toBe(409);
    expect(await problem(response)).toMatchObject({
      code: 'MFA_ALREADY_ENROLLED',
      messageKey: 'problem.mfa.alreadyEnrolled',
      remedies: [{ id: 'review_mfa_status' }],
    });
    expect(authMocks.enableTwoFactor).toHaveBeenCalledTimes(1);
  });

  it('returns typed sign-in and field problems before changing MFA', async () => {
    const signedOut = event('verify', { code: 'bad' });
    signedOut.locals.user = null;
    signedOut.locals.session = null;
    const unauthorized = await POST(signedOut);
    expect(unauthorized.status).toBe(401);
    expect(await problem(unauthorized)).toMatchObject({
      code: 'MFA_SIGN_IN_REQUIRED',
      messageKey: 'problem.mfa.signInRequired',
      remedies: [{ id: 'sign_in_again' }],
    });

    const invalidAction = event('enable', {});
    invalidAction.request = new Request('http://localhost/j-aautomation/app/api/security/mfa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'rotate' }),
    });
    const actionResponse = await POST(invalidAction);
    expect(actionResponse.status).toBe(400);
    expect(await problem(actionResponse)).toMatchObject({
      code: 'MFA_ACTION_INVALID',
      messageKey: 'problem.mfa.actionInvalid',
    });

    const codeResponse = await POST(event('verify', { code: '123' }));
    expect(codeResponse.status).toBe(400);
    expect(await problem(codeResponse)).toMatchObject({
      code: 'MFA_CODE_INVALID',
      messageKey: 'problem.mfa.codeInvalid',
      fieldErrors: { code: ['problem.mfa.codeInvalid'] },
      remedies: [{ id: 'review_mfa_code' }],
    });
    expect(authMocks.verifyTOTP).not.toHaveBeenCalled();
  });

  it('maps authenticator rejection and unexpected failures without exposing raw details', async () => {
    authMocks.verifyTOTP.mockRejectedValue(
      Object.assign(new Error('sensitive authenticator vendor detail'), {
        statusCode: 'BAD_REQUEST',
      }),
    );
    const rejected = await POST(event('verify', { code: '123456' }));
    expect(rejected.status).toBe(400);
    const rejectedBody = await problem(rejected);
    expect(rejectedBody).toMatchObject({
      code: 'MFA_VERIFICATION_REJECTED',
      messageKey: 'problem.mfa.verificationRejected',
      fieldErrors: { code: ['problem.mfa.verificationRejected'] },
    });
    expect(JSON.stringify(rejectedBody)).not.toContain('vendor detail');

    authMocks.verifyTOTP.mockRejectedValue(new Error('private database detail'));
    const unexpected = await POST(event('verify', { code: '123456' }));
    expect(unexpected.status).toBe(500);
    const unexpectedBody = await problem(unexpected);
    expect(unexpectedBody).toMatchObject({
      code: 'MFA_CHANGE_UNAVAILABLE',
      messageKey: 'problem.mfa.changeUnavailable',
      params: { correlationId: 'mfa-correlation' },
    });
    expect(JSON.stringify(unexpectedBody)).not.toContain('private database detail');
  });

  it('keeps authenticator error details out of server logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      authMocks.verifyTOTP.mockRejectedValue(new Error('private MFA code 123456 and secret'));
      const response = await POST(event('verify', { code: '123456' }));
      expect(response.status).toBe(500);
      expect(log).toHaveBeenCalledWith(
        'MFA change failed',
        expect.objectContaining({
          correlationId: 'mfa-correlation',
          code: 'MFA_CHANGE_UNAVAILABLE',
          status: 500,
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain('private MFA code');
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    } finally {
      log.mockRestore();
    }
  });

  it('distinguishes an unavailable audit writer before MFA changes', async () => {
    auditMocks.assertAuthAuditReady.mockImplementation(() => {
      throw new auditMocks.AuthAuditFailure('AUTH_AUDIT_UNAVAILABLE');
    });
    const response = await POST(event('enable', {}));
    expect(response.status).toBe(503);
    expect(await problem(response)).toMatchObject({
      code: 'MFA_AUDIT_UNAVAILABLE',
      messageKey: 'problem.mfa.auditUnavailable',
      remedies: [{ id: 'review_mfa_status' }, { id: 'contact_owner' }],
    });
    expect(authMocks.enableTwoFactor).not.toHaveBeenCalled();
  });

  it('restores Better Auth and local projections when setup audit fails', async () => {
    authMocks.enableTwoFactor.mockImplementation(async () => {
      const database = createDatabase();
      try {
        database.sqlite
          .prepare(
            `UPDATE user SET two_factor_enabled=1,updated_at=?,version=version+1 WHERE id='owner'`,
          )
          .run(new Date().toISOString());
        database.sqlite
          .prepare(
            `UPDATE two_factor SET secret='new-secret',backup_codes='new-codes',verified=0 WHERE user_id='owner'`,
          )
          .run();
      } finally {
        database.sqlite.close();
      }
      return { totpURI: 'otpauth://totp/J&A:owner', backupCodes: ['new-code'] };
    });
    auditMocks.recordAuthAudit.mockImplementation(() => {
      throw new auditMocks.AuthAuditFailure('AUTH_AUDIT_WRITE_FAILED');
    });

    const response = await POST(event('enable', {}));
    expect(response.status).toBe(503);
    expect(await problem(response)).toMatchObject({
      code: 'MFA_AUDIT_UNAVAILABLE',
      messageKey: 'problem.mfa.auditUnavailable',
    });
    expect(readIdentity()).toMatchObject({
      mfa_enrolled: 0,
      two_factor_enabled: 0,
      secret: 'encrypted-secret-before',
      backup_codes: 'encrypted-codes-before',
      verified: 0,
      failed_verification_count: 2,
    });
  });

  it('reports uncertain MFA state when audit compensation itself fails', async () => {
    authMocks.enableTwoFactor.mockImplementation(async () => {
      const database = createDatabase();
      try {
        database.sqlite.prepare("UPDATE user SET two_factor_enabled=1 WHERE id='owner'").run();
        database.sqlite
          .prepare("UPDATE two_factor SET secret='new-secret' WHERE user_id='owner'")
          .run();
      } finally {
        database.sqlite.close();
      }
      return { totpURI: 'otpauth://totp/J&A:owner', backupCodes: ['new-code'] };
    });
    auditMocks.recordAuthAudit.mockImplementation(() => {
      const database = createDatabase();
      try {
        database.sqlite.exec(`CREATE TRIGGER deny_mfa_restore BEFORE UPDATE ON user
          BEGIN SELECT RAISE(ABORT, 'private restore failure detail'); END`);
      } finally {
        database.sqlite.close();
      }
      throw new auditMocks.AuthAuditFailure('AUTH_AUDIT_WRITE_FAILED');
    });

    const response = await POST(event('enable', {}));
    expect(response.status).toBe(503);
    const body = await problem(response);
    expect(body).toMatchObject({
      code: 'MFA_CHANGE_STATE_UNCERTAIN',
      messageKey: 'problem.mfa.changeStateUncertain',
      params: { correlationId: 'mfa-correlation' },
      remedies: [{ id: 'review_mfa_status' }, { id: 'contact_owner' }],
    });
    expect(String(body.error)).not.toContain('Reference:');
    expect(String(body.error)).not.toContain('no change was applied');
    expect(JSON.stringify(body)).not.toContain('private restore failure detail');
    expect(readIdentity()).toMatchObject({
      two_factor_enabled: 1,
      secret: 'new-secret',
    });
  });

  it('restores local and Better Auth state when verification audit fails', async () => {
    authMocks.verifyTOTP.mockImplementation(async () => {
      const database = createDatabase();
      try {
        database.sqlite.prepare(`UPDATE user SET two_factor_enabled=1 WHERE id='owner'`).run();
        database.sqlite.prepare(`UPDATE two_factor SET verified=1 WHERE user_id='owner'`).run();
      } finally {
        database.sqlite.close();
      }
    });
    auditMocks.recordAuthAudit.mockImplementation(() => {
      throw new auditMocks.AuthAuditFailure('AUTH_AUDIT_WRITE_FAILED');
    });

    const response = await POST(event('verify', { code: '123456' }));
    expect(response.status).toBe(503);
    expect(await problem(response)).toMatchObject({ code: 'MFA_AUDIT_UNAVAILABLE' });
    expect(readIdentity()).toMatchObject({
      mfa_enrolled: 0,
      two_factor_enabled: 0,
      secret: 'encrypted-secret-before',
      verified: 0,
    });
  });

  it('rolls back a transactional disable when the audit fails', async () => {
    auditMocks.recordAuthAudit.mockImplementation(() => {
      throw new auditMocks.AuthAuditFailure('AUTH_AUDIT_WRITE_FAILED');
    });

    const response = await POST(event('disable', {}));
    expect(response.status).toBe(503);
    expect(await problem(response)).toMatchObject({ code: 'MFA_AUDIT_UNAVAILABLE' });
    expect(readIdentity()).toMatchObject({
      mfa_enrolled: 0,
      two_factor_enabled: 0,
      secret: 'encrypted-secret-before',
      backup_codes: 'encrypted-codes-before',
      verified: 0,
    });
  });
});
