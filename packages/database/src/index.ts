import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(
  path = process.env.JA_DATABASE_PATH ?? resolve(process.cwd(), 'data/app.db'),
): DatabaseSync {
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
    configured,
    resolve(process.cwd(), 'migrations/0001_v3_initial.sql'),
    resolve(process.cwd(), '../../migrations/0001_v3_initial.sql'),
  ].filter((value): value is string => Boolean(value));
  const migration = candidates.find((value) => existsSync(value));
  if (!migration) throw new Error('Migration 0001_v3_initial.sql was not found');
  const sql = readFileSync(migration, 'utf8');
  sqlite.exec(sql);
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
