import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './identity.ts';
import { projects } from './projects.ts';
import { timeEntries } from './time.ts';
import { crewLeaderGrants, projectMembers } from './workforce-planning.ts';
import { lifecycle } from './shared.ts';

export const expenses = sqliteTable(
  'expense',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    workerId: text('worker_id')
      .notNull()
      .references(() => users.id),
    spentOn: text('spent_on').notNull(),
    occurredTimeLocal: text('occurred_time_local'),
    timeEntryId: text('time_entry_id').references(() => timeEntries.id),
    category: text('category').notNull(),
    currency: text('currency').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    clientTreatment: text('client_treatment').notNull(),
    approvalState: text('approval_state').notNull().default('draft'),
    invoiceId: text('invoice_id'),
    vendor: text('vendor'),
    description: text('description'),
    whoPaid: text('who_paid'),
    receiptDocumentId: text('receipt_document_id'),
    receiptRequired: integer('receipt_required', { mode: 'boolean' }),
    reimbursementState: text('reimbursement_state'),
    submittedAt: text('submitted_at'),
    approvedBy: text('approved_by'),
    approvedAt: text('approved_at'),
    financeApprovedBy: text('finance_approved_by'),
    financeApprovedAt: text('finance_approved_at'),
    taxAmountMinor: integer('tax_amount_minor'),
    paymentMethod: text('payment_method'),
    markupBps: integer('markup_bps'),
    projectCurrencyAmountMinor: integer('project_currency_amount_minor'),
    billingTreatment: text('billing_treatment'),
    billingState: text('billing_state'),
    billingAmountMinor: integer('billing_amount_minor'),
    billingLockId: text('billing_lock_id'),
    reimbursementAmountMinor: integer('reimbursement_amount_minor'),
    reimbursedAt: text('reimbursed_at'),
    reimbursementReference: text('reimbursement_reference'),
    expectedReimbursementOn: text('expected_reimbursement_on'),
    expectedRecoveryOn: text('expected_recovery_on'),
    commercialClassificationState: text('commercial_classification_state')
      .notNull()
      .default('legacy_classified'),
    fxRateBps: integer('fx_rate_bps'),
    expensePolicyRequired: integer('expense_policy_required', { mode: 'boolean' })
      .notNull()
      .default(false),
    assignmentExpensePolicyId: text('assignment_expense_policy_id').references(
      () => assignmentExpensePolicies.id,
    ),
    version: integer('version').notNull().default(1),
    ...lifecycle,
  },
  (table) => [index('expense_project_period_idx').on(table.projectId, table.spentOn)],
);

export const assignmentExpensePolicies = sqliteTable(
  'assignment_expense_policy',
  {
    id: text('id').primaryKey(),
    projectMemberId: text('project_member_id')
      .notNull()
      .references(() => projectMembers.id),
    payer: text('payer').notNull(),
    category: text('category'),
    effectiveFrom: text('effective_from').notNull(),
    effectiveTo: text('effective_to'),
    workerReimbursement: text('worker_reimbursement').notNull(),
    clientRecovery: text('client_recovery').notNull(),
    markupBps: integer('markup_bps').notNull().default(0),
    version: integer('version').notNull(),
    reason: text('reason').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('assignment_expense_policy_lookup_idx').on(
      table.projectMemberId,
      table.payer,
      table.effectiveFrom,
      table.effectiveTo,
    ),
  ],
);

export const operationalTimeExpenseRequests = sqliteTable('operational_time_expense_request', {
  actorUserId: text('actor_user_id')
    .notNull()
    .references(() => users.id),
  requestId: text('request_id').notNull(),
  payloadSha256: text('payload_sha256').notNull(),
  timeEntryId: text('time_entry_id')
    .notNull()
    .references(() => timeEntries.id),
  expenseId: text('expense_id')
    .notNull()
    .references(() => expenses.id),
  createdAt: text('created_at').notNull(),
});

// One receipt expense is the financial source; these rows only attribute its
// total to crew time. They never become independent invoice/payable sources.
export const crewSharedExpenseAllocationGroups = sqliteTable(
  'crew_shared_expense_allocation_group',
  {
    id: text('id').primaryKey(),
    expenseId: text('expense_id')
      .notNull()
      .unique()
      .references(() => expenses.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    requestId: text('request_id').notNull(),
    payloadSha256: text('payload_sha256').notNull(),
    totalMinor: integer('total_minor').notNull(),
    allocationCount: integer('allocation_count').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
);

export const crewSharedExpenseAllocations = sqliteTable(
  'crew_shared_expense_allocation',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => crewSharedExpenseAllocationGroups.id),
    timeEntryId: text('time_entry_id')
      .notNull()
      .references(() => timeEntries.id),
    workerId: text('worker_id')
      .notNull()
      .references(() => users.id),
    grantId: text('grant_id')
      .notNull()
      .references(() => crewLeaderGrants.id),
    amountMinor: integer('amount_minor').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.timeEntryId] })],
);
