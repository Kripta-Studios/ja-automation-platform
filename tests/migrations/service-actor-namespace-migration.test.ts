import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck } from '@ja/database';

const ROOT = resolve(process.cwd());
const MIGRATIONS = resolve(ROOT, 'migrations');
const LEGACY_FIXTURE = resolve(ROOT, 'tests/fixtures/b5-migration-legacy-fixture.sql');
const temporaryDirectories: string[] = [];
const previousEnvironment = {
  tenant: process.env.JA_TENANT_ID,
  deployment: process.env.JA_DEPLOYMENT_ID,
  migrations: process.env.JA_MIGRATIONS_PATH,
};

afterEach(() => {
  if (previousEnvironment.tenant === undefined) delete process.env.JA_TENANT_ID;
  else process.env.JA_TENANT_ID = previousEnvironment.tenant;
  if (previousEnvironment.deployment === undefined) delete process.env.JA_DEPLOYMENT_ID;
  else process.env.JA_DEPLOYMENT_ID = previousEnvironment.deployment;
  if (previousEnvironment.migrations === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = previousEnvironment.migrations;
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function migrationCopy(maxVersion: number): string {
  const destination = mkdtempSync(join(tmpdir(), 'ja-service-actor-migration-'));
  temporaryDirectories.push(destination);
  for (const entry of readdirSync(MIGRATIONS, { withFileTypes: true })) {
    if (entry.isFile() && /^\d{4}_.+\.sql$/u.test(entry.name)) {
      if (Number(entry.name.slice(0, 4)) > maxVersion) continue;
      copyFileSync(join(MIGRATIONS, entry.name), join(destination, entry.name));
      continue;
    }
    if (entry.isDirectory()) {
      const target = join(destination, entry.name);
      mkdirSync(target, { recursive: true });
      for (const child of readdirSync(join(MIGRATIONS, entry.name)))
        copyFileSync(join(MIGRATIONS, entry.name, child), join(target, child));
    }
  }
  return destination;
}

function buildLegacyDatabase(path: string): void {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  for (const file of readdirSync(MIGRATIONS)
    .filter(
      (candidate) => /^\d{4}_.+\.sql$/u.test(candidate) && Number(candidate.slice(0, 4)) <= 18,
    )
    .sort())
    sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  sqlite.exec(readFileSync(LEGACY_FIXTURE, 'utf8'));
  sqlite.close();
}

describe('service actor namespace migration', () => {
  it('rolls back a populated v32 upgrade when a pre-existing user/actor collision is found', () => {
    process.env.JA_TENANT_ID = 'test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'test-deployment';
    const v32Migrations = migrationCopy(32);
    const allMigrations = migrationCopy(33);
    const root = mkdtempSync(join(tmpdir(), 'ja-service-actor-namespace-upgrade-'));
    temporaryDirectories.push(root);
    const databasePath = join(root, 'app.db');
    buildLegacyDatabase(databasePath);

    process.env.JA_MIGRATIONS_PATH = v32Migrations;
    const v32 = createDatabase(databasePath);
    try {
      expect(v32.sqlite.prepare('SELECT max(version) version FROM schema_migration').get()).toEqual(
        {
          version: 32,
        },
      );
      expect(v32.sqlite.prepare('SELECT count(*) count FROM project').get()).toEqual({ count: 1 });
    } finally {
      v32.sqlite.close();
    }

    const populated = new DatabaseSync(databasePath);
    try {
      const now = new Date().toISOString();
      populated
        .prepare(
          `INSERT INTO user(
             id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
           ) VALUES(?,?,?,1,'worker','active',0,0,?,?,1)`,
        )
        .run('namespace-collision', 'Collision user', 'collision@example.test', now, now);
      populated
        .prepare(
          `INSERT INTO service_actor(
             id,tenant_id,deployment_id,name,status,capabilities_json,created_at,updated_at,version
           ) VALUES(?,?,?,?,?,?,?,?,1)`,
        )
        .run(
          'namespace-collision',
          'test-tenant',
          'test-deployment',
          'Collision actor',
          'active',
          '["backup.verify"]',
          now,
          now,
        );
    } finally {
      populated.close();
    }

    process.env.JA_MIGRATIONS_PATH = allMigrations;
    expect(() => createDatabase(databasePath)).toThrow(/namespace collision/iu);

    const afterFailure = new DatabaseSync(databasePath);
    try {
      expect(
        afterFailure
          .prepare('SELECT max(version) version,count(*) count FROM schema_migration')
          .get(),
      ).toEqual({ version: 32, count: 32 });
      expect(afterFailure.prepare('SELECT count(*) count FROM project').get()).toEqual({
        count: 1,
      });
      expect(
        afterFailure.prepare('SELECT id FROM user WHERE id=?').get('namespace-collision'),
      ).toEqual({ id: 'namespace-collision' });
      expect(
        afterFailure.prepare('SELECT id FROM service_actor WHERE id=?').get('namespace-collision'),
      ).toEqual({ id: 'namespace-collision' });
      expect(
        afterFailure
          .prepare(
            `SELECT count(*) count FROM sqlite_master
              WHERE type='trigger' AND name IN(
                'service_actor_namespace_insert_guard',
                'user_service_actor_namespace_insert_guard'
              )`,
          )
          .get(),
      ).toEqual({ count: 0 });
      expect(afterFailure.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(afterFailure)).toBe('ok');
    } finally {
      afterFailure.close();
    }
  });
});
