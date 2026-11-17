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

const INDEXES = ['audit_event_occurred_idx', 'audit_event_actor_time_idx', 'notification_user_read_time_idx'];

describe('scale indexes migration80', () => {
  it('upgrades populated schema79 additively: only new read indexes, data and metadata unchanged', () => {
    const prior = mkdtempSync(join(tmpdir(), 'ja-scale-schema79-'));
    directories.push(prior);
    for (const entry of readdirSync(resolve('migrations')))
      if (entry === 'contracts' || (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 79))
        cpSync(join(resolve('migrations'), entry), join(prior, entry), { recursive: true });
    process.env.JA_MIGRATIONS_PATH = prior;
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({ version: 79 });
    const names = ['user', 'project', 'time_entry', 'invoice', 'notification', 'audit_event', 'finance_v2_cutover'];
    const before = Object.fromEntries(
      names.map((name) => [name, f.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
    );
    const metadata = f.sqlite.prepare('SELECT * FROM migration_contract_metadata ORDER BY migration_version').all();
    const schema = f.sqlite
      .prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name<>'migration_contract_metadata' ORDER BY type,name")
      .all();
    f.sqlite.close();
    // Upgrade to exactly schema 80: later migrations change the schema on purpose.
    const target = mkdtempSync(join(tmpdir(), 'ja-scale-schema80-'));
    directories.push(target);
    for (const entry of readdirSync(resolve('migrations')))
      if (entry === 'contracts' || (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 80))
        cpSync(join(resolve('migrations'), entry), join(target, entry), { recursive: true });
    process.env.JA_MIGRATIONS_PATH = target;
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({ version: 80 });
    for (const name of names)
      expect(f.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(), name).toEqual(before[name]);
    expect(
      f.sqlite.prepare('SELECT * FROM migration_contract_metadata WHERE migration_version<=79 ORDER BY migration_version').all(),
    ).toEqual(metadata);
    expect(
      f.sqlite.prepare('SELECT migration_name FROM migration_contract_metadata WHERE migration_version=80').get(),
    ).toEqual({ migration_name: 'scale_indexes' });
    const after = f.sqlite
      .prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name<>'migration_contract_metadata' ORDER BY type,name")
      .all() as Array<{ name: string }>;
    // Same schema plus exactly the three indexes.
    expect(after.filter((row) => !INDEXES.includes(row.name))).toEqual(schema);
    expect(after.filter((row) => INDEXES.includes(row.name)).map((row) => row.name).sort()).toEqual([...INDEXES].sort());
    // The audit register's newest-first window uses the time index instead of a full sort.
    const plan = f.sqlite
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM audit_event WHERE occurred_at>=? AND occurred_at<? ORDER BY occurred_at DESC,id DESC LIMIT 25",
      )
      .all('2026-11-01', '2026-11-08') as Array<{ detail: string }>;
    expect(plan.map((row) => row.detail).join('\n')).toMatch(/audit_event_occurred_idx/);
    expect(plan.map((row) => row.detail).join('\n')).not.toMatch(/TEMP B-TREE/);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(f.sqlite)).toBe('ok');
  }, 60_000);
});
