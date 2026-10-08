import type { PortalRow } from '../portal-data';

function value(row: PortalRow, ...keys: string[]): string {
  for (const key of keys) {
    const candidate = row[key];
    if (candidate !== null && candidate !== undefined && String(candidate).trim())
      return String(candidate);
  }
  return '';
}

function assignmentCoversDate(assignment: PortalRow, date: string): boolean {
  if (!date || (value(assignment, 'status') && value(assignment, 'status') !== 'active'))
    return false;
  return (
    value(assignment, 'starts_on', 'startsOn') <= date &&
    (!value(assignment, 'ends_on', 'endsOn') || value(assignment, 'ends_on', 'endsOn') >= date)
  );
}

/** Projects with at least one active worker assignment covering the selected work date. */
export function assignedTimeProjectsForDate(
  projects: readonly PortalRow[],
  assignments: readonly PortalRow[],
  date: string,
): PortalRow[] {
  if (!date) return [];
  const assignedProjectIds = new Set(
    assignments
      .filter((assignment) => assignmentCoversDate(assignment, date))
      .map((assignment) => value(assignment, 'project_id', 'projectId'))
      .filter(Boolean),
  );
  return projects.filter((project) => assignedProjectIds.has(value(project, 'id', 'project_id')));
}

/** Workers assigned to one selected project on the selected work date. */
export function assignedTimeWorkersForProjectDate(
  workers: readonly PortalRow[],
  assignments: readonly PortalRow[],
  projectId: string,
  date: string,
): PortalRow[] {
  if (!projectId || !date) return [];
  const assignedWorkerIds = new Set(
    assignments
      .filter(
        (assignment) =>
          value(assignment, 'project_id', 'projectId') === projectId &&
          assignmentCoversDate(assignment, date),
      )
      .map((assignment) => value(assignment, 'worker_id', 'workerId'))
      .filter(Boolean),
  );
  return workers.filter((worker) => assignedWorkerIds.has(value(worker, 'id', 'worker_id')));
}
