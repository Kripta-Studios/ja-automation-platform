import type { DatabaseSync } from 'node:sqlite';

type AssignmentRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
};

/** Keep this choice list aligned with settleCompensation's active membership rule. */
export function listProjectSettlementWorkers(
  sqlite: DatabaseSync,
  projectId: string,
  today: string,
): Array<{ id: string; name: string; assignmentRelation: string; assignmentWindows: string[] }> {
  if (!projectId) return [];
  const assignments = sqlite
    .prepare(
      `SELECT u.id,u.name,pm.starts_on,pm.ends_on
         FROM project_member pm
         JOIN user u ON u.id=pm.user_id
        WHERE pm.project_id=? AND pm.status='active'
          AND u.status='active' AND u.role IN ('worker','project_manager')
        ORDER BY u.name,u.id,pm.starts_on DESC`,
    )
    .all(projectId) as AssignmentRow[];
  const workers = new Map<
    string,
    { id: string; name: string; assignmentRelation: string; assignmentWindows: string[] }
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
        assignmentRelation: relation,
        assignmentWindows: previous
          ? [...previous.assignmentWindows, assignmentWindow]
          : [assignmentWindow],
      });
    } else {
      previous.assignmentWindows.push(assignmentWindow);
    }
  }
  return [...workers.values()];
}
