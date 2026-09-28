import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const publicInquiries = sqliteTable('public_inquiry', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  payloadJson: text('payload_json').notNull(),
  sourceHash: text('source_hash').notNull(),
  createdAt: text('created_at').notNull(),
  deliveredAt: text('delivered_at'),
});
