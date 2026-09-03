import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const ROOT = resolve(process.cwd());
const MIGRATIONS = resolve(ROOT, 'migrations');
const CONTRACT = resolve(MIGRATIONS, 'contracts/ja-b5-migration-contract-v1.json');
const LIFECYCLE_STATES = [
  'issued',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  'credited',
] as const;
const IMMUTABLE_ISSUED_COLUMNS = [
  'id',
  'created_at',
  'tenant_id',
  'deployment_id',
  'project_id',
  'billing_rule_id',
  'invoice_number',
  'stream_type',
  'currency',
  'subtotal_minor',
  'tax_minor',
  'total_minor',
  'period_start',
  'period_end',
  'due_at',
  'issued_at',
  'snapshot_json',
  'calculation_hash',
  'legal_entity_revision_id',
  'configuration_revision_id',
  'predecessor_subject_hash',
  'invoice_subject_hash',
  'source_lock_at',
  'planned_issue_on',
] as const;
const INVOICE_COLUMNS = [
  'id',
  'project_id',
  'invoice_number',
  'stream_type',
  'state',
  'currency',
  'subtotal_minor',
  'tax_minor',
  'total_minor',
  'issued_at',
  'snapshot_json',
  'created_at',
  'updated_at',
  'version',
  'billing_rule_id',
  'period_start',
  'period_end',
  'due_at',
  'calculation_hash',
  'sent_at',
  'pdf_status',
  'pdf_storage_key',
  'pdf_sha256',
  'pdf_generated_at',
  'source_lock_at',
  'voided_at',
  'pdf_byte_length',
  'tenant_id',
  'deployment_id',
  'legal_entity_revision_id',
  'configuration_revision_id',
  'predecessor_subject_hash',
  'invoice_subject_hash',
  'planned_issue_on',
  'expected_collection_on',
] as const;

const databases: DatabaseSync[] = [];
const directories: string[] = [];
let restoreIdentity: (() => void) | undefined;

beforeAll(() => {
  restoreIdentity = installB5TestDeploymentIdentity();
});

