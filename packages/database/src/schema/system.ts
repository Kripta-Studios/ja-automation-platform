import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const schemaMigrations = sqliteTable('schema_migration', {
  version: integer('version').primaryKey(),
  appliedAt: text('applied_at').notNull(),
});

export const numberSequences = sqliteTable('number_sequence', {
  scope: text('scope').notNull(),
  scopeId: text('scope_id').notNull(),
  nextValue: integer('next_value').notNull(),
  version: integer('version').notNull().default(1),
});

export const rateLimitBuckets = sqliteTable('rate_limit_bucket', {
  bucketKey: text('bucket_key').primaryKey(),
  windowStartedAt: text('window_started_at').notNull(),
  requestCount: integer('request_count').notNull(),
});
