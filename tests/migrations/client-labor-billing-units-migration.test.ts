import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
const migrations = resolve('migrations');
const directories: string[] = [];
const fixtures: B5LifecycleSecurityFixture[] = [];
const oldMigrationPath = process.env.JA_MIGRATIONS_PATH;
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
  for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true });
  if (oldMigrationPath === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = oldMigrationPath;
});
describe('customer unit migration 74', () => {
  it('preserves hourly money and all sources on populated schema 73, enforces new unit constraints and is repeatable', () => {
    const prior = mkdtempSync(join(tmpdir(), 'ja-client-units-schema73-'));
    directories.push(prior);
    for (const entry of readdirSync(migrations))
      if (
        entry === 'contracts' ||
        (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 73)
      )
        cpSync(join(migrations, entry), join(prior, entry), { recursive: true });
    process.env.JA_MIGRATIONS_PATH = prior;
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 73,
    });
    const stamp = '2026-08-01T00:00:00Z';
    f.sqlite
      .prepare(
        `INSERT INTO client_labor_rate(id,project_id,worker_id,currency,hourly_rate_minor,effective_from,created_at,updated_at,rate_basis) VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'historical-hourly',
        f.project.id,
        f.worker.userId,
        'EUR',
        12345,
        '2026-08-01',
        stamp,
        stamp,
        'hourly',
      );
    const before = f.sqlite
      .prepare('SELECT * FROM client_labor_rate WHERE id=?')
      .get('historical-hourly');
    const projects = f.sqlite.prepare('SELECT * FROM project ORDER BY id').all();
    f.sqlite.close();
    process.env.JA_MIGRATIONS_PATH = migrations;
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(
      f.sqlite.prepare('SELECT * FROM client_labor_rate WHERE id=?').get('historical-hourly'),
    ).toEqual({ ...before, unit_rate_minor: null });
    expect(f.sqlite.prepare('SELECT * FROM project ORDER BY id').all()).toEqual(projects);
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 74,
    });
    expect(() =>
      f.sqlite
        .prepare('UPDATE client_labor_rate SET rate_basis=? WHERE id=?')
        .run('weekly', 'historical-hourly'),
    ).toThrow('invalid client billing unit');
    expect(() =>
      f.sqlite
        .prepare('UPDATE client_labor_rate SET unit_rate_minor=-1 WHERE id=?')
        .run('historical-hourly'),
    ).toThrow();
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(f.sqlite)).toBe('ok');
    f.sqlite.close();
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(
      f.sqlite.prepare('SELECT COUNT(*) count FROM schema_migration WHERE version=74').get(),
    ).toEqual({ count: 1 });
  });
  it('applies to a fresh database and retains migration/cutover immutability', () => {
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    expect(
      f.sqlite
        .prepare(
          "SELECT name FROM pragma_table_info('client_labor_rate') WHERE name='unit_rate_minor'",
        )
        .get(),
    ).toEqual({ name: 'unit_rate_minor' });
    expect(() =>
      f.sqlite
        .prepare('UPDATE migration_contract_metadata SET applied_at=? WHERE migration_version=74')
        .run('changed'),
    ).toThrow('migration metadata immutable');
    expect(() => f.sqlite.prepare('DELETE FROM finance_v2_cutover').run()).toThrow(
      'finance cutover immutable',
    );
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
