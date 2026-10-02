import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.ts';
import { users } from './identity.ts';
export const projectPersonDefaults = sqliteTable(
  'project_person_defaults',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull(),
    effectiveFrom: text('effective_from').notNull(),
    configJson: text('config_json').notNull(),
    version: integer('version').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('project_person_defaults_date_unique').on(table.projectId, table.effectiveFrom),
  ],
);
export const projectMemberDefaultTerms = sqliteTable('project_member_default_terms', {
  projectMemberId: text('project_member_id').primaryKey(),
  defaultId: text('default_id')
    .notNull()
    .references(() => projectPersonDefaults.id, { onDelete: 'cascade' }),
});
