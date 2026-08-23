import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const createdDirectories: string[] = [];

function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function reviewedMigrationCopy(): string {
  const source = resolve(process.cwd(), 'migrations');
  const destination = mkdtempSync(join(tmpdir(), 'ja-accounting-pack-migrations-'));
  createdDirectories.push(destination);
  for (const file of readdirSync(source).filter((candidate) => {
    const version = Number(candidate.slice(0, 4));
    return /^\d{4}_.+\.sql$/u.test(candidate) && version <= 23;
  }))
    copyFileSync(join(source, file), join(destination, file));
  mkdirSync(join(destination, 'contracts'), { recursive: true });
  copyFileSync(
    join(source, 'contracts', 'ja-b5-migration-contract-v1.json'),
    join(destination, 'contracts', 'ja-b5-migration-contract-v1.json'),
  );
  return destination;
}

function createPre24Database() {
  const migrationPath = reviewedMigrationCopy();
  const previousMigrationPath = process.env.JA_MIGRATIONS_PATH;
  process.env.JA_MIGRATIONS_PATH = migrationPath;
  const directory = mkdtempSync(join(tmpdir(), 'ja-accounting-pack-bridge-'));
  createdDirectories.push(directory);
  const database = createDatabase(join(directory, 'app.db'));
  if (previousMigrationPath === undefined) delete process.env.JA_MIGRATIONS_PATH;
  else process.env.JA_MIGRATIONS_PATH = previousMigrationPath;
  return database.sqlite;
}

function createBridgeDatabase() {
  const sqlite = createPre24Database();
  // The contract owner deliberately has not added 0024 to the active manifest
  // in this focused test fixture.  Execute the additive SQL on the already
  // migrated connection so tests also exercise the registered hash UDF.
  sqlite.exec(
    readFileSync(
      resolve(process.cwd(), 'migrations/0024_accounting_pack_snapshot_bridge.sql'),
      'utf8',
    ),
  );
  return sqlite;
}

