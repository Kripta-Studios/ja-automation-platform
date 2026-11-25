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
import { readIssuerDocumentSettings } from '../../packages/database/src/domains/billing/issuer-document-settings.ts';

const directories: string[] = [];
const fixtures: B5LifecycleSecurityFixture[] = [];
const original = process.env.JA_MIGRATIONS_PATH;
afterEach(() => {
  fixtures.splice(0).forEach(closeB5LifecycleSecurityFixture);
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  if (original === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = original;
});

describe('issuer bank routing fields migration 90', () => {
  it('adds nullable routing/EUR SWIFT columns without changing saved settings or invoices', () => {
    const prior = mkdtempSync(join(tmpdir(), 'ja-routing-schema85-'));
    directories.push(prior);
    for (const entry of readdirSync(resolve('migrations')))
      if (entry === 'contracts' || (/^\d{4}_.+\.sql$/.test(entry) && Number(entry.slice(0, 4)) <= 85))
        cpSync(join(resolve('migrations'), entry), join(prior, entry), { recursive: true });
    process.env.JA_MIGRATIONS_PATH = prior;
    const f = createB5LifecycleSecurityFixture();
    fixtures.push(f);
    expect(f.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
      version: 85,
    });
    const issuer = f.sqlite
      .prepare("SELECT id FROM legal_entity WHERE code='JA-USA' AND currency='USD'")
      .get() as { id: string };
    const deployment = f.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string };
    const now = '2026-11-25T00:00:00.000Z';
    f.sqlite
      .prepare(
        `INSERT INTO issuer_document_settings(tenant_id,deployment_id,legal_entity_id,currency,bank_swift_number,
         bank_account_number,bank_name,beneficiary,version,created_at,updated_at,updated_by)
         VALUES(?,?,?,'USD','BOFAUS3N','488117823145','Bank of America','J&A Automation LLC',3,?,?,'b5-owner')`,
      )
      .run(deployment.tenant_id, deployment.deployment_id, issuer.id, now, now);
    const before = f.sqlite.prepare('SELECT * FROM issuer_document_settings').all();
    const invoices = f.sqlite.prepare('SELECT * FROM invoice ORDER BY rowid').all();
    f.sqlite.close();
    process.env.JA_MIGRATIONS_PATH = resolve('migrations');
    f.sqlite = createDatabase(join(f.directory, 'app.db')).sqlite;
    expect(
      f.sqlite.prepare('SELECT version FROM schema_migration WHERE version=90').get(),
    ).toEqual({ version: 90 });
    const after = f.sqlite.prepare('SELECT * FROM issuer_document_settings').all() as Array<
      Record<string, unknown>
    >;
    expect(
      after.map(
        ({ bank_ach_routing_number, bank_wire_routing_number, bank_swift_eur, ...row }) => {
          expect([bank_ach_routing_number, bank_wire_routing_number, bank_swift_eur]).toEqual([
            null,
            null,
            null,
          ]);
          return row;
        },
      ),
    ).toEqual(before);
    expect(f.sqlite.prepare('SELECT * FROM invoice ORDER BY rowid').all()).toEqual(invoices);
    // Never-saved new fields read the issuer's starting values; saved fields keep their value.
    expect(readIssuerDocumentSettings(f.sqlite, issuer.id, 'USD')).toMatchObject({
      version: 3,
      bankAccountNumber: '488117823145',
      bankAchRouting: '111000025',
      bankWireRouting: '026009593',
      bankSwiftEur: 'BOFAUS6S',
    });
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(f.sqlite)).toBe('ok');
  });
});
