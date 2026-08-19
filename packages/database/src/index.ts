import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statfsSync,
} from 'node:fs';
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

function migrationFiles(): readonly string[] {
  const configured = process.env.JA_MIGRATIONS_PATH;
  const candidates = [
    configured ? resolve(configured) : undefined,
    resolve(process.cwd(), 'migrations'),
    resolve(process.cwd(), '../../migrations'),
  ].filter((value): value is string => Boolean(value));
  const directory = candidates.find((value) => existsSync(value));
  if (!directory) return [];
  return readdirSync(directory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
}

export function expectedMigrationVersion(): number {
  const versions = migrationFiles().map((file) => Number(file.slice(0, 4)));
  return versions.length ? Math.max(...versions) : 0;
}

export type DatabaseReadiness = Readonly<{
  ok: boolean;
  integrity: string;
  migrationVersion: number;
  expectedMigrationVersion: number;
  writableDirectories: boolean;
  writeReady: boolean;
  diskFreeBytes: number | null;
  diskFreeThresholdBytes: number;
}>;

export function readinessCheck(
  sqlite: DatabaseSync,
  documentRoot = process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT ?? 'data/documents',
): DatabaseReadiness {
  const integrity = integrityCheck(sqlite);
  const hasMigrationTable = Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migration'")
      .get(),
  );
  const migrationRow = hasMigrationTable
    ? (sqlite.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migration').get() as
        | { version: number }
        | undefined)
    : undefined;
  const migrationVersion = Number(migrationRow?.version ?? 0);
  const expected = expectedMigrationVersion();
  const directories = [
    'receipts',
    'reports',
    'invoices',
    'technical',
    'plc-backups',
    'exports',
    'temp',
  ];
  const writableDirectories = [
    documentRoot,
    ...directories.map((name) => resolve(documentRoot, name)),
  ].every((directory) => {
    try {
      accessSync(directory, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  });
  let writeReady = false;
  try {
    sqlite.exec('BEGIN IMMEDIATE; ROLLBACK;');
    writeReady = true;
  } catch {
    try {
      sqlite.exec('ROLLBACK;');
    } catch {
      // Keep readiness failure contained; the original write error is reflected by writeReady.
    }
  }
  const diskFreeThresholdBytes = Number.parseInt(process.env.JA_MIN_FREE_BYTES ?? '1073741824', 10);
  let diskFreeBytes: number | null = null;
  try {
    const stats = statfsSync(resolve(documentRoot));
    diskFreeBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    diskFreeBytes = null;
  }
  const diskReady = diskFreeBytes === null || diskFreeBytes >= diskFreeThresholdBytes;
  return {
    ok:
      integrity === 'ok' &&
      migrationVersion === expected &&
      writableDirectories &&
      writeReady &&
      diskReady,
    integrity,
    migrationVersion,
    expectedMigrationVersion: expected,
    writableDirectories,
    writeReady,
    diskFreeBytes,
    diskFreeThresholdBytes,
  };
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
