import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck } from '@ja/database';

const ROOT = resolve(process.cwd());
const MIGRATIONS = resolve(ROOT, 'migrations');
const LEGACY_FIXTURE = resolve(ROOT, 'tests/fixtures/b5-migration-legacy-fixture.sql');
const TEST_TENANT = 'wp02t-test-tenant';
const TEST_DEPLOYMENT = 'wp02t-test-deployment';
const WRONG_SNAPSHOT_HASH = 'b'.repeat(64);
const PDF_HASH = 'c'.repeat(64);
const ADDITIVE_COLUMNS = {
  client: ['client_code'],
  project: ['cost_center_code'],
  invoice: ['planned_issue_on', 'expected_collection_on'],
  compensation_settlement: ['expected_payment_on'],
  expense: ['expected_reimbursement_on', 'expected_recovery_on', 'commercial_classification_state'],
  period_report: ['snapshot_version', 'snapshot_sha256'],
} as const;

type SqliteColumn = Readonly<{
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | number | null;
  pk: number;
}>;

type LegacyProjection = Readonly<Record<string, unknown>>;

const databases: DatabaseSync[] = [];
const temporaryDirectories: string[] = [];

const LEGACY_COLUMNS = {
  client: [
    'id',
    'client_number',
    'legal_name',
    'display_name',
    'status',
    'currency',
    'timezone',
    'created_at',
    'updated_at',
    'version',
    'billing_email',
    'payment_terms_days',
    'notes',
  ],
  project: [
    'id',
    'project_number',
    'client_id',
    'name',
    'timezone',
    'currency',
    'status',
    'billing_model',
    'created_at',
    'updated_at',
    'version',
    'description',
    'site_name',
    'country',
    'project_manager_id',
    'expected_minutes_per_day',
    'client_daily_minimum_minutes',
    'revenue_budget_minor',
    'po_cap_minor',
    'labor_budget_minutes',
    'travel_budget_minor',
    'po_number',
    'daily_report_required',
    'technical_reporting_required',
    'budget_minor',
    'planned_minutes',
    'project_alias',
    'start_date',
    'planned_end_date',
    'actual_end_date',
    'contract_number',
    'budget_type',
    'other_cost_budget_minor',
    'weekly_close_enabled',
    'notes',
    'expected_schedule_id',
    'fixed_price_minor',
  ],
  invoice: [
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
  ],
  expense: [
    'id',
    'project_id',
    'worker_id',
    'spent_on',
    'category',
    'currency',
    'amount_minor',
    'client_treatment',
    'approval_state',
    'invoice_id',
    'created_at',
    'updated_at',
    'version',
    'vendor',
    'description',
    'who_paid',
    'receipt_document_id',
    'receipt_required',
    'reimbursement_state',
    'submitted_at',
    'approved_by',
    'approved_at',
    'finance_approved_by',
    'finance_approved_at',
    'tax_amount_minor',
    'payment_method',
    'markup_bps',
    'project_currency_amount_minor',
    'billing_treatment',
    'billing_state',
    'billing_amount_minor',
    'billing_lock_id',
    'reimbursement_amount_minor',
    'reimbursed_at',
    'reimbursement_reference',
    'fx_rate_bps',
  ],
  daily_report: [
    'id',
    'project_id',
    'worker_id',
    'work_date',
    'summary',
    'safety_notes',
    'approval_state',
    'created_at',
    'updated_at',
    'version',
    'site_shift',
    'tasks_completed',
    'problems_found',
    'corrective_actions',
    'client_decisions',
    'downtime_minutes',
    'standby_reason',
    'blockers',
    'open_items',
    'next_day_plan',
    'safety_related',
    'customer_contact',
    'reviewed_by',
    'reviewed_at',
  ],
  technical_report: [
    'id',
    'project_id',
    'author_id',
    'system_name',
    'controller',
    'change_summary',
    'safety_related',
    'validation',
    'rollback_plan',
    'approval_state',
    'created_at',
    'updated_at',
    'version',
    'plant_site',
    'area_line',
    'station_machine',
    'system_type',
    'plc_platform',
    'hmi_scada',
    'robot_platform',
    'drive_motion',
    'network_protocol',
    'software_version',
    'program_reference',
    'production_impact',
    'validation_result',
    'open_risk',
    'reviewed_by',
    'reviewed_at',
  ],
  compensation_settlement: [
    'id',
    'worker_id',
    'project_id',
    'compensation_rule_id',
    'period_start',
    'period_end',
    'source_basis',
    'source_amount_minor',
    'percentage_bps',
    'amount_minor',
    'currency',
    'state',
    'settled_at',
    'created_at',
    'updated_at',
  ],
  period_report: [
    'id',
    'project_id',
    'period_start',
    'period_end',
    'audience',
    'report_type',
    'state',
    'snapshot_json',
    'pdf_storage_key',
    'pdf_sha256',
    'created_by',
    'created_at',
    'updated_at',
  ],
} as const;

function setTestIdentity(): void {
  process.env.JA_TENANT_ID = TEST_TENANT;
  process.env.JA_DEPLOYMENT_ID = TEST_DEPLOYMENT;
}

function fresh(): DatabaseSync {
  setTestIdentity();
  const { sqlite } = createDatabase(':memory:');
  databases.push(sqlite);
  return sqlite;
}

