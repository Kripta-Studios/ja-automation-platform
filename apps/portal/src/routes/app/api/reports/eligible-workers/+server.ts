import { projectRecordIdSchema } from '@ja/schemas';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { openPortalRepository } from '$lib/server/portal-repository';
import { projectVisibility } from '$lib/portal/project-visibility';

const query = z.object({ projectId: projectRecordIdSchema, date: z.iso.date() });
const headers = { 'cache-control': 'private, no-store' };

/**
 * Report capture worker picker (owner / project manager): the active workers
 * assigned to one authorized project on one day. Replaces shipping every
 * assignment with the Reports page (scale). Same scope as the page did:
 * repository-scoped assignments and workers, never a supplier-restricted account.
 */
export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) return json({ workers: [] }, { status: 401, headers });
  if (!['owner_admin', 'project_manager'].includes(locals.user.role ?? ''))
    return json({ workers: [] }, { status: 403, headers });
  const parsed = query.safeParse({
    projectId: url.searchParams.get('projectId'),
    date: url.searchParams.get('date'),
  });
  if (!parsed.success) return json({ workers: [] }, { status: 400, headers });
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const restricted = context.sqlite
      .prepare('SELECT 1 FROM supplier_user_profile WHERE user_id=?')
      .get(context.principal.userId);
    if (restricted) return json({ workers: [] }, { status: 403, headers });
    const { projectIds } = projectVisibility(
      context.repository.listAssignedProjects(context.principal),
      true,
    );
    const { projectId, date } = parsed.data;
    if (!projectIds.has(projectId)) return json({ workers: [] }, { headers });
    const assigned = new Set(
      context.repository
        .listAssignments(context.principal)
        .filter(
          (assignment) =>
            String(assignment.project_id) === projectId &&
            assignment.status === 'active' &&
            String(assignment.starts_on) <= date &&
            (!assignment.ends_on || String(assignment.ends_on) >= date),
        )
        .map((assignment) => String(assignment.user_id ?? assignment.worker_id ?? '')),
    );
    const workers = context.repository
      .listAllWorkers(context.principal)
      .filter(
        (worker) =>
          worker.status === 'active' &&
          ['worker', 'project_manager'].includes(String(worker.role)) &&
          assigned.has(String(worker.id)),
      )
      .map((worker) => ({ id: String(worker.id), name: worker.name, email: worker.email }));
    return json({ workers }, { headers });
  } catch {
    return json({ workers: [] }, { status: 403, headers });
  } finally {
    context?.sqlite.close();
  }
};
