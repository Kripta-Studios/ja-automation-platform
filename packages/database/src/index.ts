import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statfsSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, parse, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

type DeploymentIdentity = Readonly<{ tenantId: string; deploymentId: string }>;

const DEPLOYMENT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;

function resolveRequiredDeploymentIdentity(): DeploymentIdentity {
  const read = (name: 'JA_TENANT_ID' | 'JA_DEPLOYMENT_ID'): string => {
    const value = process.env[name];
    if (!value || value !== value.trim() || !DEPLOYMENT_ID_PATTERN.test(value)) {
      throw new Error(`${name} must be configured as a lowercase deployment identifier`);
    }
    return value;
  };
  return { tenantId: read('JA_TENANT_ID'), deploymentId: read('JA_DEPLOYMENT_ID') };
}

export function deploymentIdentityFromEnvironment(): DeploymentIdentity {
  return resolveRequiredDeploymentIdentity();
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Legacy JSON contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  throw new Error('Unsupported legacy JSON value');
}

function canonicalJsonHash(value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Legacy offline payload/result is not valid JSON');
  }
  return sha256(canonicalJson(parsed));
}

function installMigrationFunctions(sqlite: DatabaseSync): void {
  // 0020 validates every finance evidence blob with this deterministic UDF.
  // Register it on the same connection before any reviewed B5 SQL executes.
  sqlite.function('ja_finance_hash_v1', { deterministic: true }, (value: unknown): string => {
    if (typeof value === 'string') return sha256(value);
    if (value instanceof Uint8Array) return sha256(value);
    throw new Error('Finance evidence hash requires a text or blob value');
  });
}

function assertExistingDeploymentIdentity(
  sqlite: DatabaseSync,
  identity: DeploymentIdentity,
): void {
  const table = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='deployment_identity'")
    .get() as { name: string } | undefined;
  if (!table) return;
  const existing = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as { tenant_id: string; deployment_id: string } | undefined;
  if (!existing) throw new Error('DEPLOYMENT_IDENTITY_MISSING');
  if (existing.tenant_id !== identity.tenantId || existing.deployment_id !== identity.deploymentId)
    throw new Error('DEPLOYMENT_IDENTITY_MISMATCH');
}

