import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AccountingPackRevisionService, createDatabase, integrityCheck } from '@ja/database';
import type { Principal } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const MIGRATIONS = resolve(process.cwd(), 'migrations');
const directories: string[] = [];
const previousMigrations = process.env.JA_MIGRATIONS_PATH;
let restoreIdentity: (() => void) | undefined;

const SNAPSHOT_COLUMNS = [
  'revision_id',
  'tenant_id',
  'deployment_id',
  'legal_entity_revision_id',
  'currency',
  'period_start',
  'period_end',
  'source_cut_id',
  'source_cut_hash',
  'snapshot_json',
  'snapshot_sha256',
  'reconciliation_json',
  'reconciliation_sha256',
  'command_id',
  'audit_event_id',
  'created_at',
  'schema_version',
  'timezone',
  'invoice_count',
  'payment_count',
  'worker_cost_count',
  'expense_count',
  'source_item_count',
  'invoice_source_count',
  'source_mismatch_count',
  'approved_time_entry_count',
  'approved_expense_count',
  'net_minor',
  'tax_minor',
  'gross_minor',
  'collected_minor',
  'outstanding_minor',
  'worker_cost_minor',
  'expense_cost_minor',
  'direct_cost_minor',
  'contribution_minor',
] as const;

type SnapshotRow = Record<(typeof SNAPSHOT_COLUMNS)[number], unknown>;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function copyMigrationTree(maxVersion = Number.POSITIVE_INFINITY): string {
  const destination = mkdtempSync(join(tmpdir(), 'ja-signed-credit-migrations-'));
  directories.push(destination);
  for (const entry of readdirSync(MIGRATIONS, { withFileTypes: true })) {
    if (entry.isFile() && /^\d{4}_.+\.sql$/u.test(entry.name)) {
      if (Number(entry.name.slice(0, 4)) > maxVersion) continue;
      copyFileSync(join(MIGRATIONS, entry.name), join(destination, entry.name));
    } else if (entry.isDirectory()) {
      const childDestination = join(destination, entry.name);
      mkdirSync(childDestination, { recursive: true });
      for (const child of readdirSync(join(MIGRATIONS, entry.name)))
        copyFileSync(join(MIGRATIONS, entry.name, child), join(childDestination, child));
    }
  }
  return destination;
}

function openFixtureDatabase(migrationPath: string) {
  const directory = mkdtempSync(join(tmpdir(), 'ja-signed-credit-db-'));
  directories.push(directory);
  const databasePath = join(directory, 'app.db');
  process.env.JA_MIGRATIONS_PATH = migrationPath;
  return { databasePath, ...createDatabase(databasePath) };
}

function seedAccountingSources(sqlite: DatabaseSync, credit: boolean) {
  const now = '2026-08-18T12:00:00.000Z';
  sqlite
    .prepare(
      `INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at)
       VALUES('owner','Owner','antonny.luty@j-aautomation.com','owner_admin','active',1,?,?)`,
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT INTO legal_entity(
         id,code,legal_name,currency,billing_address,company_identifiers,status,
         created_at,updated_at,version
       ) VALUES('legacy','LE-TEST','Legacy Test Entity','EUR','Address','TAX-TEST','active',?,?,1)`,
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT INTO client(
         id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at
       ) VALUES('client-1','CLIENT-001','Client One','Client One','active','EUR','Europe/Madrid',?,?)`,
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT INTO project(
         id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at
       ) VALUES('project-1','PROJECT-001','client-1','Project One','Europe/Madrid','EUR',
                'active','time_and_materials',?,?)`,
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT INTO billing_rule(
         id,project_id,legal_entity_id,stream_type,enabled,cadence_type,currency,
         auto_generate_draft,auto_issue,auto_send,effective_from,created_at,updated_at,version
       ) VALUES('billing-rule-1','project-1','legacy','labor',1,'monthly','EUR',0,0,0,
                '2026-01-01',?,?,1)`,
    )
    .run(now, now);

  sqlite
    .prepare(
      `INSERT INTO invoice(
         id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
         issued_at,snapshot_json,billing_rule_id,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    )
    .run(
      'invoice-1',
      'project-1',
      'INVOICE-1',
      credit ? 'adjustment' : 'labor',
      'issued',
      'EUR',
      credit ? -1000 : 1000,
      credit ? -200 : 200,
      credit ? -1200 : 1200,
      '2026-01-10T00:00:00.000Z',
      '{}',
      'billing-rule-1',
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO invoice(
         id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,
         issued_at,snapshot_json,billing_rule_id,created_at,updated_at,version
       ) VALUES('invoice-2','project-1','INVOICE-2','labor','issued','EUR',1100,220,1320,
                '2025-12-10T00:00:00.000Z','{}','billing-rule-1',?,?,1)`,
    )
    .run(now, now);
  if (credit)
    sqlite
      .prepare(
        `INSERT INTO invoice_adjustment(
           id,original_invoice_id,adjustment_invoice_id,adjustment_type,reason,
           created_by,created_at,idempotency_key
         ) VALUES('credit-adjustment-1','invoice-2','invoice-1','credit','Signed credit fixture',
                  'owner','2026-01-10T00:00:00.000Z','accounting-pack-signed-credit')`,
      )
      .run();
  sqlite
    .prepare(
      `INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at)
       VALUES('accounting-pack-owner-session','accounting-pack-owner-token','owner',?,?,?,?)`,
    )
    .run('2027-01-01T00:00:00.000Z', now, now, now);
  sqlite
    .prepare(
      `INSERT INTO accounting_pack_run(
         id,period_start,period_end,legal_entity_id,state,snapshot_json,reconciliation_json,
         generated_by,created_at,updated_at
       ) VALUES('legacy-run','2026-01-01','2026-02-01','legacy','final',
                '{"legacy":true}','{"differenceMinor":0}','owner',?,?)`,
    )
    .run(now, now);

  const principal: Principal = {
    userId: 'owner',
    role: 'owner_admin',
    projectIds: new Set(),
    sessionId: 'accounting-pack-owner-session',
  };
  return { principal, service: new AccountingPackRevisionService(sqlite) };
}

