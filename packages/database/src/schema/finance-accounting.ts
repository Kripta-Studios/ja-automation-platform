import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const financeSnapshots = sqliteTable('finance_snapshot', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  asOf: text('as_of').notNull(),
  costMinor: integer('cost_minor').notNull(),
  revenueMinor: integer('revenue_minor').notNull(),
  contributionMarginMinor: integer('contribution_margin_minor').notNull(),
  etcMinor: integer('etc_minor').notNull(),
  eacMinor: integer('eac_minor').notNull(),
  inputHash: text('input_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export const accountingPeriods = sqliteTable('accounting_period', {
  id: text('id').primaryKey(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  legalEntityId: text('legal_entity_id'),
  state: text('state').notNull(),
  closedAt: text('closed_at'),
  closedBy: text('closed_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const accountingPackRuns = sqliteTable('accounting_pack_run', {
  id: text('id').primaryKey(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  legalEntityId: text('legal_entity_id'),
  state: text('state').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  reconciliationJson: text('reconciliation_json').notNull(),
  generatedBy: text('generated_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const accountingPackExports = sqliteTable('accounting_pack_export', {
  id: text('id').primaryKey(),
  packRunId: text('pack_run_id').notNull(),
  exportType: text('export_type').notNull(),
  storageKey: text('storage_key').notNull(),
  sha256: text('sha256').notNull(),
  byteLength: integer('byte_length').notNull(),
  createdAt: text('created_at').notNull(),
});
