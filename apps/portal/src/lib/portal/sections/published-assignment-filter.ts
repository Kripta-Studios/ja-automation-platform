import type { PortalRow } from '../portal-data';

export type PublishedAssignmentFilters = Readonly<{
  search: string;
  projectId: string;
  workerId: string;
}>;

export const emptyPublishedAssignmentFilters: PublishedAssignmentFilters = {
  search: '',
  projectId: '',
  workerId: '',
};

export function normalizeAssignmentSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase()
    .trim();
}

function text(row: PortalRow, ...fields: string[]): string[] {
  return fields.map((field) => String(row[field] ?? '')).filter(Boolean);
}

/** Search only the authorized assignment and project directory projections. */
export function publishedAssignmentMatches(
  assignment: PortalRow,
  project: PortalRow | undefined,
  filters: PublishedAssignmentFilters,
): boolean {
  const assignmentProjectId = String(assignment.project_id ?? assignment.projectId ?? '');
  const assignmentWorkerId = String(assignment.user_id ?? assignment.worker_id ?? '');
  if (filters.projectId && assignmentProjectId !== filters.projectId) return false;
  if (filters.workerId && assignmentWorkerId !== filters.workerId) return false;

  const needle = normalizeAssignmentSearch(filters.search);
  if (!needle) return true;
  const searchable = [
    ...text(
      assignment,
      'id',
      'assignment_id',
      'assignment_role',
      'starts_on',
      'ends_on',
      'starts_at',
      'ends_at',
      'site',
      'required_skill',
    ),
    ...text(assignment, 'project_id', 'project_number', 'project_name', 'project_reference'),
    ...text(assignment, 'worker_id', 'user_id', 'worker_name', 'worker_email'),
    ...text(project ?? {}, 'id', 'project_number', 'name', 'project_name', 'project_alias'),
    ...text(
      project ?? {},
      'cost_center_code',
      'cost_center',
      'project_cost_center',
      'po_number',
      'project_po_number',
      'project_reference',
    ),
  ];
  return searchable.some((value) => normalizeAssignmentSearch(value).includes(needle));
}
