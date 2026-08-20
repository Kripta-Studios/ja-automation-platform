import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './identity.ts';
import { projects } from './projects.ts';
import { lifecycle } from './shared.ts';

export const timeEntries = sqliteTable(
  'time_entry',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    workerId: text('worker_id')
      .notNull()
      .references(() => users.id),
    workDate: text('work_date').notNull(),
    category: text('category').notNull(),
    minutes: integer('minutes').notNull(),
    approvalState: text('approval_state').notNull().default('draft'),
    billabilityState: text('billability_state').notNull().default('pending'),
    invoiceId: text('invoice_id'),
    projectTimezone: text('project_timezone'),
    activitySummary: text('activity_summary'),
    submittedAt: text('submitted_at'),
    approvedBy: text('approved_by'),
    approvedAt: text('approved_at'),
    financeApprovedBy: text('finance_approved_by'),
    financeApprovedAt: text('finance_approved_at'),
    startTime: text('start_time'),
    endTime: text('end_time'),
    activityCode: text('activity_code'),
    breakMinutes: integer('break_minutes'),
    site: text('site'),
    billableMinutes: integer('billable_minutes'),
    clientRateMinor: integer('client_rate_minor'),
    compensationAmountMinor: integer('compensation_amount_minor'),
    internalCostMinor: integer('internal_cost_minor'),
    billingStatus: text('billing_status'),
    lockedAt: text('locked_at'),
    lockedBy: text('locked_by'),
    billingLockId: text('billing_lock_id'),
    version: integer('version').notNull().default(1),
    ...lifecycle,
  },
  (table) => [
    index('time_project_period_idx').on(table.projectId, table.workDate),
    index('time_worker_period_idx').on(table.workerId, table.workDate),
  ],
);
