import { error, redirect } from '@sveltejs/kit';
import { AccessDeniedError, OwnerRecordManagement, V3AccessDeniedError } from '@ja/database';
import { defaultLookbackPeriod, isRealIsoDate } from '$lib/server/iso-date';
import { openPortalRepository } from '$lib/server/portal-repository';
import { workerPayOutstanding } from '$lib/server/worker-pay-outstanding';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    // Check the live Owner identity before reading the worker list or parameters.
    new OwnerRecordManagement(context.sqlite).assertOwner(context.principal);
    const fallback = defaultLookbackPeriod();
    const unique = (name: string) => {
      const values = url.searchParams.getAll(name);
      if (values.length > 1) error(400, 'Invalid worker pay request');
      return values[0] ?? '';
    };
    const periodStart = unique('start') || fallback.periodStart;
    const periodEnd = unique('end') || fallback.periodEnd;
    if (!isRealIsoDate(periodStart) || !isRealIsoDate(periodEnd) || periodStart > periodEnd)
      error(400, 'Invalid date range');
    const workers = context.sqlite
      .prepare(
        "SELECT id,name FROM user WHERE role IN ('worker','project_manager') ORDER BY name,id",
      )
      .all() as Array<{ id: string; name: string }>;
    const workerId = unique('worker');
    const selectedWorker = workers.find((worker) => worker.id === workerId) ?? null;
    if (workerId && !selectedWorker) error(400, 'Invalid worker');
    if (!selectedWorker)
      return {
        workers,
        selectedWorker: null,
        periodStart,
        periodEnd,
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
      periodStart,
      periodEnd,
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
