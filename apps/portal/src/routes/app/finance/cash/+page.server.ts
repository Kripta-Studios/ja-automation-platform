import { error, redirect } from '@sveltejs/kit';
import { assertLiveSession, AccessDeniedError } from '@ja/database';
import { isStrictIsoCalendarDate } from '@ja/billing-engine';
import { openPortalRepository } from '$lib/server/portal-repository';
import { readCashMovements, groupCashMovements } from '$lib/server/cash-calendar';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const projectId = url.searchParams.get('project') ?? '';
  const granularity = url.searchParams.get('group') === 'month' ? 'month' : 'week';
  if (
    (from && !isStrictIsoCalendarDate(from)) ||
    (to && !isStrictIsoCalendarDate(to)) ||
    (from && to && from > to)
  )
    error(400, 'Invalid date range');
  const context = openPortalRepository(locals);
  try {
    try {
      assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    } catch {
      error(401, 'Live authenticated session required');
    }
    if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
      error(403, 'Finance access required');
    const projects = context.repository.listFinanceProjects(context.principal);
    if (projectId && !projects.some((project) => project.id === projectId))
      error(404, 'Project not found');
    const movements = readCashMovements(context).filter(
      (item) =>
        (!projectId || item.projectId === projectId) &&
        (!item.date || ((!from || item.date >= from) && (!to || item.date <= to))),
    );
    return {
      from,
      to,
      projectId,
      granularity,
      movements,
      groups: groupCashMovements(movements, granularity),
      projects: projects.map((project) => ({
        id: String(project.id),
        label: `${project.project_number} — ${project.name}`,
      })),
    };
  } finally {
    context.sqlite.close();
  }
};
