import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.ts';
import { lifecycle } from './shared.ts';

export const invoices = sqliteTable(
  'invoice',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    invoiceNumber: text('invoice_number').unique(),
    streamType: text('stream_type').notNull(),
    state: text('state').notNull().default('draft'),
    currency: text('currency').notNull(),
    subtotalMinor: integer('subtotal_minor').notNull().default(0),
    taxMinor: integer('tax_minor').notNull().default(0),
    totalMinor: integer('total_minor').notNull().default(0),
    issuedAt: text('issued_at'),
    snapshotJson: text('snapshot_json'),
    billingRuleId: text('billing_rule_id'),
    periodStart: text('period_start'),
    periodEnd: text('period_end'),
    dueAt: text('due_at'),
    calculationHash: text('calculation_hash'),
    sentAt: text('sent_at'),
    pdfStatus: text('pdf_status'),
    pdfStorageKey: text('pdf_storage_key'),
    pdfSha256: text('pdf_sha256'),
    pdfGeneratedAt: text('pdf_generated_at'),
    sourceLockAt: text('source_lock_at'),
    voidedAt: text('voided_at'),
    pdfByteLength: integer('pdf_byte_length'),
    version: integer('version').notNull().default(1),
    ...lifecycle,
  },
  (table) => [
    index('invoice_project_idx').on(table.projectId),
    uniqueIndex('invoice_number_unique').on(table.invoiceNumber),
  ],
);

export const invoiceLines = sqliteTable('invoice_line', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull(),
  description: text('description').notNull(),
  quantityNumerator: integer('quantity_numerator').notNull(),
  quantityDenominator: integer('quantity_denominator').notNull(),
  unitPriceMinor: integer('unit_price_minor').notNull(),
  subtotalMinor: integer('subtotal_minor').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  taxMinor: integer('tax_minor'),
  groupingKey: text('grouping_key'),
});

export const invoiceSources = sqliteTable('invoice_source', {
  invoiceId: text('invoice_id').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  sourceVersion: integer('source_version').notNull(),
  lockedAt: text('locked_at'),
});

export const payments = sqliteTable('payment', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  receivedAt: text('received_at').notNull(),
  reference: text('reference'),
  createdAt: text('created_at').notNull(),
  idempotencyKey: text('idempotency_key'),
});

export const invoiceEvents = sqliteTable('invoice_event', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull(),
  eventType: text('event_type').notNull(),
  amountMinor: integer('amount_minor'),
  reason: text('reason').notNull(),
  actorId: text('actor_id').notNull(),
  occurredAt: text('occurred_at').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
});

export const invoiceAdjustments = sqliteTable('invoice_adjustment', {
  id: text('id').primaryKey(),
  originalInvoiceId: text('original_invoice_id').notNull(),
  adjustmentInvoiceId: text('adjustment_invoice_id').notNull().unique(),
  adjustmentType: text('adjustment_type').notNull(),
  reason: text('reason').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});
