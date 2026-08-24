import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './identity.ts';
import { projects } from './projects.ts';
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
    version: integer('version').notNull().default(1),
    ...lifecycle,
  },
  (table) => [index('expense_project_period_idx').on(table.projectId, table.spentOn)],
);
