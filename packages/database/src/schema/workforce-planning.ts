import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './identity.ts';
import { projects } from './projects.ts';
import { lifecycle } from './shared.ts';

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
    plannedMinutes: integer('planned_minutes'),
    canSubmitTechnicalReport: integer('can_submit_technical_report', { mode: 'boolean' }),
    canReview: integer('can_review', { mode: 'boolean' }),
    status: text('status'),
    roleOnProject: text('role_on_project'),
    expectedMinutesPerDay: integer('expected_minutes_per_day'),
    workdayMask: text('workday_mask'),
    workerCompensationRuleId: text('worker_compensation_rule_id'),
    internalCostRuleId: text('internal_cost_rule_id'),
    clientBillRuleId: text('client_bill_rule_id'),
    version: integer('version').notNull().default(1),
    ...lifecycle,
  },
  (table) => [
    uniqueIndex('project_member_unique').on(table.projectId, table.userId, table.startsOn),
  ],
);

export const skills = sqliteTable('skill', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

export const workerSkills = sqliteTable('worker_skill', {
  workerId: text('worker_id').notNull(),
  skillId: text('skill_id').notNull(),
  proficiency: integer('proficiency').notNull(),
  verifiedAt: text('verified_at'),
});

export const schedules = sqliteTable('schedule', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  timezone: text('timezone').notNull(),
  mondayMinutes: integer('monday_minutes').notNull(),
  tuesdayMinutes: integer('tuesday_minutes').notNull(),
  wednesdayMinutes: integer('wednesday_minutes').notNull(),
  thursdayMinutes: integer('thursday_minutes').notNull(),
  fridayMinutes: integer('friday_minutes').notNull(),
  saturdayMinutes: integer('saturday_minutes').notNull(),
  sundayMinutes: integer('sunday_minutes').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  version: integer('version').notNull().default(1),
});

export const planningAssignments = sqliteTable('planning_assignment', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  workerId: text('worker_id').notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  plannedMinutes: integer('planned_minutes').notNull(),
  status: text('status'),
  site: text('site'),
  requiredSkill: text('required_skill'),
  plannedCostMinor: integer('planned_cost_minor'),
  createdBy: text('created_by'),
  version: integer('version').notNull().default(1),
  ...lifecycle,
});

export const workerAvailability = sqliteTable('worker_availability', {
  id: text('id').primaryKey(),
  workerId: text('worker_id').notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  availability: text('availability').notNull(),
  note: text('note'),
  version: integer('version').notNull().default(1),
  ...lifecycle,
});
