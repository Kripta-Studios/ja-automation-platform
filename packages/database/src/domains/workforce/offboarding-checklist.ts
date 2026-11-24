import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { AccessDeniedError, ValidationError } from '../../repository.ts';

export type OffboardingChecklist = Readonly<{
  /** Unsent time and expense drafts (they will never reach approval). */
  draftTime: number;
  draftExpenses: number;
  /** Submitted or returned records still waiting for a decision. */
  pendingTime: number;
  pendingExpenses: number;
  /** Assignments still running today or later. */
  activeAssignments: ReadonlyArray<{ projectName: string; endsOn: string | null }>;
  /** Approved hours with no settled pay period covering their day. */
  unsettledApprovedMinutes: number;
  /** Approved expenses the worker paid that J&A has not reimbursed yet. */
  unreimbursedExpenses: number;
}>;

/**
 * T33: what an owner should see before suspending or offboarding a person:
 * drafts, records waiting for a decision, running assignments and pay that is
 * still owed. Counts only; no amounts (the owner opens Pay for the money).
 */
export function offboardingChecklist(
  sqlite: DatabaseSync,
  principal: Principal,
  userId: string,
  today: string = new Date().toISOString().slice(0, 10),
): OffboardingChecklist {
  if (principal.role !== 'owner_admin') throw new AccessDeniedError('Owner administration required');
  if (!sqlite.prepare('SELECT 1 FROM user WHERE id=?').get(userId))
    throw new ValidationError('User not found');
  const count = (sql: string, ...args: string[]) =>
    Number((sqlite.prepare(sql).get(...args) as { n: number | null } | undefined)?.n ?? 0);
  return {
    draftTime: count(
      "SELECT COUNT(*) n FROM time_entry WHERE worker_id=? AND approval_state='draft'",
      userId,
    ),
    draftExpenses: count(
      "SELECT COUNT(*) n FROM expense WHERE worker_id=? AND approval_state='draft'",
      userId,
    ),
    pendingTime: count(
      "SELECT COUNT(*) n FROM time_entry WHERE worker_id=? AND approval_state IN ('submitted','needs_changes')",
      userId,
    ),
    pendingExpenses: count(
      "SELECT COUNT(*) n FROM expense WHERE worker_id=? AND approval_state IN ('submitted','needs_changes')",
      userId,
    ),
    activeAssignments: sqlite
      .prepare(
        `SELECT p.name projectName,pm.ends_on endsOn FROM project_member pm JOIN project p ON p.id=pm.project_id
          WHERE pm.user_id=? AND pm.status='active' AND (pm.ends_on IS NULL OR pm.ends_on>=?)
          ORDER BY p.name`,
      )
      .all(userId, today) as Array<{ projectName: string; endsOn: string | null }>,
    unsettledApprovedMinutes: count(
      `SELECT COALESCE(SUM(t.minutes),0) n FROM time_entry t
        WHERE t.worker_id=? AND t.approval_state='approved'
          AND NOT EXISTS(SELECT 1 FROM compensation_settlement s
                          WHERE s.worker_id=t.worker_id AND s.project_id=t.project_id
                            AND s.state='settled' AND s.period_start<=t.work_date AND s.period_end>=t.work_date)`,
      userId,
    ),
    unreimbursedExpenses: count(
      `SELECT COUNT(*) n FROM expense WHERE worker_id=? AND approval_state='approved' AND who_paid='worker'
          AND reimbursed_at IS NULL AND reimbursement_state<>'reimbursed'`,
      userId,
    ),
  };
}
