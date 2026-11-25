import type { DatabaseSync } from 'node:sqlite';
import { mondayOf } from '$lib/server/portal-week';
import { hasAssignmentFinanceCoverage } from '$lib/server/actions/assignment-finance';
import { personPayIntervalView, type PersonPayIntervalView } from '$lib/server/intervals';

/**
 * Extra, role-safe projections for the People directory (`/projects?view=team`).
 *
 * - Week hours and pending counts are operational (minutes and counts, no money)
 *   and are limited to the projects the principal can already see.
 * - Mailbox link state comes from the local `mail_identity` table, so it works
 *   even when the Stalwart mail server is unavailable. Owner only.
 * - Pay terms (worker compensation rules) are returned only to the Owner and
 *   only for the one person being viewed.
 */
export type TeamPersonStats = {
  worker_id: string;
  week_submitted_minutes: number;
  week_approved_minutes: number;
  week_draft_minutes: number;
  pending_time: number;
  pending_expenses: number;
};

export type TeamDirectoryExtras = {
  teamWeekStart: string;
  teamWeekEnd: string;
  teamStats: TeamPersonStats[];
  mailboxLinkedIds: string[];
  personPayRules: Array<Record<string, unknown>>;
  defaultsProjectIds: string[];
  /** Owner only, viewed person only: how a new assignment gets its rates. */
  personAssignModes: Record<string, 'defaults' | 'existing' | 'rates'>;
  /** Owner only, viewed person only: how often the person is paid. */
  personPayInterval: PersonPayIntervalView | null;
};

function shift(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function loadTeamDirectoryExtras(
  sqlite: DatabaseSync,
  options: {
    role: string;
    canonicalOwner: boolean;
    projectIds: readonly string[];
    personId?: string | null;
    projects?: ReadonlyArray<Record<string, unknown>>;
    today?: string;
  },
): TeamDirectoryExtras {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const weekStart = mondayOf(today);
  const weekEnd = shift(weekStart, 6);
  const projectIds = [...options.projectIds];
  const placeholders = projectIds.map(() => '?').join(',');
  const teamStats: TeamPersonStats[] = [];
  if (projectIds.length) {
    const time = sqlite
      .prepare(
        `SELECT worker_id,
                SUM(CASE WHEN work_date BETWEEN ? AND ? AND approval_state='submitted' THEN minutes ELSE 0 END) submitted,
                SUM(CASE WHEN work_date BETWEEN ? AND ? AND approval_state IN ('approved','finance_approved','locked') THEN minutes ELSE 0 END) approved,
                SUM(CASE WHEN work_date BETWEEN ? AND ? AND approval_state IN ('draft','needs_changes') THEN minutes ELSE 0 END) draft,
                SUM(CASE WHEN approval_state='submitted' THEN 1 ELSE 0 END) pending
           FROM time_entry
          WHERE project_id IN (${placeholders})
          GROUP BY worker_id`,
      )
      .all(weekStart, weekEnd, weekStart, weekEnd, weekStart, weekEnd, ...projectIds) as Array<{
      worker_id: string;
      submitted: number | null;
      approved: number | null;
      draft: number | null;
      pending: number | null;
    }>;
    const expenses = sqlite
      .prepare(
        `SELECT worker_id, COUNT(*) pending
           FROM expense
          WHERE project_id IN (${placeholders}) AND approval_state='submitted'
          GROUP BY worker_id`,
      )
      .all(...projectIds) as Array<{ worker_id: string; pending: number }>;
    const byWorker = new Map<string, TeamPersonStats>();
    const entry = (id: string): TeamPersonStats => {
      let row = byWorker.get(id);
      if (!row) {
        row = {
          worker_id: id,
          week_submitted_minutes: 0,
          week_approved_minutes: 0,
          week_draft_minutes: 0,
          pending_time: 0,
          pending_expenses: 0,
        };
        byWorker.set(id, row);
      }
      return row;
    };
    for (const row of time) {
      const target = entry(String(row.worker_id));
      target.week_submitted_minutes = Number(row.submitted ?? 0);
      target.week_approved_minutes = Number(row.approved ?? 0);
      target.week_draft_minutes = Number(row.draft ?? 0);
      target.pending_time = Number(row.pending ?? 0);
    }
    for (const row of expenses) entry(String(row.worker_id)).pending_expenses = Number(row.pending);
    teamStats.push(...byWorker.values());
  }
  const isOwner = options.role === 'owner_admin' && options.canonicalOwner;
  const mailboxLinkedIds = isOwner
    ? (
        sqlite.prepare("SELECT user_id FROM mail_identity WHERE status='active'").all() as Array<{
          user_id: string;
        }>
      ).map((row) => String(row.user_id))
    : [];
  const personPayRules =
    isOwner && options.personId
      ? (sqlite
          .prepare(
            `SELECT r.id,r.project_id,p.project_number,p.name project_name,r.currency,r.rate_minor,
                    r.rate_basis,r.rule_type,r.effective_from,r.effective_to
               FROM compensation_rule r
               LEFT JOIN project p ON p.id=r.project_id
              WHERE r.worker_id=?
              ORDER BY (r.effective_to IS NULL OR r.effective_to>=?) DESC, r.effective_from DESC
              LIMIT 50`,
          )
          .all(options.personId, today) as Array<Record<string, unknown>>)
      : [];
  const defaultsProjectIds =
    isOwner && projectIds.length
      ? (
          sqlite
            .prepare(
              `SELECT DISTINCT project_id FROM project_person_defaults WHERE project_id IN (${placeholders})`,
            )
            .all(...projectIds) as Array<{ project_id: string }>
        ).map((row) => String(row.project_id))
      : [];
  const personAssignModes: Record<string, 'defaults' | 'existing' | 'rates'> = {};
  if (isOwner && options.personId) {
    const defaults = sqlite.prepare(
      'SELECT 1 FROM project_person_defaults WHERE project_id=? AND currency=? AND effective_from<=? LIMIT 1',
    );
    for (const project of options.projects ?? []) {
      if (!['active', 'planned', 'paused'].includes(String(project.status))) continue;
      const id = String(project.id);
      const currency = String(project.currency ?? '');
      const start =
        typeof project.start_date === 'string' && project.start_date > today
          ? project.start_date
          : today;
      personAssignModes[id] = defaults.get(id, currency, start)
        ? 'defaults'
        : hasAssignmentFinanceCoverage(sqlite, id, options.personId, currency, start)
          ? 'existing'
          : 'rates';
    }
  }
  return {
    personAssignModes,
    teamWeekStart: weekStart,
    teamWeekEnd: weekEnd,
    teamStats,
    mailboxLinkedIds,
    personPayRules,
    defaultsProjectIds,
    personPayInterval:
      isOwner && options.personId ? personPayIntervalView(sqlite, options.personId, today) : null,
  };
}
