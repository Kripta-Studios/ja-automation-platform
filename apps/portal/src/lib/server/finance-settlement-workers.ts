import type { DatabaseSync } from 'node:sqlite';
import { nextPayPeriod } from '@ja/database';

type AssignmentRow = {
  id: string;
  member_id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
};

/** Keep this choice list aligned with settleCompensation's active membership rule. */
export function listProjectSettlementWorkers(
  sqlite: DatabaseSync,
  projectId: string,
  today: string,
): Array<{
  id: string;
  name: string;
  assignmentRelation: string;
  assignmentWindows: string[];
  /** Owner request 2026-11-25: the person's pay interval and the period their next pay covers. */
  payInterval?: string | null;
  nextPeriodStart?: string | null;
  nextPeriodEnd?: string | null;
}> {
  if (!projectId) return [];
  const assignments = sqlite
    .prepare(
      `SELECT u.id,u.name,pm.id member_id,pm.starts_on,pm.ends_on
         FROM project_member pm
         JOIN user u ON u.id=pm.user_id
        WHERE pm.project_id=? AND pm.status='active'
          AND u.status='active' AND u.role IN ('worker','project_manager')
          -- D3 (round 2): a project manager or supplier coordinator assignment is not paid
          -- work, and supplier staff are paid by their supplier, never by J&A compensation.
          AND COALESCE(pm.assignment_role,'worker') NOT IN ('project_manager','supplier_coordinator')
          AND NOT EXISTS (SELECT 1 FROM supplier_user_profile sp WHERE sp.user_id=u.id)
        ORDER BY u.name,u.id,pm.starts_on DESC`,
    )
    .all(projectId) as AssignmentRow[];
  const workers = new Map<
    string,
    {
      id: string;
      name: string;
      assignmentRelation: string;
      assignmentWindows: string[];
      memberId: string;
      startsOn: string;
      endsOn: string | null;
    }
  >();
  for (const assignment of assignments) {
    const relation =
      assignment.starts_on <= today && (assignment.ends_on === null || assignment.ends_on >= today)
        ? 'Current project assignment'
        : assignment.ends_on !== null && assignment.ends_on < today
          ? 'Past project assignment'
          : 'Upcoming project assignment';
    const previous = workers.get(assignment.id);
    const assignmentWindow = `${assignment.starts_on}/${assignment.ends_on ?? ''}`;
    if (
      !previous ||
      (relation === 'Current project assignment' &&
        previous.assignmentRelation !== 'Current project assignment') ||
      (relation === 'Past project assignment' &&
        previous.assignmentRelation === 'Upcoming project assignment')
    ) {
      workers.set(assignment.id, {
        id: assignment.id,
        name: assignment.name,
        memberId: assignment.member_id,
        startsOn: assignment.starts_on,
        endsOn: assignment.ends_on,
        assignmentRelation: relation,
        assignmentWindows: previous
          ? [...previous.assignmentWindows, assignmentWindow]
          : [assignmentWindow],
      });
    } else {
      previous.assignmentWindows.push(assignmentWindow);
    }
  }
  return [...workers.values()].map(({ memberId, startsOn, endsOn, ...worker }) => {
    let next: ReturnType<typeof nextPayPeriod>;
    try {
      next = nextPayPeriod(sqlite, worker.id, { today, projectId, projectMemberId: memberId });
    } catch {
      // Advisory only: never hide the worker list because of it.
      return { ...worker, payInterval: null, nextPeriodStart: null, nextPeriodEnd: null };
    }
    // Clip to the assignment so the worker stays selectable for that period.
    const start = next.period && next.period.start < startsOn ? startsOn : next.period?.start;
    const end = next.period && endsOn && next.period.end > endsOn ? endsOn : next.period?.end;
    return {
      ...worker,
      payInterval: next.interval,
      nextPeriodStart: start && end && start <= end ? start : null,
      nextPeriodEnd: start && end && start <= end ? end : null,
    };
  });
}
