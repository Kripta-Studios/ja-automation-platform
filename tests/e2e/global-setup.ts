import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  e2eDatabasePath as databasePath,
  e2eDocumentRoot as documentRoot,
  e2eRoot as root,
} from './environment';

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
  if (existsSync(documentRoot)) rmSync(documentRoot, { recursive: true, force: true });
  mkdirSync(join(root, 'data'), { recursive: true });
  const env = {
    ...process.env,
    JA_DATABASE_PATH: databasePath,
    JA_MIGRATIONS_PATH: join(root, 'migrations'),
    JA_DOCUMENT_ROOT: documentRoot,
    JA_DEMO_MODE: 'true',
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
  return async () => {
    removeDatabaseArtifacts();
    if (existsSync(documentRoot)) rmSync(documentRoot, { recursive: true, force: true });
  };
}
