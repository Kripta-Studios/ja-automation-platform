import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.ts';

export const auditEvents = sqliteTable('audit_event', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  occurredAt: text('occurred_at').notNull(),
  detailsJson: text('details_json').notNull(),
  projectId: text('project_id').references(() => projects.id),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  reason: text('reason'),
  correlationId: text('correlation_id'),
  metadataJson: text('metadata_json'),
});
