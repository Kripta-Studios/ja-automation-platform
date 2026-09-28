import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  MailIdentityRepository,
  SYNTHETIC_OWNER_DEPLOYMENT_ID,
  SYNTHETIC_OWNER_EMAIL,
  SYNTHETIC_OWNER_TENANT_ID,
} from '@ja/database';
import type { Principal } from '@ja/domain';

const previousEnvironment = {
  tenant: process.env.JA_TENANT_ID,
  deployment: process.env.JA_DEPLOYMENT_ID,
  nodeEnv: process.env.NODE_ENV,
};
const directories: string[] = [];

function restoreEnvironment(): void {
  if (previousEnvironment.tenant === undefined) delete process.env.JA_TENANT_ID;
  else process.env.JA_TENANT_ID = previousEnvironment.tenant;
  if (previousEnvironment.deployment === undefined) delete process.env.JA_DEPLOYMENT_ID;
  else process.env.JA_DEPLOYMENT_ID = previousEnvironment.deployment;
  if (previousEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment.nodeEnv;
}

function createFixtureDatabase(tenant: string, deployment: string) {
  process.env.JA_TENANT_ID = tenant;
  process.env.JA_DEPLOYMENT_ID = deployment;
  const directory = mkdtempSync(join(tmpdir(), 'ja-synthetic-owner-'));
  directories.push(directory);
  return createDatabase(join(directory, 'app.db'));
}

function seedOwner(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  email: string,
  id = 'synthetic-owner',
): Principal {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO user(
         id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
       ) VALUES(?,?,?,1,'owner_admin','active',0,0,?,?,1)`,
    )
    .run(id, 'Fixture Owner', email, now, now);
  sqlite
    .prepare(
      `INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at)
       VALUES('owner-session','owner-token',?,?,?,?,?)`,
    )
    .run(id, new Date(Date.now() + 10 * 60_000).toISOString(), now, now, now);
  return { userId: id, role: 'owner_admin', projectIds: new Set(), sessionId: 'owner-session' };
}

afterEach(() => {
  restoreEnvironment();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('synthetic Owner deployment gate', () => {
  it('authorizes and bootstraps the reserved Owner only in the fixed E2E deployment', () => {
    const database = createFixtureDatabase(
      SYNTHETIC_OWNER_TENANT_ID,
      SYNTHETIC_OWNER_DEPLOYMENT_ID,
    );
    try {
      const principal = seedOwner(database.sqlite, SYNTHETIC_OWNER_EMAIL);
      const repository = new MailIdentityRepository(database.sqlite);
      expect(() => repository.assertCanonicalOwner(principal)).not.toThrow();

      repository.bootstrap(principal, [
        {
          stalwartAccountId: 'synthetic-owner-mailbox',
          email: SYNTHETIC_OWNER_EMAIL,
          name: 'Fixture Owner',
        },
      ]);

      expect(
        database.sqlite
          .prepare('SELECT role,status,mfa_required FROM user WHERE id=?')
          .get(principal.userId),
      ).toEqual({ role: 'owner_admin', status: 'active', mfa_required: 0 });
      expect(
        database.sqlite.prepare('SELECT 1 FROM session WHERE id=?').get('owner-session'),
      ).toEqual({
        1: 1,
      });
    } finally {
      database.sqlite.close();
    }
  });

  it('does not authorize the reserved mailbox outside the fixed deployment identity', () => {
    const database = createFixtureDatabase('test-tenant', 'test-deployment');
    try {
      expect(() => seedOwner(database.sqlite, SYNTHETIC_OWNER_EMAIL)).toThrow(
        /designated deployment Owner/u,
      );
    } finally {
      database.sqlite.close();
    }
  });

  it('rejects the reserved E2E deployment identity in production mode', () => {
    process.env.NODE_ENV = 'production';
    process.env.JA_TENANT_ID = SYNTHETIC_OWNER_TENANT_ID;
    process.env.JA_DEPLOYMENT_ID = SYNTHETIC_OWNER_DEPLOYMENT_ID;
    const directory = mkdtempSync(join(tmpdir(), 'ja-production-identity-rejection-'));
    directories.push(directory);
    expect(() => createDatabase(join(directory, 'app.db'))).toThrow(
      /Reserved E2E deployment identity cannot be used in production/u,
    );
  });
});
