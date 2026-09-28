import { cashFilters, matchesCashFilter, type CashFilter } from '$lib/portal/owner-finance';
import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { assertLiveSession, AccessDeniedError } from '@ja/database';
import { isStrictIsoCalendarDate } from '@ja/billing-engine';
import { openPortalRepository } from '$lib/server/portal-repository';
import { readCashMovements, groupCashMovements } from '$lib/server/cash-calendar';
import type { ProblemData } from '$lib/problem/contract';
import type { PageServerLoad } from './$types';

function cashFilterProblem(
  code: string,
  messageKey: ProblemData['messageKey'],
  message: string,
  fieldErrors: ProblemData['fieldErrors'],
  correlationId?: string,
): ProblemData {
  return {
    code,
    messageKey,
    message,
    params: {},
    fieldErrors,
    remedies: [{ id: 'correct_field' }],
    correlationId: correlationId || randomUUID(),
  };
}

export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    try {
      assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    } catch {
      error(401, 'Live authenticated session required');
    }
    if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
      error(403, 'Finance access required');
    const currency = url.searchParams.get('currency') ?? '';
    const currencyValid = !currency || ['USD', 'EUR', 'BRL'].includes(currency);
    const requestedFilter = url.searchParams.get('filter') ?? 'all';
    const filterValid = cashFilters.includes(requestedFilter as CashFilter);
    const today = new Date().toISOString().slice(0, 10);
    const datedOnly = url.searchParams.get('dated') === '1';
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    const fromValid = !from || isStrictIsoCalendarDate(from);
    const toValid = !to || isStrictIsoCalendarDate(to);
    const dateOrderValid = !from || !to || !fromValid || !toValid || from <= to;
    const projectId = url.searchParams.get('project') ?? '';
    const requestedGranularity = url.searchParams.get('group') ?? 'week';
    const granularityValid = ['week', 'month'].includes(requestedGranularity);
    const projects = context.repository.listFinanceProjects(context.principal);
    const projectValid = !projectId || projects.some((project) => project.id === projectId);
    const projectOptions = projects.map((project) => ({
      id: String(project.id),
      label: `${project.project_number} — ${project.name}`,
    }));
    const fieldErrors = {
      ...(!currencyValid ? { currency: ['problem.finance.cashCurrencyInvalid'] } : {}),
      ...(!filterValid ? { filter: ['problem.finance.cashFilterInvalid'] } : {}),
      ...(!fromValid ? { from: ['Enter a valid date.'] } : {}),
      ...(!toValid ? { to: ['Enter a valid date.'] } : {}),
      ...(!dateOrderValid ? { to: ['problem.finance.cashDateOrderInvalid'] } : {}),
      ...(!projectValid ? { project: ['problem.finance.cashProjectUnavailable'] } : {}),
      ...(!granularityValid ? { group: ['problem.finance.cashGroupInvalid'] } : {}),
    };
    const problem = !currencyValid
      ? cashFilterProblem(
          'FINANCE_CASH_CURRENCY_INVALID',
          'problem.finance.cashCurrencyInvalid',
          'Choose USD, EUR, or BRL for the cash currency filter.',
          fieldErrors,
          locals.correlationId,
        )
      : !filterValid
        ? cashFilterProblem(
            'FINANCE_CASH_FILTER_INVALID',
            'problem.finance.cashFilterInvalid',
            'This cash view is not available. Choose a filter from the current list.',
            fieldErrors,
            locals.correlationId,
          )
        : !fromValid || !toValid
          ? cashFilterProblem(
              'FINANCE_CASH_DATE_INVALID',
              'problem.finance.cashDateInvalid',
              'Enter real start and end dates for the cash calendar.',
              fieldErrors,
              locals.correlationId,
            )
          : !dateOrderValid
            ? cashFilterProblem(
                'FINANCE_CASH_DATE_ORDER_INVALID',
                'problem.finance.cashDateOrderInvalid',
                'The end date is before the start date. Choose an end date on or after the start date.',
                fieldErrors,
                locals.correlationId,
              )
            : !projectValid
              ? cashFilterProblem(
                  'FINANCE_CASH_PROJECT_UNAVAILABLE',
                  'problem.finance.cashProjectUnavailable',
                  'The selected project is no longer available in this cash view. Choose a project from the current list or All projects.',
                  fieldErrors,
                  locals.correlationId,
                )
              : !granularityValid
                ? cashFilterProblem(
                    'FINANCE_CASH_GROUP_INVALID',
                    'problem.finance.cashGroupInvalid',
                    'Choose weekly or monthly grouping for the cash calendar.',
                    fieldErrors,
                    locals.correlationId,
                  )
                : null;
    if (problem)
      return {
        currency,
        currencies: [...new Set(projects.map((project) => String(project.currency)))].sort(),
        filter: requestedFilter,
        datedOnly,
        from,
        to,
        projectId,
        granularity: requestedGranularity,
        movements: [],
        groups: [],
        projects: projectOptions,
        problem,
      };
    const filter = requestedFilter as CashFilter;
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
      granularity: requestedGranularity as 'week' | 'month',
      movements,
      groups: groupCashMovements(movements, requestedGranularity as 'week' | 'month'),
      projects: projectOptions,
      problem: null,
    };
  } finally {
    context.sqlite.close();
  }
};
