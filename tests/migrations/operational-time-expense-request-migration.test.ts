import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const migrations = resolve(process.cwd(), 'migrations');
const directories: string[] = [];
const fixtures: B5LifecycleSecurityFixture[] = [];
const previousMigrationPath = process.env.JA_MIGRATIONS_PATH;

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  if (previousMigrationPath === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = previousMigrationPath;
});

function priorMigrationDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ja-time-expense-schema54-'));
  directories.push(directory);
  for (const entry of readdirSync(migrations)) {
    if (
      entry === 'contracts' ||
      (/^\d{4}_.+\.sql$/u.test(entry) && Number(entry.slice(0, 4)) <= 54)
    ) cpSync(join(migrations, entry), join(directory, entry), { recursive: true });
  }
  return directory;
}

describe('0055 operational time/expense request migration', () => {
  it('adds an immutable request ledger on a populated schema 54 without changing sources', () => {
    process.env.JA_MIGRATIONS_PATH = priorMigrationDirectory();
    const value = createB5LifecycleSecurityFixture();
    fixtures.push(value);
    const time = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Earlier site work',
    });
    const before = value.sqlite.prepare('SELECT * FROM time_entry WHERE id=?').get(time.id);
    expect(value.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({ version: 54 });
    value.sqlite.close();
    process.env.JA_MIGRATIONS_PATH = migrations;
    value.sqlite = createDatabase(join(value.directory, 'app.db')).sqlite;
    expect(value.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({ version: 55 });
    expect(value.sqlite.prepare('SELECT * FROM time_entry WHERE id=?').get(time.id)).toEqual(before);
    expect(value.sqlite.prepare('SELECT COUNT(*) count FROM operational_time_expense_request').get()).toEqual({ count: 0 });
    expect(value.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(value.sqlite)).toBe('ok');
  });
});
