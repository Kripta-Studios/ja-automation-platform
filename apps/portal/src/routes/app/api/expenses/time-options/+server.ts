import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { AccessDeniedError, CrewLeaderRepository } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';

const filtersSchema = z.object({
  projectId: z.uuid(),
  date: z.iso.date(),
  workerId: z.uuid().optional(),
});

/** Read-only, role-scoped time choices for an operational expense. */
export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) return json({ error: 'Sign in required' }, { status: 401 });
  const parsed = filtersSchema.safeParse({
    projectId: url.searchParams.get('projectId'),
    date: url.searchParams.get('date'),
    workerId: url.searchParams.get('workerId') || undefined,
  });
  if (!parsed.success) return json({ error: 'Project and date are required' }, { status: 400 });
  const context = openPortalRepository(locals);
  try {
    const delegated =
      context.principal.role === 'worker' &&
      parsed.data.workerId &&
      parsed.data.workerId !== context.principal.userId;
    const rows = delegated
      ? (() => {
          const crew = new CrewLeaderRepository(context.sqlite);
          crew.authorizeDelegatedOperationalEntry(
            context.principal,
            parsed.data.workerId!,
            parsed.data.projectId,
            parsed.data.date,
          );
          return context.sqlite.prepare(
            `SELECT t.id,t.worker_id workerId,u.name workerName,t.minutes,
                    t.category,t.activity_summary summary
             FROM time_entry t JOIN user u ON u.id=t.worker_id
             WHERE t.project_id=? AND t.work_date=? AND t.worker_id=?
               AND t.approval_state NOT IN ('rejected','void')
             ORDER BY t.created_at DESC`,
          ).all(parsed.data.projectId,parsed.data.date,parsed.data.workerId!) as Array<{
            id: string; workerId: string; workerName: string; minutes: number;
            category: string; summary: string;
          }>;
        })()
      : context.repository
          .listTimeForScope(context.principal, {
            projectId: parsed.data.projectId,
            from: parsed.data.date,
            to: parsed.data.date,
          })
          .filter(
            (row) =>
              (!parsed.data.workerId || row.worker_id === parsed.data.workerId) &&
              !['rejected', 'void'].includes(String(row.approval_state)),
          )
          .map((row) => ({
            id: row.id,
            workerId: row.worker_id,
            workerName: row.worker_name,
            minutes: row.minutes,
            category: row.category,
            summary: row.activity_summary,
          }));
    return json({ rows }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (caught) {
    if (caught instanceof AccessDeniedError)
      return json({ error: 'Time access denied' }, { status: 403 });
    throw caught;
  } finally {
    context.sqlite.close();
  }
};