function revisionInput(credit: boolean, includeLegacyBridge = false) {
  return {
    periodStart: '2026-01-01',
    periodEnd: '2026-02-01',
    currency: 'EUR',
    timezone: 'Europe/Madrid',
    legacyLegalEntityId: 'legacy',
    ...(includeLegacyBridge ? { legacyRunId: 'legacy-run' } : {}),
    sourceItems: [
      {
        id: 'source-1',
        itemKind: 'invoice',
        sourceId: 'invoice-1',
        itemVersion: 1,
        effectiveAt: '2026-01-10T00:00:00.000Z',
        evidenceType: 'invoice_source',
        evidenceId: 'invoice-source-evidence-1',
        amountMinor: credit ? -1000 : 1000,
        currency: 'EUR',
      },
    ],
    invoiceCount: 1,
    paymentCount: 0,
    workerCostCount: 0,
    expenseCount: 0,
    sourceItemCount: 1,
    invoiceSourceCount: 0,
    sourceMismatchCount: 0,
    approvedTimeEntryCount: 0,
    approvedExpenseCount: 0,
    netMinor: credit ? -1000 : 1000,
    taxMinor: credit ? -200 : 200,
    grossMinor: credit ? -1200 : 1200,
    collectedMinor: 0,
    outstandingMinor: credit ? -1200 : 1200,
    workerCostMinor: 0,
    expenseCostMinor: 0,
    directCostMinor: 0,
    contributionMinor: credit ? -1000 : 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    effectiveAt: '2026-01-01T00:00:00.000Z',
    idempotencyKey: credit
      ? 'test:accounting-pack:signed-credit-migration'
      : 'test:accounting-pack:positive-migration',
  };
}

function snapshotObjects(sqlite: DatabaseSync) {
  return sqlite
    .prepare(
      `SELECT type,name,tbl_name,sql FROM sqlite_master
       WHERE type IN('index','trigger')
         AND (tbl_name='accounting_pack_revision_snapshot'
              OR sql LIKE '%accounting_pack_revision_snapshot%')
       ORDER BY type,name`,
    )
    .all();
}

function insertSnapshot(sqlite: DatabaseSync, row: SnapshotRow): void {
  sqlite
    .prepare(
      `INSERT INTO accounting_pack_revision_snapshot(${SNAPSHOT_COLUMNS.join(',')})
       VALUES(${SNAPSHOT_COLUMNS.map(() => '?').join(',')})`,
    )
    .run(...SNAPSHOT_COLUMNS.map((column) => row[column] as never));
}

function mutateSnapshot(row: SnapshotRow, changes: Readonly<Record<string, number>>): SnapshotRow {
  const snapshot = JSON.parse(String(row.snapshot_json)) as Record<string, unknown>;
  const reconciliation = JSON.parse(String(row.reconciliation_json)) as Record<string, unknown>;
  const totals = snapshot.totals as Record<string, unknown>;
  const exact = snapshot.exact_reconciliation as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    snapshot[key] = value;
    totals[key] = value;
    exact[key] = value;
    reconciliation[key] = value;
  }
  const snapshotJson = JSON.stringify(snapshot);
  const reconciliationJson = JSON.stringify(reconciliation);
  return {
    ...row,
    ...changes,
    snapshot_json: snapshotJson,
    snapshot_sha256: sha256(snapshotJson),
    reconciliation_json: reconciliationJson,
    reconciliation_sha256: sha256(reconciliationJson),
  };
}

function expectReplacementRejected(sqlite: DatabaseSync, replacement: SnapshotRow): void {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec('DROP TRIGGER accounting_pack_revision_snapshot_no_delete');
    sqlite
      .prepare('DELETE FROM accounting_pack_revision_snapshot WHERE revision_id=?')
      .run(replacement.revision_id as string);
    expect(() => insertSnapshot(sqlite, replacement)).toThrow(/CHECK constraint failed/u);
  } finally {
    sqlite.exec('ROLLBACK');
  }
}

beforeAll(() => {
  restoreIdentity = installB5TestDeploymentIdentity();
});

