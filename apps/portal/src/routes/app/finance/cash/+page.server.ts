import { cashFilters, matchesCashFilter, type CashFilter } from '$lib/portal/owner-finance';
import { error, redirect } from '@sveltejs/kit';
import { assertLiveSession, AccessDeniedError } from '@ja/database';
import { isStrictIsoCalendarDate } from '@ja/billing-engine';
import { openPortalRepository } from '$lib/server/portal-repository';
import { readCashMovements, groupCashMovements } from '$lib/server/cash-calendar';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  const currency = url.searchParams.get('currency') ?? '';
  const requestedFilter = url.searchParams.get('filter') ?? 'all';
  if (!cashFilters.includes(requestedFilter as CashFilter)) error(400, 'Invalid cash filter');
  const filter = requestedFilter as CashFilter;
  const today = new Date().toISOString().slice(0, 10);
  const datedOnly = url.searchParams.get('dated') === '1';
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
    const allMovements = readCashMovements(context);
    const currencies = [
      ...new Set([
        ...projects.map((project) => String(project.currency)),
        ...allMovements.map((item) => item.currency),
      ]),
    ].sort();
    const movements = allMovements.filter(
      (item) =>
        (!currency || item.currency === currency) &&
        matchesCashFilter(item, filter, today) &&
        (!datedOnly || Boolean(item.date)) &&
        (!projectId || item.projectId === projectId) &&
        (!item.date || ((!from || item.date >= from) && (!to || item.date <= to))),
    );
    return {
      currency,
      currencies,
      filter,
      datedOnly,
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
