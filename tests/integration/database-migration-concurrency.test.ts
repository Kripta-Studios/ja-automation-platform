import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck, openDatabase } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const migrationsPath = resolve(process.cwd(), 'migrations');
let restoreIdentity: (() => void) | undefined;

beforeAll(() => {
  restoreIdentity = installB5TestDeploymentIdentity();
});
afterAll(() => restoreIdentity?.());
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixtureDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ja-migration-race-'));
  directories.push(directory);
  return directory;
}

function priorMigrationDirectory(directory: string): string {
  const prior = join(directory, 'prior-migrations');
  mkdirSync(join(prior, 'contracts'), { recursive: true });
  copyFileSync(
    join(migrationsPath, 'contracts/ja-b5-migration-contract-v1.json'),
    join(prior, 'contracts/ja-b5-migration-contract-v1.json'),
  );
  for (const file of readdirSync(migrationsPath)) {
    if (/^\d{4}_.+\.sql$/u.test(file) && Number(file.slice(0, 4)) <= 61)
      copyFileSync(join(migrationsPath, file), join(prior, file));
  }
  return prior;
}

async function migrateWithTwoConnections(
  databasePath: string,
  snapshot: 'schema' | 'versions',
): Promise<void> {
  const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { migrate, openDatabase } = await import('@ja/database');
      const state = new Int32Array(workerData.shared);
      const sqlite = openDatabase(workerData.databasePath);
      const prepare = sqlite.prepare.bind(sqlite);
      const barrierSql = workerData.snapshot === 'schema'
        ? "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migration'"
        : 'SELECT version FROM schema_migration';
      let passedBarrier = false;
      const synchronize = (value) => {
        if (!passedBarrier) {
          passedBarrier = true;
          Atomics.add(state, 0, 1);
          Atomics.notify(state, 0);
          while (Atomics.load(state, 0) < 2)
            Atomics.wait(state, 0, 1, 10000);
        }
        return value;
      };
      sqlite.prepare = (sql) => {
        const statement = prepare(sql);
        if (sql !== barrierSql) return statement;
        return {
          all: (...args) => synchronize(statement.all(...args)),
          get: (...args) => synchronize(statement.get(...args)),
        };
      };
      try {
        migrate(sqlite);
        parentPort.postMessage({ ok: true });
      } catch (error) {
        parentPort.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
      } finally {
        sqlite.close();
      }
    })().catch((error) => parentPort.postMessage({ ok: false, message: String(error) }));
  `;
  const workers = [0, 1].map(
    () =>
      new Worker(source, {
        eval: true,
        execArgv: ['--experimental-strip-types'],
        workerData: { databasePath, shared, snapshot },
        env: { ...process.env, JA_MIGRATIONS_PATH: migrationsPath },
      }),
  );
  try {
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((resolve, reject) => {
            worker.once('message', (message: { ok: boolean; message?: string }) => {
              if (message.ok) resolve();
              else reject(new Error(message.message ?? 'Concurrent migration failed'));
            });
            worker.once('error', reject);
            worker.once('exit', (code) => {
              if (code !== 0) reject(new Error(`Migration worker exited with ${code}`));
            });
          }),
      ),
    );
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}

describe('SQLite migration concurrency', () => {
  it('migrates a fresh database and verifies its immutable metadata on reopen', () => {
    const databasePath = join(fixtureDirectory(), 'app.db');
    const first = createDatabase(databasePath).sqlite;
    first.close();
    const second = createDatabase(databasePath).sqlite;
    try {
      expect(integrityCheck(second)).toBe('ok');
      expect(second.prepare('SELECT max(version) AS version FROM schema_migration').get()).toEqual({
        version: 67,
      });
      expect(
        second.prepare('SELECT count(*) AS count FROM migration_contract_metadata').get(),
      ).toEqual({ count: 49 });
    } finally {
      second.close();
    }
  });

  it('serializes two migrators that both saw an empty fresh database', async () => {
    const databasePath = join(fixtureDirectory(), 'app.db');
    // Establish WAL before both workers open their separate SQLite handles.
    openDatabase(databasePath).close();
    await migrateWithTwoConnections(databasePath, 'schema');
    const final = createDatabase(databasePath).sqlite;
    try {
      expect(integrityCheck(final)).toBe('ok');
      expect(final.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
      expect(final.prepare('SELECT count(*) AS count FROM schema_migration').get()).toEqual({
        count: 67,
      });
      expect(
        final.prepare('SELECT count(*) AS count FROM migration_contract_metadata').get(),
      ).toEqual({ count: 49 });
    } finally {
      final.close();
    }
  }, 120_000);

  it('serializes two migrators that both saw version 61 before taking the write lock', async () => {
    const directory = fixtureDirectory();
    const databasePath = join(directory, 'app.db');
    const previousPath = process.env.JA_MIGRATIONS_PATH;
    process.env.JA_MIGRATIONS_PATH = priorMigrationDirectory(directory);
    try {
      const prior = createDatabase(databasePath).sqlite;
      expect(prior.prepare('SELECT max(version) AS version FROM schema_migration').get()).toEqual({
        version: 61,
      });
      prior.close();
    } finally {
      if (previousPath === undefined) delete process.env.JA_MIGRATIONS_PATH;
      else process.env.JA_MIGRATIONS_PATH = previousPath;
    }

    await migrateWithTwoConnections(databasePath, 'versions');
    const final = createDatabase(databasePath).sqlite;
    try {
      expect(integrityCheck(final)).toBe('ok');
      expect(final.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
      expect(final.prepare('SELECT max(version) AS version FROM schema_migration').get()).toEqual({
        version: 67,
      });
      expect(
        final
          .prepare('SELECT count(*) AS count FROM schema_migration WHERE version BETWEEN 62 AND 67')
          .get(),
      ).toEqual({ count: 6 });
      expect(
        final
          .prepare(
            'SELECT count(*) AS count FROM migration_contract_metadata WHERE migration_version BETWEEN 62 AND 67',
          )
          .get(),
      ).toEqual({ count: 6 });
    } finally {
      final.close();
    }
  }, 120_000);
});