function insertCommand(
  sqlite: ReturnType<typeof createBridgeDatabase>,
  id: string,
  targetId: string,
  targetKind = 'accounting_pack_revision',
  state: 'completed' | 'pending' = 'completed',
  operation = targetKind === 'legal_entity_revision_bridge'
    ? 'legal_entity_revision_bridge.create'
    : targetKind === 'accounting_pack_revision_snapshot'
      ? 'accounting_pack_revision_snapshot.create'
      : targetKind === 'accounting_pack_legacy_run_bridge'
        ? 'accounting_pack_legacy_run_bridge.create'
        : 'test.create',
  targetContractVersion = targetKind === 'legal_entity_revision_bridge'
    ? 'legal-entity-revision-bridge-v1'
    : targetKind === 'accounting_pack_revision_snapshot'
      ? 'accounting-pack-revision-snapshot-v1'
      : targetKind === 'accounting_pack_legacy_run_bridge'
        ? 'accounting-pack-legacy-run-bridge-v1'
        : `${id}-target`,
): void {
  const now = new Date().toISOString();
  const insertEvidence = sqlite.prepare(
    `INSERT INTO finance_hash_evidence(
       evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
     ) VALUES(?,?,?,?,?,?,?)`,
  );
  const request = Buffer.from(`${id}:request`);
  const command = Buffer.from(`${id}:command`);
  insertEvidence.run(
    `${id}:request-evidence`,
    'finance_request',
    'test-b6',
    `${id}:request`,
    request,
    digest(request),
    now,
  );
  insertEvidence.run(
    `${id}:command-evidence`,
    'finance_command',
    'test-b6',
    `${id}:command`,
    command,
    digest(command),
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
      id,
      digest(request),
      digest(command),
      'test-tenant',
      'test-deployment',
      operation,
      `${id}:idempotency`,
      'owner',
      now,
      targetKind,
      targetId,
      null,
      null,
      digest(`${id}:payload`),
      digest(`${id}:session`),
      state,
      state === 'completed' ? now : null,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO finance_command_target(
         command_id,target_kind,target_semantic_id,target_contract_version
       ) VALUES(?,?,?,?)`,
    )
    .run(id, targetKind, targetId, targetContractVersion);
}

function insertAudit(
  sqlite: ReturnType<typeof createBridgeDatabase>,
  id: string,
  entityId: string,
  action = 'legal_entity.create',
  entityType = 'legal_entity',
  commandId?: string,
): void {
  const now = new Date().toISOString();
  const command = commandId
    ? (sqlite
        .prepare(
          `SELECT c.command_hash,c.target_kind,c.target_semantic_id,t.target_contract_version
           FROM finance_command c
           JOIN finance_command_target t ON t.command_id=c.command_id
           WHERE c.command_id=?`,
        )
        .get(commandId) as
        | {
            command_hash: string;
            target_kind: string;
            target_semantic_id: string;
            target_contract_version: string;
          }
        | undefined)
    : undefined;
  if (commandId && !command) throw new Error(`missing test command ${commandId}`);
  const detailsJson = command
    ? JSON.stringify({
        command_id: commandId,
        command_hash: command.command_hash,
        target_kind: command.target_kind,
        target_semantic_id: command.target_semantic_id,
        target_contract_version: command.target_contract_version,
      })
    : '{}';
  sqlite
    .prepare(
      `INSERT INTO audit_event(
         id,actor_id,action,entity_type,entity_id,occurred_at,details_json,
         audit_contract_version,actor_kind,tenant_id,deployment_id,correlation_id,provenance
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      'owner',
      action,
      entityType,
      entityId,
      now,
      detailsJson,
      'B5-R4',
      'user',
      'test-tenant',
      'test-deployment',
      commandId ?? `${id}:correlation`,
      'native',
    );
}

type SnapshotRowOverrides = Readonly<{
  revisionId?: string;
  snapshotJson?: string;
  snapshotSha256?: string;
  reconciliationJson?: string;
  reconciliationSha256?: string;
  commandId?: string;
  auditEventId?: string;
  currency?: string;
  timezone?: string;
  invoiceCount?: number;
  paymentCount?: number;
  workerCostCount?: number;
  expenseCount?: number;
  sourceItemCount?: number;
  invoiceSourceCount?: number;
  sourceMismatchCount?: number;
  approvedTimeEntryCount?: number;
  approvedExpenseCount?: number;
  netMinor?: number;
  taxMinor?: number;
  grossMinor?: number;
  collectedMinor?: number;
  outstandingMinor?: number;
  workerCostMinor?: number;
  expenseCostMinor?: number;
  directCostMinor?: number;
  contributionMinor?: number;
}>;

type SnapshotScalarValues = Readonly<{
  invoiceCount: number;
  paymentCount: number;
  workerCostCount: number;
  expenseCount: number;
  sourceItemCount: number;
  invoiceSourceCount: number;
  sourceMismatchCount: number;
  approvedTimeEntryCount: number;
  approvedExpenseCount: number;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  workerCostMinor: number;
  expenseCostMinor: number;
  directCostMinor: number;
  contributionMinor: number;
}>;

const DEFAULT_SNAPSHOT_SCALARS: SnapshotScalarValues = {
  invoiceCount: 0,
  paymentCount: 0,
  workerCostCount: 0,
  expenseCount: 0,
  sourceItemCount: 0,
  invoiceSourceCount: 0,
  sourceMismatchCount: 0,
  approvedTimeEntryCount: 0,
  approvedExpenseCount: 0,
  netMinor: 1000,
  taxMinor: 200,
  grossMinor: 1200,
  collectedMinor: 1500,
  outstandingMinor: 400,
  workerCostMinor: 200,
  expenseCostMinor: 100,
  directCostMinor: 300,
  contributionMinor: 700,
};

function reviewedSnapshotJson(values: SnapshotScalarValues): string {
  return JSON.stringify({
    schema_version: 'accounting-pack-snapshot-v1',
    period_start: '2026-01-01',
    period_end: '2026-02-01',
    currency: 'EUR',
    timezone: 'Europe/Madrid',
    invoice_count: values.invoiceCount,
    payment_count: values.paymentCount,
    worker_cost_count: values.workerCostCount,
    expense_count: values.expenseCount,
    source_item_count: values.sourceItemCount,
    invoice_source_count: values.invoiceSourceCount,
    source_mismatch_count: values.sourceMismatchCount,
    approved_time_entry_count: values.approvedTimeEntryCount,
    approved_expense_count: values.approvedExpenseCount,
    net_minor: values.netMinor,
    tax_minor: values.taxMinor,
    gross_minor: values.grossMinor,
    collected_minor: values.collectedMinor,
    outstanding_minor: values.outstandingMinor,
    worker_cost_minor: values.workerCostMinor,
    expense_cost_minor: values.expenseCostMinor,
    direct_cost_minor: values.directCostMinor,
    contribution_minor: values.contributionMinor,
    invoice_register: [],
    collections: [],
    worker_costs: [],
    expense_register: [],
    ledger: [],
    totals: {
      currency: 'EUR',
      net_minor: values.netMinor,
      tax_minor: values.taxMinor,
      gross_minor: values.grossMinor,
      collected_minor: values.collectedMinor,
      outstanding_minor: values.outstandingMinor,
      worker_cost_minor: values.workerCostMinor,
      expense_cost_minor: values.expenseCostMinor,
      direct_cost_minor: values.directCostMinor,
      contribution_minor: values.contributionMinor,
    },
    totals_by_currency: [],
    source_reconciliation: {
      invoice_source_count: values.invoiceSourceCount,
      source_mismatch_count: values.sourceMismatchCount,
      approved_time_entry_count: values.approvedTimeEntryCount,
      approved_expense_count: values.approvedExpenseCount,
      source_item_count: values.sourceItemCount,
    },
    exact_reconciliation: {
      invoice_count: values.invoiceCount,
      payment_count: values.paymentCount,
      worker_cost_count: values.workerCostCount,
      expense_count: values.expenseCount,
      source_item_count: values.sourceItemCount,
      net_minor: values.netMinor,
      tax_minor: values.taxMinor,
      gross_minor: values.grossMinor,
      collected_minor: values.collectedMinor,
      outstanding_minor: values.outstandingMinor,
      worker_cost_minor: values.workerCostMinor,
      expense_cost_minor: values.expenseCostMinor,
      direct_cost_minor: values.directCostMinor,
      contribution_minor: values.contributionMinor,
    },
  });
}

function reviewedReconciliationJson(values: SnapshotScalarValues): string {
  return JSON.stringify({
    schema_version: 'accounting-pack-reconciliation-v1',
    period_start: '2026-01-01',
    period_end: '2026-02-01',
    currency: 'EUR',
    timezone: 'Europe/Madrid',
    invoice_count: values.invoiceCount,
    payment_count: values.paymentCount,
    worker_cost_count: values.workerCostCount,
    expense_count: values.expenseCount,
    source_item_count: values.sourceItemCount,
    invoice_source_count: values.invoiceSourceCount,
    source_mismatch_count: values.sourceMismatchCount,
    approved_time_entry_count: values.approvedTimeEntryCount,
    approved_expense_count: values.approvedExpenseCount,
    net_minor: values.netMinor,
    tax_minor: values.taxMinor,
    gross_minor: values.grossMinor,
    collected_minor: values.collectedMinor,
    outstanding_minor: values.outstandingMinor,
    worker_cost_minor: values.workerCostMinor,
    expense_cost_minor: values.expenseCostMinor,
    direct_cost_minor: values.directCostMinor,
    contribution_minor: values.contributionMinor,
    checks: {},
    reconciles: true,
  });
}

function insertSnapshotRow(
  sqlite: ReturnType<typeof createBridgeDatabase>,
  overrides: SnapshotRowOverrides = {},
): { snapshotJson: string; reconciliationJson: string } {
  const values: SnapshotScalarValues = {
    ...DEFAULT_SNAPSHOT_SCALARS,
    ...(overrides.invoiceCount === undefined ? {} : { invoiceCount: overrides.invoiceCount }),
    ...(overrides.paymentCount === undefined ? {} : { paymentCount: overrides.paymentCount }),
    ...(overrides.workerCostCount === undefined
      ? {}
      : { workerCostCount: overrides.workerCostCount }),
    ...(overrides.expenseCount === undefined ? {} : { expenseCount: overrides.expenseCount }),
    ...(overrides.sourceItemCount === undefined
      ? {}
      : { sourceItemCount: overrides.sourceItemCount }),
    ...(overrides.invoiceSourceCount === undefined
      ? {}
      : { invoiceSourceCount: overrides.invoiceSourceCount }),
    ...(overrides.sourceMismatchCount === undefined
      ? {}
      : { sourceMismatchCount: overrides.sourceMismatchCount }),
    ...(overrides.approvedTimeEntryCount === undefined
      ? {}
      : { approvedTimeEntryCount: overrides.approvedTimeEntryCount }),
    ...(overrides.approvedExpenseCount === undefined
      ? {}
      : { approvedExpenseCount: overrides.approvedExpenseCount }),
    ...(overrides.netMinor === undefined ? {} : { netMinor: overrides.netMinor }),
    ...(overrides.taxMinor === undefined ? {} : { taxMinor: overrides.taxMinor }),
    ...(overrides.grossMinor === undefined ? {} : { grossMinor: overrides.grossMinor }),
    ...(overrides.collectedMinor === undefined ? {} : { collectedMinor: overrides.collectedMinor }),
    ...(overrides.outstandingMinor === undefined
      ? {}
      : { outstandingMinor: overrides.outstandingMinor }),
    ...(overrides.workerCostMinor === undefined
      ? {}
      : { workerCostMinor: overrides.workerCostMinor }),
    ...(overrides.expenseCostMinor === undefined
      ? {}
      : { expenseCostMinor: overrides.expenseCostMinor }),
    ...(overrides.directCostMinor === undefined
      ? {}
      : { directCostMinor: overrides.directCostMinor }),
    ...(overrides.contributionMinor === undefined
      ? {}
      : { contributionMinor: overrides.contributionMinor }),
  };
  const snapshotJson = overrides.snapshotJson ?? reviewedSnapshotJson(values);
  const reconciliationJson = overrides.reconciliationJson ?? reviewedReconciliationJson(values);
  sqlite
    .prepare(
      `INSERT INTO accounting_pack_revision_snapshot(
         revision_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
         source_cut_id,source_cut_hash,snapshot_json,snapshot_sha256,reconciliation_json,
         reconciliation_sha256,command_id,audit_event_id,created_at,schema_version,timezone,
         invoice_count,payment_count,worker_cost_count,expense_count,source_item_count,
         invoice_source_count,source_mismatch_count,approved_time_entry_count,approved_expense_count,
         net_minor,tax_minor,gross_minor,collected_minor,outstanding_minor,
         worker_cost_minor,expense_cost_minor,direct_cost_minor,contribution_minor
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      overrides.revisionId ?? 'pack-revision',
      'test-tenant',
      'test-deployment',
      'entity-revision',
      overrides.currency ?? 'EUR',
      '2026-01-01',
      '2026-02-01',
      'cut',
      digest('cut'),
      snapshotJson,
      overrides.snapshotSha256 ?? digest(snapshotJson),
      reconciliationJson,
      overrides.reconciliationSha256 ?? digest(reconciliationJson),
      overrides.commandId ?? 'cmd-snapshot',
      overrides.auditEventId ?? 'audit-snapshot',
      new Date().toISOString(),
      'accounting-pack-snapshot-v1',
      overrides.timezone ?? 'Europe/Madrid',
      values.invoiceCount,
      values.paymentCount,
      values.workerCostCount,
      values.expenseCount,
      values.sourceItemCount,
      values.invoiceSourceCount,
      values.sourceMismatchCount,
      values.approvedTimeEntryCount,
      values.approvedExpenseCount,
      values.netMinor,
      values.taxMinor,
      values.grossMinor,
      values.collectedMinor,
      values.outstandingMinor,
      values.workerCostMinor,
      values.expenseCostMinor,
      values.directCostMinor,
      values.contributionMinor,
    );
  return { snapshotJson, reconciliationJson };
}

function reviewedIdentityManifest(): string {
  return JSON.stringify({
    schema_version: 'legal-entity-identity-manifest-v1',
    tenant_id: 'test-tenant',
    deployment_id: 'test-deployment',
    legacy_legal_entity_id: 'legacy-eur',
    legacy_legal_entity_code: 'LE-EUR',
    legacy_legal_entity_name: 'Legacy EUR Entity',
    legacy_legal_entity_version: 1,
    legacy_currency: 'EUR',
    canonical_revision_id: 'entity-revision',
    canonical_revision_hash: digest('entity-revision'),
    canonical_currency: 'EUR',
    canonical_timezone: 'Europe/Madrid',
  });
}

function insertReviewedSourceItem(
  sqlite: ReturnType<typeof createBridgeDatabase>,
  id: string,
  options: Readonly<{
    cutId?: string;
    evidenceId?: string;
    evidenceHash?: string;
    currency?: string;
  }> = {},
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO finance_source_cut_item(
         id,cut_id,item_kind,item_id,item_version,effective_at,evidence_type,evidence_id,
         evidence_hash,amount_minor,currency,item_hash
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      options.cutId ?? 'cut',
      'invoice',
      `${id}-invoice`,
      1,
      now,
      'source_cut',
      options.evidenceId ?? 'cut-evidence',
      options.evidenceHash ?? digest('cut'),
      100,
      options.currency ?? 'EUR',
      digest(id),
    );
}

type SeedCanonicalPackOptions = Readonly<{
  insertSnapshot?: boolean;
  insertSourceBatch?: boolean;
}>;

function seedCanonicalPack(
  sqlite: ReturnType<typeof createBridgeDatabase>,
  options: SeedCanonicalPackOptions = {},
) {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO user(id,name,email,role,status,created_at,updated_at)
       VALUES('owner','Owner','owner@example.test','owner_admin','active',?,?)`,
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT INTO legal_entity(
         id,code,legal_name,currency,billing_address,company_identifiers,status,created_at,updated_at,version
       ) VALUES(?,?,?,?,?,?,?,?,?,1)`,
    )
    .run('legacy-eur', 'LE-EUR', 'Legacy EUR Entity', 'EUR', 'Address', '{}', 'active', now, now);
  sqlite
    .prepare(
      `INSERT INTO accounting_pack_run(
         id,period_start,period_end,legal_entity_id,state,snapshot_json,reconciliation_json,
         generated_by,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'legacy-scoped',
      '2026-01-01',
      '2026-02-01',
      'legacy-eur',
      'final',
      '{"legacy":true}',
      '{"differenceMinor":0}',
      'owner',
      now,
      now,
    );
  sqlite
    .prepare(
      `INSERT INTO accounting_pack_run(
         id,period_start,period_end,legal_entity_id,state,snapshot_json,reconciliation_json,
         generated_by,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'legacy-global',
      '2026-01-01',
      '2026-02-01',
      null,
      'final',
      '{"global":true}',
      '{"differenceMinor":0}',
      'owner',
      now,
      now,
    );

  insertCommand(sqlite, 'cmd-entity-revision', 'entity-revision');
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
      'entity-revision',
      'entity-series',
      1,
      null,
      'test-tenant',
      'test-deployment',
      'Canonical EUR Entity',
      'TAX-EUR',
      null,
      'Address',
      null,
      'Madrid',
      null,
      '28001',
      'ES',
      'EUR',
      'Europe/Madrid',
      '2026-01-01T00:00:00.000Z',
      null,
      digest('entity-revision'),
      now,
      'owner',
      'cmd-entity-revision',
    );
  insertCommand(sqlite, 'cmd-cut', 'cut');
  const cutEvidence = Buffer.from('cut');
  sqlite
    .prepare(
      `INSERT INTO finance_hash_evidence(
         evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run('cut-evidence', 'source_cut', 'test-b6', 'cut', cutEvidence, digest(cutEvidence), now);
  sqlite
    .prepare(
      `INSERT INTO finance_source_cut(
         cut_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
         change_sequence_high_watermark,cut_hash,created_at,created_by,command_id
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'cut',
      'test-tenant',
      'test-deployment',
      'entity-revision',
      'EUR',
      '2026-01-01',
      '2026-02-01',
      0,
      digest('cut'),
      now,
      'owner',
      'cmd-cut',
    );
  insertCommand(sqlite, 'cmd-series', 'pack-series');
  sqlite
    .prepare(
      `INSERT INTO accounting_pack_series(
         series_id,tenant_id,deployment_id,legal_entity_revision_id,currency,timezone,
         period_start,period_end,tail_revision_id,current_authority_event_id
       ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'pack-series',
      'test-tenant',
      'test-deployment',
      'entity-revision',
      'EUR',
      'Europe/Madrid',
      '2026-01-01',
      '2026-02-01',
      null,
      null,
    );
  insertCommand(sqlite, 'cmd-pack-revision', 'pack-revision');
  sqlite
    .prepare(
      `INSERT INTO accounting_pack_revision(
         revision_id,series_id,revision_number,predecessor_revision_id,tenant_id,deployment_id,
         legal_entity_revision_id,currency,timezone,period_start,period_end,source_cut_id,
         source_cut_hash,reconciliation_status,reconciliation_difference_minor,blocker_count,
         status,revision_hash,created_at,created_by,command_id
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'pack-revision',
      'pack-series',
      1,
      null,
      'test-tenant',
      'test-deployment',
      'entity-revision',
      'EUR',
      'Europe/Madrid',
      '2026-01-01',
      '2026-02-01',
      'cut',
      digest('cut'),
      'CLEAN',
      0,
      0,
      'candidate',
      digest('pack-revision'),
      now,
      'owner',
      'cmd-pack-revision',
    );
  if (options.insertSourceBatch !== false) {
    sqlite
      .prepare(
        `INSERT INTO accounting_pack_source_cut_batch(
           id,revision_id,cut_id,change_sequence_high_watermark,cut_hash
         ) VALUES(?,?,?,?,?)`,
      )
      .run('pack-cut-batch', 'pack-revision', 'cut', 0, digest('cut'));
  }
  const snapshotJson = reviewedSnapshotJson(DEFAULT_SNAPSHOT_SCALARS);
  const reconciliationJson = reviewedReconciliationJson(DEFAULT_SNAPSHOT_SCALARS);
  if (options.insertSnapshot !== false) {
    insertCommand(sqlite, 'cmd-snapshot', 'pack-revision', 'accounting_pack_revision_snapshot');
    insertAudit(
      sqlite,
      'audit-snapshot',
      'pack-revision',
      'accounting_pack_revision_snapshot.create',
      'accounting_pack_revision_snapshot',
      'cmd-snapshot',
    );
    insertSnapshotRow(sqlite);
  }
  insertCommand(sqlite, 'cmd-entity-bridge', 'entity-bridge', 'legal_entity_revision_bridge');
  insertAudit(
    sqlite,
    'audit-entity',
    'entity-bridge',
    'legal_entity_revision_bridge.create',
    'legal_entity_revision_bridge',
    'cmd-entity-bridge',
  );
  sqlite
    .prepare(
      `INSERT INTO legal_entity_revision_bridge(
         bridge_id,tenant_id,deployment_id,legacy_legal_entity_id,canonical_revision_id,
         legacy_legal_entity_code,legacy_legal_entity_name,legacy_legal_entity_version,
         legacy_currency,canonical_revision_hash,canonical_currency,canonical_timezone,
         identity_manifest_version,identity_manifest_json,identity_manifest_sha256,
         command_id,audit_event_id,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      'entity-bridge',
      'test-tenant',
      'test-deployment',
      'legacy-eur',
      'entity-revision',
      'LE-EUR',
      'Legacy EUR Entity',
      1,
      'EUR',
      digest('entity-revision'),
      'EUR',
      'Europe/Madrid',
      'legal-entity-identity-manifest-v1',
      reviewedIdentityManifest(),
      digest(reviewedIdentityManifest()),
      'cmd-entity-bridge',
      'audit-entity',
      now,
    );
  return {
    snapshotJson,
    reconciliationJson,
    snapshotSha256: digest(snapshotJson),
    reconciliationSha256: digest(reconciliationJson),
    legacySnapshotSha256: digest('{"legacy":true}'),
    legacyReconciliationSha256: digest('{"differenceMinor":0}'),
    now,
  };
}

afterEach(() => {
  for (const directory of createdDirectories.splice(0))
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup after a failed assertion.
    }
});

describe('0024 accounting-pack snapshot bridge', () => {
  it('adds all bridge tables without backfilling legacy runs', () => {
    const restoreIdentity = installB5TestDeploymentIdentity();
    const sqlite = createPre24Database();
    try {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,role,status,created_at,updated_at)
           VALUES('owner','Owner','owner@example.test','owner_admin','active',?,?)`,
        )
        .run(now, now);
      sqlite
        .prepare(
          `INSERT INTO accounting_pack_run(
             id,period_start,period_end,legal_entity_id,state,snapshot_json,reconciliation_json,
             generated_by,created_at,updated_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'legacy-pre24-global',
          '2026-01-01',
          '2026-02-01',
          null,
          'final',
          '{"global":true}',
          '{"differenceMinor":0}',
          'owner',
          now,
          now,
        );
      sqlite.exec(
        readFileSync(
          resolve(process.cwd(), 'migrations/0024_accounting_pack_snapshot_bridge.sql'),
          'utf8',
        ),
      );
      const tables = sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type='table' AND name IN(
             'legal_entity_revision_bridge',
             'accounting_pack_revision_snapshot',
             'accounting_pack_legacy_run_bridge'
           ) ORDER BY name`,
        )
        .all() as Array<{ name: string }>;
      expect(tables.map((table) => table.name)).toEqual([
        'accounting_pack_legacy_run_bridge',
        'accounting_pack_revision_snapshot',
        'legal_entity_revision_bridge',
      ]);
      expect(
        (
          sqlite.prepare('SELECT count(*) count FROM accounting_pack_run').get() as {
            count: number;
          }
        ).count,
      ).toBe(1);
      expect(
        (
          sqlite.prepare('SELECT count(*) count FROM accounting_pack_legacy_run_bridge').get() as {
            count: number;
          }
        ).count,
      ).toBe(0);
      expect(
        (
          sqlite.prepare('SELECT count(*) count FROM accounting_pack_revision_snapshot').get() as {
            count: number;
          }
        ).count,
      ).toBe(0);
    } finally {
      sqlite.close();
      restoreIdentity();
    }
  });

  it('restores historical metadata, FK targets and rows when the 0024 transaction is injected to roll back', () => {
    const restoreIdentity = installB5TestDeploymentIdentity();
    const sqlite = createPre24Database();
    try {
      const sql = readFileSync(
        resolve(process.cwd(), 'migrations/0024_accounting_pack_snapshot_bridge.sql'),
        'utf8',
      );
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        sqlite.exec(sql);
        throw new Error('injected rollback');
      } catch (error) {
        expect(error).toEqual(new Error('injected rollback'));
        sqlite.exec('ROLLBACK');
      }
      const metadataSql = (
        sqlite
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='migration_contract_metadata'",
          )
          .get() as { sql: string }
      ).sql;
      expect(metadataSql).toContain('migration_version BETWEEN 19 AND 23');
      expect(metadataSql).not.toContain('accounting_pack_snapshot_bridge');
      expect(
        (
          sqlite
            .prepare(
              "SELECT sql FROM sqlite_master WHERE type='table' AND name='finance_v2_cutover'",
            )
            .get() as { sql: string }
        ).sql,
      ).toContain('REFERENCES migration_contract_metadata');
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(
        (
          sqlite.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migration').get() as {
            version: number;
          }
        ).version,
      ).toBe(23);
      expect(
        sqlite
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_v23'")
          .all(),
      ).toEqual([]);
    } finally {
      sqlite.close();
      restoreIdentity();
    }
  });

  it('accepts a fully scoped canonical snapshot and a non-null legacy run bridge', () => {
    const restoreIdentity = installB5TestDeploymentIdentity();
    const sqlite = createBridgeDatabase();
    try {
      const values = seedCanonicalPack(sqlite);
      insertCommand(sqlite, 'cmd-run-bridge', 'run-bridge', 'accounting_pack_legacy_run_bridge');
      insertAudit(
        sqlite,
        'audit-run-bridge',
        'run-bridge',
        'accounting_pack_legacy_run_bridge.create',
        'accounting_pack_legacy_run_bridge',
        'cmd-run-bridge',
      );
      sqlite
        .prepare(
          `INSERT INTO accounting_pack_legacy_run_bridge(
             bridge_id,tenant_id,deployment_id,legacy_run_id,legacy_legal_entity_id,revision_id,
             legal_entity_revision_id,currency,period_start,period_end,source_cut_id,source_cut_hash,
             timezone,legacy_snapshot_sha256,legacy_reconciliation_sha256,
             snapshot_sha256,reconciliation_sha256,command_id,audit_event_id,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'run-bridge',
          'test-tenant',
          'test-deployment',
          'legacy-scoped',
          'legacy-eur',
          'pack-revision',
          'entity-revision',
          'EUR',
          '2026-01-01',
          '2026-02-01',
          'cut',
          digest('cut'),
          'Europe/Madrid',
          values.legacySnapshotSha256,
          values.legacyReconciliationSha256,
          values.snapshotSha256,
          values.reconciliationSha256,
          'cmd-run-bridge',
          'audit-run-bridge',
          values.now,
        );
      expect(
        sqlite
          .prepare(
            `SELECT revision_id,snapshot_sha256,reconciliation_sha256
             FROM accounting_pack_revision_snapshot`,
          )
          .get(),
      ).toEqual({
        revision_id: 'pack-revision',
        snapshot_sha256: values.snapshotSha256,
        reconciliation_sha256: values.reconciliationSha256,
      });
      expect(
        (
          sqlite.prepare('SELECT count(*) count FROM accounting_pack_legacy_run_bridge').get() as {
            count: number;
          }
        ).count,
      ).toBe(1);
      expect(() =>
        sqlite
          .prepare('UPDATE accounting_pack_run SET snapshot_json=? WHERE id=?')
          .run('{"mutated":true}', 'legacy-scoped'),
      ).toThrow();
      expect(() =>
        sqlite.prepare('DELETE FROM accounting_pack_run WHERE id=?').run('legacy-scoped'),
      ).toThrow();
    } finally {
      sqlite.close();
      restoreIdentity();
    }
  });

  it('rejects hash, scope and null/global linkage violations and preserves immutability', () => {
    const restoreIdentity = installB5TestDeploymentIdentity();
    const sqlite = createBridgeDatabase();
    try {
      const values = seedCanonicalPack(sqlite);
      insertAudit(
        sqlite,
        'audit-bad-hash',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-snapshot',
      );
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-snapshot',
          auditEventId: 'audit-bad-hash',
          snapshotSha256: '0'.repeat(64),
        }),
      ).toThrow();

      insertCommand(
        sqlite,
        'cmd-null-run-bridge',
        'null-run-bridge',
        'accounting_pack_legacy_run_bridge',
      );
      insertAudit(
        sqlite,
        'audit-null-run-bridge',
        'null-run-bridge',
        'accounting_pack_legacy_run_bridge.create',
        'accounting_pack_legacy_run_bridge',
        'cmd-null-run-bridge',
      );
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO accounting_pack_legacy_run_bridge(
               bridge_id,tenant_id,deployment_id,legacy_run_id,legacy_legal_entity_id,revision_id,
               legal_entity_revision_id,currency,period_start,period_end,source_cut_id,source_cut_hash,
               timezone,legacy_snapshot_sha256,legacy_reconciliation_sha256,
               snapshot_sha256,reconciliation_sha256,command_id,audit_event_id,created_at
             ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            'null-run-bridge',
            'test-tenant',
            'test-deployment',
            'legacy-global',
            'legacy-eur',
            'pack-revision',
            'entity-revision',
            'EUR',
            '2026-01-01',
            '2026-02-01',
            'cut',
            digest('cut'),
            'Europe/Madrid',
            values.legacySnapshotSha256,
            values.legacyReconciliationSha256,
            values.snapshotSha256,
            values.reconciliationSha256,
            'cmd-null-run-bridge',
            'audit-null-run-bridge',
            values.now,
          ),
      ).toThrow();

      expect(() =>
        sqlite
          .prepare(
            `UPDATE accounting_pack_revision_snapshot SET snapshot_json=? WHERE revision_id=?`,
          )
          .run(values.snapshotJson, 'pack-revision'),
      ).toThrow();
      expect(() =>
        sqlite
          .prepare('DELETE FROM legal_entity_revision_bridge WHERE bridge_id=?')
          .run('entity-bridge'),
      ).toThrow();
    } finally {
      sqlite.close();
      restoreIdentity();
    }
  });

  it('rejects non-completed or mis-targeted commands, foreign audit entities, open JSON keys and money equation violations', () => {
    const restoreIdentity = installB5TestDeploymentIdentity();
    const sqlite = createBridgeDatabase();
    try {
      seedCanonicalPack(sqlite);

      insertAudit(
        sqlite,
        'audit-empty-json',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-snapshot',
      );
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-snapshot',
          auditEventId: 'audit-empty-json',
          snapshotJson: '{}',
        }),
      ).toThrow();

      insertAudit(
        sqlite,
        'audit-null-json-scalar',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-snapshot',
      );
      const nullJsonScalar = JSON.parse(reviewedSnapshotJson(DEFAULT_SNAPSHOT_SCALARS)) as {
        invoice_count: number | null;
      } & Record<string, unknown>;
      nullJsonScalar.invoice_count = null;
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-snapshot',
          auditEventId: 'audit-null-json-scalar',
          snapshotJson: JSON.stringify(nullJsonScalar),
        }),
      ).toThrow();

      insertAudit(
        sqlite,
        'audit-scalar-mismatch',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-snapshot',
      );
      const mismatchedSnapshot = JSON.parse(reviewedSnapshotJson(DEFAULT_SNAPSHOT_SCALARS)) as {
        net_minor: number;
      } & Record<string, unknown>;
      mismatchedSnapshot.net_minor = 999;
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-snapshot',
          auditEventId: 'audit-scalar-mismatch',
          snapshotJson: JSON.stringify(mismatchedSnapshot),
        }),
      ).toThrow();

      insertCommand(
        sqlite,
        'cmd-pending-snapshot',
        'pending-revision',
        'accounting_pack_revision_snapshot',
        'pending',
      );
      insertAudit(
        sqlite,
        'audit-pending-snapshot',
        'pending-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-pending-snapshot',
      );
      expect(() =>
        insertSnapshotRow(sqlite, {
          revisionId: 'pack-revision',
          commandId: 'cmd-pending-snapshot',
          auditEventId: 'audit-pending-snapshot',
        }),
      ).toThrow();

      insertCommand(
        sqlite,
        'cmd-wrong-target',
        'different-revision',
        'accounting_pack_revision_snapshot',
      );
      insertAudit(
        sqlite,
        'audit-wrong-target',
        'different-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-wrong-target',
      );
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-wrong-target',
          auditEventId: 'audit-wrong-target',
        }),
      ).toThrow();

      insertAudit(
        sqlite,
        'audit-foreign-snapshot',
        'different-run',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-snapshot',
      );
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-snapshot',
          auditEventId: 'audit-foreign-snapshot',
        }),
      ).toThrow();

      insertAudit(
        sqlite,
        'audit-unknown-json',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-snapshot',
      );
      const unknownSnapshot = JSON.stringify({
        ...JSON.parse(reviewedSnapshotJson(DEFAULT_SNAPSHOT_SCALARS)),
        unreviewed: true,
      });
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-snapshot',
          auditEventId: 'audit-unknown-json',
          snapshotJson: unknownSnapshot,
        }),
      ).toThrow();

      insertAudit(
        sqlite,
        'audit-bad-equation',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-snapshot',
      );
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-snapshot',
          auditEventId: 'audit-bad-equation',
          grossMinor: 1199,
        }),
      ).toThrow();
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-snapshot',
          auditEventId: 'audit-bad-equation',
          directCostMinor: 301,
        }),
      ).toThrow();

      insertAudit(
        sqlite,
        'audit-bad-timezone',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-snapshot',
      );
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-snapshot',
          auditEventId: 'audit-bad-timezone',
          timezone: 'Europe/London',
        }),
      ).toThrow();
    } finally {
      sqlite.close();
      restoreIdentity();
    }
  });

  it('rejects arbitrary command operations, target contracts and audit actions', () => {
    const restoreIdentity = installB5TestDeploymentIdentity();
    const sqlite = createBridgeDatabase();
    try {
      seedCanonicalPack(sqlite, { insertSnapshot: false });

      insertCommand(
        sqlite,
        'cmd-arbitrary-operation',
        'pack-revision',
        'accounting_pack_revision_snapshot',
        'completed',
        'accounting_pack_revision_snapshot.rebuild',
      );
      insertAudit(
        sqlite,
        'audit-arbitrary-operation',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-arbitrary-operation',
      );
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-arbitrary-operation',
          auditEventId: 'audit-arbitrary-operation',
        }),
      ).toThrow();

      insertCommand(
        sqlite,
        'cmd-arbitrary-contract',
        'pack-revision',
        'accounting_pack_revision_snapshot',
        'completed',
        'accounting_pack_revision_snapshot.create',
        'accounting-pack-revision-snapshot-v999',
      );
      insertAudit(
        sqlite,
        'audit-arbitrary-contract',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-arbitrary-contract',
      );
      expect(() =>
        insertSnapshotRow(sqlite, {
          commandId: 'cmd-arbitrary-contract',
          auditEventId: 'audit-arbitrary-contract',
        }),
      ).toThrow();

      insertCommand(
        sqlite,
        'cmd-arbitrary-audit',
        'audit-revision',
        'accounting_pack_revision_snapshot',
      );
      expect(() =>
        insertAudit(
          sqlite,
          'audit-arbitrary-action',
          'audit-revision',
          'accounting_pack_revision_snapshot.publish',
          'accounting_pack_revision_snapshot',
          'cmd-arbitrary-audit',
        ),
      ).toThrow();
    } finally {
      sqlite.close();
      restoreIdentity();
    }
  });

  it('requires a source-cut batch and exact one-to-one source projections', () => {
    const restoreIdentity = installB5TestDeploymentIdentity();
    const missingBatch = createBridgeDatabase();
    try {
      seedCanonicalPack(missingBatch, { insertSnapshot: false, insertSourceBatch: false });
      insertCommand(
        missingBatch,
        'cmd-missing-source-batch',
        'pack-revision',
        'accounting_pack_revision_snapshot',
      );
      insertAudit(
        missingBatch,
        'audit-missing-source-batch',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-missing-source-batch',
      );
      expect(() =>
        insertSnapshotRow(missingBatch, {
          commandId: 'cmd-missing-source-batch',
          auditEventId: 'audit-missing-source-batch',
        }),
      ).toThrow();
    } finally {
      missingBatch.close();
    }

    const omittedItem = createBridgeDatabase();
    try {
      seedCanonicalPack(omittedItem, { insertSnapshot: false });
      insertReviewedSourceItem(omittedItem, 'omitted-source-item');
      insertCommand(
        omittedItem,
        'cmd-omitted-source-item',
        'pack-revision',
        'accounting_pack_revision_snapshot',
      );
      insertAudit(
        omittedItem,
        'audit-omitted-source-item',
        'pack-revision',
        'accounting_pack_revision_snapshot.create',
        'accounting_pack_revision_snapshot',
        'cmd-omitted-source-item',
      );
      expect(() =>
        insertSnapshotRow(omittedItem, {
          commandId: 'cmd-omitted-source-item',
          auditEventId: 'audit-omitted-source-item',
          sourceItemCount: 1,
        }),
      ).toThrow();
    } finally {
      omittedItem.close();
    }

    const extraItem = createBridgeDatabase();
    try {
      seedCanonicalPack(extraItem, { insertSnapshot: false });
      const now = new Date().toISOString();
      const otherCutBlob = Buffer.from('other-cut');
      extraItem
        .prepare(
          `INSERT INTO finance_hash_evidence(
             evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
           ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          'other-cut-evidence',
          'source_cut',
          'test-b6',
          'other-cut',
          otherCutBlob,
          digest(otherCutBlob),
          now,
        );
      insertCommand(extraItem, 'cmd-other-cut', 'other-cut');
      extraItem
        .prepare(
          `INSERT INTO finance_source_cut(
             cut_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
             change_sequence_high_watermark,cut_hash,created_at,created_by,command_id
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          'other-cut',
          'test-tenant',
          'test-deployment',
          'entity-revision',
          'EUR',
          '2026-01-01',
          '2026-02-01',
          0,
          digest(otherCutBlob),
          now,
          'owner',
          'cmd-other-cut',
        );
      insertReviewedSourceItem(extraItem, 'extra-source-item', {
        cutId: 'other-cut',
        evidenceId: 'other-cut-evidence',
        evidenceHash: digest(otherCutBlob),
      });
      expect(() =>
        extraItem
          .prepare(
            `INSERT INTO accounting_pack_source_cut_item(
               id,batch_id,source_cut_item_id,evidence_hash
             ) VALUES(?,?,?,?)`,
          )
          .run(
            'extra-source-projection',
            'pack-cut-batch',
            'extra-source-item',
            digest(otherCutBlob),
          ),
      ).toThrow();
    } finally {
      extraItem.close();
    }

    const duplicateProjection = createBridgeDatabase();
    try {
      seedCanonicalPack(duplicateProjection, { insertSnapshot: false });
      insertReviewedSourceItem(duplicateProjection, 'duplicate-source-item');
      const projectionSql = `INSERT INTO accounting_pack_source_cut_item(
        id,batch_id,source_cut_item_id,evidence_hash
      ) VALUES(?,?,?,?)`;
      duplicateProjection
        .prepare(projectionSql)
        .run(
          'duplicate-source-projection',
          'pack-cut-batch',
          'duplicate-source-item',
          digest('cut'),
        );
      expect(() =>
        duplicateProjection
          .prepare(projectionSql)
          .run(
            'duplicate-source-projection-again',
            'pack-cut-batch',
            'duplicate-source-item',
            digest('cut'),
          ),
      ).toThrow();
    } finally {
      duplicateProjection.close();
      restoreIdentity();
    }
  });

  it('anchors source-cut evidence once per cut/evidence identity and rejects copied-hash drift', () => {
    const restoreIdentity = installB5TestDeploymentIdentity();
    const sqlite = createBridgeDatabase();
    try {
      // Source-cut items must be anchored before the immutable Accounting Pack
      // snapshot seals the cut. This test exercises evidence identity and hash
      // drift, so keep the fixture intentionally pre-snapshot.
      seedCanonicalPack(sqlite, { insertSnapshot: false });
      const now = new Date().toISOString();
      insertCommand(sqlite, 'cmd-cut-without-evidence', 'cut-without-evidence');
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO finance_source_cut(
               cut_id,tenant_id,deployment_id,legal_entity_revision_id,currency,period_start,period_end,
               change_sequence_high_watermark,cut_hash,created_at,created_by,command_id
             ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            'cut-without-evidence',
            'test-tenant',
            'test-deployment',
            'entity-revision',
            'EUR',
            '2026-01-01',
            '2026-02-01',
            0,
            digest('cut-without-evidence'),
            now,
            'owner',
            'cmd-cut-without-evidence',
          ),
      ).toThrow();
      const blob = Buffer.from('source-cut-evidence');
      const evidenceHash = digest(blob);
      sqlite
        .prepare(
          `INSERT INTO finance_hash_evidence(
             evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
           ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          'source-evidence',
          'source_cut',
          'test-b6',
          'source-evidence',
          blob,
          evidenceHash,
          now,
        );
      const itemSql = `INSERT INTO finance_source_cut_item(
        id,cut_id,item_kind,item_id,item_version,effective_at,evidence_type,evidence_id,
        evidence_hash,amount_minor,currency,item_hash
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`;
      sqlite
        .prepare(itemSql)
        .run(
          'source-item',
          'cut',
          'invoice',
          'invoice-1',
          1,
          now,
          'source_cut',
          'source-evidence',
          evidenceHash,
          100,
          'EUR',
          digest('source-item'),
        );
      sqlite
        .prepare(itemSql)
        .run(
          'source-item-duplicate',
          'cut',
          'invoice',
          'invoice-2',
          1,
          now,
          'source_cut',
          'source-evidence',
          evidenceHash,
          100,
          'EUR',
          digest('source-item-duplicate'),
        );
      sqlite
        .prepare(
          `INSERT INTO accounting_pack_source_cut_item(
             id,batch_id,source_cut_item_id,evidence_hash
           ) VALUES(?,?,?,?)`,
        )
        .run('pack-cut-item', 'pack-cut-batch', 'source-item', evidenceHash);
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO accounting_pack_source_cut_item(
               id,batch_id,source_cut_item_id,evidence_hash
             ) VALUES(?,?,?,?)`,
          )
          .run('pack-cut-item-bad-hash', 'pack-cut-batch', 'source-item-duplicate', '0'.repeat(64)),
      ).toThrow();
      expect(
        (
          sqlite
            .prepare('SELECT count(*) count FROM finance_source_cut_item WHERE cut_id=?')
            .get('cut') as {
            count: number;
          }
        ).count,
      ).toBe(2);
      expect(() =>
        sqlite
          .prepare(itemSql)
          .run(
            'source-item-bad-hash',
            'cut',
            'invoice',
            'invoice-3',
            1,
            now,
            'source_cut',
            'source-evidence',
            '0'.repeat(64),
            100,
            'EUR',
            digest('source-item-bad-hash'),
          ),
      ).toThrow();
      expect(() =>
        sqlite
          .prepare(itemSql)
          .run(
            'source-item-null-currency',
            'cut',
            'invoice',
            'invoice-4',
            1,
            now,
            'source_cut',
            'source-evidence',
            evidenceHash,
            100,
            null,
            digest('source-item-null-currency'),
          ),
      ).toThrow();
    } finally {
      sqlite.close();
      restoreIdentity();
    }
  });
});
