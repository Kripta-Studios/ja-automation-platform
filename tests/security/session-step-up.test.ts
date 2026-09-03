import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository, V3Repository, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const databases: ReturnType<typeof createDatabase>['sqlite'][] = [];
const restoreDeploymentIdentities: (() => void)[] = [];
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
  for (const sqlite of databases.splice(0)) {
    try {
      sqlite.close();
    } catch {
      // Keep cleanup idempotent if a test closed the handle before failing.
    }
  }
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
});

describe('session-bound step-up authentication', () => {
  it('authorizes each live finance session without a second password confirmation', () => {
    process.env.NODE_ENV = 'production';
    const directory = mkdtempSync(join(tmpdir(), 'ja-step-up-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const v3 = new V3Repository(sqlite);
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('finance','Finance','finance@example.com','finance_admin','active',1,?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('worker','Worker','worker@example.com','worker','active',1,?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run('session-a', 'token-a', 'finance', future, now, now, now);
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      )
      .run('session-b', 'token-b', 'finance', future, now, now);

    const sessionA: Principal = {
      userId: 'finance',
      role: 'finance_admin',
      projectIds: new Set(),
      sessionId: 'session-a',
    };
    const sessionB: Principal = { ...sessionA, sessionId: 'session-b' };
    const input = {
      workerId: 'worker',
      currency: 'USD' as const,
      ruleType: 'Hourly' as const,
      rateMinor: 4_000n,
      effectiveFrom: '2026-08-01',
    };

    expect(() => v3.createCompensationRule(sessionA, input)).not.toThrow();
    expect(() =>
      v3.createCompensationRule(sessionB, { ...input, effectiveFrom: '2026-09-01' }),
    ).not.toThrow();
  });

  it('revokes sessions when an owner offboards an account', () => {
    process.env.NODE_ENV = 'production';
    const directory = mkdtempSync(join(tmpdir(), 'ja-offboard-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const repository = new PortalRepository(sqlite);
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('owner','Owner','antonny.luty@j-aautomation.com','owner_admin','active',1,?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('worker','Worker','worker@example.com','worker','active',1,?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run('owner-session', 'owner-token', 'owner', future, now, now, now);
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      )
      .run('worker-session', 'worker-token', 'worker', future, now, now);
    repository.updateUserStatus(
      { userId: 'owner', role: 'owner_admin', projectIds: new Set(), sessionId: 'owner-session' },
      'worker',
      'offboarded',
    );
    expect(
      sqlite.prepare('SELECT status,offboarded_at FROM user WHERE id=?').get('worker'),
    ).toMatchObject({
      status: 'offboarded',
    });
    expect(
      sqlite.prepare('SELECT 1 FROM session WHERE id=?').get('worker-session'),
    ).toBeUndefined();
  });

  it('treats a live owner session as stepped-up for the whole login', () => {
    process.env.NODE_ENV = 'production';
    const directory = mkdtempSync(join(tmpdir(), 'ja-owner-session-privilege-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const repository = new PortalRepository(sqlite);
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('owner','Owner','antonny.luty@j-aautomation.com','owner_admin','active',1,?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('worker','Worker','worker@example.com','worker','active',1,?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run('owner-session', 'owner-token', 'owner', future, now, now, null);
    const owner: Principal = {
      userId: 'owner',
      role: 'owner_admin',
      projectIds: new Set(),
      sessionId: 'owner-session',
    };
    expect(() => repository.updateUserStatus(owner, 'worker', 'suspended')).not.toThrow();
    expect(sqlite.prepare('SELECT status FROM user WHERE id=?').get('worker')).toEqual({
      status: 'suspended',
    });
    expect(() =>
      repository.updateUserStatus(
        { userId: 'owner', role: 'owner_admin', projectIds: new Set() },
        'worker',
        'active',
      ),
    ).toThrow(/Recent step-up authentication is required/i);
  });

  it('authorizes an owner login by session token without a second password confirmation', () => {
    process.env.NODE_ENV = 'production';
    const directory = mkdtempSync(join(tmpdir(), 'ja-owner-token-privilege-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    databases.push(sqlite);
    const v3 = new V3Repository(sqlite);
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('owner','Owner','antonny.luty@j-aautomation.com','owner_admin','active',1,?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run('owner-session', 'owner-cookie-token', 'owner', future, now, now, null);
    const ownerByToken: Principal = {
      userId: 'owner',
      role: 'owner_admin',
      projectIds: new Set(),
      sessionId: 'owner-cookie-token',
    };
    expect(() =>
      v3.createInvitation(ownerByToken, {
        email: 'invitee@example.com',
        role: 'worker',
        expiresInDays: 7,
      }),
    ).not.toThrow();
  });
});
