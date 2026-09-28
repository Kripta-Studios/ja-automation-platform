import {
  SupplierWorkforceRepository,
  AccessDeniedError,
  V3AccessDeniedError,
  ValidationError,
  V3ValidationError,
} from '@ja/database';
import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { openPortalRepository } from './portal-repository';
import { isRealIsoDate } from './iso-date';
import type { ProblemData } from '$lib/problem/contract';

export function openSupplierContext(locals: App.Locals) {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  if (!locals.session) error(401, 'Sign in required');
  const context = openPortalRepository(locals);
  return { ...context, supplier: new SupplierWorkforceRepository(context.sqlite) };
}

export function supplierReadFailure(caught: unknown): never {
  if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError)
    error(403, 'Supplier workforce access denied');
  if (caught instanceof ValidationError || caught instanceof V3ValidationError)
    error(400, caught.message);
  throw caught;
}

export function supplierPeriod(
  url: URL,
  requestCorrelationId?: string,
): {
  from: string;
  to: string;
  periodProblem: ProblemData | null;
} {
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get('from') ?? `${today.slice(0, 7)}-01`;
  const to = url.searchParams.get('to') ?? today;
  const fromValid = isRealIsoDate(from);
  const toValid = isRealIsoDate(to);
  if (!fromValid || !toValid)
    return {
      from,
      to,
      periodProblem: {
        code: 'SUPPLIER_REPORT_PERIOD_DATE_INVALID',
        messageKey: 'problem.supplier.reportPeriodDateInvalid',
        message:
          'Enter real start and end dates to view the operational report. Use YYYY-MM-DD dates.',
        params: {},
        fieldErrors: {
          ...(!fromValid ? { from: ['problem.supplier.dateInvalid'] } : {}),
          ...(!toValid ? { to: ['problem.supplier.dateInvalid'] } : {}),
        },
        remedies: [{ id: 'review_report_period' }],
        correlationId: requestCorrelationId || randomUUID(),
      },
    };
  if (from > to)
    return {
      from,
      to,
      periodProblem: {
        code: 'SUPPLIER_REPORT_PERIOD_ORDER_INVALID',
        messageKey: 'problem.supplier.reportPeriodOrderInvalid',
        message:
          'The report end date is before its start date. Choose an end date on or after the start date.',
        params: {},
        fieldErrors: { to: ['problem.supplier.reportPeriodOrderInvalid'] },
        remedies: [{ id: 'review_report_period' }],
        correlationId: requestCorrelationId || randomUUID(),
      },
    };
  return { from, to, periodProblem: null };
}
