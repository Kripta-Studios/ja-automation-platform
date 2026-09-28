import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const approvalEvents = sqliteTable('approval_event', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  fromState: text('from_state').notNull(),
  toState: text('to_state').notNull(),
  actorId: text('actor_id').notNull(),
  reason: text('reason'),
  occurredAt: text('occurred_at').notNull(),
});

export const notifications = sqliteTable('notification', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(),
  subjectId: text('subject_id').notNull(),
  readAt: text('read_at'),
  createdAt: text('created_at').notNull(),
});
