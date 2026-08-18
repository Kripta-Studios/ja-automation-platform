import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const lifecycle = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  version: integer('version').notNull().default(1),
};

export const users = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('worker'),
  status: text('status').notNull().default('invited'),
  mfaEnrolled: integer('mfa_enrolled', { mode: 'boolean' }).notNull().default(false),
  ...lifecycle,
});

export const sessions = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('session_user_idx').on(table.userId)],
);

export const invitations = sqliteTable('invitation', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  role: text('role').notNull(),
  invitedBy: text('invited_by')
    .notNull()
    .references(() => users.id),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull(),
});

export const clients = sqliteTable('client', {
  id: text('id').primaryKey(),
  clientNumber: text('client_number').notNull().unique(),
  legalName: text('legal_name').notNull(),
  displayName: text('display_name').notNull(),
  status: text('status').notNull(),
  currency: text('currency').notNull(),
  timezone: text('timezone').notNull(),
  ...lifecycle,
});

export const projects = sqliteTable(
  'project',
  {
    id: text('id').primaryKey(),
    projectNumber: text('project_number').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    name: text('name').notNull(),
    timezone: text('timezone').notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull(),
    billingModel: text('billing_model').notNull(),
    ...lifecycle,
  },
  (table) => [index('project_client_idx').on(table.clientId)],
);

export const projectMembers = sqliteTable(
  'project_member',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    assignmentRole: text('assignment_role').notNull(),
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on'),
    ...lifecycle,
  },
  (table) => [
    uniqueIndex('project_member_unique').on(table.projectId, table.userId, table.startsOn),
  ],
);

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
    ...lifecycle,
  },
  (table) => [
    index('time_project_period_idx').on(table.projectId, table.workDate),
    index('time_worker_period_idx').on(table.workerId, table.workDate),
  ],
);

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
    ...lifecycle,
  },
  (table) => [index('expense_project_period_idx').on(table.projectId, table.spentOn)],
);

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
    ...lifecycle,
  },
  (table) => [
    index('invoice_project_idx').on(table.projectId),
    uniqueIndex('invoice_number_unique').on(table.invoiceNumber),
  ],
);

export const documents = sqliteTable(
  'document',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    sha256: text('sha256').notNull(),
    mediaType: text('media_type').notNull(),
    byteLength: integer('byte_length').notNull(),
    state: text('state').notNull(),
    storageKey: text('storage_key').notNull(),
    ...lifecycle,
  },
  (table) => [
    index('document_project_idx').on(table.projectId),
    uniqueIndex('document_content_idx').on(table.sha256, table.byteLength),
  ],
);

export const auditEvents = sqliteTable('audit_event', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  occurredAt: text('occurred_at').notNull(),
  detailsJson: text('details_json').notNull(),
});

export const jobs = sqliteTable('job', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  state: text('state').notNull(),
  runAfter: text('run_after').notNull(),
  leaseUntil: text('lease_until'),
  attempts: integer('attempts').notNull().default(0),
  payloadJson: text('payload_json').notNull(),
  ...lifecycle,
});

export const publicInquiries = sqliteTable('public_inquiry', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  payloadJson: text('payload_json').notNull(),
  sourceHash: text('source_hash').notNull(),
  createdAt: text('created_at').notNull(),
  deliveredAt: text('delivered_at'),
});

export const outboxEvents = sqliteTable('outbox_event', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  aggregateId: text('aggregate_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  payloadJson: text('payload_json').notNull(),
  availableAt: text('available_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  deliveredAt: text('delivered_at'),
  createdAt: text('created_at').notNull(),
});
