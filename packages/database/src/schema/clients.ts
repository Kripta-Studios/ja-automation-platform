import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { lifecycle } from './shared.ts';

export const clients = sqliteTable('client', {
  id: text('id').primaryKey(),
  clientNumber: text('client_number').notNull().unique(),
  clientCode: text('client_code'),
  legalName: text('legal_name').notNull(),
  displayName: text('display_name').notNull(),
  status: text('status').notNull(),
  currency: text('currency').notNull(),
  timezone: text('timezone').notNull(),
  billingEmail: text('billing_email'),
  billingAddress: text('billing_address'),
  poReference: text('po_reference'),
  paymentTermsDays: integer('payment_terms_days'),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
  ...lifecycle,
});

export const clientContacts = sqliteTable('client_contact', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  role: text('role'),
  isBillingContact: integer('is_billing_contact', { mode: 'boolean' }),
  isPrimary: integer('is_primary', { mode: 'boolean' }),
  version: integer('version').notNull().default(1),
  ...lifecycle,
});
