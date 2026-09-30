type AssignmentAction = 'updateAssignment' | 'removeAssignment';

function workflowParams(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.searchParams);
  for (const key of [...params.keys()]) {
    if (key.startsWith('/')) params.delete(key);
  }
  return params;
}

/** Enter an assignment workflow without dropping the directory's context. */
export function assignmentWorkflowHref(
  url: URL,
  action: AssignmentAction,
  selection: Readonly<{ project?: string; worker?: string }> = {},
): string {
  const params = workflowParams(url);
  params.set('action', action === 'updateAssignment' ? 'update-assignment' : 'remove-assignment');
  for (const key of ['project', 'worker'] as const) {
    if (selection[key] !== undefined) params.set(key, selection[key]);
  }
  return `${url.pathname}?${params.toString()}#project-assignment-list`;
}

/** Keep native assignment submissions in the same filtered workflow. */
export function assignmentFormAction(url: URL, action: AssignmentAction): string {
  const params = workflowParams(url);
  params.set('action', action === 'updateAssignment' ? 'update-assignment' : 'remove-assignment');
  return `${url.pathname}?/${action}&${params.toString()}${url.hash || '#project-assignment-list'}`;
}

const nativeWorkflows = {
  createClient: 'new-client',
  updateClient: 'update-client',
  createProject: 'new-project',
  assignWorker: 'assign-worker',
  updateAssignment: 'update-assignment',
  removeAssignment: 'remove-assignment',
} as const;

/** Current explicit navigation outranks a retained previous action result. */
export function projectWorkflowFrom(url: URL, resultAction?: string) {
  const requested = url.searchParams.get('action');
  const explicit = Object.values(nativeWorkflows).find((workflow) => workflow === requested);
  if (explicit) return explicit;
  const nativeAction = Object.keys(nativeWorkflows).find(
    (action) => url.searchParams.has(`/${action}`) && (!resultAction || resultAction === action),
  ) as keyof typeof nativeWorkflows | undefined;
  return nativeAction ? nativeWorkflows[nativeAction] : null;
}

/** Cross-section recovery must target Projects, retaining directory context only there. */
export function assignmentReviewHref(url: URL, projectsPath: string): string {
  const destination = new URL(projectsPath, url);
  if (destination.pathname === url.pathname) destination.search = url.search;
  else {
    for (const key of ['lang', 'project', 'worker']) {
      for (const value of url.searchParams.getAll(key)) destination.searchParams.append(key, value);
    }
  }
  return assignmentWorkflowHref(destination, 'updateAssignment');
}

/** Preserve the return directory in the URL while showing the chosen assignment workflow. */
export function assignmentDirectoryView(
  url: URL,
  workflow: ReturnType<typeof projectWorkflowFrom>,
) {
  if (workflow !== null) return null;
  const view = url.searchParams.get('view');
  return view === 'team' || view === 'clients' ? view : null;
}

/** Retain a failed field only for its exact action and assignment. */
export function assignmentRetainedValue(
  result: { actionName?: string; values?: Readonly<Record<string, unknown>> } | null | undefined,
  action: AssignmentAction | undefined,
  assignmentId: unknown,
  field: string,
  fallback = '',
): string {
  if (
    !action ||
    result?.actionName !== action ||
    String(result.values?.assignmentId ?? '') !== String(assignmentId) ||
    !result.values ||
    !Object.hasOwn(result.values, field)
  )
    return fallback;
  const submitted = result.values[field];
  return submitted == null ? '' : String(submitted);
}
