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
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  if (previousMigrationPath === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = previousMigrationPath;
});

function priorMigrationDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ja-expense-schema49-'));
  directories.push(directory);
  for (const entry of readdirSync(migrations)) {
    if (
      entry === 'contracts' ||
      (/^\d{4}_.+\.sql$/u.test(entry) && Number(entry.slice(0, 4)) <= 49)
    )
      cpSync(join(migrations, entry), join(directory, entry), { recursive: true });
  }
  return directory;
}

describe('0050 expense occurrence time and shift link migration', () => {
  it('creates nullable columns and a matching time foreign key on a fresh database', () => {
    delete process.env.JA_MIGRATIONS_PATH;
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    const columns = fixture.sqlite.prepare('PRAGMA table_info(expense)').all() as Array<{
      name: string;
    }>;
    expect(columns.map((column) => column.name)).toContain('occurred_time_local');
    expect(columns.map((column) => column.name)).toContain('time_entry_id');
    expect(fixture.sqlite.prepare('PRAGMA foreign_key_list(expense)').all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'time_entry', from: 'time_entry_id' }),
      ]),
    );
    expect(fixture.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(
      fixture.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('crew_expense_recorder','crew_expense_request') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: 'crew_expense_recorder' }, { name: 'crew_expense_request' }]);
  });

  it('upgrades a populated schema-49 database without changing existing expense values', () => {
    process.env.JA_MIGRATIONS_PATH = priorMigrationDirectory();
    const fixture = createB5LifecycleSecurityFixture();
    fixtures.push(fixture);
    const expenseId = 'schema49-expense';
    const timestamp = '2026-08-20T12:00:00.000Z';
    fixture.sqlite
      .prepare(
        `INSERT INTO expense(
           id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,
           vendor,description,who_paid,receipt_required,approval_state,reimbursement_state,
           created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        expenseId,
        fixture.project.id,
        fixture.worker.userId,
        '2026-08-20',
        'hotel',
        'EUR',
        12345,
        'non_billable',
        'Original hotel',
        'Preserved migration record',
        'worker',
        0,
        'draft',
        'pending',
        timestamp,
        timestamp,
      );
    const before = fixture.sqlite
      .prepare('SELECT * FROM expense WHERE id=?')
      .get(expenseId) as Record<string, unknown>;
    expect(
      fixture.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get(),
    ).toEqual({ version: 49 });
    fixture.sqlite.close();
    process.env.JA_MIGRATIONS_PATH = migrations;
    fixture.sqlite = createDatabase(join(fixture.directory, 'app.db')).sqlite;
    const after = fixture.sqlite
      .prepare('SELECT * FROM expense WHERE id=?')
      .get(expenseId) as Record<string, unknown>;
    expect(after).toMatchObject(before);
    expect(after.occurred_time_local).toBeNull();
    expect(after.time_entry_id).toBeNull();
    expect(
      fixture.sqlite.prepare('SELECT COUNT(*) count FROM crew_expense_recorder').get(),
    ).toEqual({ count: 0 });
    expect(
      fixture.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get(),
    ).toEqual({ version: 55 });
    expect(fixture.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(fixture.sqlite)).toBe('ok');
  });
});
