import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import { createDatabase } from '@ja/database';
import {
  e2eDatabasePath as databasePath,
  e2eDocumentRoot as documentRoot,
  e2eFixturePointerPath,
  e2eRoot as root,
  acquireE2EFixtureLock,
  makeE2EFixturePointer,
  readE2EFixturePointer,
  removeE2EFixturePointer,
  releaseE2EFixtureLock,
  writeE2EFixturePointer,
} from './environment.js';
import { e2eCredentials } from './auth.js';

// A fresh disposable identity exercises production scanner behavior without
// changing the default browser fixture's reserved development identity.
export const scannerTenantId = 'e2e-scanner-qa-tenant';
export const scannerDeploymentId = 'e2e-scanner-qa-deployment';
export const scannerOwnerEmail = 'antonny.luty@j-aautomation.com';

function scannerSeedSource(): string {
  const source = readFileSync(join(root, 'packages/database/src/demo-seed.ts'), 'utf8');
  const replacements = [
    [
      "from './index.ts';",
      `from '${pathToFileURL(join(root, 'packages/database/src/index.ts')).href}';`,
    ],
    [
      "from '../../../scripts/isolated-test-guards.ts';",
      `from '${pathToFileURL(join(root, 'scripts/isolated-test-guards.ts')).href}';`,
    ],
    [
      "const ownerAdminEmail = 'owner@demo.jaautomation.test';",
      `const ownerAdminEmail = '${scannerOwnerEmail}';`,
    ],
  ] as const;
  return replacements.reduce((current, [before, after]) => {
    if (!current.includes(before)) throw new Error(`Scanner seed adaptation is stale: ${before}`);
    return current.replace(before, after);
  }, source);
}

async function seedScannerOwnerPassword(): Promise<void> {
  const database = createDatabase(databasePath);
  try {
    const owner = database.sqlite
      .prepare("SELECT id FROM user WHERE email=? AND role='owner_admin' AND status='active'")
      .get(scannerOwnerEmail) as { id: string } | undefined;
    if (!owner) throw new Error('Scanner fixture Owner is missing');
    const now = new Date().toISOString();
    database.sqlite
      .prepare(
        `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        'local:credential',
        owner.id,
        'credential',
        owner.id,
        await hashPassword(e2eCredentials.owner.password),
        now,
        now,
      );
  } finally {
    database.sqlite.close();
  }
}

function removeDatabaseArtifacts(): void {
  for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (!existsSync(path)) continue;
    try {
      rmSync(path, { force: true });
    } catch {
      // SQLite may retain its handle until the scoped preview process exits.
    }
  }
}

export default async function scannerGlobalSetup() {
  process.env.JA_TENANT_ID = scannerTenantId;
  process.env.JA_DEPLOYMENT_ID = scannerDeploymentId;
  acquireE2EFixtureLock();
  try {
    if (existsSync(e2eFixturePointerPath)) {
      try {
        readE2EFixturePointer(e2eFixturePointerPath);
        throw new Error('Another Playwright run owns the active E2E fixture pointer');
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'Another Playwright run owns the active E2E fixture pointer'
        )
          throw error;
        removeE2EFixturePointer(e2eFixturePointerPath);
      }
    }
    if (existsSync(documentRoot)) rmSync(documentRoot, { recursive: true, force: true });
    mkdirSync(join(root, 'data'), { recursive: true });
    mkdirSync(documentRoot, { recursive: true });
    const adaptedSeedPath = join(root, 'tests/e2e/data', `scanner-seed-${randomUUID()}.ts`);
    writeFileSync(adaptedSeedPath, scannerSeedSource());
    try {
      execFileSync(process.execPath, ['--experimental-strip-types', adaptedSeedPath], {
        cwd: root,
        env: {
          ...process.env,
          JA_DATABASE_PATH: databasePath,
          JA_MIGRATIONS_PATH: join(root, 'migrations'),
          JA_DOCUMENT_ROOT: documentRoot,
          JA_TENANT_ID: scannerTenantId,
          JA_DEPLOYMENT_ID: scannerDeploymentId,
          JA_FIXTURE_RESET_DOCUMENTS: 'false',
          JA_DEMO_SEED_PRESERVE_DB: 'true',
          JA_AUTH_SECRET: 'e2e-only-secret-do-not-use-in-production',
          JA_PUBLIC_BASE_PATH: '/j-aautomation',
          JA_PORTAL_BASE_PATH: '/j-aautomation/app',
        },
        stdio: 'inherit',
      });
    } finally {
      rmSync(adaptedSeedPath, { force: true });
    }
    await seedScannerOwnerPassword();
    writeE2EFixturePointer(makeE2EFixturePointer());
    return async () => {
      removeDatabaseArtifacts();
      if (existsSync(documentRoot)) rmSync(documentRoot, { recursive: true, force: true });
      removeE2EFixturePointer(e2eFixturePointerPath);
      releaseE2EFixtureLock();
    };
  } catch (error) {
    releaseE2EFixtureLock();
    throw error;
  }
}
