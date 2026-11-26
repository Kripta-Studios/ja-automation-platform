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

const NEW_TABLES = ['exchange_rate', 'exchange_rate_fetch', 'currency_conversion'];
const REBUILT = [
  'worker_compensation_payment_event',
  'project_person_defaults',
  'project_member_default_terms',
];

function seedPaymentsAndDefaults(f: B5LifecycleSecurityFixture): void {
  const now = '2026-11-10T10:00:00.000Z';
  const s = f.sqlite;
  s.prepare(
    `INSERT INTO compensation_rule(id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,created_at,updated_at)
     VALUES('fx-rule','b5-worker',?,'EUR',3000,'hourly','2026-01-01',?,?)`,
  ).run(f.project.id, now, now);
  s.prepare(
    `INSERT INTO compensation_settlement(id,worker_id,project_id,compensation_rule_id,period_start,period_end,
       source_basis,source_amount_minor,amount_minor,currency,state,settled_at,created_at,updated_at)
     VALUES('fx-settlement','b5-worker',?,'fx-rule','2026-11-02','2026-11-08','APPROVED_TIME',600,3000,'EUR','settled',?,?,?)`,
  ).run(f.project.id, now, now, now);
  const pay = s.prepare(
    `INSERT INTO worker_compensation_payment_event(id,settlement_id,event_type,reverses_event_id,payee_kind,
       payee_user_id,payee_supplier_id,amount_minor,currency,paid_on,reference,note,created_by,created_at,idempotency_key)
     VALUES(?,'fx-settlement',?,?,'person','b5-worker',NULL,?,'EUR','2026-11-10',?,NULL,'b5-owner',?,?)`,
  );
  pay.run('fx-pay-1', 'payment', null, 1000, 'TR-1', now, 'k1');
  pay.run('fx-rev-1', 'reversal', 'fx-pay-1', 1000, 'TR-1 reversal', now, 'k2');
  pay.run('fx-pay-2', 'payment', null, 3000, 'TR-2', now, 'k3');
  const member = s
    .prepare('SELECT id FROM project_member WHERE project_id=? ORDER BY id LIMIT 1')
    .get(f.project.id) as { id: string };
  s.prepare(
    `INSERT INTO project_person_defaults(id,project_id,currency,effective_from,config_json,version,created_by,created_at)
     VALUES('fx-defaults',?,'EUR','2026-01-01','{}',1,'b5-owner',?)`,
  ).run(f.project.id, now);
  s.prepare(
    'INSERT INTO project_member_default_terms(project_member_id,default_id) VALUES(?,?)',
  ).run(member.id, 'fx-defaults');
}

describe('multi currency fx migration82', () => {
  it('upgrades a populated schema without changing data, widens currency checks and adds fx tables', () => {
    const prior = mkdtempSync(join(tmpdir(), 'ja-fx-schema80-'));
    directories.push(prior);
    for (const entry of readdirSync(resolve('migrations')))
      if (entry === 'contracts' || (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 81))
        cpSync(join(resolve('migrations'), entry), join(prior, entry), { recursive: true });
    process.env.JA_MIGRATIONS_PATH = prior;
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    const priorVersion = (
      f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get() as { version: number }
    ).version;
    expect(priorVersion).toBeGreaterThanOrEqual(80);
    expect(priorVersion).toBeLessThan(82);
    seedPaymentsAndDefaults(f);
    const names = ['user', 'project', 'expense', 'compensation_settlement', ...REBUILT];
    const before = Object.fromEntries(
      names.map((name) => [name, f.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
    );
    const metadata = f.sqlite
      .prepare('SELECT * FROM migration_contract_metadata ORDER BY migration_version')
      .all();
    f.sqlite.close();
    process.env.JA_MIGRATIONS_PATH = resolve('migrations');
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 97,
    });
    for (const name of names)
      expect(f.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(), name).toEqual(
        before[name],
      );
    expect(
      f.sqlite
        .prepare(
          `SELECT * FROM migration_contract_metadata WHERE migration_version<=${priorVersion} ORDER BY migration_version`,
        )
        .all(),
    ).toEqual(metadata);
    expect(
      f.sqlite
        .prepare('SELECT migration_name FROM migration_contract_metadata WHERE migration_version=82')
        .get(),
    ).toEqual({ migration_name: 'multi_currency_fx' });
    for (const table of NEW_TABLES)
      expect(
        f.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),
        table,
      ).toBeTruthy();
    // Immutability triggers survive the rebuild.
    expect(() =>
      f.sqlite.prepare("UPDATE worker_compensation_payment_event SET note='x' WHERE id='fx-pay-1'").run(),
    ).toThrow(/immutable/);
    expect(() =>
      f.sqlite.prepare("DELETE FROM project_person_defaults WHERE id='fx-defaults'").run(),
    ).toThrow(/immutable/);
    // The link table still references the rebuilt defaults table (no dangling _v81 reference).
    expect(
      f.sqlite.prepare("SELECT \"table\" FROM pragma_foreign_key_list('project_member_default_terms') WHERE \"from\"='default_id'").get(),
    ).toEqual({ table: 'project_person_defaults' });
    expect(
      f.sqlite.prepare("SELECT \"table\" FROM pragma_foreign_key_list('worker_compensation_payment_event') WHERE \"from\"='reverses_event_id'").get(),
    ).toEqual({ table: 'worker_compensation_payment_event' });
    // MXN / JPY are now storable where only USD/BRL/EUR were.
    f.sqlite
      .prepare(
        `INSERT INTO project_person_defaults(id,project_id,currency,effective_from,config_json,version,created_by,created_at)
         VALUES('fx-defaults-mxn',?,'MXN','2026-06-01','{}',2,'b5-owner','2026-11-10T10:00:00.000Z')`,
      )
      .run(f.project.id);
    expect(() =>
      f.sqlite
        .prepare(
          `INSERT INTO project_person_defaults(id,project_id,currency,effective_from,config_json,version,created_by,created_at)
           VALUES('fx-defaults-bad',?,'mxn','2026-07-01','{}',3,'b5-owner','2026-11-10T10:00:00.000Z')`,
        )
        .run(f.project.id),
    ).toThrow(/CHECK/);
    // Exchange rates are append-only exact decimal text.
    f.sqlite
      .prepare(
        "INSERT INTO exchange_rate VALUES('2026-11-16','EUR','MXN','21.4356','ECB','2026-11-16T16:00:00Z')",
      )
      .run();
    expect(() =>
      f.sqlite
        .prepare(
          "INSERT INTO exchange_rate VALUES('2026-11-16','EUR','USD','1.05e3','ECB','2026-11-16T16:00:00Z')",
        )
        .run(),
    ).toThrow(/CHECK/);
    expect(() => f.sqlite.prepare("DELETE FROM exchange_rate").run()).toThrow(/append-only/);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(f.sqlite)).toBe('ok');
  }, 60_000);
});
