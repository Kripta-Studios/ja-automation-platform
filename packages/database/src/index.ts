import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(
  path = process.env.JA_DATABASE_PATH ?? resolve(process.cwd(), 'data/app.db'),
): DatabaseSync {
  if (!path.startsWith(':')) mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec(
    'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
  );
  const defensive = sqlite as DatabaseSync & { enableDefensive?: (enabled: boolean) => void };
  defensive.enableDefensive?.(true);
  return sqlite;
}

export function migrate(sqlite: DatabaseSync): void {
  const configured = process.env.JA_MIGRATIONS_PATH;
  const candidates = [
    configured ? resolve(configured) : undefined,
    resolve(process.cwd(), 'migrations'),
    resolve(process.cwd(), '../../migrations'),
  ].filter((value): value is string => Boolean(value));
  const migrationDirectory = candidates.find((value) => existsSync(value));
  if (!migrationDirectory) throw new Error('Migration directory was not found');
  const files = readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  if (files.length === 0) throw new Error('No reviewed SQL migrations were found');
  const hasMigrationTable = Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migration'")
      .get(),
  );
  const applied = new Set<number>(
    hasMigrationTable
      ? (
          sqlite.prepare('SELECT version FROM schema_migration').all() as Array<{ version: number }>
        ).map((row) => row.version)
      : [],
  );
  for (const file of files) {
    const version = Number(file.slice(0, 4));
    if (!applied.has(version)) sqlite.exec(readFileSync(resolve(migrationDirectory, file), 'utf8'));
  }
}

export function createDatabase(path?: string) {
  const sqlite = openDatabase(path);
  migrate(sqlite);
  return { sqlite };
}

export function integrityCheck(sqlite: DatabaseSync): string {
  const result = sqlite.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  return result.integrity_check;
}

export * from './repository.ts';
export * from './v3-repository.ts';
