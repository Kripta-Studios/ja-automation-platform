import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { documents } from './documents.ts';
import { users } from './identity.ts';
import { lifecycle } from './shared.ts';

export const dailyReports = sqliteTable('daily_report', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  workerId: text('worker_id').notNull(),
  workDate: text('work_date').notNull(),
  summary: text('summary').notNull(),
  safetyNotes: text('safety_notes'),
  approvalState: text('approval_state').notNull(),
  version: integer('version').notNull().default(1),
  ...lifecycle,
  siteShift: text('site_shift'),
  tasksCompleted: text('tasks_completed'),
  problemsFound: text('problems_found'),
  correctiveActions: text('corrective_actions'),
  clientDecisions: text('client_decisions'),
  downtimeMinutes: integer('downtime_minutes'),
  standbyReason: text('standby_reason'),
  blockers: text('blockers'),
  openItems: text('open_items'),
  nextDayPlan: text('next_day_plan'),
  safetyRelated: integer('safety_related', { mode: 'boolean' }),
  customerContact: text('customer_contact'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
});

export const periodReports = sqliteTable('period_report', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  audience: text('audience').notNull(),
  reportType: text('report_type').notNull(),
  state: text('state').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  pdfStorageKey: text('pdf_storage_key'),
  pdfSha256: text('pdf_sha256'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  pdfByteLength: integer('pdf_byte_length'),
  snapshotVersion: integer('snapshot_version').notNull().default(1),
  snapshotSha256: text('snapshot_sha256'),
  approvedAt: text('approved_at'),
});

export const customerConformities = sqliteTable(
  'customer_conformity',
  {
    id: text('id').primaryKey(),
    periodReportId: text('period_report_id')
      .notNull()
      .references(() => periodReports.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    snapshotVersion: integer('snapshot_version').notNull(),
    snapshotSha256: text('snapshot_sha256').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    reportPdfStorageKey: text('report_pdf_storage_key').notNull(),
    reportPdfSha256: text('report_pdf_sha256').notNull(),
    reportPdfByteLength: integer('report_pdf_byte_length').notNull(),
    signerName: text('signer_name').notNull(),
    signerIdentity: text('signer_identity'),
    signedAt: text('signed_at').notNull(),
    signatureDocumentId: text('signature_document_id').references(() => documents.id, {
      onUpdate: 'restrict',
      onDelete: 'restrict',
    }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('customer_conformity_snapshot_uq').on(
      table.periodReportId,
      table.snapshotVersion,
      table.snapshotSha256,
    ),
    index('customer_conformity_report_idx').on(
      table.periodReportId,
      table.snapshotVersion,
      table.snapshotSha256,
    ),
  ],
);

export const customerConformityInvalidations = sqliteTable(
  'customer_conformity_invalidation',
  {
    id: text('id').primaryKey(),
    conformityId: text('conformity_id')
      .notNull()
      .unique()
      .references(() => customerConformities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    occurredAt: text('occurred_at').notNull(),
  },
  (table) => [
    index('customer_conformity_invalidation_conformity_idx').on(
      table.conformityId,
      table.occurredAt,
    ),
  ],
);

export const reportSources = sqliteTable('report_source', {
  reportId: text('report_id').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
});

export const reportTimeLinks = sqliteTable('report_time_link', {
  reportType: text('report_type').notNull(),
  reportId: text('report_id').notNull(),
  timeEntryId: text('time_entry_id').notNull(),
});