function tableNames(sqlite: DatabaseSync): string[] {
  return (
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function tableColumns(sqlite: DatabaseSync, table: string): SqliteColumn[] {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all() as SqliteColumn[];
}

function hasTable(sqlite: DatabaseSync, table: string): boolean {
  return tableNames(sqlite).includes(table);
}

function financeSnapshotHash(sqlite: DatabaseSync, snapshotJson: string): string {
  return (
    sqlite.prepare('SELECT ja_finance_hash_v1(?) AS hash').get(snapshotJson) as { hash: string }
  ).hash;
}

function financeBlobHash(sqlite: DatabaseSync, blob: Buffer): string {
  return (sqlite.prepare('SELECT ja_finance_hash_v1(?) AS hash').get(blob) as { hash: string })
    .hash;
}

function seedFinanceCommand(
  sqlite: DatabaseSync,
  values: Readonly<{
    id: string;
    targetKind: string;
    targetId: string;
    operation: string;
  }>,
): void {
  const now = '2026-08-24T10:01:00.000Z';
  const request = Buffer.from(`${values.id}:request`);
  const command = Buffer.from(`${values.id}:command`);
  const requestHash = financeBlobHash(sqlite, request);
  const commandHash = financeBlobHash(sqlite, command);
  const payloadHash = financeBlobHash(sqlite, Buffer.from(`${values.id}:payload`));
  const sessionHash = financeBlobHash(sqlite, Buffer.from(`${values.id}:session`));

  sqlite
    .prepare(
      `INSERT INTO finance_hash_evidence(
         evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run(
      `${values.id}:request-evidence`,
      'finance_request',
      'client-essential-test-v1',
      `${values.id}:request`,
      request,
      requestHash,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO finance_hash_evidence(
         evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run(
      `${values.id}:command-evidence`,
      'finance_command',
      'client-essential-test-v1',
      `${values.id}:command`,
      command,
      commandHash,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO finance_command(
         command_id,request_hash,command_hash,tenant_id,deployment_id,operation,idempotency_key,
         principal_id,effective_at,target_kind,target_semantic_id,amount_minor,currency,payload_hash,
         session_id_hash,state,completed_at,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      values.id,
      requestHash,
      commandHash,
      TEST_TENANT,
      TEST_DEPLOYMENT,
      values.operation,
      `${values.id}:idempotency`,
      'wp02t-owner',
      now,
      values.targetKind,
      values.targetId,
      null,
      null,
      payloadHash,
      sessionHash,
      'completed',
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO finance_command_target(
         command_id,target_kind,target_semantic_id,target_contract_version
       ) VALUES(?,?,?,?)`,
    )
    .run(values.id, values.targetKind, values.targetId, 'client-essential-test-v1');
}

function seedCanonicalLegalEntity(sqlite: DatabaseSync): void {
  const revisionId = 'wp02t-legal-revision';
  seedFinanceCommand(sqlite, {
    id: 'wp02t-legal-revision-command',
    targetKind: 'legal_entity_revision',
    targetId: revisionId,
    operation: 'canonical_legal_entity.configure',
  });
  sqlite
    .prepare(
      `INSERT INTO legal_entity_revision(
         revision_id,series_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,
         legal_name,tax_identifier,registration_identifier,address_line1,address_line2,locality,
         region,postal_code,country_code,base_currency,timezone,effective_from,effective_to,
         revision_hash,created_at,created_by,command_id
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      revisionId,
      'wp02t-legal-series',
      1,
      null,
      TEST_TENANT,
      TEST_DEPLOYMENT,
      'WP02T Canonical Legal Entity',
      'WP02T-TAX',
      'WP02T-REG',
      'WP02T Street 1',
      null,
      'Madrid',
      'Madrid',
      '28001',
      'ES',
      'EUR',
      'Europe/Madrid',
      '2026-01-01',
      '2026-12-31',
      'd'.repeat(64),
      '2026-08-24T10:02:00.000Z',
      'wp02t-owner',
      'wp02t-legal-revision-command',
    );
  seedFinanceCommand(sqlite, {
    id: 'wp02t-assignment-command',
    targetKind: 'project_legal_entity_assignment',
    targetId: 'wp02t-assignment-base',
    operation: 'project_legal_entity.assign',
  });
}

function insertProjectLegalEntityAssignment(
  sqlite: DatabaseSync,
  values: Readonly<{
    assignmentId: string;
    projectId: string;
    legalEntityRevisionId: string;
    tenantId?: string;
    deploymentId?: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    commandId?: string;
  }>,
): void {
  sqlite
    .prepare(
      `INSERT INTO project_legal_entity_assignment(
         assignment_id,project_id,legal_entity_revision_id,tenant_id,deployment_id,
         effective_from,effective_to,created_at,command_id
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      values.assignmentId,
      values.projectId,
      values.legalEntityRevisionId,
      values.tenantId ?? TEST_TENANT,
      values.deploymentId ?? TEST_DEPLOYMENT,
      values.effectiveFrom,
      values.effectiveTo,
      '2026-08-24T10:03:00.000Z',
      values.commandId ?? 'wp02t-assignment-command',
    );
}

function requireTable(sqlite: DatabaseSync, table: string): void {
  expect(hasTable(sqlite, table), `${table} must be installed by migration 28`).toBe(true);
}

function seedMinimalProject(sqlite: DatabaseSync): void {
  const now = '2026-08-24T10:00:00.000Z';
  sqlite
    .prepare(
      `INSERT INTO user(
         id,name,email,role,status,email_verified,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'wp02t-owner',
      'WP02T Owner',
      'wp02t.owner@example.test',
      'owner_admin',
      'active',
      1,
      now,
      now,
      1,
    );
  sqlite
    .prepare(
      `INSERT INTO client(
         id,client_number,legal_name,display_name,status,currency,timezone,
         created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'wp02t-client',
      'WP02T-CLIENT',
      'WP02T Client',
      'WP02T Client',
      'active',
      'EUR',
      'Europe/Madrid',
      now,
      now,
      1,
    );
  sqlite
    .prepare(
      `INSERT INTO project(
         id,project_number,client_id,name,timezone,currency,status,billing_model,
         created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'wp02t-project',
      'WP02T-PROJECT',
      'wp02t-client',
      'WP02T Project',
      'Europe/Madrid',
      'EUR',
      'active',
      'tm',
      now,
      now,
      1,
    );
}

function seedSecondProject(sqlite: DatabaseSync): void {
  const now = '2026-08-24T10:00:00.000Z';
  sqlite
    .prepare(
      `INSERT INTO project(
         id,project_number,client_id,name,timezone,currency,status,billing_model,
         created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'wp02t-project-other',
      'WP02T-PROJECT-OTHER',
      'wp02t-client',
      'WP02T Other Project',
      'Europe/Madrid',
      'EUR',
      'active',
      'tm',
      now,
      now,
      1,
    );
}

function seedFreshRows(sqlite: DatabaseSync): void {
  seedMinimalProject(sqlite);
  const now = '2026-08-24T10:00:00.000Z';
  sqlite
    .prepare(
      `INSERT INTO compensation_rule(
         id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,version
       ) VALUES(?,?,?,?,?,?,?,?)`,
    )
    .run('wp02t-comp-rule', 'wp02t-owner', 'wp02t-project', 'EUR', 1000, 'hourly', '2026-01-01', 1);
  sqlite
    .prepare(
      `INSERT INTO invoice(
         id,project_id,invoice_number,stream_type,state,currency,
         subtotal_minor,tax_minor,total_minor,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run('wp02t-invoice', 'wp02t-project', null, 'labor', 'draft', 'EUR', 0, 0, 0, now, now, 1);
  sqlite
    .prepare(
      `INSERT INTO expense(
         id,project_id,worker_id,spent_on,category,currency,amount_minor,
         client_treatment,approval_state,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'wp02t-expense',
      'wp02t-project',
      'wp02t-owner',
      '2026-08-24',
      'travel',
      'EUR',
      1250,
      'reimbursable',
      'draft',
      now,
      now,
      1,
    );
  sqlite
    .prepare(
      `INSERT INTO compensation_settlement(
         id,worker_id,project_id,compensation_rule_id,period_start,period_end,
         source_basis,source_amount_minor,percentage_bps,amount_minor,currency,
         state,settled_at,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'wp02t-settlement',
      'wp02t-owner',
      'wp02t-project',
      'wp02t-comp-rule',
      '2026-08-01',
      '2026-08-31',
      'approved_labor',
      48000,
      null,
      48000,
      'EUR',
      'estimated',
      null,
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO period_report(
         id,project_id,period_start,period_end,audience,report_type,state,
         snapshot_json,created_by,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'wp02t-report',
      'wp02t-project',
      '2026-08-01',
      '2026-08-31',
      'customer',
      'period_close',
      'approved',
      '{"totalMinutes":480}',
      'wp02t-owner',
      now,
      now,
    );
}

function insertPolicy(
  sqlite: DatabaseSync,
  overrides: Partial<{
    id: string;
    project_id: string;
    supersedes_policy_id: string | null;
    effective_from: string;
    effective_to: string | null;
    overtime_enabled: number;
    overtime_threshold_minutes: number | null;
    travel_client_billable: number;
    customer_signoff_required: number;
    created_by: string;
    created_at: string;
    version: number;
  }> = {},
): void {
  const values = {
    id: 'wp02t-policy-1',
    project_id: 'wp02t-project',
    supersedes_policy_id: null,
    effective_from: '2026-01-01',
    effective_to: '2026-06-30',
    overtime_enabled: 1,
    overtime_threshold_minutes: 480,
    travel_client_billable: 1,
    customer_signoff_required: 1,
    created_by: 'wp02t-owner',
    created_at: '2026-08-24T10:00:00.000Z',
    version: 1,
    ...overrides,
  };
  sqlite
    .prepare(
      `INSERT INTO project_commercial_policy(
         id,project_id,supersedes_policy_id,effective_from,effective_to,overtime_enabled,
         overtime_threshold_minutes,travel_client_billable,customer_signoff_required,
         created_by,created_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      values.id,
      values.project_id,
      values.supersedes_policy_id,
      values.effective_from,
      values.effective_to,
      values.overtime_enabled,
      values.overtime_threshold_minutes,
      values.travel_client_billable,
      values.customer_signoff_required,
      values.created_by,
      values.created_at,
      values.version,
    );
}

function insertPeriodReport(
  sqlite: DatabaseSync,
  values: Readonly<{
    id: string;
    audience: 'customer' | 'internal';
    snapshotVersion: number;
    snapshotSha256: string;
    snapshotJson: string;
    pdfStorageKey: string;
    pdfSha256: string;
    pdfByteLength: number;
    periodStart?: string;
    periodEnd?: string;
  }>,
): void {
  sqlite
    .prepare(
      `INSERT INTO period_report(
         id,project_id,period_start,period_end,audience,report_type,state,
         snapshot_json,snapshot_version,snapshot_sha256,pdf_storage_key,pdf_sha256,
         pdf_byte_length,created_by,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      values.id,
      'wp02t-project',
      values.periodStart ?? '2026-09-01',
      values.periodEnd ?? '2026-09-30',
      values.audience,
      'period_close',
      'approved',
      values.snapshotJson,
      values.snapshotVersion,
      values.snapshotSha256,
      values.pdfStorageKey,
      values.pdfSha256,
      values.pdfByteLength,
      'wp02t-owner',
      '2026-09-30T18:00:00.000Z',
      '2026-09-30T18:00:00.000Z',
    );
}

function insertConformity(
  sqlite: DatabaseSync,
  values: Readonly<{
    id: string;
    periodReportId: string;
    snapshotVersion: number;
    snapshotSha256: string;
    snapshotJson: string;
    reportPdfStorageKey: string;
    reportPdfSha256: string;
    reportPdfByteLength: number;
  }>,
): void {
  sqlite
    .prepare(
      `INSERT INTO customer_conformity(
         id,period_report_id,snapshot_version,snapshot_sha256,snapshot_json,
         report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length,signer_name,
         signer_identity,signed_at,signature_document_id,created_by,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      values.id,
      values.periodReportId,
      values.snapshotVersion,
      values.snapshotSha256,
      values.snapshotJson,
      values.reportPdfStorageKey,
      values.reportPdfSha256,
      values.reportPdfByteLength,
      'Customer Signer',
      null,
      '2026-09-30T18:30:00.000Z',
      null,
      'wp02t-owner',
      '2026-09-30T18:30:00.000Z',
    );
}

function projectRow(
  sqlite: DatabaseSync,
  table: string,
  columns: readonly string[],
  id: string,
): LegacyProjection {
  return sqlite
    .prepare(`SELECT ${columns.join(',')} FROM ${table} WHERE id=?`)
    .get(id) as LegacyProjection;
}

function buildSchema18Database(path: string): DatabaseSync {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON;');
  for (const file of readdirSync(MIGRATIONS)
    .filter((entry) => /^\d{4}_.+\.sql$/u.test(entry) && Number(entry.slice(0, 4)) <= 18)
    .sort())
    sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  sqlite.exec(readFileSync(LEGACY_FIXTURE, 'utf8'));
  sqlite
    .prepare(
      `INSERT INTO compensation_rule(
         id,worker_id,project_id,currency,rate_minor,rate_basis,effective_from,version
       ) VALUES(?,?,?,?,?,?,?,?)`,
    )
    .run(
      'legacy-comp-rule',
      'legacy-worker',
      'legacy-project',
      'EUR',
      900,
      'hourly',
      '2026-08-01',
      1,
    );
  sqlite
    .prepare(
      `INSERT INTO compensation_settlement(
         id,worker_id,project_id,compensation_rule_id,period_start,period_end,
         source_basis,source_amount_minor,percentage_bps,amount_minor,currency,
         state,settled_at,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'legacy-settlement',
      'legacy-worker',
      'legacy-project',
      'legacy-comp-rule',
      '2026-08-01',
      '2026-08-31',
      'legacy_fixture',
      90000,
      null,
      90000,
      'EUR',
      'approved',
      null,
      '2026-08-31T18:00:00.000Z',
      '2026-08-31T18:00:00.000Z',
    );
  sqlite
    .prepare(
      `INSERT INTO period_report(
         id,project_id,period_start,period_end,audience,report_type,state,
         snapshot_json,created_by,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'legacy-period-report',
      'legacy-project',
      '2026-08-01',
      '2026-08-31',
      'customer',
      'period_close',
      'final',
      '{"legacy":true,"totalMinutes":480}',
      'legacy-owner',
      '2026-08-31T18:30:00.000Z',
      '2026-08-31T18:30:00.000Z',
    );
  return sqlite;
}

function restoreEnvironment(): void {
  delete process.env.JA_TENANT_ID;
  delete process.env.JA_DEPLOYMENT_ID;
}

beforeEach(() => {
  setTestIdentity();
});

afterEach(() => {
  for (const sqlite of databases.splice(0)) {
    try {
      sqlite.close();
    } catch {
      // Preserve the first test failure if a migration already closed it.
    }
  }
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  restoreEnvironment();
});

describe('additive Client Essential 2026-08-24 migration contract', () => {
  it('reaches schema version 30 and retains the reviewed migration-28 identity', () => {
    const sqlite = fresh();
    const version = (
      sqlite.prepare('SELECT COALESCE(MAX(version),0) AS version FROM schema_migration').get() as {
        version: number;
      }
    ).version;
    const metadata = sqlite
      .prepare(
        `SELECT migration_version,migration_name
         FROM migration_contract_metadata
         WHERE migration_version=28`,
      )
      .get() as { migration_version: number; migration_name: string } | undefined;

    expect({ version, metadata: metadata ?? null }).toEqual({
      version: 30,
      metadata: { migration_version: 28, migration_name: 'client_essential_20260824' },
    });
    expect(sqlite.prepare('SELECT version FROM schema_migration ORDER BY version').all()).toEqual(
      Array.from({ length: 30 }, (_, index) => ({ version: index + 1 })),
    );
  });

  it('adds nullable fields and the period-report snapshot default without backfilling legacy meaning', () => {
    const sqlite = fresh();
    const missingColumns = Object.fromEntries(
      Object.entries(ADDITIVE_COLUMNS).map(([table, columns]) => [
        table,
        columns.filter(
          (column) => !tableColumns(sqlite, table).some((entry) => entry.name === column),
        ),
      ]),
    );
    expect(missingColumns).toEqual(
      Object.fromEntries(Object.keys(ADDITIVE_COLUMNS).map((table) => [table, []])),
    );

    seedFreshRows(sqlite);
    expect(
      sqlite
        .prepare(
          `SELECT
             (SELECT client_code FROM client WHERE id='wp02t-client') AS client_code,
             (SELECT cost_center_code FROM project WHERE id='wp02t-project') AS cost_center_code,
             (SELECT planned_issue_on FROM invoice WHERE id='wp02t-invoice') AS planned_issue_on,
             (SELECT expected_collection_on FROM invoice WHERE id='wp02t-invoice') AS expected_collection_on,
             (SELECT expected_payment_on FROM compensation_settlement WHERE id='wp02t-settlement') AS expected_payment_on,
             (SELECT expected_reimbursement_on FROM expense WHERE id='wp02t-expense') AS expected_reimbursement_on,
             (SELECT expected_recovery_on FROM expense WHERE id='wp02t-expense') AS expected_recovery_on,
             (SELECT commercial_classification_state FROM expense WHERE id='wp02t-expense') AS commercial_classification_state,
             (SELECT snapshot_version FROM period_report WHERE id='wp02t-report') AS snapshot_version,
             (SELECT snapshot_sha256 FROM period_report WHERE id='wp02t-report') AS snapshot_sha256`,
        )
        .get(),
    ).toEqual({
      client_code: null,
      cost_center_code: null,
      planned_issue_on: null,
      expected_collection_on: null,
      expected_payment_on: null,
      expected_reimbursement_on: null,
      expected_recovery_on: null,
      commercial_classification_state: 'legacy_classified',
      snapshot_version: 1,
      snapshot_sha256: null,
    });
    expect(() =>
      sqlite
        .prepare(
          "UPDATE expense SET commercial_classification_state='unclassified' WHERE id='wp02t-expense'",
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE expense SET commercial_classification_state='classified' WHERE id='wp02t-expense'",
        )
        .run(),
    ).not.toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE expense SET commercial_classification_state='invented' WHERE id='wp02t-expense'",
        )
        .run(),
    ).toThrow();
    expect(integrityCheck(sqlite)).toBe('ok');
  });

  it('installs the policy and conformity tables with no fabricated history', () => {
    const sqlite = fresh();
    expect(tableNames(sqlite)).toEqual(
      expect.arrayContaining([
        'project_commercial_policy',
        'customer_conformity',
        'customer_conformity_invalidation',
      ]),
    );
    seedFreshRows(sqlite);
    expect(sqlite.prepare('SELECT count(*) AS count FROM project_commercial_policy').get()).toEqual(
      { count: 0 },
    );
    expect(sqlite.prepare('SELECT count(*) AS count FROM customer_conformity').get()).toEqual({
      count: 0,
    });
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM customer_conformity_invalidation').get(),
    ).toEqual({ count: 0 });
    const missingColumns = Object.fromEntries(
      Object.entries(ADDITIVE_COLUMNS).map(([table, columns]) => [
        table,
        columns.filter(
          (column) => !tableColumns(sqlite, table).some((entry) => entry.name === column),
        ),
      ]),
    );
    expect(missingColumns).toEqual(
      Object.fromEntries(Object.keys(ADDITIVE_COLUMNS).map((table) => [table, []])),
    );
    expect(
      sqlite
        .prepare(
          `SELECT
             (SELECT client_code FROM client WHERE id='wp02t-client') AS client_code,
             (SELECT cost_center_code FROM project WHERE id='wp02t-project') AS cost_center_code,
             (SELECT planned_issue_on FROM invoice WHERE id='wp02t-invoice') AS planned_issue_on,
             (SELECT expected_collection_on FROM invoice WHERE id='wp02t-invoice') AS expected_collection_on,
             (SELECT expected_payment_on FROM compensation_settlement WHERE id='wp02t-settlement') AS expected_payment_on,
             (SELECT expected_reimbursement_on FROM expense WHERE id='wp02t-expense') AS expected_reimbursement_on,
             (SELECT expected_recovery_on FROM expense WHERE id='wp02t-expense') AS expected_recovery_on,
             (SELECT snapshot_version FROM period_report WHERE id='wp02t-report') AS snapshot_version,
             (SELECT snapshot_sha256 FROM period_report WHERE id='wp02t-report') AS snapshot_sha256`,
        )
        .get(),
    ).toEqual({
      client_code: null,
      cost_center_code: null,
      planned_issue_on: null,
      expected_collection_on: null,
      expected_payment_on: null,
      expected_reimbursement_on: null,
      expected_recovery_on: null,
      snapshot_version: 1,
      snapshot_sha256: null,
    });
  });

  it('enforces optional nonblank unique client codes at the SQLite boundary', () => {
    const sqlite = fresh();
    seedMinimalProject(sqlite);
    expect(tableColumns(sqlite, 'client').map((column) => column.name)).toContain('client_code');

    expect(() =>
      sqlite.prepare("UPDATE client SET client_code='CL-0001' WHERE id='wp02t-client'").run(),
    ).not.toThrow();
    expect(() =>
      sqlite.prepare("UPDATE client SET client_code=NULL WHERE id='wp02t-client'").run(),
    ).not.toThrow();
    expect(() =>
      sqlite.prepare("UPDATE client SET client_code=' ' WHERE id='wp02t-client'").run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare("UPDATE client SET client_code='CL-0001' WHERE id='wp02t-client'").run(),
    ).not.toThrow();
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO client(
             id,client_number,client_code,legal_name,display_name,status,currency,timezone,
             created_at,updated_at,version
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'wp02t-client-duplicate',
          'WP02T-CLIENT-2',
          'CL-0001',
          'Second Client',
          'Second Client',
          'active',
          'EUR',
          'Europe/Madrid',
          '2026-08-24T10:00:00.000Z',
          '2026-08-24T10:00:00.000Z',
          1,
        ),
    ).toThrow();
  });

  it('enforces effective-dated commercial policy validity and successor-only changes', () => {
    const sqlite = fresh();
    seedMinimalProject(sqlite);
    seedSecondProject(sqlite);
    requireTable(sqlite, 'project_commercial_policy');

    expect(tableColumns(sqlite, 'project_commercial_policy').map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'id',
        'project_id',
        'supersedes_policy_id',
        'effective_from',
        'effective_to',
        'overtime_enabled',
        'overtime_threshold_minutes',
        'travel_client_billable',
        'customer_signoff_required',
        'created_by',
        'created_at',
        'version',
      ]),
    );
    expect(
      tableColumns(sqlite, 'project_commercial_policy').find(
        (column) => column.name === 'supersedes_policy_id',
      ),
    ).toMatchObject({ type: 'TEXT', notnull: 0 });
    const policyUniqueIndexes = sqlite
      .prepare('PRAGMA index_list(project_commercial_policy)')
      .all() as Array<{ name: string; unique: number }>;
    expect(
      policyUniqueIndexes.some(
        (index) =>
          index.unique === 1 &&
          (
            sqlite.prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`).all() as Array<{
              name: string;
            }>
          ).some((column) => column.name === 'supersedes_policy_id'),
      ),
    ).toBe(true);
    expect(sqlite.prepare('PRAGMA foreign_key_list(project_commercial_policy)').all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'project_commercial_policy',
          from: 'supersedes_policy_id',
          to: 'id',
        }),
      ]),
    );

    // Every invalid candidate has a unique identity and an otherwise isolated
    // interval, so a failure cannot be explained by a duplicate key or overlap.
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-reversed',
        effective_from: '2028-02-01',
        effective_to: '2028-01-01',
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-no-threshold',
        effective_from: '2028-03-01',
        effective_to: '2028-04-01',
        overtime_threshold_minutes: null,
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-too-low',
        effective_from: '2028-05-01',
        effective_to: '2028-06-01',
        overtime_threshold_minutes: 0,
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-too-high',
        effective_from: '2028-07-01',
        effective_to: '2028-08-01',
        overtime_threshold_minutes: 1441,
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-disabled-threshold',
        effective_from: '2028-09-01',
        effective_to: '2028-10-01',
        overtime_enabled: 0,
        overtime_threshold_minutes: 480,
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-invalid-travel-bool',
        effective_from: '2028-11-01',
        effective_to: '2028-12-01',
        travel_client_billable: 2,
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-invalid-overtime-bool',
        effective_from: '2029-01-01',
        effective_to: '2029-02-01',
        overtime_enabled: 2,
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-invalid-signoff-bool',
        effective_from: '2029-03-01',
        effective_to: '2029-04-01',
        customer_signoff_required: -1,
      }),
    ).toThrow();

    // A genesis is version 1, has no predecessor and is the only row allowed
    // to start a project policy chain.  It is intentionally open-ended so the
    // next row proves implicit supersession at its effective_from.
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-genesis',
        effective_from: '2026-01-01',
        effective_to: null,
        overtime_threshold_minutes: 1,
        version: 1,
      }),
    ).not.toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-second-genesis',
        effective_from: '2030-01-01',
        effective_to: '2030-02-01',
        version: 1,
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-wrong-project',
        project_id: 'wp02t-project-other',
        supersedes_policy_id: 'wp02t-policy-genesis',
        effective_from: '2026-08-01',
        effective_to: '2026-12-31',
        version: 2,
      }),
    ).toThrow();

    // An open-ended predecessor is validly superseded by a later closed row;
    // threshold 1440 exercises the upper valid boundary.
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-successor',
        supersedes_policy_id: 'wp02t-policy-genesis',
        effective_from: '2026-08-01',
        effective_to: '2026-12-31',
        overtime_threshold_minutes: 1440,
        version: 2,
      }),
    ).not.toThrow();

    // The predecessor has an explicit end, so starting a successor before it
    // ends is invalid even though the candidate otherwise has the right tail
    // and next version.
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-explicit-overlap',
        supersedes_policy_id: 'wp02t-policy-successor',
        effective_from: '2026-12-15',
        effective_to: '2027-01-15',
        version: 3,
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-successor-2',
        supersedes_policy_id: 'wp02t-policy-successor',
        effective_from: '2027-01-01',
        effective_to: '2027-06-30',
        overtime_enabled: 0,
        overtime_threshold_minutes: null,
        version: 3,
      }),
    ).not.toThrow();

    // This candidate has a later date and the right version, but points to a
    // non-tail predecessor, so it must be rejected as a branch.
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-non-tail',
        supersedes_policy_id: 'wp02t-policy-successor',
        effective_from: '2028-01-01',
        effective_to: '2028-02-01',
        version: 3,
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-successor-3',
        supersedes_policy_id: 'wp02t-policy-successor-2',
        effective_from: '2027-07-01',
        effective_to: null,
        overtime_threshold_minutes: 480,
        version: 4,
      }),
    ).not.toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-wrong-version',
        supersedes_policy_id: 'wp02t-policy-successor-3',
        effective_from: '2028-03-01',
        effective_to: '2028-04-01',
        version: 6,
      }),
    ).toThrow();
    expect(() =>
      insertPolicy(sqlite, {
        id: 'wp02t-policy-not-later',
        supersedes_policy_id: 'wp02t-policy-successor-3',
        effective_from: '2027-06-30',
        effective_to: '2028-05-01',
        version: 5,
      }),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE project_commercial_policy SET travel_client_billable=0 WHERE id='wp02t-policy-successor-3'",
        )
        .run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare("DELETE FROM project_commercial_policy WHERE id='wp02t-policy-successor-3'")
        .run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          `INSERT OR REPLACE INTO project_commercial_policy(
             id,project_id,supersedes_policy_id,effective_from,effective_to,overtime_enabled,
             overtime_threshold_minutes,travel_client_billable,customer_signoff_required,
             created_by,created_at,version
           ) SELECT id,project_id,supersedes_policy_id,effective_from,effective_to,overtime_enabled,
                    overtime_threshold_minutes,0,customer_signoff_required,
                    created_by,created_at,version
             FROM project_commercial_policy WHERE id='wp02t-policy-successor-3'`,
        )
        .run(),
    ).toThrow();
  });

  it('guards project legal-entity assignments against invalid scope, overlap, replacement, and mutation', () => {
    const sqlite = fresh();
    seedMinimalProject(sqlite);
    seedCanonicalLegalEntity(sqlite);

    expect(() =>
      insertProjectLegalEntityAssignment(sqlite, {
        assignmentId: 'wp02t-assignment-missing-project',
        projectId: 'wp02t-project-missing',
        legalEntityRevisionId: 'wp02t-legal-revision',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-01-31',
      }),
    ).toThrow(/invalid or overlapping project legal entity assignment/i);
    expect(() =>
      insertProjectLegalEntityAssignment(sqlite, {
        assignmentId: 'wp02t-assignment-missing-revision',
        projectId: 'wp02t-project',
        legalEntityRevisionId: 'wp02t-legal-revision-missing',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-01-31',
      }),
    ).toThrow(/invalid or overlapping project legal entity assignment/i);
    expect(() =>
      insertProjectLegalEntityAssignment(sqlite, {
        assignmentId: 'wp02t-assignment-mismatched-deployment',
        projectId: 'wp02t-project',
        legalEntityRevisionId: 'wp02t-legal-revision',
        deploymentId: 'wp02t-other-deployment',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-01-31',
      }),
    ).toThrow(/invalid or overlapping project legal entity assignment/i);

    expect(() =>
      insertProjectLegalEntityAssignment(sqlite, {
        assignmentId: 'wp02t-assignment-before-revision',
        projectId: 'wp02t-project',
        legalEntityRevisionId: 'wp02t-legal-revision',
        effectiveFrom: '2025-12-01',
        effectiveTo: '2026-01-31',
      }),
    ).toThrow(/invalid or overlapping project legal entity assignment/i);
    expect(() =>
      insertProjectLegalEntityAssignment(sqlite, {
        assignmentId: 'wp02t-assignment-after-revision',
        projectId: 'wp02t-project',
        legalEntityRevisionId: 'wp02t-legal-revision',
        effectiveFrom: '2026-12-01',
        effectiveTo: '2027-01-01',
      }),
    ).toThrow(/invalid or overlapping project legal entity assignment/i);

    expect(() =>
      insertProjectLegalEntityAssignment(sqlite, {
        assignmentId: 'wp02t-assignment-base',
        projectId: 'wp02t-project',
        legalEntityRevisionId: 'wp02t-legal-revision',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-06-30',
      }),
    ).not.toThrow();

    // Assignment endpoints are inclusive at the database guard boundary:
    // reusing 2026-06-30 overlaps, while 2026-07-01 is the next valid day.
    expect(() =>
      insertProjectLegalEntityAssignment(sqlite, {
        assignmentId: 'wp02t-assignment-same-day-overlap',
        projectId: 'wp02t-project',
        legalEntityRevisionId: 'wp02t-legal-revision',
        effectiveFrom: '2026-06-30',
        effectiveTo: '2026-12-31',
      }),
    ).toThrow(/invalid or overlapping project legal entity assignment/i);

    expect(() =>
      sqlite
        .prepare(
          `INSERT OR REPLACE INTO project_legal_entity_assignment(
             assignment_id,project_id,legal_entity_revision_id,tenant_id,deployment_id,
             effective_from,effective_to,created_at,command_id
           ) VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'wp02t-assignment-base',
          'wp02t-project',
          'wp02t-legal-revision',
          TEST_TENANT,
          TEST_DEPLOYMENT,
          '2026-01-01',
          '2026-06-29',
          '2026-08-24T10:04:00.000Z',
          'wp02t-assignment-command',
        ),
    ).toThrow(/immutable/i);

    expect(() =>
      insertProjectLegalEntityAssignment(sqlite, {
        assignmentId: 'wp02t-assignment-adjacent',
        projectId: 'wp02t-project',
        legalEntityRevisionId: 'wp02t-legal-revision',
        effectiveFrom: '2026-07-01',
        effectiveTo: '2026-12-31',
      }),
    ).not.toThrow();
    expect(
      sqlite
        .prepare(
          `SELECT assignment_id,effective_from,effective_to
           FROM project_legal_entity_assignment
           WHERE project_id=? ORDER BY effective_from`,
        )
        .all('wp02t-project'),
    ).toEqual([
      {
        assignment_id: 'wp02t-assignment-base',
        effective_from: '2026-01-01',
        effective_to: '2026-06-30',
      },
      {
        assignment_id: 'wp02t-assignment-adjacent',
        effective_from: '2026-07-01',
        effective_to: '2026-12-31',
      },
    ]);

    expect(() =>
      sqlite
        .prepare(
          `UPDATE project_legal_entity_assignment
           SET effective_to='2026-06-29' WHERE assignment_id='wp02t-assignment-base'`,
        )
        .run(),
    ).toThrow(/legal-entity assignment immutable/i);
    expect(() =>
      sqlite
        .prepare(
          `DELETE FROM project_legal_entity_assignment
           WHERE assignment_id='wp02t-assignment-base'`,
        )
        .run(),
    ).toThrow(/legal-entity assignment immutable/i);
    expect(
      sqlite.prepare('SELECT COUNT(*) AS count FROM project_legal_entity_assignment').get(),
    ).toEqual({ count: 2 });
  });

  it('requires an exact current customer snapshot and preserves conformity/invalidation history', () => {
    const sqlite = fresh();
    seedMinimalProject(sqlite);
    requireTable(sqlite, 'customer_conformity');
    requireTable(sqlite, 'customer_conformity_invalidation');
    expect(tableColumns(sqlite, 'customer_conformity').map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'id',
        'period_report_id',
        'snapshot_version',
        'snapshot_sha256',
        'snapshot_json',
        'report_pdf_storage_key',
        'report_pdf_sha256',
        'report_pdf_byte_length',
        'signer_name',
        'signer_identity',
        'signed_at',
        'signature_document_id',
        'created_by',
        'created_at',
      ]),
    );
    expect(
      tableColumns(sqlite, 'customer_conformity_invalidation').map((column) => column.name),
    ).toEqual(expect.arrayContaining(['id', 'conformity_id', 'reason', 'actor_id', 'occurred_at']));

    const customerSnapshotJson = '{"period":"2026-09"}';
    const customerSnapshotSha256 = financeSnapshotHash(sqlite, customerSnapshotJson);
    const customerPdf = {
      storageKey: 'reports/wp02t-customer-report.pdf',
      sha256: PDF_HASH,
      byteLength: 4096,
    };
    const internalSnapshotJson = '{"period":"2026-09","audience":"internal"}';
    const internalSnapshotSha256 = financeSnapshotHash(sqlite, internalSnapshotJson);
    insertPeriodReport(sqlite, {
      id: 'wp02t-customer-report',
      audience: 'customer',
      snapshotVersion: 2,
      snapshotSha256: customerSnapshotSha256,
      snapshotJson: customerSnapshotJson,
      pdfStorageKey: customerPdf.storageKey,
      pdfSha256: customerPdf.sha256,
      pdfByteLength: customerPdf.byteLength,
    });
    insertPeriodReport(sqlite, {
      id: 'wp02t-internal-report',
      audience: 'internal',
      snapshotVersion: 2,
      snapshotSha256: internalSnapshotSha256,
      snapshotJson: internalSnapshotJson,
      pdfStorageKey: 'reports/wp02t-internal-report.pdf',
      pdfSha256: PDF_HASH,
      pdfByteLength: 2048,
    });
    insertPeriodReport(sqlite, {
      id: 'wp02t-unsafe-key-report',
      audience: 'customer',
      snapshotVersion: 2,
      snapshotSha256: customerSnapshotSha256,
      snapshotJson: customerSnapshotJson,
      pdfStorageKey: '../private/customer-report.pdf',
      pdfSha256: PDF_HASH,
      pdfByteLength: 2048,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    const currentConformity = {
      periodReportId: 'wp02t-customer-report',
      snapshotVersion: 2,
      snapshotSha256: customerSnapshotSha256,
      snapshotJson: customerSnapshotJson,
      reportPdfStorageKey: customerPdf.storageKey,
      reportPdfSha256: customerPdf.sha256,
      reportPdfByteLength: customerPdf.byteLength,
    };

    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-unsafe-key-conformity',
        periodReportId: 'wp02t-unsafe-key-report',
        snapshotVersion: 2,
        snapshotSha256: customerSnapshotSha256,
        snapshotJson: customerSnapshotJson,
        reportPdfStorageKey: '../private/customer-report.pdf',
        reportPdfSha256: PDF_HASH,
        reportPdfByteLength: 2048,
      }),
    ).toThrow();

    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-internal-conformity',
        periodReportId: 'wp02t-internal-report',
        snapshotVersion: 2,
        snapshotSha256: internalSnapshotSha256,
        snapshotJson: internalSnapshotJson,
        reportPdfStorageKey: 'reports/wp02t-internal-report.pdf',
        reportPdfSha256: PDF_HASH,
        reportPdfByteLength: 2048,
      }),
    ).toThrow();
    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-stale-conformity',
        ...currentConformity,
        snapshotVersion: 1,
      }),
    ).toThrow();
    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-wrong-hash-conformity',
        ...currentConformity,
        snapshotSha256: WRONG_SNAPSHOT_HASH,
      }),
    ).toThrow();
    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-wrong-json-conformity',
        ...currentConformity,
        snapshotJson: '{"period":"2026-09","tampered":true}',
        snapshotSha256: financeSnapshotHash(sqlite, '{"period":"2026-09","tampered":true}'),
      }),
    ).toThrow();
    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-wrong-pdf-key-conformity',
        ...currentConformity,
        reportPdfStorageKey: 'reports/wp02t-other.pdf',
      }),
    ).toThrow();
    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-wrong-pdf-hash-conformity',
        ...currentConformity,
        reportPdfSha256: 'd'.repeat(64),
      }),
    ).toThrow();
    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-wrong-pdf-length-conformity',
        ...currentConformity,
        reportPdfByteLength: 4097,
      }),
    ).toThrow();
    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-conformity-1',
        ...currentConformity,
      }),
    ).not.toThrow();
    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-conformity-duplicate',
        ...currentConformity,
      }),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE customer_conformity SET signer_name='Changed' WHERE id='wp02t-conformity-1'",
        )
        .run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare("DELETE FROM customer_conformity WHERE id='wp02t-conformity-1'").run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          `INSERT OR REPLACE INTO customer_conformity(
             id,period_report_id,snapshot_version,snapshot_sha256,snapshot_json,
             report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length,signer_name,
             signer_identity,signed_at,signature_document_id,created_by,created_at
           ) SELECT id,period_report_id,snapshot_version,snapshot_sha256,snapshot_json,
                    report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length,'Replaced',
                    signer_identity,signed_at,signature_document_id,created_by,created_at
             FROM customer_conformity WHERE id='wp02t-conformity-1'`,
        )
        .run(),
    ).toThrow();
    for (const mutation of [
      "audience='internal'",
      "state='draft'",
      "period_start='2026-08-01'",
      "period_end='2026-10-31'",
      "report_type='changed'",
    ]) {
      expect(() =>
        sqlite
          .prepare(`UPDATE period_report SET ${mutation} WHERE id='wp02t-customer-report'`)
          .run(),
      ).toThrow();
    }

    const signedSnapshot = sqlite
      .prepare(
        `SELECT snapshot_version,snapshot_sha256,snapshot_json,
                report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length
         FROM customer_conformity WHERE id='wp02t-conformity-1'`,
      )
      .get();
    expect(signedSnapshot).toEqual({
      snapshot_version: currentConformity.snapshotVersion,
      snapshot_sha256: currentConformity.snapshotSha256,
      snapshot_json: currentConformity.snapshotJson,
      report_pdf_storage_key: currentConformity.reportPdfStorageKey,
      report_pdf_sha256: currentConformity.reportPdfSha256,
      report_pdf_byte_length: currentConformity.reportPdfByteLength,
    });

    const refreshedSnapshotJson = '{"period":"2026-09","refreshed":true}';
    const refreshedSnapshotSha256 = financeSnapshotHash(sqlite, refreshedSnapshotJson);
    const refreshedPdf = {
      storageKey: 'reports/wp02t-customer-report-v2.pdf',
      sha256: 'd'.repeat(64),
      byteLength: 8192,
    };
    const refreshReport = () =>
      sqlite
        .prepare(
          `UPDATE period_report
           SET snapshot_version=?,snapshot_sha256=?,snapshot_json=?,
               pdf_storage_key=?,pdf_sha256=?,pdf_byte_length=?,updated_at=?
           WHERE id='wp02t-customer-report'`,
        )
        .run(
          3,
          refreshedSnapshotSha256,
          refreshedSnapshotJson,
          refreshedPdf.storageKey,
          refreshedPdf.sha256,
          refreshedPdf.byteLength,
          '2026-10-01T10:00:00.000Z',
        );
    expect(refreshReport).toThrow();

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO customer_conformity_invalidation(
             id,conformity_id,reason,actor_id,occurred_at
           ) VALUES(?,?,?,?,?)`,
        )
        .run(
          'wp02t-invalidation-1',
          'wp02t-conformity-1',
          'Customer requested correction',
          'wp02t-owner',
          '2026-10-01T10:00:00.000Z',
        ),
    ).not.toThrow();
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO customer_conformity_invalidation(
             id,conformity_id,reason,actor_id,occurred_at
           ) VALUES(?,?,?,?,?)`,
        )
        .run(
          'wp02t-invalidation-duplicate',
          'wp02t-conformity-1',
          'Duplicate invalidation',
          'wp02t-owner',
          '2026-10-01T10:01:00.000Z',
        ),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE customer_conformity_invalidation SET reason='Changed' WHERE id='wp02t-invalidation-1'",
        )
        .run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare("DELETE FROM customer_conformity_invalidation WHERE id='wp02t-invalidation-1'")
        .run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          `INSERT OR REPLACE INTO customer_conformity_invalidation(
             id,conformity_id,reason,actor_id,occurred_at
           ) VALUES(?,?,?,?,?)`,
        )
        .run(
          'wp02t-invalidation-1',
          'wp02t-conformity-1',
          'Replacement attempt',
          'wp02t-owner',
          '2026-10-01T10:02:00.000Z',
        ),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare("UPDATE period_report SET audience='internal' WHERE id='wp02t-customer-report'")
        .run(),
    ).toThrow();

    expect(() =>
      sqlite
        .prepare(
          `UPDATE period_report
           SET snapshot_version=1,snapshot_sha256=?,snapshot_json=?,
               pdf_storage_key=?,pdf_sha256=?,pdf_byte_length=?,updated_at=?
           WHERE id='wp02t-customer-report'`,
        )
        .run(
          refreshedSnapshotSha256,
          refreshedSnapshotJson,
          refreshedPdf.storageKey,
          refreshedPdf.sha256,
          refreshedPdf.byteLength,
          '2026-10-01T10:03:00.000Z',
        ),
    ).toThrow();

    expect(refreshReport).not.toThrow();
    expect(
      sqlite
        .prepare(
          `SELECT snapshot_version,snapshot_sha256,snapshot_json,
                  report_pdf_storage_key,report_pdf_sha256,report_pdf_byte_length
           FROM customer_conformity WHERE id='wp02t-conformity-1'`,
        )
        .get(),
    ).toEqual(signedSnapshot);
    expect(() =>
      insertConformity(sqlite, {
        id: 'wp02t-conformity-2',
        periodReportId: 'wp02t-customer-report',
        snapshotVersion: 3,
        snapshotSha256: refreshedSnapshotSha256,
        snapshotJson: refreshedSnapshotJson,
        reportPdfStorageKey: refreshedPdf.storageKey,
        reportPdfSha256: refreshedPdf.sha256,
        reportPdfByteLength: refreshedPdf.byteLength,
      }),
    ).not.toThrow();
  });

  it('upgrades populated schema-18 client/project/invoice/expense/report/settlement rows byte-for-byte', () => {
    setTestIdentity();
    const directory = mkdtempSync(join(tmpdir(), 'ja-wp02t-legacy-upgrade-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'app.db');
    const legacy = buildSchema18Database(databasePath);
    const before = Object.fromEntries(
      Object.entries(LEGACY_COLUMNS).map(([table, columns]) => [
        table,
        projectRow(
          legacy,
          table,
          columns,
          table === 'client'
            ? 'legacy-client'
            : table === 'project'
              ? 'legacy-project'
              : table === 'invoice'
                ? 'legacy-invoice'
                : table === 'expense'
                  ? 'legacy-expense'
                  : table === 'daily_report'
                    ? 'legacy-daily'
                    : table === 'technical_report'
                      ? 'legacy-technical'
                      : table === 'compensation_settlement'
                        ? 'legacy-settlement'
                        : 'legacy-period-report',
        ),
      ]),
    );
    legacy.close();

    const { sqlite } = createDatabase(databasePath);
    databases.push(sqlite);
    const after = Object.fromEntries(
      Object.entries(LEGACY_COLUMNS).map(([table, columns]) => [
        table,
        projectRow(
          sqlite,
          table,
          columns,
          table === 'client'
            ? 'legacy-client'
            : table === 'project'
              ? 'legacy-project'
              : table === 'invoice'
                ? 'legacy-invoice'
                : table === 'expense'
                  ? 'legacy-expense'
                  : table === 'daily_report'
                    ? 'legacy-daily'
                    : table === 'technical_report'
                      ? 'legacy-technical'
                      : table === 'compensation_settlement'
                        ? 'legacy-settlement'
                        : 'legacy-period-report',
        ),
      ]),
    );
    expect(after).toEqual(before);
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(integrityCheck(sqlite)).toBe('ok');
    expect(sqlite.prepare('SELECT MAX(version) AS version FROM schema_migration').get()).toEqual({
      version: 30,
    });
  });

  it('does not backfill policy, conformity, or invalidation rows during a legacy upgrade', () => {
    setTestIdentity();
    const directory = mkdtempSync(join(tmpdir(), 'ja-wp02t-empty-history-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'app.db');
    const legacy = buildSchema18Database(databasePath);
    legacy.close();

    const { sqlite } = createDatabase(databasePath);
    databases.push(sqlite);
    expect(tableNames(sqlite)).toEqual(
      expect.arrayContaining([
        'project_commercial_policy',
        'customer_conformity',
        'customer_conformity_invalidation',
      ]),
    );
    expect(sqlite.prepare('SELECT count(*) AS count FROM project_commercial_policy').get()).toEqual(
      { count: 0 },
    );
    expect(sqlite.prepare('SELECT count(*) AS count FROM customer_conformity').get()).toEqual({
      count: 0,
    });
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM customer_conformity_invalidation').get(),
    ).toEqual({ count: 0 });
    const missingColumns = Object.fromEntries(
      Object.entries(ADDITIVE_COLUMNS).map(([table, columns]) => [
        table,
        columns.filter(
          (column) => !tableColumns(sqlite, table).some((entry) => entry.name === column),
        ),
      ]),
    );
    expect(missingColumns).toEqual(
      Object.fromEntries(Object.keys(ADDITIVE_COLUMNS).map((table) => [table, []])),
    );
    expect(
      sqlite
        .prepare(
          `SELECT
             (SELECT client_code FROM client WHERE id='legacy-client') AS client_code,
             (SELECT cost_center_code FROM project WHERE id='legacy-project') AS cost_center_code,
             (SELECT planned_issue_on FROM invoice WHERE id='legacy-invoice') AS planned_issue_on,
             (SELECT expected_collection_on FROM invoice WHERE id='legacy-invoice') AS expected_collection_on,
             (SELECT expected_payment_on FROM compensation_settlement WHERE id='legacy-settlement') AS expected_payment_on,
             (SELECT expected_reimbursement_on FROM expense WHERE id='legacy-expense') AS expected_reimbursement_on,
             (SELECT expected_recovery_on FROM expense WHERE id='legacy-expense') AS expected_recovery_on,
             (SELECT commercial_classification_state FROM expense WHERE id='legacy-expense') AS commercial_classification_state,
             (SELECT snapshot_version FROM period_report WHERE id='legacy-period-report') AS snapshot_version,
             (SELECT snapshot_sha256 FROM period_report WHERE id='legacy-period-report') AS snapshot_sha256`,
        )
        .get(),
    ).toEqual({
      client_code: null,
      cost_center_code: null,
      planned_issue_on: null,
      expected_collection_on: null,
      expected_payment_on: null,
      expected_reimbursement_on: null,
      expected_recovery_on: null,
      commercial_classification_state: 'legacy_classified',
      snapshot_version: 1,
      snapshot_sha256: null,
    });
  });

  it('preserves prior reviewed migration metadata and its immutable guard', () => {
    const sqlite = fresh();
    expect(
      sqlite
        .prepare(
          'SELECT migration_version FROM migration_contract_metadata ORDER BY migration_version',
        )
        .all(),
    ).toEqual(Array.from({ length: 12 }, (_, index) => ({ migration_version: index + 19 })));
    expect(() =>
      sqlite
        .prepare(
          "UPDATE migration_contract_metadata SET migration_name='changed' WHERE migration_version=19",
        )
        .run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare('DELETE FROM migration_contract_metadata WHERE migration_version=19').run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          'INSERT OR REPLACE INTO migration_contract_metadata SELECT * FROM migration_contract_metadata WHERE migration_version=19',
        )
        .run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare('UPDATE finance_v2_cutover SET cutover_at="changed" WHERE singleton=1').run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare('DELETE FROM finance_v2_cutover WHERE singleton=1').run(),
    ).toThrow();
    expect(() =>
      sqlite
        .prepare(
          'INSERT OR REPLACE INTO finance_v2_cutover SELECT * FROM finance_v2_cutover WHERE singleton=1',
        )
        .run(),
    ).toThrow();
    expect(
      sqlite
        .prepare(
          `SELECT action,entity_type FROM audit_action_registry
           WHERE owner_packet IN ('WP-03','WP-04') ORDER BY action`,
        )
        .all(),
    ).toEqual(
      expect.arrayContaining([
        { action: 'canonical_legal_entity.configure', entity_type: 'legal_entity_revision' },
        { action: 'project_legal_entity.assign', entity_type: 'project_legal_entity_assignment' },
        { action: 'expense.classify', entity_type: 'expense' },
        { action: 'customer_conformity.create', entity_type: 'customer_conformity' },
      ]),
    );
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO audit_action_registry(
             contract_version,action,entity_type,actor_kind,owner_packet,data_classification
           ) VALUES('B5-R4','unreviewed.action','expense','user','runtime','restricted')`,
        )
        .run(),
    ).toThrow();
    expect(
      sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='trigger'
           AND name LIKE 'project_legal_entity_assignment_%' ORDER BY name`,
        )
        .all(),
    ).toEqual([
      { name: 'project_legal_entity_assignment_insert_guard' },
      { name: 'project_legal_entity_assignment_no_delete' },
      { name: 'project_legal_entity_assignment_no_replace' },
      { name: 'project_legal_entity_assignment_no_update' },
    ]);
  });
});
