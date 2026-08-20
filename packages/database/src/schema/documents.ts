import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.ts';
import { users } from './identity.ts';
import { lifecycle } from './shared.ts';

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
    originalFilename: text('original_filename'),
    description: text('description'),
    sensitive: integer('sensitive', { mode: 'boolean' }),
    artifactType: text('artifact_type'),
    softwareVersion: text('software_version'),
    supersedesId: text('supersedes_id'),
    approvedAt: text('approved_at'),
    approvedBy: text('approved_by'),
    sensitivity: text('sensitivity'),
    safeFilename: text('safe_filename'),
    scanStatus: text('scan_status'),
    scannedAt: text('scanned_at'),
    scanProvider: text('scan_provider'),
    artifactMetadataJson: text('artifact_metadata_json'),
    version: integer('version').notNull().default(1),
    ...lifecycle,
  },
  (table) => [
    index('document_project_idx').on(table.projectId),
    uniqueIndex('document_content_idx').on(table.sha256, table.byteLength),
  ],
);

export const documentAccessEvents = sqliteTable('document_access_event', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull(),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  occurredAt: text('occurred_at').notNull(),
});
