import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, integrityCheck, MIGRATION_CONTRACT_MANIFEST_SHA256 } from '@ja/database';

const ROOT = resolve(process.cwd());
const MIGRATIONS = resolve(ROOT, 'migrations');
const FIXTURE = resolve(ROOT, 'tests/fixtures/b5-migration-legacy-fixture.sql');
const MANIFEST = resolve(MIGRATIONS, 'contracts/ja-b5-migration-contract-v1.json');
const CONTRACT_FILES = [
  '0019_lifecycle_security.sql',
  '0020_finance_v2.sql',
  '0021_accounting_pack_artifacts.sql',
  '0022_report_registry.sql',
  '0023_localized_pdf_variants.sql',
  '0024_accounting_pack_snapshot_bridge.sql',
  '0025_client_essential_client_fields.sql',
  '0026_client_essential_report_attachments.sql',
  '0027_client_essential_temporary_upload_cleanup.sql',
  '0028_client_essential_20260824.sql',
  '0029_period_report_reapproval.sql',
  '0030_period_report_source_binding.sql',
] as const;
const TABLES = {
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
  time_entry: [
    'id',
    'project_id',
    'worker_id',
    'work_date',
    'category',
    'minutes',
    'approval_state',
    'billability_state',
    'invoice_id',
    'created_at',
    'updated_at',
    'version',
    'project_timezone',
    'activity_summary',
    'submitted_at',
    'approved_by',
    'approved_at',
    'finance_approved_by',
    'finance_approved_at',
    'start_time',
    'end_time',
    'activity_code',
    'break_minutes',
    'site',
    'billable_minutes',
    'client_rate_minor',
    'compensation_amount_minor',
    'internal_cost_minor',
    'billing_status',
    'locked_at',
    'locked_by',
    'billing_lock_id',
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
  document: [
    'id',
    'project_id',
    'owner_id',
    'sha256',
    'media_type',
    'byte_length',
    'state',
    'storage_key',
    'created_at',
    'updated_at',
    'version',
    'original_filename',
    'description',
    'sensitive',
    'artifact_type',
    'software_version',
    'supersedes_id',
    'approved_at',
    'approved_by',
    'sensitivity',
    'safe_filename',
    'scan_status',
    'scanned_at',
    'scan_provider',
    'artifact_metadata_json',
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
  payment: [
    'id',
    'invoice_id',
    'amount_minor',
    'currency',
    'received_at',
    'reference',
    'created_at',
    'idempotency_key',
  ],
  audit_event: [
    'id',
    'actor_id',
    'action',
    'entity_type',
    'entity_id',
    'occurred_at',
    'details_json',
    'project_id',
    'before_json',
    'after_json',
    'reason',
    'correlation_id',
    'metadata_json',
  ],
  job: [
    'id',
    'kind',
    'idempotency_key',
    'state',
    'run_after',
    'lease_until',
    'attempts',
    'payload_json',
    'created_at',
    'updated_at',
    'version',
  ],
  job_run: ['id', 'job_id', 'started_at', 'finished_at', 'outcome', 'error_code'],
} as const;

const EXPECTED_FIXTURE_SHA256 = '2c34f6360fa86df895fcf52596defdf481a2883d6502742691a33fdaa1ec69cc';
const EXPECTED_PROJECTIONS: Record<string, { rowCount: number; sha256: string }> = {
  client: {
    rowCount: 1,
    sha256: '685f4b74dfa1f99892fcbd36f7effbdedd70c55ea0810dc106c38c88e808ac43',
  },
  project: {
    rowCount: 1,
    sha256: 'ba3eb35afd6ffda5852839f1c83b67d6ac2142b8974a3f95becc1122d64eb1fc',
  },
  time_entry: {
    rowCount: 1,
    sha256: 'cd7787460066a4c1d19405ece54c8c2feb4429fd786d439063b34c0ede0abc48',
  },
  expense: {
    rowCount: 1,
    sha256: 'f61d3b391b9320f113fbc8139ced116760c409ea6481913d00219f07e4f1ca56',
  },
  daily_report: {
    rowCount: 1,
    sha256: 'dd4ffad1cd1dc371627ede6f841f1a5caff2723b880ccffdf24f5c6101113665',
  },
  technical_report: {
    rowCount: 1,
    sha256: 'be8d20e6925b9ce9381507467827dd7e4738fc8343147cd93361e6a3dcc63723',
  },
  document: {
    rowCount: 1,
    sha256: '463a08eed97a436ce2e0436e42b33569782639aa40fb2c803eb9146dbac86fac',
  },
  invoice: {
    rowCount: 1,
    sha256: 'eb9b9bb30c67e51c54978a4690e38a620f58838a8df335e2f444b045b747fb27',
  },
  payment: {
    rowCount: 1,
    sha256: '8542b9451154abfb19ede5d3d3a9849b3c0dc21f59e5e3368439bc0f8a588914',
  },
  audit_event: {
    rowCount: 1,
    sha256: 'c9f75ea0a6137593a993d5c6c63f06d8c7953cba9da7ed92a852d344fa62d75d',
  },
  job: { rowCount: 1, sha256: '44f9ed38ce1e9a76b8c40523c548279c8fd51347727debe60f9e3d2cad47dc20' },
  job_run: {
    rowCount: 1,
    sha256: '1b4d05f536d30146c62eaeb83cd3a3f4d698c829fa11675f0c80aeeb0600a0e2',
  },
};
const EXPECTED_MANIFEST_SHA256 = 'dffc60f16811375a210e03fee8e733c225e736791a509e448e879d9e9bc2c316';
const EXPECTED_MIGRATION_HASHES: Record<string, string> = {
  '0019_lifecycle_security.sql': '93a56b070237e6be436ff1b0b2ae3bf3a78767bdef58f03619f634520dac1b8c',
  '0020_finance_v2.sql': '21c8e230e98c71d96dbf790284ed56fa6d417638443d17e0ccd9b580655824db',
  '0021_accounting_pack_artifacts.sql':
    '3217b609b94fa0aa7e9da4e1b24bc12fc43fae0a9269b2b8426ee64e940d8d76',
  '0022_report_registry.sql': '70822a3aed026f3ba7723a195ff26459f7d8403c7fde48e90e5a25aa850c18a8',
  '0023_localized_pdf_variants.sql':
    '7e688361d3b3a0055f7243af2982892608be2e67ea17754214ba0a2eb70001ca',
  '0024_accounting_pack_snapshot_bridge.sql':
    '486dd15160811fa4a7e61839eec037553b5d78c72b387289405dbeb18322180f',
  '0025_client_essential_client_fields.sql':
    '9fde5787ae6d9b30f6d522f912481034a22d0d1eedbf088b5fe5ffb25e228af9',
  '0026_client_essential_report_attachments.sql':
    '730189c6df8e44cbd99ce564481ad4d48d55a30c6fc2c0dc6fe06f4861361195',
  '0027_client_essential_temporary_upload_cleanup.sql':
    '462bc9a9040b5197a874c0f3a17cf265ead19747c41d40df7dd67ac52a3c9536',
  '0028_client_essential_20260824.sql':
    'd9ee382d6c7d4925be360c0b58f25b4bccfeb6760819220a8ff4cabe3cbaa0c7',
  '0029_period_report_reapproval.sql':
    'cb548d8f5c179f2392b763b7d49910e9998c5bcee5fa38f1021c244b3704dfb9',
  '0030_period_report_source_binding.sql':
    '8e0accef11bc0755e19c93324323c7821612ea9f57d0374cb7e1827e9efb99ea',
};

const tempDirectories: string[] = [];
const previousEnvironment = {
  tenant: process.env.JA_TENANT_ID,
  deployment: process.env.JA_DEPLOYMENT_ID,
  migrations: process.env.JA_MIGRATIONS_PATH,
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function encodeU64(value: number): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function encodeCanonValue(value: unknown): Buffer {
  if (value === null || value === undefined) return Buffer.from([0]);
  if (typeof value === 'number' || typeof value === 'bigint') {
    const bytes = Buffer.alloc(9);
    bytes[0] = 1;
    bytes.writeBigInt64BE(BigInt(value), 1);
    return bytes;
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([Buffer.from([2]), encodeU64(bytes.length), bytes]);
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([Buffer.from([3]), encodeU64(bytes.length), bytes]);
  }
  throw new Error(`Unsupported SQLite storage class: ${typeof value}`);
}

function projection(sqlite: DatabaseSync, table: string, columns: readonly string[]) {
  const rows = sqlite
    .prepare(`SELECT ${columns.join(',')} FROM ${table} ORDER BY id COLLATE BINARY`)
    .all() as Array<Record<string, unknown>>;
  const bytes = Buffer.concat(
    rows.flatMap((row) => columns.map((column) => encodeCanonValue(row[column]))),
  );
  return { rowCount: rows.length, sha256: sha256(bytes) };
}

function migrationMetadata(sqlite: DatabaseSync): Array<{
  migration_version: number;
  migration_name: string;
}> {
  return sqlite
    .prepare(
      `SELECT migration_version,migration_name
       FROM migration_contract_metadata ORDER BY migration_version`,
    )
    .all() as Array<{ migration_version: number; migration_name: string }>;
}

function buildLegacyDatabase(path: string, migrationDirectory = MIGRATIONS): void {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  for (const file of readdirSync(migrationDirectory)
    .filter(
      (candidate) => /^\d{4}_.+\.sql$/u.test(candidate) && Number(candidate.slice(0, 4)) <= 18,
    )
    .sort())
    sqlite.exec(readFileSync(join(migrationDirectory, file), 'utf8'));
  sqlite.exec(readFileSync(FIXTURE, 'utf8'));
  sqlite.close();
}

function rewriteV22MetadataConstraint(sqlite: DatabaseSync): void {
  // A production v22 database may have been created before the localized PDF
  // evidence row was added to the reviewed metadata contract.  This fixture
  // keeps the real v22 table/FK/trigger shape but restores that historical
  // CHECK so the runner's compatibility preflight is exercised against an
  // actual persisted schema, not a mocked insert failure.
  sqlite.exec(`
    BEGIN IMMEDIATE;
    DROP TRIGGER migration_contract_metadata_no_update;
    DROP TRIGGER migration_contract_metadata_no_delete;
    DROP TRIGGER finance_v2_cutover_no_update;
    DROP TRIGGER finance_v2_cutover_no_delete;
    ALTER TABLE finance_v2_cutover RENAME TO finance_v2_cutover_legacy_fixture;
    ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_legacy_fixture;
    CREATE TABLE migration_contract_metadata(
      migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 22),
      migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
        'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry'
      )),
      descriptor_version TEXT NOT NULL CHECK(descriptor_version='ja-migration-contract-v1'),
      descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64 AND descriptor_sha256 NOT GLOB '*[^0-9a-f]*'),
      sql_sha256 TEXT NOT NULL CHECK(length(sql_sha256)=64 AND sql_sha256 NOT GLOB '*[^0-9a-f]*'),
      projection_sha256 TEXT NOT NULL CHECK(length(projection_sha256)=64 AND projection_sha256 NOT GLOB '*[^0-9a-f]*'),
      vector_sha256 TEXT NOT NULL CHECK(length(vector_sha256)=64 AND vector_sha256 NOT GLOB '*[^0-9a-f]*'),
      encoder_sha256 TEXT NOT NULL CHECK(length(encoder_sha256)=64 AND encoder_sha256 NOT GLOB '*[^0-9a-f]*'),
      runner_sha256 TEXT NOT NULL CHECK(length(runner_sha256)=64 AND runner_sha256 NOT GLOB '*[^0-9a-f]*'),
      heartbeat_worker_sha256 TEXT NOT NULL CHECK(length(heartbeat_worker_sha256)=64 AND heartbeat_worker_sha256 NOT GLOB '*[^0-9a-f]*'),
      schema_hash_manifest BLOB NOT NULL CHECK(typeof(schema_hash_manifest)='blob'),
      schema_hash_manifest_sha256 TEXT NOT NULL CHECK(length(schema_hash_manifest_sha256)=64 AND schema_hash_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
      pre_projection_sha256 TEXT NOT NULL CHECK(length(pre_projection_sha256)=64 AND pre_projection_sha256 NOT GLOB '*[^0-9a-f]*'),
      post_projection_sha256 TEXT NOT NULL CHECK(length(post_projection_sha256)=64 AND post_projection_sha256 NOT GLOB '*[^0-9a-f]*'),
      node_version TEXT NOT NULL CHECK(length(node_version)>0),
      sqlite_version TEXT NOT NULL CHECK(length(sqlite_version)>0),
      applied_at TEXT NOT NULL CHECK(length(applied_at)>0)
    ) STRICT;
    INSERT INTO migration_contract_metadata SELECT * FROM migration_contract_metadata_legacy_fixture;
    CREATE TABLE finance_v2_cutover(
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      migration_version INTEGER NOT NULL CHECK(migration_version=20)
        REFERENCES migration_contract_metadata(migration_version) ON UPDATE RESTRICT ON DELETE RESTRICT,
      descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64),
      cutover_at TEXT NOT NULL
    ) STRICT;
    INSERT INTO finance_v2_cutover SELECT * FROM finance_v2_cutover_legacy_fixture;
    DROP TABLE finance_v2_cutover_legacy_fixture;
    DROP TABLE migration_contract_metadata_legacy_fixture;
    CREATE TRIGGER migration_contract_metadata_no_update BEFORE UPDATE ON migration_contract_metadata
    BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
    CREATE TRIGGER migration_contract_metadata_no_delete BEFORE DELETE ON migration_contract_metadata
    BEGIN SELECT RAISE(ABORT,'migration metadata immutable'); END;
    CREATE TRIGGER finance_v2_cutover_no_update BEFORE UPDATE ON finance_v2_cutover
    BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
    CREATE TRIGGER finance_v2_cutover_no_delete BEFORE DELETE ON finance_v2_cutover
    BEGIN SELECT RAISE(ABORT,'finance cutover immutable'); END;
    COMMIT;
  `);
}

function quotedMetadataRows(sqlite: DatabaseSync): Array<Record<string, string>> {
  return sqlite
    .prepare(
      `SELECT migration_version,migration_name,descriptor_version,
         quote(descriptor_sha256) descriptor_sha256,quote(sql_sha256) sql_sha256,
         quote(projection_sha256) projection_sha256,quote(vector_sha256) vector_sha256,
         quote(encoder_sha256) encoder_sha256,quote(runner_sha256) runner_sha256,
         quote(heartbeat_worker_sha256) heartbeat_worker_sha256,
         quote(schema_hash_manifest) schema_hash_manifest,
         quote(schema_hash_manifest_sha256) schema_hash_manifest_sha256,
         quote(pre_projection_sha256) pre_projection_sha256,
         quote(post_projection_sha256) post_projection_sha256,
         quote(node_version) node_version,quote(sqlite_version) sqlite_version,
         quote(applied_at) applied_at
       FROM migration_contract_metadata ORDER BY migration_version`,
    )
    .all() as Array<Record<string, string>>;
}

function copyMigrationTree(maxVersion = Number.POSITIVE_INFINITY): string {
  const root = mkdtempSync(join(tmpdir(), 'ja-b5-contract-migrations-'));
  tempDirectories.push(root);
  for (const entry of readdirSync(MIGRATIONS, { withFileTypes: true })) {
    if (entry.isFile() && /^\d{4}_.+\.sql$/u.test(entry.name)) {
      const version = Number(entry.name.slice(0, 4));
      if (version > maxVersion) continue;
    }
    const source = join(MIGRATIONS, entry.name);
    const destination = join(root, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destination, { recursive: true });
      for (const child of readdirSync(source))
        copyFileSync(join(source, child), join(destination, child));
    } else copyFileSync(source, destination);
  }
  return root;
}

function restoreEnvironment(): void {
  if (previousEnvironment.tenant === undefined) delete process.env.JA_TENANT_ID;
  else process.env.JA_TENANT_ID = previousEnvironment.tenant;
  if (previousEnvironment.deployment === undefined) delete process.env.JA_DEPLOYMENT_ID;
  else process.env.JA_DEPLOYMENT_ID = previousEnvironment.deployment;
  if (previousEnvironment.migrations === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = previousEnvironment.migrations;
}

afterEach(() => {
  restoreEnvironment();
  for (const directory of tempDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('frozen B5 migration contract', () => {
  it('matches the checked-in fixture bytes and literal projection evidence', () => {
    expect(sha256(readFileSync(MANIFEST))).toBe(EXPECTED_MANIFEST_SHA256);
    expect(MIGRATION_CONTRACT_MANIFEST_SHA256).toBe(EXPECTED_MANIFEST_SHA256);
    expect(sha256(readFileSync(FIXTURE))).toBe(EXPECTED_FIXTURE_SHA256);
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      legacyFixture: {
        file: string;
        sha256: string;
        projectionEncoder: string;
        tables: Record<string, { rowCount: number; sha256: string }>;
      };
      migrations: Array<{ version: number; canonicalName: string; file: string; sha256: string }>;
    };
    expect(manifest.legacyFixture).toMatchObject({
      file: '../../tests/fixtures/b5-migration-legacy-fixture.sql',
      sha256: EXPECTED_FIXTURE_SHA256,
      projectionEncoder: 'CANON-V1',
    });
    expect(manifest.legacyFixture.tables).toEqual(EXPECTED_PROJECTIONS);
    expect(manifest.migrations.map((entry) => entry.version)).toEqual([
      19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    ]);
    for (const [file, expectedHash] of Object.entries(EXPECTED_MIGRATION_HASHES))
      expect(sha256(readFileSync(join(MIGRATIONS, file))), file).toBe(expectedHash);
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys=ON;');
    for (const file of readdirSync(MIGRATIONS)
      .filter(
        (candidate) => /^\d{4}_.+\.sql$/u.test(candidate) && Number(candidate.slice(0, 4)) <= 18,
      )
      .sort())
      sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
    sqlite.exec(readFileSync(FIXTURE, 'utf8'));
    for (const [table, columns] of Object.entries(TABLES))
      expect(projection(sqlite, table, columns), table).toEqual(EXPECTED_PROJECTIONS[table]);
    sqlite.close();
  });

  it('creates the Client Essential fields and reviewed invite audit identity on a fresh database', () => {
    process.env.JA_TENANT_ID = 'test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'test-deployment';
    const { sqlite } = createDatabase(':memory:');
    try {
      expect(
        sqlite
          .prepare('PRAGMA table_info(client)')
          .all()
          .map((column) => (column as { name: string }).name),
      ).toContain('billing_address');
      expect(
        sqlite
          .prepare('PRAGMA table_info(client)')
          .all()
          .map((column) => (column as { name: string }).name),
      ).toContain('po_reference');
      expect(
        sqlite
          .prepare(
            "SELECT contract_version,action,entity_type,actor_kind,owner_packet,data_classification FROM audit_action_registry WHERE action='invitation.accept'",
          )
          .get(),
      ).toEqual({
        contract_version: 'B5-R4',
        action: 'invitation.accept',
        entity_type: 'invitation',
        actor_kind: 'system',
        owner_packet: 'CE-CORE01',
        data_classification: 'confidential',
      });
      expect(sqlite.prepare('SELECT MAX(version) AS version FROM schema_migration').get()).toEqual({
        version: 30,
      });
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(sqlite)).toBe('ok');
    } finally {
      sqlite.close();
    }
  });

  it('preserves v18 legacy job-run outcomes and free-text errors during B5 upgrade', () => {
    process.env.JA_TENANT_ID = 'test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'test-deployment';
    const directory = mkdtempSync(join(tmpdir(), 'ja-b5-legacy-job-run-upgrade-'));
    tempDirectories.push(directory);
    const databasePath = join(directory, 'app.db');
    buildLegacyDatabase(databasePath);

    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        UPDATE job_run
        SET outcome='success', error_code=NULL
        WHERE id='legacy-job-run';

        INSERT INTO job_run(id,job_id,started_at,finished_at,outcome,error_code)
        VALUES(
          'legacy-job-run-failure',
          'legacy-job',
          '2026-08-05T09:03:00.000Z',
          '2026-08-05T09:04:00.000Z',
          'failure',
          'Chromium PDF rendering failed: legacy diagnostic'
        );
      `);
    } finally {
      legacy.close();
    }

    const { sqlite } = createDatabase(databasePath);
    try {
      expect(
        sqlite
          .prepare(
            `SELECT id,outcome,error_code,contract_version
             FROM job_run
             WHERE id IN ('legacy-job-run','legacy-job-run-failure')
             ORDER BY id`,
          )
          .all(),
      ).toEqual([
        {
          id: 'legacy-job-run',
          outcome: 'success',
          error_code: null,
          contract_version: 'legacy',
        },
        {
          id: 'legacy-job-run-failure',
          outcome: 'failure',
          error_code: 'Chromium PDF rendering failed: legacy diagnostic',
          contract_version: 'legacy',
        },
      ]);
      expect(sqlite.prepare('SELECT MAX(version) AS version FROM schema_migration').get()).toEqual({
        version: 30,
      });
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(sqlite)).toBe('ok');
    } finally {
      sqlite.close();
    }
  });
  it('upgrades a populated schema-18 copy transactionally through migration 30', () => {
    process.env.JA_TENANT_ID = 'test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'test-deployment';
    const directory = mkdtempSync(join(tmpdir(), 'ja-b5-populated-upgrade-'));
    tempDirectories.push(directory);
    const databasePath = join(directory, 'app.db');
    buildLegacyDatabase(databasePath);
    const before = new DatabaseSync(databasePath);
    const beforeProjections = Object.fromEntries(
      Object.entries(TABLES).map(([table, columns]) => [table, projection(before, table, columns)]),
    );
    before.close();

    const { sqlite } = createDatabase(databasePath);
    try {
      expect(
        sqlite
          .prepare('SELECT MIN(version) min,MAX(version) max,COUNT(*) count FROM schema_migration')
          .get(),
      ).toEqual({ min: 1, max: 30, count: 30 });
      expect(
        sqlite.prepare('SELECT tenant_id,deployment_id FROM deployment_identity').get(),
      ).toEqual({
        tenant_id: 'test-tenant',
        deployment_id: 'test-deployment',
      });
      expect(
        sqlite.prepare('SELECT COUNT(*) count FROM migration_contract_metadata').get(),
      ).toEqual({ count: 12 });
      for (const [table, columns] of Object.entries(TABLES))
        expect(projection(sqlite, table, columns), table).toEqual(beforeProjections[table]);
      expect(
        sqlite.prepare('SELECT status FROM legal_entity WHERE id=?').get('legacy-entity'),
      ).toEqual({
        status: 'active',
      });
      expect(sqlite.prepare('SELECT COUNT(*) count FROM localized_pdf_variant').get()).toEqual({
        count: 0,
      });
      expect(
        sqlite
          .prepare('SELECT billing_address,po_reference FROM client WHERE id=?')
          .get('legacy-client'),
      ).toEqual({ billing_address: null, po_reference: null });
      expect(
        sqlite
          .prepare(
            "SELECT contract_version,action,entity_type,actor_kind,owner_packet,data_classification FROM audit_action_registry WHERE action='invitation.accept'",
          )
          .get(),
      ).toEqual({
        contract_version: 'B5-R4',
        action: 'invitation.accept',
        entity_type: 'invitation',
        actor_kind: 'system',
        owner_packet: 'CE-CORE01',
        data_classification: 'confidential',
      });
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(sqlite)).toBe('ok');
    } finally {
      sqlite.close();
    }
  });

  it('upgrades a populated v23 copy and rolls back a failed v24 retry atomically', () => {
    process.env.JA_TENANT_ID = 'test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'test-deployment';
    const v23Migrations = copyMigrationTree(23);
    const allMigrations = copyMigrationTree();
    const directory = mkdtempSync(join(tmpdir(), 'ja-b5-v23-upgrade-'));
    tempDirectories.push(directory);
    const databasePath = join(directory, 'app.db');
    buildLegacyDatabase(databasePath);
    const before = new DatabaseSync(databasePath);
    const beforeProjections = Object.fromEntries(
      Object.entries(TABLES).map(([table, columns]) => [table, projection(before, table, columns)]),
    );
    before.close();

    process.env.JA_MIGRATIONS_PATH = v23Migrations;
    const v23 = createDatabase(databasePath);
    try {
      expect(
        v23.sqlite.prepare('SELECT MAX(version) max,COUNT(*) count FROM schema_migration').get(),
      ).toEqual({ max: 23, count: 23 });
      expect(
        v23.sqlite.prepare('SELECT COUNT(*) count FROM migration_contract_metadata').get(),
      ).toEqual({ count: 5 });
      expect(migrationMetadata(v23.sqlite)).toEqual([
        { migration_version: 19, migration_name: 'lifecycle_security' },
        { migration_version: 20, migration_name: 'finance_v2' },
        { migration_version: 21, migration_name: 'accounting_pack_artifacts' },
        { migration_version: 22, migration_name: 'report_registry' },
        { migration_version: 23, migration_name: 'localized_pdf_variants' },
      ]);
      for (const [table, columns] of Object.entries(TABLES))
        expect(projection(v23.sqlite, table, columns), table).toEqual(beforeProjections[table]);
    } finally {
      v23.sqlite.close();
    }

    process.env.JA_MIGRATIONS_PATH = allMigrations;
    const upgraded = createDatabase(databasePath);
    try {
      expect(
        upgraded.sqlite
          .prepare('SELECT MAX(version) max,COUNT(*) count FROM schema_migration')
          .get(),
      ).toEqual({ max: 30, count: 30 });
      expect(
        upgraded.sqlite.prepare('SELECT COUNT(*) count FROM migration_contract_metadata').get(),
      ).toEqual({ count: 12 });
      expect(migrationMetadata(upgraded.sqlite)).toEqual([
        { migration_version: 19, migration_name: 'lifecycle_security' },
        { migration_version: 20, migration_name: 'finance_v2' },
        { migration_version: 21, migration_name: 'accounting_pack_artifacts' },
        { migration_version: 22, migration_name: 'report_registry' },
        { migration_version: 23, migration_name: 'localized_pdf_variants' },
        { migration_version: 24, migration_name: 'accounting_pack_snapshot_bridge' },
        { migration_version: 25, migration_name: 'client_essential_client_fields' },
        { migration_version: 26, migration_name: 'client_essential_report_attachments' },
        {
          migration_version: 27,
          migration_name: 'client_essential_temporary_upload_cleanup',
        },
        { migration_version: 28, migration_name: 'client_essential_20260824' },
        { migration_version: 29, migration_name: 'period_report_reapproval' },
        { migration_version: 30, migration_name: 'period_report_source_binding' },
      ]);
      for (const [table, columns] of Object.entries(TABLES))
        expect(projection(upgraded.sqlite, table, columns), table).toEqual(
          beforeProjections[table],
        );
      expect(upgraded.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(upgraded.sqlite)).toBe('ok');
    } finally {
      upgraded.sqlite.close();
    }

    const rollbackPath = join(directory, 'rollback.db');
    buildLegacyDatabase(rollbackPath);
    process.env.JA_MIGRATIONS_PATH = v23Migrations;
    const rollbackV23 = createDatabase(rollbackPath);
    rollbackV23.sqlite.close();
    const conflicting = new DatabaseSync(rollbackPath);
    conflicting.exec('CREATE TABLE accounting_pack_legacy_run_bridge(id TEXT PRIMARY KEY) STRICT;');
    conflicting.close();

    process.env.JA_MIGRATIONS_PATH = allMigrations;
    expect(() => createDatabase(rollbackPath)).toThrow(/accounting_pack_legacy_run_bridge/u);
    const afterFailure = new DatabaseSync(rollbackPath);
    try {
      expect(
        afterFailure.prepare('SELECT MAX(version) max,COUNT(*) count FROM schema_migration').get(),
      ).toEqual({ max: 23, count: 23 });
      expect(
        afterFailure.prepare('SELECT COUNT(*) count FROM migration_contract_metadata').get(),
      ).toEqual({ count: 5 });
      expect(migrationMetadata(afterFailure)).toEqual([
        { migration_version: 19, migration_name: 'lifecycle_security' },
        { migration_version: 20, migration_name: 'finance_v2' },
        { migration_version: 21, migration_name: 'accounting_pack_artifacts' },
        { migration_version: 22, migration_name: 'report_registry' },
        { migration_version: 23, migration_name: 'localized_pdf_variants' },
      ]);
      expect(
        afterFailure
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN('legal_entity_revision_bridge','accounting_pack_revision_snapshot') ORDER BY name",
          )
          .all(),
      ).toEqual([]);
      expect(afterFailure.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(afterFailure)).toBe('ok');
      for (const [table, columns] of Object.entries(TABLES))
        expect(projection(afterFailure, table, columns), table).toEqual(beforeProjections[table]);
    } finally {
      afterFailure.close();
    }

    const removeConflict = new DatabaseSync(rollbackPath);
    removeConflict.exec('DROP TABLE accounting_pack_legacy_run_bridge');
    removeConflict.close();
    const retried = createDatabase(rollbackPath);
    try {
      expect(
        retried.sqlite
          .prepare('SELECT MAX(version) max,COUNT(*) count FROM schema_migration')
          .get(),
      ).toEqual({ max: 30, count: 30 });
      expect(
        retried.sqlite.prepare('SELECT COUNT(*) count FROM migration_contract_metadata').get(),
      ).toEqual({ count: 12 });
      expect(migrationMetadata(retried.sqlite)).toEqual([
        { migration_version: 19, migration_name: 'lifecycle_security' },
        { migration_version: 20, migration_name: 'finance_v2' },
        { migration_version: 21, migration_name: 'accounting_pack_artifacts' },
        { migration_version: 22, migration_name: 'report_registry' },
        { migration_version: 23, migration_name: 'localized_pdf_variants' },
        { migration_version: 24, migration_name: 'accounting_pack_snapshot_bridge' },
        { migration_version: 25, migration_name: 'client_essential_client_fields' },
        { migration_version: 26, migration_name: 'client_essential_report_attachments' },
        {
          migration_version: 27,
          migration_name: 'client_essential_temporary_upload_cleanup',
        },
        { migration_version: 28, migration_name: 'client_essential_20260824' },
        { migration_version: 29, migration_name: 'period_report_reapproval' },
        { migration_version: 30, migration_name: 'period_report_source_binding' },
      ]);
      expect(retried.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(retried.sqlite)).toBe('ok');
    } finally {
      retried.sqlite.close();
    }
  });

  it('upgrades a populated v22 copy with the historical metadata CHECK through 30', () => {
    process.env.JA_TENANT_ID = 'test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'test-deployment';
    const v22Migrations = copyMigrationTree(22);
    const allMigrations = copyMigrationTree();
    const directory = mkdtempSync(join(tmpdir(), 'ja-b5-v22-upgrade-'));
    tempDirectories.push(directory);
    const databasePath = join(directory, 'app.db');
    buildLegacyDatabase(databasePath);

    process.env.JA_MIGRATIONS_PATH = v22Migrations;
    const v22 = createDatabase(databasePath);
    const beforeMetadata = quotedMetadataRows(v22.sqlite);
    expect(beforeMetadata).toHaveLength(4);
    expect(
      v22.sqlite
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='migration_contract_metadata'",
        )
        .get(),
    ).toMatchObject({ sql: expect.stringContaining('BETWEEN 19 AND 23') });
    rewriteV22MetadataConstraint(v22.sqlite);
    expect(
      v22.sqlite
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='migration_contract_metadata'",
        )
        .get(),
    ).toMatchObject({ sql: expect.stringContaining('BETWEEN 19 AND 22') });
    expect(v22.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    v22.sqlite.close();

    process.env.JA_MIGRATIONS_PATH = allMigrations;
    const upgraded = createDatabase(databasePath);
    try {
      expect(
        upgraded.sqlite
          .prepare('SELECT MAX(version) max,COUNT(*) count FROM schema_migration')
          .get(),
      ).toEqual({ max: 30, count: 30 });
      expect(quotedMetadataRows(upgraded.sqlite).slice(0, 4)).toEqual(beforeMetadata);
      expect(quotedMetadataRows(upgraded.sqlite)).toHaveLength(12);
      expect(
        upgraded.sqlite
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='migration_contract_metadata'",
          )
          .get(),
      ).toMatchObject({ sql: expect.stringContaining('BETWEEN 19 AND 30') });
      expect(upgraded.sqlite.prepare('PRAGMA foreign_key_list(finance_v2_cutover)').all()).toEqual([
        expect.objectContaining({
          table: 'migration_contract_metadata',
          from: 'migration_version',
          to: 'migration_version',
          on_update: 'RESTRICT',
          on_delete: 'RESTRICT',
        }),
      ]);
      expect(
        upgraded.sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN(?, ?, ?, ?) ORDER BY name",
          )
          .all(
            'migration_contract_metadata_no_delete',
            'migration_contract_metadata_no_update',
            'finance_v2_cutover_no_delete',
            'finance_v2_cutover_no_update',
          )
          .map((row) => (row as { name: string }).name),
      ).toEqual([
        'finance_v2_cutover_no_delete',
        'finance_v2_cutover_no_update',
        'migration_contract_metadata_no_delete',
        'migration_contract_metadata_no_update',
      ]);
      expect(upgraded.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(integrityCheck(upgraded.sqlite)).toBe('ok');
    } finally {
      upgraded.sqlite.close();
    }
  });

  it.each([
    [
      'SQL bytes',
      (directory: string) => {
        const path = join(directory, CONTRACT_FILES[0]);
        const bytes = readFileSync(path);
        bytes[bytes.length - 1] ^= 1;
        writeFileSync(path, bytes);
      },
      'MIGRATION_CONTRACT_SQL_TAMPERED',
    ],
    [
      '0024 SQL bytes',
      (directory: string) => {
        const path = join(directory, CONTRACT_FILES[5]);
        const bytes = readFileSync(path);
        bytes[bytes.length - 1] ^= 1;
        writeFileSync(path, bytes);
      },
      'MIGRATION_CONTRACT_SQL_TAMPERED',
    ],
    [
      'CRLF conversion',
      (directory: string) => {
        const path = join(directory, CONTRACT_FILES[0]);
        writeFileSync(path, readFileSync(path, 'utf8').replace(/\n/g, '\r\n'), 'utf8');
      },
      'MIGRATION_CONTRACT_SQL_TAMPERED',
    ],
    [
      'file name',
      (directory: string) => {
        const path = join(directory, CONTRACT_FILES[0]);
        const renamed = join(directory, '0019_tampered.sql');
        copyFileSync(path, renamed);
        rmSync(path);
      },
      'MIGRATION_CONTRACT_FILE_MISMATCH',
    ],
    [
      'manifest bytes',
      (directory: string) => {
        const bytes = readFileSync(join(directory, 'contracts/ja-b5-migration-contract-v1.json'));
        bytes[bytes.length - 2] ^= 1;
        writeFileSync(join(directory, 'contracts/ja-b5-migration-contract-v1.json'), bytes);
      },
      'MIGRATION_CONTRACT_MANIFEST_TAMPERED',
    ],
  ])('fails closed on %s before applying B5 SQL', (_label, mutate, errorCode) => {
    process.env.JA_TENANT_ID = 'test-tenant';
    process.env.JA_DEPLOYMENT_ID = 'test-deployment';
    const migrationDirectory = copyMigrationTree();
    mutate(migrationDirectory);
    const directory = mkdtempSync(join(tmpdir(), 'ja-b5-tamper-'));
    tempDirectories.push(directory);
    const databasePath = join(directory, 'app.db');
    buildLegacyDatabase(databasePath);
    process.env.JA_MIGRATIONS_PATH = migrationDirectory;
    expect(() => createDatabase(databasePath)).toThrow(new RegExp(errorCode));
    const sqlite = new DatabaseSync(databasePath);
    try {
      expect(sqlite.prepare('SELECT MAX(version) version FROM schema_migration').get()).toEqual({
        version: 18,
      });
      expect(
        sqlite
          .prepare("SELECT name FROM sqlite_master WHERE name='migration_contract_metadata'")
          .get(),
      ).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });
});