afterAll(() => {
  restoreIdentity?.();
  if (previousMigrations === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = previousMigrations;
});

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('0048 signed accounting-pack credit balances', () => {
  it('upgrades a populated schema 47 without changing snapshot bytes, references or guards', () => {
    const schema47 = copyMigrationTree(47);
    const { databasePath, sqlite } = openFixtureDatabase(schema47);
    const { principal, service } = seedAccountingSources(sqlite, false);
    const revision = service.createCanonicalRevision(principal, revisionInput(false, true));
    const beforeSnapshot = sqlite
      .prepare('SELECT * FROM accounting_pack_revision_snapshot WHERE revision_id=?')
      .get(revision.revisionId) as SnapshotRow;
    const beforeBridge = sqlite
      .prepare('SELECT * FROM accounting_pack_legacy_run_bridge WHERE revision_id=?')
      .get(revision.revisionId);
    const beforeMetadata = sqlite
      .prepare(
        'SELECT * FROM migration_contract_metadata WHERE migration_version<=47 ORDER BY migration_version',
      )
      .all();
    const beforeColumns = sqlite
      .prepare('PRAGMA table_info(accounting_pack_revision_snapshot)')
      .all();
    const beforeForeignKeys = sqlite
      .prepare('PRAGMA foreign_key_list(accounting_pack_revision_snapshot)')
      .all();
    const beforeObjects = snapshotObjects(sqlite);
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    sqlite.close();

    process.env.JA_MIGRATIONS_PATH = MIGRATIONS;
    const upgraded = createDatabase(databasePath);
    try {
      expect(
        upgraded.sqlite
          .prepare('SELECT * FROM accounting_pack_revision_snapshot WHERE revision_id=?')
          .get(revision.revisionId),
      ).toEqual(beforeSnapshot);
      expect(
        upgraded.sqlite
          .prepare('SELECT * FROM accounting_pack_legacy_run_bridge WHERE revision_id=?')
          .get(revision.revisionId),
      ).toEqual(beforeBridge);
      expect(
        upgraded.sqlite
          .prepare(
            'SELECT * FROM migration_contract_metadata WHERE migration_version<=47 ORDER BY migration_version',
          )
          .all(),
      ).toEqual(beforeMetadata);
      expect(
        upgraded.sqlite.prepare('PRAGMA table_info(accounting_pack_revision_snapshot)').all(),
      ).toEqual(beforeColumns);
      expect(
        upgraded.sqlite.prepare('PRAGMA foreign_key_list(accounting_pack_revision_snapshot)').all(),
      ).toEqual(beforeForeignKeys);
      expect(snapshotObjects(upgraded.sqlite)).toEqual(beforeObjects);
      expect(() =>
        upgraded.sqlite
          .prepare('UPDATE accounting_pack_revision_snapshot SET timezone=? WHERE revision_id=?')
          .run('UTC', revision.revisionId),
      ).toThrow(/immutable/u);
      expect(() =>
        upgraded.sqlite
          .prepare('DELETE FROM accounting_pack_revision_snapshot WHERE revision_id=?')
          .run(revision.revisionId),
      ).toThrow(/immutable/u);
      expect(upgraded.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(upgraded.sqlite)).toBe('ok');
      expect(
        upgraded.sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get(),
      ).toEqual({ version: 48 });
    } finally {
      upgraded.sqlite.close();
    }
  });

  it('creates a fresh schema and persists a reconciled credit with negative tax', () => {
    const { sqlite } = openFixtureDatabase(MIGRATIONS);
    try {
      const { principal, service } = seedAccountingSources(sqlite, true);
      const revision = service.createCanonicalRevision(principal, revisionInput(true));
      const row = sqlite
        .prepare('SELECT * FROM accounting_pack_revision_snapshot WHERE revision_id=?')
        .get(revision.revisionId) as SnapshotRow;
      expect(row).toMatchObject({
        net_minor: -1000,
        tax_minor: -200,
        gross_minor: -1200,
        collected_minor: 0,
        outstanding_minor: -1200,
        worker_cost_minor: 0,
        expense_cost_minor: 0,
        direct_cost_minor: 0,
        contribution_minor: -1000,
      });
      expect(JSON.parse(String(row.snapshot_json))).toMatchObject({
        net_minor: -1000,
        tax_minor: -200,
        gross_minor: -1200,
        outstanding_minor: -1200,
      });
      expect(sha256(String(row.snapshot_json))).toBe(row.snapshot_sha256);
      expect(sha256(String(row.reconciliation_json))).toBe(row.reconciliation_sha256);

      expectReplacementRejected(sqlite, mutateSnapshot(row, { gross_minor: -1199 }));
      expectReplacementRejected(
        sqlite,
        mutateSnapshot(row, {
          worker_cost_minor: -1,
          direct_cost_minor: -1,
          contribution_minor: -999,
        }),
      );
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(sqlite)).toBe('ok');
      expect(
        sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN('accounting_pack_revision_snapshot_v48','migration_contract_metadata_v47')",
          )
          .all(),
      ).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