function createMigrationContext(sqlite: DatabaseSync, identity: DeploymentIdentity): void {
  sqlite.exec('DROP TABLE IF EXISTS temp.ja_migration_context');
  sqlite.exec('DROP TABLE IF EXISTS temp.technical_report_date_backfill');
  sqlite.exec('DROP TABLE IF EXISTS temp.legacy_offline_hash_backfill');
  sqlite.exec('DROP TABLE IF EXISTS temp.legacy_audit_registry_backfill');
  sqlite.exec(`
    CREATE TEMP TABLE ja_migration_context(
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      tenant_id TEXT NOT NULL,
      deployment_id TEXT NOT NULL
    );
    CREATE TEMP TABLE technical_report_date_backfill(
      report_id TEXT PRIMARY KEY NOT NULL,
      report_date TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TEMP TABLE legacy_offline_hash_backfill(
      source_table TEXT NOT NULL CHECK(source_table IN ('offline_mutation','mutation_receipt')),
      mutation_id TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
      result_sha256 TEXT NOT NULL CHECK(length(result_sha256)=64),
      PRIMARY KEY(source_table,mutation_id)
    ) WITHOUT ROWID;
    CREATE TEMP TABLE legacy_audit_registry_backfill(
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user','service','system')),
      source_location_sha256 TEXT NOT NULL CHECK(length(source_location_sha256)=64),
      PRIMARY KEY(action,entity_type,actor_kind)
    ) WITHOUT ROWID;
  `);
  sqlite
    .prepare(
      'INSERT INTO temp.ja_migration_context(singleton,tenant_id,deployment_id) VALUES(1,?,?)',
    )
    .run(identity.tenantId, identity.deploymentId);

  const reportRows = sqlite
    .prepare(
      `SELECT tr.id,tr.created_at,p.timezone
       FROM technical_report tr JOIN project p ON p.id=tr.project_id
       ORDER BY tr.id`,
    )
    .all() as Array<{ id: string; created_at: string; timezone: string }>;
  const insertReportDate = sqlite.prepare(
    'INSERT INTO temp.technical_report_date_backfill(report_id,report_date) VALUES(?,?)',
  );
  for (const row of reportRows) {
    const instant = new Date(row.created_at);
    if (Number.isNaN(instant.valueOf()))
      throw new Error(`Invalid technical report timestamp: ${row.id}`);
    let reportDate: string;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: row.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(instant);
      const values = new Map(parts.map((part) => [part.type, part.value]));
      reportDate = `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
    } catch {
      throw new Error(`Invalid project timezone for technical report: ${row.id}`);
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) ||
      Number.isNaN(Date.parse(`${reportDate}T00:00:00Z`))
    )
      throw new Error(`Invalid technical report date: ${row.id}`);
    insertReportDate.run(row.id, reportDate);
  }
  if (
    reportRows.length !==
    Number(
      (sqlite.prepare('SELECT count(*) count FROM technical_report').get() as { count: number })
        .count,
    )
  )
    throw new Error('TECHNICAL_REPORT_BACKFILL_COUNT_MISMATCH');

  const insertOfflineHash = sqlite.prepare(
    'INSERT INTO temp.legacy_offline_hash_backfill(source_table,mutation_id,payload_sha256,result_sha256) VALUES(?,?,?,?)',
  );
  const offlineRows = sqlite
    .prepare(
      'SELECT mutation_id,payload_json,result_json FROM offline_mutation ORDER BY mutation_id',
    )
    .all() as Array<{ mutation_id: string; payload_json: string; result_json: string }>;
  for (const row of offlineRows)
    insertOfflineHash.run(
      'offline_mutation',
      row.mutation_id,
      canonicalJsonHash(row.payload_json),
      canonicalJsonHash(row.result_json),
    );
  const receiptRows = sqlite
    .prepare('SELECT mutation_id,result_json FROM mutation_receipt ORDER BY mutation_id')
    .all() as Array<{ mutation_id: string; result_json: string }>;
  const legacyPayloadHash = (mutationId: string): string => {
    const source = offlineRows.find((row) => row.mutation_id === mutationId);
    return source
      ? canonicalJsonHash(source.payload_json)
      : sha256(JSON.stringify({ legacyMutationId: mutationId, provenance: 'payload_unavailable' }));
  };
  for (const row of receiptRows)
    insertOfflineHash.run(
      'mutation_receipt',
      row.mutation_id,
      legacyPayloadHash(row.mutation_id),
      canonicalJsonHash(row.result_json),
    );
  if (
    offlineRows.length !==
    Number(
      (sqlite.prepare('SELECT count(*) count FROM offline_mutation').get() as { count: number })
        .count,
    )
  )
    throw new Error('OFFLINE_MUTATION_BACKFILL_COUNT_MISMATCH');
  if (
    receiptRows.length !==
    Number(
      (sqlite.prepare('SELECT count(*) count FROM mutation_receipt').get() as { count: number })
        .count,
    )
  )
    throw new Error('MUTATION_RECEIPT_BACKFILL_COUNT_MISMATCH');

  const insertAudit = sqlite.prepare(
    'INSERT INTO temp.legacy_audit_registry_backfill(action,entity_type,actor_kind,source_location_sha256) VALUES(?,?,?,?)',
  );
  const auditRows = sqlite
    .prepare(
      `SELECT DISTINCT action,entity_type,
         CASE WHEN actor_id IS NULL THEN 'system' ELSE 'user' END actor_kind
       FROM audit_event ORDER BY action,entity_type,actor_kind`,
    )
    .all() as Array<{
    action: string;
    entity_type: string;
    actor_kind: 'user' | 'service' | 'system';
  }>;
  for (const row of auditRows)
    insertAudit.run(
      row.action,
      row.entity_type,
      row.actor_kind,
      sha256(`legacy-v1:${row.action}:${row.entity_type}:${row.actor_kind}`),
    );
}

const REVIEWED_B5_MIGRATION_NAMES: Readonly<Record<number, string>> = {
  19: 'lifecycle_security',
  20: 'finance_v2',
  21: 'accounting_pack_artifacts',
  22: 'report_registry',
  23: 'localized_pdf_variants',
  24: 'accounting_pack_snapshot_bridge',
  25: 'client_essential_client_fields',
  26: 'client_essential_report_attachments',
  27: 'client_essential_temporary_upload_cleanup',
};

const MIGRATION_CONTRACT_VERSION = 'ja-migration-contract-v1';
const MIGRATION_CONTRACT_MANIFEST_RELATIVE_PATH = 'contracts/ja-b5-migration-contract-v1.json';
// This is deliberately checked in rather than calculated from the manifest at
// startup.  The manifest is a release artifact: changing it without changing
// this constant fails closed before any migration SQL can run.
export const MIGRATION_CONTRACT_MANIFEST_SHA256 =
  'f871e5401e63d4d7c4f7a43ab8f25970a32a4649188dafb4560dd0d38e5620bb';

type MigrationContractEntry = Readonly<{
  version: number;
  canonicalName: string;
  file: string;
  sha256: string;
  descriptor: string;
  descriptorSha256: string;
  projectionSha256: string;
  vectorSha256: string;
  encoderSha256: string;
  runnerSha256: string;
  heartbeatWorkerSha256: string;
  preProjectionSha256: string;
  postProjectionSha256: string;
}>;

type MigrationContractManifest = Readonly<{
  contractVersion: string;
  manifestVersion: number;
  migrations: readonly MigrationContractEntry[];
}>;

type LoadedMigrationContract = Readonly<{
  manifest: MigrationContractManifest;
  bytes: Buffer;
  sha256: string;
  entriesByVersion: ReadonlyMap<number, MigrationContractEntry>;
}>;

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMigrationContract(migrationDirectory: string): LoadedMigrationContract {
  const manifestPath = resolve(migrationDirectory, MIGRATION_CONTRACT_MANIFEST_RELATIVE_PATH);
  let bytes: Buffer;
  try {
    bytes = readFileSync(manifestPath);
  } catch {
    throw new Error(`MIGRATION_CONTRACT_MANIFEST_MISSING: ${manifestPath}`);
  }
  const manifestHash = sha256(bytes);
  if (manifestHash !== MIGRATION_CONTRACT_MANIFEST_SHA256)
    throw new Error('MIGRATION_CONTRACT_MANIFEST_TAMPERED');

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('MIGRATION_CONTRACT_MANIFEST_INVALID_JSON');
  }
  if (
    !isRecord(parsed) ||
    parsed.contractVersion !== MIGRATION_CONTRACT_VERSION ||
    parsed.contractDescriptor !==
      'J&A B5 migration contract v1; SQL hashes cover exact shipped bytes'
  )
    throw new Error('MIGRATION_CONTRACT_VERSION_MISMATCH');
  if (parsed.manifestVersion !== 1 || !Array.isArray(parsed.migrations))
    throw new Error('MIGRATION_CONTRACT_MANIFEST_SHAPE_INVALID');

  const entries: MigrationContractEntry[] = [];
  const versions = new Set<number>();
  const files = new Set<string>();
  for (const candidate of parsed.migrations) {
    if (!isRecord(candidate)) throw new Error('MIGRATION_CONTRACT_ENTRY_INVALID');
    const fields = [
      'sha256',
      'descriptorSha256',
      'projectionSha256',
      'vectorSha256',
      'encoderSha256',
      'runnerSha256',
      'heartbeatWorkerSha256',
      'preProjectionSha256',
      'postProjectionSha256',
    ] as const;
    if (
      typeof candidate.version !== 'number' ||
      !Number.isInteger(candidate.version) ||
      typeof candidate.canonicalName !== 'string' ||
      typeof candidate.file !== 'string' ||
      typeof candidate.descriptor !== 'string' ||
      fields.some((field) => !isSha256(candidate[field]))
    )
      throw new Error('MIGRATION_CONTRACT_ENTRY_INVALID');
    const entry = candidate as unknown as MigrationContractEntry;
    const expectedName = REVIEWED_B5_MIGRATION_NAMES[entry.version];
    if (!expectedName || expectedName !== entry.canonicalName)
      throw new Error(`MIGRATION_CONTRACT_NAME_MISMATCH: ${entry.version}`);
    if (entry.file !== `${String(entry.version).padStart(4, '0')}_${entry.canonicalName}.sql`)
      throw new Error(`MIGRATION_CONTRACT_FILE_MISMATCH: ${entry.version}`);
    if (versions.has(entry.version) || files.has(entry.file))
      throw new Error(`MIGRATION_CONTRACT_DUPLICATE: ${entry.version}`);
    if (sha256(entry.descriptor) !== entry.descriptorSha256)
      throw new Error(`MIGRATION_CONTRACT_DESCRIPTOR_MISMATCH: ${entry.version}`);
    versions.add(entry.version);
    files.add(entry.file);
    entries.push(entry);
  }

  const expectedVersions = Object.keys(REVIEWED_B5_MIGRATION_NAMES).map(Number);
  if (
    entries.length !== expectedVersions.length ||
    expectedVersions.some((version) => !versions.has(version))
  )
    throw new Error('MIGRATION_CONTRACT_VERSION_SET_MISMATCH');
  return {
    manifest: parsed as unknown as MigrationContractManifest,
    bytes,
    sha256: MIGRATION_CONTRACT_MANIFEST_SHA256,
    entriesByVersion: new Map(entries.map((entry) => [entry.version, entry])),
  };
}

function verifyMigrationSql(
  contract: LoadedMigrationContract,
  file: string,
  bytes: Buffer,
): MigrationContractEntry {
  const match = /^(\d{4})_(.+)\.sql$/u.exec(file);
  if (!match) throw new Error(`UNREVIEWED_B5_MIGRATION: ${file}`);
  const version = Number(match[1]);
  const entry = contract.entriesByVersion.get(version);
  if (!entry || entry.file !== file || entry.canonicalName !== match[2])
    throw new Error(`MIGRATION_CONTRACT_FILE_MISMATCH: ${file}`);
  const actualHash = sha256(bytes);
  if (actualHash !== entry.sha256) throw new Error(`MIGRATION_CONTRACT_SQL_TAMPERED: ${file}`);
  return entry;
}

function recordMigrationMetadata(
  sqlite: DatabaseSync,
  version: number,
  entry: MigrationContractEntry,
  manifestBytes: Buffer,
  manifestSha256: string,
  appliedAt: string,
): void {
  const insert = sqlite.prepare(
    `INSERT INTO migration_contract_metadata(
       migration_version,migration_name,descriptor_version,descriptor_sha256,sql_sha256,
       projection_sha256,vector_sha256,encoder_sha256,runner_sha256,heartbeat_worker_sha256,
       schema_hash_manifest,schema_hash_manifest_sha256,pre_projection_sha256,post_projection_sha256,
       node_version,sqlite_version,applied_at
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  insert.run(
    version,
    entry.canonicalName,
    MIGRATION_CONTRACT_VERSION,
    entry.descriptorSha256,
    entry.sha256,
    entry.projectionSha256,
    entry.vectorSha256,
    entry.encoderSha256,
    entry.runnerSha256,
    entry.heartbeatWorkerSha256,
    manifestBytes,
    manifestSha256,
    entry.preProjectionSha256,
    entry.postProjectionSha256,
    process.version,
    String(
      (sqlite.prepare('SELECT sqlite_version() version').get() as { version: string }).version,
    ),
    appliedAt,
  );
}

const MIGRATION_METADATA_COLUMNS = [
  'migration_version',
  'migration_name',
  'descriptor_version',
  'descriptor_sha256',
  'sql_sha256',
  'projection_sha256',
  'vector_sha256',
  'encoder_sha256',
  'runner_sha256',
  'heartbeat_worker_sha256',
  'schema_hash_manifest',
  'schema_hash_manifest_sha256',
  'pre_projection_sha256',
  'post_projection_sha256',
  'node_version',
  'sqlite_version',
  'applied_at',
] as const;

const FINANCE_CUTOVER_COLUMNS = [
  'singleton',
  'migration_version',
  'descriptor_sha256',
  'cutover_at',
] as const;

type TriggerDefinition = Readonly<{ name: string; sql: string }>;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function readTriggerDefinitions(sqlite: DatabaseSync, table: string): TriggerDefinition[] {
  const rows = sqlite
    .prepare(
      `SELECT name,sql FROM sqlite_master
       WHERE type='trigger' AND tbl_name=? ORDER BY name`,
    )
    .all(table) as Array<{ name: string; sql: string | null }>;
  if (rows.some((row) => !row.sql)) throw new Error(`MIGRATION_METADATA_TRIGGER_INVALID: ${table}`);
  return rows.map((row) => ({ name: row.name, sql: row.sql as string }));
}

function quotedRows(
  sqlite: DatabaseSync,
  table: string,
  columns: readonly string[],
  orderBy: string,
): Array<Record<string, string>> {
  const projection = columns
    .map((column) => `quote(${quoteIdentifier(column)}) AS ${quoteIdentifier(column)}`)
    .join(',');
  return sqlite
    .prepare(
      `SELECT ${projection} FROM ${quoteIdentifier(table)} ORDER BY ${quoteIdentifier(orderBy)}`,
    )
    .all() as Array<Record<string, string>>;
}

function tableExists(sqlite: DatabaseSync, table: string): boolean {
  return Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),
  );
}

