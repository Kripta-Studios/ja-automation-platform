import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDatabase, integrityCheck } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture';

const directories: string[] = [];
const fixtures: B5LifecycleSecurityFixture[] = [];
const original = process.env.JA_MIGRATIONS_PATH;
afterEach(() => {
  fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture);
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  if (original === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = original;
});

describe('digital work coordination migration77', () => {
  it('upgrades populated schema76 without changing business rows or reviewed metadata', () => {
    const prior = mkdtempSync(join(tmpdir(), 'ja-dw-schema76-'));
    directories.push(prior);
    for (const entry of readdirSync(resolve('migrations')))
      if (
        entry === 'contracts' ||
        (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 76)
      )
        cpSync(join(resolve('migrations'), entry), join(prior, entry), { recursive: true });
    process.env.JA_MIGRATIONS_PATH = prior;
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 76,
    });
    const names = [
      'user',
      'client',
      'project',
      'project_member',
      'time_entry',
      'expense',
      'invoice',
      'payment',
    ];
    const before = Object.fromEntries(
      names.map((name) => [name, f.sqlite.prepare(`SELECT * FROM ${name} ORDER BY id`).all()]),
    );
    const metadata = f.sqlite
      .prepare('SELECT * FROM migration_contract_metadata ORDER BY migration_version')
      .all();
    const cutover = f.sqlite.prepare('SELECT * FROM finance_v2_cutover').all();
    f.sqlite.close();
    process.env.JA_MIGRATIONS_PATH = resolve('migrations');
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 77,
    });
    for (const name of names)
      expect(f.sqlite.prepare(`SELECT * FROM ${name} ORDER BY id`).all(), name).toEqual(
        before[name],
      );
    expect(
      f.sqlite
        .prepare(
          'SELECT * FROM migration_contract_metadata WHERE migration_version<=76 ORDER BY migration_version',
        )
        .all(),
    ).toEqual(metadata);
    expect(f.sqlite.prepare('SELECT * FROM finance_v2_cutover').all()).toEqual(cutover);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(f.sqlite)).toBe('ok');
    f.sqlite.close();
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(
      f.sqlite.prepare('SELECT COUNT(*) count FROM schema_migration WHERE version=77').get(),
    ).toEqual({ count: 1 });
  }, 60_000);
  it('installs fresh and retains immutable capture receipts', () => {
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    for (const name of [
      'digital_work_case',
      'digital_work_case_revision',
      'digital_work_case_review',
      'digital_work_item',
      'digital_work_item_event',
      'capture_request',
    ])
      expect(
        f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name),
      ).toEqual({ name });
    f.sqlite
      .prepare(
        'INSERT INTO capture_request(actor_user_id,request_key,payload_sha256,result_json,created_at) VALUES(?,?,?,?,?)',
      )
      .run(f.worker.userId, 'migration-test', 'a'.repeat(64), '{}', new Date().toISOString());
    expect(() => f.sqlite.prepare("UPDATE capture_request SET result_json='[]'").run()).toThrow(
      'immutable',
    );
    expect(() => f.sqlite.prepare('DELETE FROM capture_request').run()).toThrow('immutable');
    expect(integrityCheck(f.sqlite)).toBe('ok');
  }, 60_000);
});
