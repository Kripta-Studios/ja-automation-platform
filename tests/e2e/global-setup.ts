import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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
import { seedE2ECredentialAccounts } from './auth.js';

function removeDatabaseArtifacts(): void {
  for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (!existsSync(path)) continue;
    try {
      rmSync(path, { force: true });
    } catch {
      // Windows may still hold the SQLite handle until Playwright's webServer exits.
    }
  }
}

export default async function globalSetup() {
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
        // A malformed/stale pointer can only be a recoverable interrupted-run artifact after the
        // create-only lock above has been acquired.
        removeE2EFixturePointer(e2eFixturePointerPath);
      }
    }
    if (existsSync(documentRoot)) rmSync(documentRoot, { recursive: true, force: true });
    mkdirSync(join(root, 'data'), { recursive: true });
    mkdirSync(documentRoot, { recursive: true });
    const env = {
      ...process.env,
      JA_DATABASE_PATH: databasePath,
      JA_MIGRATIONS_PATH: join(root, 'migrations'),
      JA_DOCUMENT_ROOT: documentRoot,
      JA_FIXTURE_RESET_DOCUMENTS: 'false',
      JA_DEMO_SEED_PRESERVE_DB: 'true',
      JA_AUTH_SECRET: 'e2e-only-secret-do-not-use-in-production',
      JA_PUBLIC_BASE_PATH: '/j-aautomation',
      JA_PORTAL_BASE_PATH: '/j-aautomation/app',
    };
    execFileSync(
      process.execPath,
      ['--experimental-strip-types', 'packages/database/src/demo-seed.ts'],
      {
        cwd: root,
        env,
        stdio: 'inherit',
      },
    );
    await seedE2ECredentialAccounts(databasePath);
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
