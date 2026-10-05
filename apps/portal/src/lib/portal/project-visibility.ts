/** A presentation scope inside an existing authorization scope; never a grant of access. */
export function projectVisibility<T extends Record<string, unknown>>(
  authorizedProjects: readonly T[],
  includeArchived = false,
): { projects: T[]; projectIds: Set<string> } {
  const projects = authorizedProjects.filter(
    (project) => Boolean(project.id) && (includeArchived || project.status !== 'archived'),
  );
  return { projects, projectIds: new Set(projects.map((project) => String(project.id))) };
}

export function visibleProjectRecords<T extends readonly Record<string, unknown>[]>(
  authorizedRecords: T,
  projectIds: ReadonlySet<string>,
): Array<T[number]> {
  return authorizedRecords.filter((row) => projectIds.has(String(row.project_id ?? ''))) as Array<
    T[number]
  >;
}

export function normalizeVisibleProjectSelection(
  requested: unknown,
  projectIds: ReadonlySet<string>,
): string {
  const id = String(requested ?? '').trim();
  return projectIds.has(id) ? id : '';
}

export function includesArchivedProjectHistory(parameters: URLSearchParams): boolean {
  return parameters.get('includeArchived') === '1';
}
