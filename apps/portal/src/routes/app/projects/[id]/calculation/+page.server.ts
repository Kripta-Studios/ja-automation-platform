import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { invoicePeriodSchema } from '@ja/schemas';
import {
  AccessDeniedError,
  assertLiveSession,
  projectPeriodExplanation,
  ValidationError,
  V3AccessDeniedError,
  V3ValidationError,
} from '@ja/database';
import { defaultLookbackPeriod } from '$lib/server/iso-date';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { ProblemData } from '$lib/problem/contract';
import type { PageServerLoad } from './$types';

const financeRoles = new Set(['owner_admin', 'finance_admin', 'auditor_read_only']);

function resolvePeriod(
  url: URL,
  correlationId?: string,
): {
  periodValues: { periodStart: string; periodEnd: string };
  periodProblem: ProblemData | null;
} {
  const fallback = defaultLookbackPeriod();
  const startValues = url.searchParams.getAll('periodStart');
  const endValues = url.searchParams.getAll('periodEnd');
  const periodValues = {
    periodStart: startValues[0] ?? fallback.periodStart,
    periodEnd: endValues[0] ?? fallback.periodEnd,
  };
  const parsed = invoicePeriodSchema
    .pick({ periodStart: true, periodEnd: true })
    .safeParse(periodValues);
  const duplicateFields = [
    ...(startValues.length > 1 ? ['periodStart'] : []),
    ...(endValues.length > 1 ? ['periodEnd'] : []),
  ];
  const invalidFields = parsed.success
    ? []
    : parsed.error.issues.flatMap((issue) =>
        issue.path[0] === 'periodStart' || issue.path[0] === 'periodEnd' ? [issue.path[0]] : [],
      );
  const reversed =
    duplicateFields.length === 0 &&
    parsed.success &&
    parsed.data.periodEnd < parsed.data.periodStart;
  const fields = [
    ...new Set([...duplicateFields, ...invalidFields, ...(reversed ? ['periodEnd'] : [])]),
  ];
  if (fields.length === 0 && parsed.success) return { periodValues, periodProblem: null };

  const duplicate = duplicateFields.length > 0;
  const messageKey = duplicate
    ? 'problem.projectCalculation.periodDateDuplicate'
    : reversed
      ? 'problem.projectCalculation.periodRangeReversed'
      : 'problem.projectCalculation.periodDateInvalid';
  return {
    periodValues,
    periodProblem: {
      code: duplicate
        ? 'PROJECT_CALCULATION_PERIOD_DATE_DUPLICATE'
        : reversed
          ? 'PROJECT_CALCULATION_PERIOD_RANGE_REVERSED'
          : 'PROJECT_CALCULATION_PERIOD_DATE_INVALID',
      messageKey,
      message: duplicate
        ? 'A calculation period date was supplied more than once. Keep one start date and one end date.'
        : reversed
          ? 'The period end is before the start. Choose an end date on or after the start date.'
          : "Enter valid start and end dates for this project's calculation period.",
      params: {},
      fieldErrors: Object.fromEntries(fields.map((field) => [field, [messageKey]])),
      remedies: [{ id: 'correct_field' }],
      correlationId: correlationId || randomUUID(),
    },
  };
}

export const load: PageServerLoad = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  if (!financeRoles.has(String(locals.user.role ?? ''))) error(403, 'Finance role required');
  const context = openPortalRepository(locals);
  try {
    // Do not trust a client-held role or a stale session just because it reached
    // a finance URL.  This happens before loading any employee pay projection.
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    if (!financeRoles.has(context.principal.role)) error(403, 'Finance role required');
    // Check object access before interpreting date inputs. The overview skips
    // its default finance projection; invalid inputs must not calculate or
    // serialize financial figures for a different period.
    const overview = context.repository.projectOverview(context.principal, params.id, {
      includeFinance: false,
    });
    const project = {
      id: String(overview.project.id),
      name: String(overview.project.name),
      number: String(overview.project.project_number),
      currency: String(overview.project.currency),
    };
    const { periodValues, periodProblem } = resolvePeriod(url, locals.correlationId);
    if (periodProblem)
      return { user: locals.user, project, periodValues, periodProblem, explanation: null };
    const { periodStart, periodEnd } = periodValues;
    const finance = context.v3.projectFinance(context.principal, params.id, periodStart, periodEnd);
    const explanation = projectPeriodExplanation(context.sqlite, context.principal, {
      projectId: params.id,
      periodStart,
      periodEnd,
      finance,
    });
    return { user: locals.user, project, periodValues, periodProblem: null, explanation };
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError)
      error(403, 'Finance role required');
    if (
      (caught instanceof ValidationError || caught instanceof V3ValidationError) &&
      /not found/i.test(caught.message)
    )
      error(404, 'Project not found');
    throw caught;
  } finally {
    context.sqlite.close();
  }
};
