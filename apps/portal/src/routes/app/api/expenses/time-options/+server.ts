import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { AccessDeniedError } from '@ja/database';
import { expenseTimeOptions } from '$lib/server/expense-time-options';
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
    const rows = expenseTimeOptions(context, {
      projectId: parsed.data.projectId,
      date: parsed.data.date,
      workerId: parsed.data.workerId,
    });
    return json({ rows }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (caught) {
    if (caught instanceof AccessDeniedError)
      return json({ error: 'Time access denied' }, { status: 403 });
    throw caught;
  } finally {
    context.sqlite.close();
  }
};
