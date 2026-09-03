import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const authMocks = vi.hoisted(() => ({
  enableTwoFactor: vi.fn(),
  verifyTOTP: vi.fn(),
  disableTwoFactor: vi.fn(),
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

beforeEach(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
  directory = mkdtempSync(join(tmpdir(), 'ja-mfa-audit-'));
  process.env.JA_DATABASE_PATH = join(directory, 'app.db');
  process.env.NODE_ENV = 'test';
  seedUser();
  authMocks.enableTwoFactor.mockReset();
  authMocks.verifyTOTP.mockReset();
  authMocks.disableTwoFactor.mockReset();
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
    authMocks.disableTwoFactor.mockImplementation(async () => {
      const database = createDatabase();
      try {
        database.sqlite.prepare(`UPDATE user SET two_factor_enabled=0 WHERE id='owner'`).run();
        database.sqlite.prepare(`DELETE FROM two_factor WHERE user_id='owner'`).run();
      } finally {
        database.sqlite.close();
      }
      return { status: true };
    });

    const enableResponse = await POST(event('enable', { password: 'a-strong-password' }));
    expect(enableResponse.status).toBe(200);
    expect((await POST(event('verify', { code: '123456' }))).status).toBe(200);
    expect((await POST(event('disable', { password: 'a-strong-password' }))).status).toBe(200);

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

  it('allows a legacy required-MFA identity to disable MFA and clears the stale requirement', async () => {
    const database = createDatabase();
    try {
      database.sqlite
        .prepare("UPDATE user SET mfa_enrolled=1,mfa_required=1 WHERE id='owner'")
        .run();
    } finally {
      database.sqlite.close();
    }
    authMocks.disableTwoFactor.mockImplementation(async () => {
      const opened = createDatabase();
      try {
        opened.sqlite.prepare("UPDATE user SET two_factor_enabled=0 WHERE id='owner'").run();
        opened.sqlite.prepare("DELETE FROM two_factor WHERE user_id='owner'").run();
      } finally {
        opened.sqlite.close();
      }
      return { status: true };
    });

    const response = await POST(event('disable', { password: 'a-strong-password' }));

    expect(response.status).toBe(200);
    const opened = createDatabase();
    try {
      expect(
        opened.sqlite.prepare("SELECT mfa_enrolled,mfa_required FROM user WHERE id='owner'").get(),
      ).toMatchObject({ mfa_enrolled: 0, mfa_required: 0 });
    } finally {
      opened.sqlite.close();
    }
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

    const response = await POST(event('enable', { password: 'a-strong-password' }));
    expect(response.status).toBe(503);
    expect(readIdentity()).toMatchObject({
      mfa_enrolled: 0,
      two_factor_enabled: 0,
      secret: 'encrypted-secret-before',
      backup_codes: 'encrypted-codes-before',
      verified: 0,
      failed_verification_count: 2,
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
    expect(readIdentity()).toMatchObject({
      mfa_enrolled: 0,
      two_factor_enabled: 0,
      secret: 'encrypted-secret-before',
      verified: 0,
    });
  });

  it('restores a disabled authenticator when the disable audit fails', async () => {
    authMocks.disableTwoFactor.mockImplementation(async () => {
      const database = createDatabase();
      try {
        database.sqlite.prepare(`UPDATE user SET two_factor_enabled=0 WHERE id='owner'`).run();
        database.sqlite.prepare(`DELETE FROM two_factor WHERE user_id='owner'`).run();
      } finally {
        database.sqlite.close();
      }
      return { status: true };
    });
    auditMocks.recordAuthAudit.mockImplementation(() => {
      throw new auditMocks.AuthAuditFailure('AUTH_AUDIT_WRITE_FAILED');
    });

    const response = await POST(event('disable', { password: 'a-strong-password' }));
    expect(response.status).toBe(503);
    expect(readIdentity()).toMatchObject({
      mfa_enrolled: 0,
      two_factor_enabled: 0,
      secret: 'encrypted-secret-before',
      backup_codes: 'encrypted-codes-before',
      verified: 0,
    });
  });
});
