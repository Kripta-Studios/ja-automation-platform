import type { ProblemRemedy } from '../problem/contract';

const scopedReviewRemedies = new Set([
  'review_project_commercial_policy',
  'review_compensation_rules',
  'review_client_labor_rates',
  'review_internal_cost_rules',
  'review_approved_time',
  'review_worker_compensation_settlements',
]);

/** A submitted scope takes precedence; an unavailable scope must not silently become another project. */
export function financeReviewProjectId(
  remedies: readonly ProblemRemedy[],
  submittedProjectId: unknown,
  selectedProjectId: unknown,
  allowedProjectIds: readonly string[],
): string | null {
  const remedyProjectId = remedies.find(
    (remedy) => scopedReviewRemedies.has(remedy.id) && remedy.projectId,
  )?.projectId;
  const candidate =
    remedyProjectId ??
    (typeof submittedProjectId === 'string' ? submittedProjectId : null) ??
    (typeof selectedProjectId === 'string' ? selectedProjectId : null);
  return candidate && allowedProjectIds.includes(candidate) ? candidate : null;
}

export function financeProjectReviewHref(
  base: string,
  projectId: string,
  view: 'commercial' | 'economic',
  options: { task?: string; source?: string; lang?: string; hash?: string } = {},
): string {
  const query = new URLSearchParams({ view, project: projectId });
  if (options.task) query.set('task', options.task);
  if (options.source) query.set('source', options.source);
  if (options.lang) query.set('lang', options.lang);
  return `${base}/app/finance?${query.toString()}${options.hash ?? ''}`;
}
