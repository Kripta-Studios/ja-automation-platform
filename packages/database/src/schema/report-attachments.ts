import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { documents } from './documents.ts';
import { projects } from './projects.ts';
import { users } from './identity.ts';

/**
 * Immutable evidence links from a native daily/technical report to a private
 * document.  reportId is polymorphic by design; SQLite migration triggers
 * enforce the report-type-specific parent and project invariants.
 */
export const reportDocumentLinks = sqliteTable(
  'report_document_link',
  {
    id: text('id').primaryKey(),
    reportType: text('report_type').notNull(),
    reportId: text('report_id').notNull(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    attachmentKind: text('attachment_kind').notNull(),
    systemReferenceSnapshot: text('system_reference_snapshot'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('report_document_link_document_uq').on(table.documentId),
    index('report_document_link_report_idx').on(
      table.reportType,
      table.reportId,
      table.attachmentKind,
    ),
    index('report_document_link_project_idx').on(table.projectId, table.createdAt),
  ],
);