afterEach(() => {
  for (const sqlite of databases.splice(0)) {
    try {
      sqlite.close();
    } catch {
      // Preserve the original assertion when a failed upgrade closes a handle.
    }
  }
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

afterAll(() => restoreIdentity?.());

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function fresh(): DatabaseSync {
  const sqlite = createDatabase(':memory:').sqlite;
  databases.push(sqlite);
  return sqlite;
}

function copyMigrationTree(maxVersion: number): string {
  const directory = mkdtempSync(join(tmpdir(), 'ja-client-essential-invoice-migrations-'));
  directories.push(directory);
  mkdirSync(join(directory, 'contracts'));
  copyFileSync(CONTRACT, join(directory, 'contracts/ja-b5-migration-contract-v1.json'));
  for (const file of readdirSync(MIGRATIONS).filter((candidate) =>
    /^\d{4}_.+\.sql$/u.test(candidate),
  )) {
    if (Number(file.slice(0, 4)) <= maxVersion)
      copyFileSync(join(MIGRATIONS, file), join(directory, file));
  }
  return directory;
}

function seedProject(sqlite: DatabaseSync, suffix: string): void {
  const now = '2026-08-30T10:00:00.000Z';
  sqlite
    .prepare(
      `INSERT INTO client(
         id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      `client-${suffix}`,
      `C-${suffix}`,
      'Client Essential Test',
      'Client Essential Test',
      'active',
      'EUR',
      'UTC',
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO project(
         id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      `project-${suffix}`,
      `P-${suffix}`,
      `client-${suffix}`,
      'Invoice immutability test',
      'UTC',
      'EUR',
      'active',
      'hourly',
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO client(
         id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'client-other',
      'C-OTHER',
      'Other Test Client',
      'Other Test Client',
      'active',
      'EUR',
      'UTC',
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO project(
         id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'project-other',
      'P-OTHER',
      'client-other',
      'Other invoice project',
      'UTC',
      'EUR',
      'active',
      'hourly',
      now,
      now,
    );
  for (const [ruleId, projectId] of [
    ['rule-invoice-test', `project-${suffix}`],
    ['rule-invoice-test-other', 'project-other'],
  ] as const) {
    sqlite
      .prepare(
        `INSERT INTO billing_rule(
           id,project_id,stream_type,cadence_type,currency,effective_from
         ) VALUES(?,?,?,?,?,?)`,
      )
      .run(ruleId, projectId, 'labor', 'monthly', 'EUR', '2026-01-01');
  }
}

function insertInvoice(
  sqlite: DatabaseSync,
  input: Readonly<{
    id: string;
    projectSuffix?: string;
    state?: string;
    pdfStatus?: string;
    pdfStorageKey?: string | null;
    pdfSha256?: string | null;
    pdfGeneratedAt?: string | null;
    pdfByteLength?: number | null;
  }>,
): void {
  const state = input.state ?? 'issued';
  const now = '2026-08-30T10:00:00.000Z';
  const snapshotJson = JSON.stringify({ invoiceId: input.id, totalMinor: '12500' });
  const values = [
    input.id,
    `project-${input.projectSuffix ?? input.id}`,
    `INV-${input.id}`,
    'labor',
    state,
    'EUR',
    10000,
    2500,
    12500,
    state === 'draft' ? null : now,
    state === 'draft' ? null : snapshotJson,
    now,
    now,
    1,
    'rule-invoice-test',
    '2026-08-01',
    '2026-08-31',
    '2026-09-30T23:59:59.999Z',
    sha256(snapshotJson),
    null,
    input.pdfStatus ?? 'pending',
    input.pdfStorageKey ?? null,
    input.pdfSha256 ?? null,
    input.pdfGeneratedAt ?? null,
    now,
    null,
    input.pdfByteLength ?? null,
    'test-tenant',
    'test-deployment',
    'legal-revision-invoice-test',
    'configuration-revision-invoice-test',
    'a'.repeat(64),
    'b'.repeat(64),
    '2026-08-01',
    '2026-09-30',
  ];
  const placeholders = INVOICE_COLUMNS.map(() => '?').join(',');
  sqlite
    .prepare(`INSERT INTO invoice(${INVOICE_COLUMNS.join(',')}) VALUES(${placeholders})`)
    .run(...values);
}

function changedValue(column: string): string | number {
  if (column.endsWith('_minor')) return 1;
  if (column === 'id') return 'changed-invoice-id';
  if (column === 'project_id') return 'project-other';
  if (column === 'billing_rule_id') return 'rule-invoice-test-other';
  if (column === 'version') return 2;
  if (column === 'planned_issue_on') return '2026-08-02';
  if (column === 'period_start') return '2026-08-02';
  if (column === 'period_end') return '2026-09-01';
  if (column === 'due_at') return '2026-10-01T23:59:59.999Z';
  return `changed-${column}`;
}

function insertInvoiceLine(
  sqlite: DatabaseSync,
  invoiceId: string,
  suffix: string,
  sourceType: 'time' | 'adjustment' = 'time',
): void {
  const sourceId = `${sourceType}-source-${suffix}`;
  sqlite
    .prepare(
      `INSERT INTO invoice_line(
         id,invoice_id,description,quantity_numerator,quantity_denominator,
         unit_price_minor,subtotal_minor,source_type,source_id,snapshot_json
       ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      `line-${suffix}`,
      invoiceId,
      'Invoice line insert-guard test',
      1,
      1,
      100,
      100,
      sourceType,
      sourceId,
      JSON.stringify({ sourceId, sourceVersion: 1 }),
    );
}

function insertInvoiceSource(
  sqlite: DatabaseSync,
  invoiceId: string,
  suffix: string,
  sourceType: 'time' | 'adjustment' = 'time',
): void {
  sqlite
    .prepare(
      `INSERT INTO invoice_source(
         source_link_id,invoice_id,source_type,source_id,source_version
       ) VALUES(?,?,?,?,?)`,
    )
    .run(`source-${suffix}`, invoiceId, sourceType, `${sourceType}-source-${suffix}`, 1);
}

function insertCommercialManifest(
  sqlite: DatabaseSync,
  invoiceId: string,
  suffix: string,
  sourceType: 'time' | 'adjustment' = 'time',
): void {
  sqlite
    .prepare(
      `INSERT INTO invoice_commercial_source_manifest(
         manifest_id,invoice_id,source_type,source_id,source_version,disposition,
         reason_code,created_at
       ) VALUES(?,?,?,?,?,?,?,?)`,
    )
    .run(
      `manifest-${suffix}`,
      invoiceId,
      sourceType,
      `${sourceType}-source-${suffix}`,
      1,
      'included',
      'insert_guard_test',
      '2026-08-30T10:00:00.000Z',
    );
}

describe('CE-CORE11 invoice issued-history and PDF immutability migration', () => {
  it('installs on a fresh database and protects every issued lifecycle state', () => {
    const sqlite = fresh();
    seedProject(sqlite, 'fresh');
    for (const state of LIFECYCLE_STATES)
      insertInvoice(sqlite, { id: `fresh-${state}`, projectSuffix: 'fresh', state });

    for (const state of LIFECYCLE_STATES) {
      const invoiceId = `fresh-${state}`;
      for (const column of IMMUTABLE_ISSUED_COLUMNS) {
        expect(
          () =>
            sqlite
              .prepare(`UPDATE invoice SET ${column}=? WHERE id=?`)
              .run(changedValue(column), invoiceId),
          `${state}.${column}`,
        ).toThrow(/immutable|snapshot/u);
      }
    }

    sqlite
      .prepare(
        `UPDATE invoice
            SET state='sent',updated_at=?,version=version+1,expected_collection_on=?
          WHERE id=?`,
      )
      .run('2026-08-30T10:01:00.000Z', '2026-10-15', 'fresh-issued');
    sqlite
      .prepare('UPDATE invoice SET sent_at=? WHERE id=?')
      .run('2026-08-30T10:02:00.000Z', 'fresh-issued');
    expect(() =>
      sqlite
        .prepare('UPDATE invoice SET sent_at=? WHERE id=?')
        .run('2026-08-30T10:03:00.000Z', 'fresh-issued'),
    ).toThrow(/sent_at|immutable/u);
    expect(() =>
      sqlite.prepare('UPDATE invoice SET sent_at=NULL WHERE id=?').run('fresh-issued'),
    ).toThrow(/sent_at|immutable/u);

    sqlite
      .prepare("UPDATE invoice SET state='void',voided_at=? WHERE id=?")
      .run('2026-08-30T10:04:00.000Z', 'fresh-issued');
    expect(() =>
      sqlite
        .prepare('UPDATE invoice SET voided_at=? WHERE id=?')
        .run('2026-08-30T10:05:00.000Z', 'fresh-issued'),
    ).toThrow(/voided_at|immutable/u);
    expect(() =>
      sqlite.prepare('UPDATE invoice SET voided_at=NULL WHERE id=?').run('fresh-issued'),
    ).toThrow(/voided_at|immutable/u);
    expect(() => sqlite.prepare('DELETE FROM invoice WHERE id=?').run('fresh-issued')).toThrow(
      /immutable/u,
    );
    expect(
      sqlite.prepare('SELECT expected_collection_on FROM invoice WHERE id=?').get('fresh-issued'),
    ).toEqual({
      expected_collection_on: '2026-10-15',
    });
    expect(integrityCheck(sqlite)).toBe('ok');
  });

  it('enforces truthful PDF status transitions and terminal ready metadata', () => {
    const sqlite = fresh();
    seedProject(sqlite, 'pdf');
    insertInvoice(sqlite, { id: 'pdf-progress', projectSuffix: 'pdf', pdfStatus: 'pending' });
    insertInvoice(sqlite, { id: 'pdf-invalid-status', projectSuffix: 'pdf', pdfStatus: 'pending' });

    sqlite.prepare('UPDATE invoice SET pdf_status=? WHERE id=?').run('running', 'pdf-progress');
    sqlite.prepare('UPDATE invoice SET pdf_status=? WHERE id=?').run('failed', 'pdf-progress');
    sqlite.prepare('UPDATE invoice SET pdf_status=? WHERE id=?').run('pending', 'pdf-progress');
    expect(() =>
      sqlite
        .prepare('UPDATE invoice SET pdf_status=? WHERE id=?')
        .run('unknown', 'pdf-invalid-status'),
    ).toThrow(/PDF status|pdf status|transition/u);

    expect(() =>
      sqlite.prepare("UPDATE invoice SET pdf_status='ready' WHERE id=?").run('pdf-progress'),
    ).toThrow(/metadata|complete|ready/u);
    sqlite
      .prepare(
        `UPDATE invoice
            SET pdf_status='ready',pdf_storage_key=?,pdf_sha256=?,pdf_byte_length=?,pdf_generated_at=?
          WHERE id=?`,
      )
      .run(
        'invoices/pdf-progress/invoice.pdf',
        'c'.repeat(64),
        128,
        '2026-08-30T10:10:00.000Z',
        'pdf-progress',
      );

    sqlite
      .prepare('UPDATE invoice SET updated_at=?,version=version+1 WHERE id=?')
      .run('2026-08-30T10:11:00.000Z', 'pdf-progress');
    for (const [column, value] of [
      ['pdf_storage_key', 'invoices/pdf-progress/replaced.pdf'],
      ['pdf_sha256', 'd'.repeat(64)],
      ['pdf_byte_length', 256],
      ['pdf_generated_at', '2026-08-30T10:12:00.000Z'],
    ] as const) {
      expect(
        () =>
          sqlite.prepare(`UPDATE invoice SET ${column}=? WHERE id=?`).run(value, 'pdf-progress'),
        column,
      ).toThrow(/ready|immutable|PDF/u);
    }
    expect(() =>
      sqlite.prepare("UPDATE invoice SET pdf_status='failed' WHERE id=?").run('pdf-progress'),
    ).toThrow(/terminal|ready|immutable|transition/u);

    expect(() =>
      insertInvoice(sqlite, {
        id: 'pdf-ready-incomplete',
        projectSuffix: 'pdf',
        pdfStatus: 'ready',
      }),
    ).toThrow(/metadata|complete|ready/u);
    expect(() =>
      insertInvoice(sqlite, {
        id: 'pdf-invalid-insert',
        projectSuffix: 'pdf',
        pdfStatus: 'invalid',
      }),
    ).toThrow(/PDF status|pdf status|transition/u);
    expect(
      sqlite
        .prepare(
          'SELECT pdf_status,pdf_storage_key,pdf_sha256,pdf_byte_length,pdf_generated_at FROM invoice WHERE id=?',
        )
        .get('pdf-progress'),
    ).toEqual({
      pdf_status: 'ready',
      pdf_storage_key: 'invoices/pdf-progress/invoice.pdf',
      pdf_sha256: 'c'.repeat(64),
      pdf_byte_length: 128,
      pdf_generated_at: '2026-08-30T10:10:00.000Z',
    });
    expect(integrityCheck(sqlite)).toBe('ok');
  });

  it('rejects late child projection inserts for every finalized invoice state', () => {
    const sqlite = fresh();
    seedProject(sqlite, 'insert-guards');

    for (const state of LIFECYCLE_STATES) {
      const suffix = `insert-${state}`;
      const invoiceId = `invoice-${suffix}`;
      insertInvoice(sqlite, {
        id: invoiceId,
        projectSuffix: 'insert-guards',
        state,
      });

      expect(() => insertInvoiceLine(sqlite, invoiceId, suffix)).toThrow(
        /issued invoice lines are immutable/u,
      );
      expect(() => insertInvoiceSource(sqlite, invoiceId, suffix)).toThrow(
        /issued invoice sources are immutable/u,
      );
      expect(() => insertCommercialManifest(sqlite, invoiceId, suffix)).toThrow(
        /issued invoice commercial source manifest is immutable/u,
      );
    }

    expect(
      sqlite
        .prepare(
          `SELECT
             (SELECT count(*) FROM invoice_line) line_count,
             (SELECT count(*) FROM invoice_source) source_count,
             (SELECT count(*) FROM invoice_commercial_source_manifest) manifest_count`,
        )
        .get(),
    ).toEqual({ line_count: 0, source_count: 0, manifest_count: 0 });
    expect(integrityCheck(sqlite)).toBe('ok');
  });

  it('keeps draft, approved and correction invoices writable before issuance', () => {
    const sqlite = fresh();
    seedProject(sqlite, 'pre-issue');

    insertInvoice(sqlite, {
      id: 'invoice-draft-pre-issue',
      projectSuffix: 'pre-issue',
      state: 'draft',
    });
    insertInvoice(sqlite, {
      id: 'invoice-approved-pre-issue',
      projectSuffix: 'pre-issue',
      state: 'draft',
    });
    sqlite
      .prepare(
        "UPDATE invoice SET state='approved',invoice_number=NULL,issued_at=NULL,snapshot_json=NULL WHERE id=?",
      )
      .run('invoice-approved-pre-issue');
    insertInvoice(sqlite, {
      id: 'invoice-correction-pre-issue',
      projectSuffix: 'pre-issue',
      state: 'draft',
    });
    sqlite
      .prepare("UPDATE invoice SET stream_type='adjustment' WHERE id=?")
      .run('invoice-correction-pre-issue');

    for (const [invoiceId, suffix] of [
      ['invoice-draft-pre-issue', 'draft-pre-issue'],
      ['invoice-approved-pre-issue', 'approved-pre-issue'],
      ['invoice-correction-pre-issue', 'correction-pre-issue'],
    ] as const) {
      const sourceType = invoiceId === 'invoice-correction-pre-issue' ? 'adjustment' : 'time';
      expect(() => insertInvoiceLine(sqlite, invoiceId, suffix, sourceType)).not.toThrow();
      expect(() => insertInvoiceSource(sqlite, invoiceId, suffix, sourceType)).not.toThrow();
      expect(() => insertCommercialManifest(sqlite, invoiceId, suffix, sourceType)).not.toThrow();
    }

    expect(
      sqlite
        .prepare(
          `SELECT
             (SELECT count(*) FROM invoice_line) line_count,
             (SELECT count(*) FROM invoice_source) source_count,
             (SELECT count(*) FROM invoice_commercial_source_manifest) manifest_count`,
        )
        .get(),
    ).toEqual({ line_count: 3, source_count: 3, manifest_count: 3 });
    expect(integrityCheck(sqlite)).toBe('ok');
  });

  it('allows the domain transaction to roll back the whole pre-issue-to-issued attempt', () => {
    const sqlite = fresh();
    seedProject(sqlite, 'atomic');

    sqlite.exec('BEGIN');
    insertInvoice(sqlite, {
      id: 'invoice-atomic-rollback',
      projectSuffix: 'atomic',
      state: 'draft',
    });
    insertInvoiceLine(sqlite, 'invoice-atomic-rollback', 'atomic-before-issue');
    insertInvoiceSource(sqlite, 'invoice-atomic-rollback', 'atomic-before-issue');
    insertCommercialManifest(sqlite, 'invoice-atomic-rollback', 'atomic-before-issue');
    sqlite
      .prepare(
        `UPDATE invoice
            SET state='issued',issued_at=?,snapshot_json=?,calculation_hash=?
          WHERE id=?`,
      )
      .run(
        '2026-08-30T10:01:00.000Z',
        JSON.stringify({ invoiceId: 'invoice-atomic-rollback', totalMinor: '100' }),
        'a'.repeat(64),
        'invoice-atomic-rollback',
      );

    expect(() => insertInvoiceLine(sqlite, 'invoice-atomic-rollback', 'atomic-late')).toThrow(
      /issued invoice lines are immutable/u,
    );
    sqlite.exec('ROLLBACK');

    expect(
      sqlite
        .prepare('SELECT count(*) count FROM invoice WHERE id=?')
        .get('invoice-atomic-rollback'),
    ).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT count(*) count FROM invoice_line').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT count(*) count FROM invoice_source').get()).toEqual({ count: 0 });
    expect(
      sqlite.prepare('SELECT count(*) count FROM invoice_commercial_source_manifest').get(),
    ).toEqual({ count: 0 });
    expect(integrityCheck(sqlite)).toBe('ok');
  });

  it('upgrades a populated v33 database without rewriting the issued invoice snapshot', () => {
    const v33Migrations = copyMigrationTree(33);
    const directory = mkdtempSync(join(tmpdir(), 'ja-client-essential-invoice-upgrade-'));
    directories.push(directory);
    const databasePath = join(directory, 'app.db');

    process.env.JA_MIGRATIONS_PATH = v33Migrations;
    const legacy = createDatabase(databasePath).sqlite;
    databases.push(legacy);
    seedProject(legacy, 'upgrade');
    insertInvoice(legacy, { id: 'upgrade-issued', projectSuffix: 'upgrade', state: 'issued' });
    const before = legacy
      .prepare(
        `SELECT ${IMMUTABLE_ISSUED_COLUMNS.join(',')},pdf_status,pdf_storage_key,pdf_sha256,
                pdf_byte_length,pdf_generated_at,sent_at,voided_at,expected_collection_on
           FROM invoice WHERE id=?`,
      )
      .get('upgrade-issued');
    legacy.close();

    process.env.JA_MIGRATIONS_PATH = MIGRATIONS;
    const upgraded = createDatabase(databasePath).sqlite;
    databases.push(upgraded);
    expect(upgraded.prepare('SELECT MAX(version) AS version FROM schema_migration').get()).toEqual({
      version: 35,
    });
    expect(
      upgraded
        .prepare(
          `SELECT ${IMMUTABLE_ISSUED_COLUMNS.join(',')},pdf_status,pdf_storage_key,pdf_sha256,
                  pdf_byte_length,pdf_generated_at,sent_at,voided_at,expected_collection_on
             FROM invoice WHERE id=?`,
        )
        .get('upgrade-issued'),
    ).toEqual(before);
    expect(() => insertInvoiceLine(upgraded, 'upgrade-issued', 'upgrade-late')).toThrow(
      /issued invoice lines are immutable/u,
    );
    expect(() => insertInvoiceSource(upgraded, 'upgrade-issued', 'upgrade-late')).toThrow(
      /issued invoice sources are immutable/u,
    );
    expect(() => insertCommercialManifest(upgraded, 'upgrade-issued', 'upgrade-late')).toThrow(
      /issued invoice commercial source manifest is immutable/u,
    );
    insertInvoice(upgraded, {
      id: 'upgrade-draft',
      projectSuffix: 'upgrade',
      state: 'draft',
    });
    expect(() => insertInvoiceLine(upgraded, 'upgrade-draft', 'upgrade-draft')).not.toThrow();
    expect(() => insertInvoiceSource(upgraded, 'upgrade-draft', 'upgrade-draft')).not.toThrow();
    expect(() =>
      insertCommercialManifest(upgraded, 'upgrade-draft', 'upgrade-draft'),
    ).not.toThrow();
    expect(upgraded.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(upgraded)).toBe('ok');
  });
});
