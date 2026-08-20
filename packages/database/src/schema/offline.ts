import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const offlineMutations = sqliteTable('offline_mutation', {
  mutationId: text('mutation_id').primaryKey(),
  userId: text('user_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  baseVersion: integer('base_version').notNull(),
  payloadJson: text('payload_json').notNull(),
  attachmentIdsJson: text('attachment_ids_json').notNull(),
  state: text('state').notNull(),
  resultJson: text('result_json').notNull(),
  createdAt: text('created_at').notNull(),
  processedAt: text('processed_at').notNull(),
});

export const mutationReceipts = sqliteTable('mutation_receipt', {
  mutationId: text('mutation_id').primaryKey(),
  userId: text('user_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  resultJson: text('result_json').notNull(),
  createdAt: text('created_at').notNull(),
});