function metadataAllowsLocalizedPdfEvidence(sqlite: DatabaseSync): boolean {
  const row = sqlite
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='migration_contract_metadata'",
    )
    .get() as { sql: string | null } | undefined;
  if (!row?.sql) throw new Error('MIGRATION_METADATA_TABLE_MISSING');
  // v22 databases created before the metadata contract was widened contain
  // BETWEEN 19 AND 22 and do not list localized_pdf_variants.  Do not infer
  // compatibility from the current migration files: the existing database's
  // DDL is the source of truth for this preflight.
  return (
    /CHECK\s*\(\s*migration_version\s+BETWEEN\s+19\s+AND\s+23\s*\)/iu.test(row.sql) &&
    row.sql.includes("'localized_pdf_variants'")
  );
}

function prepareLegacyMetadataForLocalizedPdf(sqlite: DatabaseSync): void {
  if (metadataAllowsLocalizedPdfEvidence(sqlite)) return;
  if (!tableExists(sqlite, 'finance_v2_cutover'))
    throw new Error('MIGRATION_METADATA_FINANCE_CUTOVER_MISSING');
  if (tableExists(sqlite, 'migration_contract_metadata_v22_preflight'))
    throw new Error('MIGRATION_METADATA_PREFLIGHT_TABLE_EXISTS');
  if (tableExists(sqlite, 'finance_v2_cutover_v20_preflight'))
    throw new Error('MIGRATION_FINANCE_CUTOVER_PREFLIGHT_TABLE_EXISTS');

  const metadataInfo = sqlite
    .prepare('PRAGMA table_info(migration_contract_metadata)')
    .all() as Array<{ name: string }>;
  if (
    metadataInfo.map((column) => column.name).join('\u0000') !==
    MIGRATION_METADATA_COLUMNS.join('\u0000')
  )
    throw new Error('MIGRATION_METADATA_SCHEMA_UNSUPPORTED');
  const cutoverInfo = sqlite.prepare('PRAGMA table_info(finance_v2_cutover)').all() as Array<{
    name: string;
  }>;
  if (
    cutoverInfo.map((column) => column.name).join('\u0000') !==
    FINANCE_CUTOVER_COLUMNS.join('\u0000')
  )
    throw new Error('MIGRATION_FINANCE_CUTOVER_SCHEMA_UNSUPPORTED');

  const foreignKeys = sqlite.prepare('PRAGMA foreign_key_list(finance_v2_cutover)').all() as Array<{
    table: string;
    from: string;
    to: string;
    on_update: string;
    on_delete: string;
  }>;
  if (
    foreignKeys.length !== 1 ||
    foreignKeys[0]?.table !== 'migration_contract_metadata' ||
    foreignKeys[0]?.from !== 'migration_version' ||
    foreignKeys[0]?.to !== 'migration_version' ||
    foreignKeys[0]?.on_update !== 'RESTRICT' ||
    foreignKeys[0]?.on_delete !== 'RESTRICT'
  )
    throw new Error('MIGRATION_METADATA_FK_TOPOLOGY_UNSUPPORTED');

  const metadataTriggers = readTriggerDefinitions(sqlite, 'migration_contract_metadata');
  const cutoverTriggers = readTriggerDefinitions(sqlite, 'finance_v2_cutover');
  if (
    metadataTriggers.length === 0 ||
    cutoverTriggers.length === 0 ||
    !metadataTriggers.some((trigger) => trigger.name === 'migration_contract_metadata_no_update') ||
    !metadataTriggers.some((trigger) => trigger.name === 'migration_contract_metadata_no_delete') ||
    !cutoverTriggers.some((trigger) => trigger.name === 'finance_v2_cutover_no_update') ||
    !cutoverTriggers.some((trigger) => trigger.name === 'finance_v2_cutover_no_delete')
  )
    throw new Error('MIGRATION_METADATA_TRIGGER_TOPOLOGY_UNSUPPORTED');

  const metadataBefore = quotedRows(
    sqlite,
    'migration_contract_metadata',
    MIGRATION_METADATA_COLUMNS,
    'migration_version',
  );
  const cutoverBefore = quotedRows(
    sqlite,
    'finance_v2_cutover',
    FINANCE_CUTOVER_COLUMNS,
    'singleton',
  );

  for (const trigger of [...metadataTriggers, ...cutoverTriggers])
    sqlite.exec(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`);

  // SQLite rewrites child FKs when a parent table is renamed.  Rename the
  // child first, then the parent, so both legacy tables remain coherent while
  // the new parent/child pair is built.  The surrounding migration transaction
  // makes every DDL/data step atomic and recoverable.
  sqlite.exec(
    'ALTER TABLE finance_v2_cutover RENAME TO finance_v2_cutover_v20_preflight;\n' +
      'ALTER TABLE migration_contract_metadata RENAME TO migration_contract_metadata_v22_preflight;',
  );
  sqlite.exec(`
    CREATE TABLE migration_contract_metadata(
      migration_version INTEGER PRIMARY KEY CHECK(migration_version BETWEEN 19 AND 24),
      migration_name TEXT NOT NULL UNIQUE CHECK(migration_name IN(
        'lifecycle_security','finance_v2','accounting_pack_artifacts','report_registry',
        'localized_pdf_variants','accounting_pack_snapshot_bridge'
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
    INSERT INTO migration_contract_metadata(
      ${MIGRATION_METADATA_COLUMNS.join(',')}
    ) SELECT ${MIGRATION_METADATA_COLUMNS.join(',')}
      FROM migration_contract_metadata_v22_preflight;
  `);
  sqlite.exec(`
    CREATE TABLE finance_v2_cutover(
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      migration_version INTEGER NOT NULL CHECK(migration_version=20)
        REFERENCES migration_contract_metadata(migration_version) ON UPDATE RESTRICT ON DELETE RESTRICT,
      descriptor_sha256 TEXT NOT NULL CHECK(length(descriptor_sha256)=64),
      cutover_at TEXT NOT NULL
    ) STRICT;
    INSERT INTO finance_v2_cutover(${FINANCE_CUTOVER_COLUMNS.join(',')})
      SELECT ${FINANCE_CUTOVER_COLUMNS.join(',')} FROM finance_v2_cutover_v20_preflight;
    DROP TABLE finance_v2_cutover_v20_preflight;
    DROP TABLE migration_contract_metadata_v22_preflight;
  `);

  for (const trigger of [...metadataTriggers, ...cutoverTriggers]) sqlite.exec(trigger.sql);

  const metadataAfter = quotedRows(
    sqlite,
    'migration_contract_metadata',
    MIGRATION_METADATA_COLUMNS,
    'migration_version',
  );
  const cutoverAfter = quotedRows(
    sqlite,
    'finance_v2_cutover',
    FINANCE_CUTOVER_COLUMNS,
    'singleton',
  );
  if (JSON.stringify(metadataAfter) !== JSON.stringify(metadataBefore))
    throw new Error('MIGRATION_METADATA_PREFLIGHT_DATA_CHANGED');
  if (JSON.stringify(cutoverAfter) !== JSON.stringify(cutoverBefore))
    throw new Error('MIGRATION_FINANCE_CUTOVER_PREFLIGHT_DATA_CHANGED');
  if (sqlite.prepare('PRAGMA foreign_key_check').all().length !== 0)
    throw new Error('MIGRATION_METADATA_PREFLIGHT_FK_CHECK_FAILED');
}

function applyB5Migration(
  sqlite: DatabaseSync,
  version: number,
  entry: MigrationContractEntry,
  sql: string,
  identity: DeploymentIdentity,
  manifestBytes: Buffer,
  manifestSha256: string,
): void {
  sqlite.exec('BEGIN IMMEDIATE');
  let committed = false;
  try {
    if (version === 19) {
      createMigrationContext(sqlite, identity);
    } else {
      assertExistingDeploymentIdentity(sqlite, identity);
    }
    sqlite.exec(sql);
    if (version === 23) prepareLegacyMetadataForLocalizedPdf(sqlite);
    const appliedAt = new Date().toISOString();
    // Every reviewed migration covered by the frozen manifest records the
    // exact contract evidence that was used to authorize its execution.
    recordMigrationMetadata(sqlite, version, entry, manifestBytes, manifestSha256, appliedAt);
    sqlite
      .prepare('INSERT INTO schema_migration(version,applied_at) VALUES(?,?)')
      .run(version, appliedAt);
    if (version === 20) {
      sqlite
        .prepare(
          `INSERT INTO finance_v2_cutover(singleton,migration_version,descriptor_sha256,cutover_at)
           SELECT 1,migration_version,descriptor_sha256,applied_at
           FROM migration_contract_metadata WHERE migration_version=20`,
        )
        .run();
    }
    sqlite.exec('COMMIT');
    committed = true;
  } finally {
    if (!committed) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        // Preserve the migration failure.
      }
    }
    if (version === 19) {
      sqlite.exec('DROP TABLE IF EXISTS temp.ja_migration_context');
      sqlite.exec('DROP TABLE IF EXISTS temp.technical_report_date_backfill');
      sqlite.exec('DROP TABLE IF EXISTS temp.legacy_offline_hash_backfill');
      sqlite.exec('DROP TABLE IF EXISTS temp.legacy_audit_registry_backfill');
    }
  }
}

export function openDatabase(
  path = process.env.JA_DATABASE_PATH ?? resolve(process.cwd(), 'data/app.db'),
): DatabaseSync {
  if (!path.startsWith(':')) mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec(
    'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
  );
  const defensive = sqlite as DatabaseSync & { enableDefensive?: (enabled: boolean) => void };
  defensive.enableDefensive?.(true);
  return sqlite;
}

export function migrate(sqlite: DatabaseSync): void {
  const configured = process.env.JA_MIGRATIONS_PATH;
  const candidates = configured
    ? [resolve(configured)]
    : [resolve(process.cwd(), 'migrations'), resolve(process.cwd(), '../../migrations')];
  const migrationDirectory = candidates.find((value) => existsSync(value));
  if (!migrationDirectory) throw new Error('Migration directory was not found');
  const files = readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  if (files.length === 0) throw new Error('No reviewed SQL migrations were found');
  const hasB5Files = files.some((file) => Number(file.slice(0, 4)) >= 19);
  const migrationContract = hasB5Files ? readMigrationContract(migrationDirectory) : undefined;
  const verifiedB5Files = new Map<string, { bytes: Buffer; entry: MigrationContractEntry }>();
  if (migrationContract) {
    for (const file of files) {
      if (Number(file.slice(0, 4)) < 19) continue;
      const bytes = readFileSync(resolve(migrationDirectory, file));
      verifiedB5Files.set(file, {
        bytes,
        entry: verifyMigrationSql(migrationContract, file, bytes),
      });
    }
  }
  installMigrationFunctions(sqlite);
  const hasMigrationTable = Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migration'")
      .get(),
  );
  const applied = new Set<number>(
    hasMigrationTable
      ? (
          sqlite.prepare('SELECT version FROM schema_migration').all() as Array<{ version: number }>
        ).map((row) => row.version)
      : [],
  );
  const identity = resolveRequiredDeploymentIdentity();
  assertExistingDeploymentIdentity(sqlite, identity);
  for (const file of files) {
    const version = Number(file.slice(0, 4));
    if (applied.has(version)) continue;
    if (version >= 19) {
      const verified = verifiedB5Files.get(file);
      if (!verified || !migrationContract) throw new Error(`UNREVIEWED_B5_MIGRATION: ${file}`);
      applyB5Migration(
        sqlite,
        version,
        verified.entry,
        verified.bytes.toString('utf8'),
        identity,
        migrationContract.bytes,
        migrationContract.sha256,
      );
    } else {
      sqlite.exec(readFileSync(resolve(migrationDirectory, file), 'utf8'));
    }
  }
  assertExistingDeploymentIdentity(sqlite, identity);
  const finalVersion = Number(
    (
      sqlite.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migration').get() as {
        version: number;
      }
    ).version,
  );
  const expected = Number(files.at(-1)?.slice(0, 4) ?? 0);
  if (finalVersion !== expected) {
    throw new Error(`SCHEMA_VERSION_MISMATCH: expected ${expected}, received ${finalVersion}`);
  }
}

function migrationFiles(): readonly string[] {
  const configured = process.env.JA_MIGRATIONS_PATH;
  const candidates = [
    configured ? resolve(configured) : undefined,
    resolve(process.cwd(), 'migrations'),
    resolve(process.cwd(), '../../migrations'),
  ].filter((value): value is string => Boolean(value));
  const directory = candidates.find((value) => existsSync(value));
  if (!directory) return [];
  return readdirSync(directory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
}

export type ReviewedMigrationContractReadiness = Readonly<{
  directory: string;
  expectedMigrationVersion: number;
  manifestSha256: string;
  reviewedMigrationFiles: readonly string[];
}>;

/**
 * Validate the exact reviewed migration release artifact before exposing a
 * readiness result. This deliberately reuses the same manifest and SQL hash
 * verifier used by migrate(); a filename with a high numeric version cannot
 * make an unreviewed migration set appear current.
 */
export function validateReviewedMigrationContract(
  migrationDirectory?: string,
): ReviewedMigrationContractReadiness {
  const configured = migrationDirectory ?? process.env.JA_MIGRATIONS_PATH;
  const candidates = configured
    ? [resolve(configured)]
    : [resolve(process.cwd(), 'migrations'), resolve(process.cwd(), '../../migrations')];
  const directory = candidates.find((value) => existsSync(value));
  if (!directory) throw new Error('MIGRATION_DIRECTORY_UNAVAILABLE');

  let files: string[];
  try {
    files = readdirSync(directory)
      .filter((file) => /^\d{4}_.+\.sql$/u.test(file))
      .sort();
  } catch {
    throw new Error('MIGRATION_DIRECTORY_UNREADABLE');
  }
  if (files.length === 0) throw new Error('MIGRATION_FILES_UNAVAILABLE');

  const hasReviewedFiles = files.some((file) => Number(file.slice(0, 4)) >= 19);
  if (!hasReviewedFiles) throw new Error('MIGRATION_CONTRACT_REQUIRED');

  const contract = readMigrationContract(directory);
  const expectedReviewedFiles = contract.manifest.migrations.map((entry) => entry.file);
  if (expectedReviewedFiles.some((file) => !files.includes(file)))
    throw new Error('MIGRATION_CONTRACT_FILE_MISSING');
  const reviewedMigrationFiles: string[] = [];
  for (const file of files) {
    if (Number(file.slice(0, 4)) < 19) continue;
    const bytes = readFileSync(resolve(directory, file));
    verifyMigrationSql(contract, file, bytes);
    reviewedMigrationFiles.push(file);
  }

  return {
    directory,
    expectedMigrationVersion: Number(files.at(-1)?.slice(0, 4) ?? 0),
    manifestSha256: contract.sha256,
    reviewedMigrationFiles,
  };
}

export function expectedMigrationVersion(): number {
  const versions = migrationFiles().map((file) => Number(file.slice(0, 4)));
  return versions.length ? Math.max(...versions) : 0;
}

export type DatabaseReadiness = Readonly<{
  ok: boolean;
  integrity: string;
  migrationVersion: number;
  expectedMigrationVersion: number;
  writableDirectories: boolean;
  writeReady: boolean;
  diskFreeBytes: number | null;
  diskFreeThresholdBytes: number;
}>;

function isRealDirectoryPath(path: string): boolean {
  const target = resolve(path);
  const anchor = parse(target).root;
  const components = relative(anchor, target).split(/[\\/]/u).filter(Boolean);
  let cursor = anchor;
  try {
    for (const component of components) {
      cursor = resolve(cursor, component);
      const stats = lstatSync(cursor);
      if (stats.isSymbolicLink() || !stats.isDirectory()) return false;
    }
    const targetStats = lstatSync(target);
    return !targetStats.isSymbolicLink() && targetStats.isDirectory();
  } catch {
    return false;
  }
}

const DEFAULT_MIN_FREE_BYTES = 1_073_741_824;
const INTEGER_BYTES_PATTERN = /^(?:0|[1-9]\d*)$/u;

export function readinessCheck(
  sqlite: DatabaseSync,
  documentRoot = process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT ?? 'data/documents',
): DatabaseReadiness {
  const integrity = integrityCheck(sqlite);
  const hasMigrationTable = Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migration'")
      .get(),
  );
  const migrationRow = hasMigrationTable
    ? (sqlite.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migration').get() as
        | { version: number }
        | undefined)
    : undefined;
  const migrationVersion = Number(migrationRow?.version ?? 0);
  const expected = expectedMigrationVersion();
  const directories = [
    'receipts',
    'reports',
    'invoices',
    'technical',
    'plc-backups',
    'exports',
    'temp',
  ];
  const writableDirectories = [
    documentRoot,
    ...directories.map((name) => resolve(documentRoot, name)),
  ].every((directory) => {
    try {
      if (!isRealDirectoryPath(directory)) return false;
      accessSync(directory, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  });
  let writeReady = false;
  try {
    sqlite.exec('BEGIN IMMEDIATE; ROLLBACK;');
    writeReady = true;
  } catch {
    try {
      sqlite.exec('ROLLBACK;');
    } catch {
      // Keep readiness failure contained; the original write error is reflected by writeReady.
    }
  }
  const configuredThreshold = process.env.JA_MIN_FREE_BYTES ?? String(DEFAULT_MIN_FREE_BYTES);
  const thresholdValid = INTEGER_BYTES_PATTERN.test(configuredThreshold);
  const parsedThreshold = Number(configuredThreshold);
  const diskFreeThresholdBytes =
    thresholdValid && Number.isSafeInteger(parsedThreshold) && parsedThreshold >= 0
      ? parsedThreshold
      : DEFAULT_MIN_FREE_BYTES;
  let diskFreeBytes: number | null = null;
  let diskReady = false;
  try {
    const stats = statfsSync(resolve(documentRoot));
    const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize);
    const safeMaximum = BigInt(Number.MAX_SAFE_INTEGER);
    diskFreeBytes = Number(freeBytes > safeMaximum ? safeMaximum : freeBytes);
    diskReady =
      thresholdValid &&
      Number.isSafeInteger(parsedThreshold) &&
      parsedThreshold >= 0 &&
      freeBytes >= BigInt(parsedThreshold);
  } catch {
    diskFreeBytes = null;
    diskReady = false;
  }
  return {
    ok:
      integrity === 'ok' &&
      migrationVersion === expected &&
      writableDirectories &&
      writeReady &&
      diskReady,
    integrity,
    migrationVersion,
    expectedMigrationVersion: expected,
    writableDirectories,
    writeReady,
    diskFreeBytes,
    diskFreeThresholdBytes,
  };
}

export function createDatabase(path?: string) {
  const sqlite = openDatabase(path);
  try {
    migrate(sqlite);
    return { sqlite };
  } catch (error) {
    try {
      sqlite.close();
    } catch {
      // Preserve the migration error; callers must never receive a half-open DB.
    }
    throw error;
  }
}

export function integrityCheck(sqlite: DatabaseSync): string {
  const result = sqlite.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  return result.integrity_check;
}

export * from './repository.ts';
export * from './v3-repository.ts';
export { recordAuditEvent } from './core/audit.ts';
export * from './domains/localized-artifacts/index.ts';
export * from './domains/accounting-pack/index.ts';
export {
  runDueConfiguredDurableJobs,
  type DurableJobCompletion,
  type DurableJobExecutionContext,
  type DurableJobOutcome,
} from './runner.ts';
