import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Explicit compatibility mapping from the mutable legacy legal_entity identity
 * to one immutable canonical legal_entity_revision.  The migration requires
 * command and audit anchors; those relations are enforced by SQLite triggers
 * because the deployment-scoped composite checks are not expressible in this
 * declaration without introducing circular table imports.
 */
export const legalEntityRevisionBridges = sqliteTable(
  'legal_entity_revision_bridge',
  {
    bridgeId: text('bridge_id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    deploymentId: text('deployment_id').notNull(),
    legacyLegalEntityId: text('legacy_legal_entity_id').notNull(),
    canonicalRevisionId: text('canonical_revision_id').notNull(),
    legacyLegalEntityCode: text('legacy_legal_entity_code').notNull(),
    legacyLegalEntityName: text('legacy_legal_entity_name').notNull(),
    legacyLegalEntityVersion: integer('legacy_legal_entity_version').notNull(),
    legacyCurrency: text('legacy_currency').notNull(),
    canonicalRevisionHash: text('canonical_revision_hash').notNull(),
    canonicalCurrency: text('canonical_currency').notNull(),
    canonicalTimezone: text('canonical_timezone').notNull(),
    identityManifestVersion: text('identity_manifest_version')
      .notNull()
      .default('legal-entity-identity-manifest-v1'),
    identityManifestJson: text('identity_manifest_json').notNull(),
    identityManifestSha256: text('identity_manifest_sha256').notNull(),
    commandId: text('command_id').notNull(),
    auditEventId: text('audit_event_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('legal_entity_revision_bridge_legacy_uq').on(
      table.tenantId,
      table.deploymentId,
      table.legacyLegalEntityId,
    ),
    uniqueIndex('legal_entity_revision_bridge_revision_uq').on(
      table.tenantId,
      table.deploymentId,
      table.canonicalRevisionId,
    ),
    index('legal_entity_revision_bridge_legacy_idx').on(
      table.tenantId,
      table.deploymentId,
      table.legacyLegalEntityId,
    ),
  ],
);

/**
 * Canonical, point-in-time Accounting Pack source.  JSON is retained exactly
 * as submitted and its lowercase SHA-256 digest is checked by migration UDF
 * triggers, so renderers can use this row without reading mutable legacy data.
 */
export const accountingPackRevisionSnapshots = sqliteTable(
  'accounting_pack_revision_snapshot',
  {
    revisionId: text('revision_id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    deploymentId: text('deployment_id').notNull(),
    legalEntityRevisionId: text('legal_entity_revision_id').notNull(),
    currency: text('currency').notNull(),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    sourceCutId: text('source_cut_id').notNull(),
    sourceCutHash: text('source_cut_hash').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    snapshotSha256: text('snapshot_sha256').notNull(),
    reconciliationJson: text('reconciliation_json').notNull(),
    reconciliationSha256: text('reconciliation_sha256').notNull(),
    commandId: text('command_id').notNull(),
    auditEventId: text('audit_event_id').notNull(),
    createdAt: text('created_at').notNull(),
    schemaVersion: text('schema_version').notNull().default('accounting-pack-snapshot-v1'),
    timezone: text('timezone').notNull(),
    invoiceCount: integer('invoice_count').notNull(),
    paymentCount: integer('payment_count').notNull(),
    workerCostCount: integer('worker_cost_count').notNull(),
    expenseCount: integer('expense_count').notNull(),
    sourceItemCount: integer('source_item_count').notNull(),
    invoiceSourceCount: integer('invoice_source_count').notNull(),
    sourceMismatchCount: integer('source_mismatch_count').notNull(),
    approvedTimeEntryCount: integer('approved_time_entry_count').notNull(),
    approvedExpenseCount: integer('approved_expense_count').notNull(),
    netMinor: integer('net_minor').notNull(),
    taxMinor: integer('tax_minor').notNull(),
    grossMinor: integer('gross_minor').notNull(),
    collectedMinor: integer('collected_minor').notNull(),
    outstandingMinor: integer('outstanding_minor').notNull(),
    workerCostMinor: integer('worker_cost_minor').notNull(),
    expenseCostMinor: integer('expense_cost_minor').notNull(),
    directCostMinor: integer('direct_cost_minor').notNull(),
    contributionMinor: integer('contribution_minor').notNull(),
  },
  (table) => [
    index('accounting_pack_revision_snapshot_scope_idx').on(
      table.tenantId,
      table.deploymentId,
      table.periodStart,
      table.periodEnd,
      table.currency,
    ),
  ],
);

/**
 * Optional compatibility link for a legacy run that has a non-null legal
 * entity.  Hashes are copied as a manifest of the canonical snapshot and are
 * checked against it by the migration trigger; the legacy row itself remains
 * untouched and global runs are intentionally not linkable.
 */
export const accountingPackLegacyRunBridges = sqliteTable(
  'accounting_pack_legacy_run_bridge',
  {
    bridgeId: text('bridge_id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    deploymentId: text('deployment_id').notNull(),
    legacyRunId: text('legacy_run_id').notNull(),
    legacyLegalEntityId: text('legacy_legal_entity_id').notNull(),
    revisionId: text('revision_id').notNull(),
    legalEntityRevisionId: text('legal_entity_revision_id').notNull(),
    currency: text('currency').notNull(),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    sourceCutId: text('source_cut_id').notNull(),
    sourceCutHash: text('source_cut_hash').notNull(),
    timezone: text('timezone').notNull(),
    legacySnapshotSha256: text('legacy_snapshot_sha256').notNull(),
    legacyReconciliationSha256: text('legacy_reconciliation_sha256').notNull(),
    snapshotSha256: text('snapshot_sha256').notNull(),
    reconciliationSha256: text('reconciliation_sha256').notNull(),
    commandId: text('command_id').notNull(),
    auditEventId: text('audit_event_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('accounting_pack_legacy_run_bridge_run_uq').on(
      table.tenantId,
      table.deploymentId,
      table.legacyRunId,
    ),
    uniqueIndex('accounting_pack_legacy_run_bridge_revision_uq').on(
      table.tenantId,
      table.deploymentId,
      table.revisionId,
    ),
    index('accounting_pack_legacy_run_bridge_scope_idx').on(
      table.tenantId,
      table.deploymentId,
      table.periodStart,
      table.periodEnd,
      table.currency,
    ),
  ],
);
