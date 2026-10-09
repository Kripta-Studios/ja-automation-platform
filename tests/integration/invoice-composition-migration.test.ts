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
const directories: string[] = [];
const fixtures: B5LifecycleSecurityFixture[] = [];
const migrationPath = process.env.JA_MIGRATIONS_PATH;
afterEach(() => {
  fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture);
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  if (migrationPath === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = migrationPath;
});

describe('invoice composition migration 76', () => {
  it('preserves populated schema75 invoices and migration history, and repeats safely', () => {
    const prior = mkdtempSync(join(tmpdir(), 'ja-invoice-selection-schema75-'));
    directories.push(prior);
    for (const entry of readdirSync(resolve('migrations')))
      if (
        entry === 'contracts' ||
        (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 75)
      )
        cpSync(join(resolve('migrations'), entry), join(prior, entry), { recursive: true });
    process.env.JA_MIGRATIONS_PATH = prior;
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 75,
    });
    const stamp = '2026-08-20T10:00:00Z';
    f.sqlite
      .prepare(
        `INSERT INTO invoice(id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,issued_at,snapshot_json,created_at,updated_at)
      VALUES(?,?,'HISTORICAL-2026-1','labor','issued','EUR',12345,0,12345,?,?,?,?)`,
      )
      .run(
        'historical-selected-migration',
        f.project.id,
        stamp,
        '{"historical":true}',
        stamp,
        stamp,
      );
    const before = f.sqlite.prepare('SELECT * FROM invoice ORDER BY id').all();
    const metadata = f.sqlite
      .prepare('SELECT * FROM migration_contract_metadata ORDER BY migration_version')
      .all();
    const projects = f.sqlite.prepare('SELECT * FROM project ORDER BY id').all();
    f.sqlite.close();
    process.env.JA_MIGRATIONS_PATH = resolve('migrations');
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 76,
    });
    expect(f.sqlite.prepare('SELECT * FROM invoice ORDER BY id').all()).toEqual(
      before.map((invoice) => ({ ...invoice, source_selection_json: null })),
    );
    expect(
      f.sqlite
        .prepare(
          'SELECT * FROM migration_contract_metadata WHERE migration_version<=75 ORDER BY migration_version',
        )
        .all(),
    ).toEqual(metadata);
    expect(f.sqlite.prepare('SELECT * FROM project ORDER BY id').all()).toEqual(projects);
    expect(() =>
      f.sqlite
        .prepare('UPDATE invoice SET source_selection_json=? WHERE id=?')
        .run('[]', 'historical-selected-migration'),
    ).toThrow('selection is immutable');
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(f.sqlite)).toBe('ok');
    f.sqlite.close();
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(
      f.sqlite.prepare('SELECT COUNT(*) count FROM schema_migration WHERE version=76').get(),
    ).toEqual({ count: 1 });
  });

  it('installs on a fresh database and protects retry identity and migration metadata', () => {
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    expect(
      f.sqlite
        .prepare("SELECT name FROM pragma_table_info('invoice') WHERE name='source_selection_json'")
        .get(),
    ).toEqual({ name: 'source_selection_json' });
    f.sqlite
      .prepare(
        'INSERT INTO invoice_composition_request(request_key,payload_hash,invoice_id,created_at) VALUES(?,?,?,?)',
      )
      .run('preserved-request', 'a'.repeat(64), 'discarded-draft', new Date().toISOString());
    expect(() => f.sqlite.prepare('DELETE FROM invoice_composition_request').run()).toThrow(
      'request is immutable',
    );
    expect(() =>
      f.sqlite.prepare('UPDATE invoice_composition_request SET payload_hash=?').run('b'.repeat(64)),
    ).toThrow('request is immutable');
    expect(() =>
      f.sqlite
        .prepare('UPDATE migration_contract_metadata SET applied_at=? WHERE migration_version=76')
        .run('changed'),
    ).toThrow('migration metadata immutable');
    expect(integrityCheck(f.sqlite)).toBe('ok');
  });
});
