import { AnySQLiteColumn, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './identity.ts';
import { projects } from './projects.ts';
import { lifecycle } from './shared.ts';

export const clientLaborRates = sqliteTable('client_labor_rate', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  workerId: text('worker_id'),
  category: text('category'),
  currency: text('currency').notNull(),
  hourlyRateMinor: integer('hourly_rate_minor').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  ...lifecycle,
  rateBasis: text('rate_basis'),
  overtimeMethod: text('overtime_method'),
  overtimeMultiplierBps: integer('overtime_multiplier_bps'),
  overtimeRateMinor: integer('overtime_rate_minor'),
  eligibleForPercentage: integer('eligible_for_percentage', { mode: 'boolean' }),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
});

export const internalCostRules = sqliteTable('internal_cost_rule', {
  id: text('id').primaryKey(),
  workerId: text('worker_id').notNull(),
  projectId: text('project_id'),
  currency: text('currency').notNull(),
  hourlyRateMinor: integer('hourly_rate_minor').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  ...lifecycle,
  overtimeMethod: text('overtime_method'),
  overtimeMultiplierBps: integer('overtime_multiplier_bps'),
  overtimeRateMinor: integer('overtime_rate_minor'),
  costMethod: text('cost_method'),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
});

export const compensationRules = sqliteTable('compensation_rule', {
  id: text('id').primaryKey(),
  workerId: text('worker_id').notNull(),
  projectId: text('project_id'),
  currency: text('currency').notNull(),
  rateMinor: integer('rate_minor').notNull(),
  rateBasis: text('rate_basis').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  ...lifecycle,
  dailyGuaranteeMinutes: integer('daily_guarantee_minutes'),
  workerVisible: integer('worker_visible', { mode: 'boolean' }),
  ruleType: text('rule_type'),
  percentageBps: integer('percentage_bps'),
  percentageBasis: text('percentage_basis'),
  settlementTrigger: text('settlement_trigger'),
  overtimeMethod: text('overtime_method'),
  overtimeMultiplierBps: integer('overtime_multiplier_bps'),
  overtimeRateMinor: integer('overtime_rate_minor'),
  weekendMethod: text('weekend_method'),
  travelMethod: text('travel_method'),
  standbyMethod: text('standby_method'),
  fixedPeriodMinor: integer('fixed_period_minor'),
  fixedProjectMinor: integer('fixed_project_minor'),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
});

export const compensationSettlements = sqliteTable('compensation_settlement', {
  id: text('id').primaryKey(),
  workerId: text('worker_id').notNull(),
  projectId: text('project_id').notNull(),
  compensationRuleId: text('compensation_rule_id').notNull(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  sourceBasis: text('source_basis').notNull(),
  sourceAmountMinor: integer('source_amount_minor').notNull(),
  percentageBps: integer('percentage_bps'),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  state: text('state').notNull(),
  settledAt: text('settled_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  expectedPaymentOn: text('expected_payment_on'),
});

export const projectCommercialPolicies = sqliteTable(
  'project_commercial_policy',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    supersedesPolicyId: text('supersedes_policy_id')
      .unique()
      .references((): AnySQLiteColumn => projectCommercialPolicies.id, {
        onUpdate: 'restrict',
        onDelete: 'restrict',
      }),
    effectiveFrom: text('effective_from').notNull(),
    effectiveTo: text('effective_to'),
    overtimeEnabled: integer('overtime_enabled', { mode: 'boolean' }).notNull(),
    overtimeThresholdMinutes: integer('overtime_threshold_minutes'),
    travelClientBillable: integer('travel_client_billable', { mode: 'boolean' }).notNull(),
    customerSignoffRequired: integer('customer_signoff_required', { mode: 'boolean' }).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
    version: integer('version').notNull(),
  },
  (table) => [
    index('project_commercial_policy_lookup_idx').on(
      table.projectId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
  ],
);

export const assignmentRateOverrides = sqliteTable('assignment_rate_override', {
  id: text('id').primaryKey(),
  projectMemberId: text('project_member_id').notNull(),
  timeCategory: text('time_category'),
  activityCode: text('activity_code'),
  compensationRuleId: text('compensation_rule_id'),
  internalCostRuleId: text('internal_cost_rule_id'),
  clientLaborRateId: text('client_labor_rate_id'),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  priority: integer('priority').notNull(),
  version: integer('version').notNull().default(1),
  ...lifecycle,
});
