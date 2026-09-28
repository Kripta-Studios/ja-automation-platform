import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { AccessDeniedError, OwnerRecordManagement, V3AccessDeniedError } from '@ja/database';
import { defaultLookbackPeriod, isRealIsoDate } from '$lib/server/iso-date';
import { openPortalRepository } from '$lib/server/portal-repository';
import { workerPayOutstanding } from '$lib/server/worker-pay-outstanding';
import type { ProblemData } from '$lib/problem/contract';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    // Check the live Owner identity before reading the worker list or parameters.
    new OwnerRecordManagement(context.sqlite).assertOwner(context.principal);
    const fallback = defaultLookbackPeriod();
    const startValues = url.searchParams.getAll('start');
    const endValues = url.searchParams.getAll('end');
    const workerValues = url.searchParams.getAll('worker');
    const periodStart = startValues[0] ?? fallback.periodStart;
    const periodEnd = endValues[0] ?? fallback.periodEnd;
    const workerId = workerValues[0] ?? '';
    const workers = context.sqlite
      .prepare(
        "SELECT id,name FROM user WHERE role IN ('worker','project_manager') ORDER BY name,id",
      )
      .all() as Array<{ id: string; name: string }>;
    const selectedWorker = workers.find((worker) => worker.id === workerId) ?? null;
    const duplicateFields = [
      ...(startValues.length > 1 ? ['start'] : []),
      ...(endValues.length > 1 ? ['end'] : []),
      ...(workerValues.length > 1 ? ['worker'] : []),
    ];
    const invalidDates = [
      ...(!isRealIsoDate(periodStart) ? ['start'] : []),
      ...(!isRealIsoDate(periodEnd) ? ['end'] : []),
    ];
    const reversed =
      invalidDates.length === 0 && duplicateFields.length === 0 && periodStart > periodEnd;
    const workerUnavailable = Boolean(workerId && !selectedWorker);
    const messageKey =
      duplicateFields.length > 0
        ? 'problem.workerPay.filterDuplicate'
        : invalidDates.length > 0
          ? 'problem.workerPay.periodDateInvalid'
          : reversed
            ? 'problem.workerPay.periodRangeReversed'
            : 'problem.workerPay.workerUnavailable';
    const fieldErrors = Object.fromEntries(
      [
        ...new Set([
          ...duplicateFields,
          ...invalidDates,
          ...(reversed ? ['end'] : []),
          ...(workerUnavailable ? ['worker'] : []),
        ]),
      ].map((field) => [
        field,
        [
          ...(duplicateFields.includes(field) ? ['problem.workerPay.filterDuplicate'] : []),
          ...(invalidDates.includes(field) ? ['problem.workerPay.periodDateInvalid'] : []),
          ...(field === 'end' && reversed ? ['problem.workerPay.periodRangeReversed'] : []),
          ...(field === 'worker' && workerUnavailable
            ? ['problem.workerPay.workerUnavailable']
            : []),
        ],
      ]),
    );
    const filterProblem: ProblemData | null =
      duplicateFields.length || invalidDates.length || reversed || workerUnavailable
        ? {
            code:
              duplicateFields.length > 0
                ? 'WORKER_PAY_FILTER_DUPLICATE'
                : invalidDates.length > 0
                  ? 'WORKER_PAY_PERIOD_DATE_INVALID'
                  : reversed
                    ? 'WORKER_PAY_PERIOD_RANGE_REVERSED'
                    : 'WORKER_PAY_WORKER_UNAVAILABLE',
            messageKey,
            params: {},
            fieldErrors,
            remedies: [{ id: 'correct_field' }],
            correlationId: locals.correlationId || randomUUID(),
          }
        : null;
    if (filterProblem)
      return {
        workers,
        selectedWorker,
        requestedWorkerId: workerId,
        periodStart,
        periodEnd,
        filterProblem,
        pay: null,
        settlements: [],
        activities: [],
        expenses: [],
        outstanding: [],
      };
    if (!selectedWorker)
      return {
        workers,
        selectedWorker: null,
        requestedWorkerId: workerId,
        periodStart,
        periodEnd,
        filterProblem: null,
        pay: null,
        settlements: [],
        activities: [],
        expenses: [],
        outstanding: [],
      };
    const pay = context.v3.ownerWorkerPay(
      context.principal,
      selectedWorker.id,
      periodStart,
      periodEnd,
    );
    const settlements = context.v3.ownerWorkerSettlements(
      context.principal,
      selectedWorker.id,
      periodStart,
      periodEnd,
    );
    const { activities, expenses } = context.v3.ownerWorkerPayDetails(
      context.principal,
      selectedWorker.id,
      periodStart,
      periodEnd,
    );
    return {
      workers,
      selectedWorker,
      requestedWorkerId: workerId,
      periodStart,
      periodEnd,
      filterProblem: null,
      pay,
      settlements,
      activities,
      expenses,
      outstanding: workerPayOutstanding(settlements, expenses),
    };
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError)
      error(403, 'Owner administration required');
    throw caught;
  } finally {
    context.sqlite.close();
  }
};
