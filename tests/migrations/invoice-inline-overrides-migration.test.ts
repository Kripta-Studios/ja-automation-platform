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

describe('invoice inline overrides migration79', () => {
  it('upgrades populated schema78 additively: overrides table, client tax ID, reviewed actions, reactivation', () => {
    const prior = mkdtempSync(join(tmpdir(), 'ja-inline-schema78-'));
    directories.push(prior);
    for (const entry of readdirSync(resolve('migrations')))
      if (entry === 'contracts' || (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 78))
        cpSync(join(resolve('migrations'), entry), join(prior, entry), { recursive: true });
    process.env.JA_MIGRATIONS_PATH = prior;
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({ version: 78 });
    const names = ['user', 'project', 'time_entry', 'invoice', 'billing_rule', 'entity_lifecycle_event', 'audit_event'];
    const before = Object.fromEntries(
      names.map((name) => [name, f.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
    );
    const clients = f.sqlite.prepare('SELECT * FROM client ORDER BY id').all();
    const metadata = f.sqlite.prepare('SELECT * FROM migration_contract_metadata ORDER BY migration_version').all();
    const registry = f.sqlite.prepare('SELECT * FROM audit_action_registry ORDER BY 1,2,3,4').all();
    f.sqlite.close();
    process.env.JA_MIGRATIONS_PATH = resolve('migrations');
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({ version: 94 });
    for (const name of names)
      expect(f.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(), name).toEqual(before[name]);
    expect(
      (f.sqlite.prepare('SELECT * FROM client ORDER BY id').all() as Record<string, unknown>[]).map(({ tax_id, ...row }) => {
        expect(tax_id).toBeNull();
        return row;
      }),
    ).toEqual(clients);
    expect(
      f.sqlite.prepare('SELECT * FROM migration_contract_metadata WHERE migration_version<=78 ORDER BY migration_version').all(),
    ).toEqual(metadata);
    const after = f.sqlite.prepare('SELECT * FROM audit_action_registry ORDER BY 1,2,3,4').all() as Array<{ action: string }>;
    // 13 reviewed actions in 0079, plus 2 in 0081 (assignment PO, replacement link), plus 1 in
    // 0084 (payment.reverse), plus 4 in 0092 (invoice counter, draft number, versions and
    // version PDFs), plus 1 in 0093 (assignment extras); 0082 WP-FX rows excluded.
    expect(after.filter((row) => (row as { owner_packet?: string }).owner_packet !== 'WP-FX').length - registry.length).toBe(13 + 2 + 1 + 4 + 1);
    for (const action of [
      'invoice.approve_on_behalf',
      'invoice_line_override.create',
      'invoice_line_override.supersede',
      'billing_rule.tax_profile_change',
      'time.correct_from_invoice',
      'security.mfa.login',
      'invitation.revoke',
      'project.reactivate',
      'mailbox.sign_in_block',
      'mailbox.sign_in_unblock',
    ])
      expect(after.some((row) => row.action === action), action).toBe(true);
    // The reviewed manifest stays closed to runtime registration.
    expect(() =>
      f.sqlite
        .prepare(
          "INSERT INTO audit_action_registry(contract_version,action,entity_type,actor_kind,owner_packet,data_classification) VALUES('B5-R4','made.up','x','user','X','internal')",
        )
        .run(),
    ).toThrow(/reviewed manifest/);
    expect(f.sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='invoice_line_override'").get()).toEqual({ n: 1 });
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(f.sqlite)).toBe('ok');
  }, 60_000);
});
