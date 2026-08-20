import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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
});

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
