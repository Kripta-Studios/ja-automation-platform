import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck } from '@ja/database';
import { DatabaseSync } from 'node:sqlite';
import * as declaredSchema from '@ja/database/schema';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
describe('SQLite migration', () => {
  it('enables WAL, foreign keys and STRICT schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ja-db-'));
    dirs.push(dir);
    const { sqlite } = createDatabase(join(dir, 'app.db'));
    expect(
      (sqlite.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode,
    ).toBe('wal');
    expect(
      (sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys,
    ).toBe(1);
    expect(integrityCheck(sqlite)).toBe('ok');
    expect(
      (
        sqlite.prepare("SELECT strict FROM pragma_table_list WHERE name='invoice'").get() as {
          strict: number;
        }
      ).strict,
    ).toBe(1);
    sqlite.close();
  });

  it('upgrades a populated pre-V3 database without losing business rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ja-db-upgrade-'));
    dirs.push(dir);
    const sqlite = new DatabaseSync(join(dir, 'app.db'));
    sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    const migrationDirectory = resolve(process.cwd(), 'migrations');
    const files = readdirSync(migrationDirectory)
      .filter((file) => /^\d{4}_.+\.sql$/.test(file))
      .sort();
    for (const file of files.filter((file) => Number(file.slice(0, 4)) <= 1))
      sqlite.exec(readFileSync(join(migrationDirectory, file), 'utf8'));
    const now = new Date().toISOString();
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES('u','Worker','upgrade@example.com','worker','active',1,?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at) VALUES('c','C-0001','Upgrade Client','Upgrade Client','active','USD','UTC',?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at) VALUES('p','C-0001-P-001','c','Upgrade Project','UTC','USD','active','tm',?,?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,created_at,updated_at) VALUES('t','p','u','2026-08-03','regular',60,'draft','pending',?,?)",
      )
      .run(now, now);
    for (const file of files.filter((file) => Number(file.slice(0, 4)) > 1))
      sqlite.exec(readFileSync(join(migrationDirectory, file), 'utf8'));
    expect(
      (sqlite.prepare("SELECT name FROM user WHERE id='u'").get() as { name: string }).name,
    ).toBe('Worker');
    expect(
      (
        sqlite.prepare("SELECT project_number FROM project WHERE id='p'").get() as {
          project_number: string;
        }
      ).project_number,
    ).toBe('C-0001-P-001');
    expect(
      (
        sqlite.prepare("SELECT minutes,project_timezone FROM time_entry WHERE id='t'").get() as {
          minutes: number;
          project_timezone: string;
        }
      ).minutes,
    ).toBe(60);
    expect(
      (
        sqlite.prepare("SELECT project_timezone FROM time_entry WHERE id='t'").get() as {
          project_timezone: string;
        }
      ).project_timezone,
    ).toBe('UTC');
    expect(
      (
        sqlite.prepare('SELECT max(version) version FROM schema_migration').get() as {
          version: number;
        }
      ).version,
    ).toBe(18);
    expect(
      sqlite
        .prepare("SELECT 1 FROM pragma_table_info('project') WHERE name='fixed_price_minor'")
        .get(),
    ).toBeTruthy();
    expect(
      sqlite.prepare("SELECT status,mfa_required FROM user WHERE id='u'").get() as {
        status: string;
        mfa_required: number;
      },
    ).toEqual({ status: 'active', mfa_required: 1 });
    expect(
      sqlite.prepare("SELECT two_factor_enabled FROM user WHERE id='u'").get() as {
        two_factor_enabled: number;
      },
    ).toEqual({ two_factor_enabled: 0 });
    expect(
      sqlite
        .prepare("SELECT name FROM pragma_table_info('two_factor') WHERE name='verified'")
        .get(),
    ).toBeTruthy();
    expect(
      sqlite.prepare("SELECT name FROM pragma_table_info('account') WHERE name='issuer'").get(),
    ).toBeTruthy();
    expect(integrityCheck(sqlite)).toBe('ok');
    sqlite.close();
  });

  it('keeps the declared Drizzle schema aligned with the migrated SQLite schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ja-db-schema-parity-'));
    dirs.push(dir);
    const { sqlite } = createDatabase(join(dir, 'app.db'));
    const declaredTables = Object.values(declaredSchema).flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return [];
      const record = candidate as Record<PropertyKey, unknown>;
      const name = record[Symbol.for('drizzle:Name')];
      const columns = record[Symbol.for('drizzle:Columns')];
      if (typeof name !== 'string' || !columns || typeof columns !== 'object') return [];
      const columnNames = Object.values(columns as Record<string, { name?: unknown }>).flatMap(
        (column) => (typeof column.name === 'string' ? [column.name] : []),
      );
      return [{ name, columns: columnNames }];
    });
    expect(declaredTables.length).toBeGreaterThan(0);
    for (const table of declaredTables) {
      const actual = (
        sqlite
          .prepare('SELECT name FROM pragma_table_info(?) ORDER BY cid')
          .all(table.name) as Array<{
          name: string;
        }>
      )
        .map((column) => column.name)
        .sort();
      expect(actual, `${table.name} columns`).toEqual([...table.columns].sort());
    }
    sqlite.close();
  });
});
