import { error, fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import {
  assertLiveSession,
  AccessDeniedError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  approveSettlement,
  markSettlementPaid,
  parsePayeeKey,
  SettlementActionError,
  settlementDetail,
  settlementOverview,
  settlementWeek,
  type SettlementStatus,
} from '$lib/server/subcontractor-settlement';
import type { Actions, PageServerLoad } from './$types';

function openFinance(locals: App.Locals) {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
  } catch {
    context.sqlite.close();
    error(401, 'Live authenticated session required');
  }
  if (!['owner_admin', 'finance_admin'].includes(context.principal.role)) {
    context.sqlite.close();
    error(403, 'Finance access required');
  }
  return context;
}

export const load: PageServerLoad = ({ locals, url }) => {
  const context = openFinance(locals);
  try {
    const week = settlementWeek(url.searchParams.get('week'));
    const payee = parsePayeeKey(url.searchParams.get('payee'));
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const statusParam = url.searchParams.get('status') ?? 'all';
    const status = (['draft', 'approved', 'paid', 'all'].includes(statusParam) ? statusParam : 'all') as
      | SettlementStatus
      | 'all';
    const limit = Math.min(200, Math.max(25, Number(url.searchParams.get('show') ?? 25) || 25));
    const started = Date.now();
    const overview = payee ? null : settlementOverview(context, { start: week.start, end: week.end, q, status, limit });
    const detail = payee ? settlementDetail(context, { payee, start: week.start, end: week.end }) : null;
    return {
      week,
      payee,
      q,
      status,
      limit,
      overview,
      detail,
      today: new Date().toISOString().slice(0, 10),
      requestKey: randomUUID(),
      serverMs: Date.now() - started,
    };
  } finally {
    context.sqlite.close();
  }
};

function failure(error: unknown) {
  if (error instanceof SettlementActionError || error instanceof V3ValidationError)
    return fail(400, { success: false, message: error.message });
  if (error instanceof V3ConflictError) return fail(409, { success: false, message: error.message });
  if (error instanceof V3AccessDeniedError || error instanceof AccessDeniedError)
    return fail(403, { success: false, message: error.message });
  throw error;
}

export const actions: Actions = {
  approve: async ({ locals, request }) => {
    const form = await request.formData();
    const payee = parsePayeeKey(String(form.get('payee') ?? ''));
    const week = settlementWeek(String(form.get('week') ?? ''));
    if (!payee) return fail(400, { success: false, message: 'Choose a subcontractor' });
    const context = openFinance(locals);
    try {
      const result = approveSettlement(context, { payee, start: week.start, end: week.end });
      return { success: true, action: 'approve', ...result };
    } catch (caught) {
      return failure(caught);
    } finally {
      context.sqlite.close();
    }
  },
  markPaid: async ({ locals, request }) => {
    const form = await request.formData();
    const payee = parsePayeeKey(String(form.get('payee') ?? ''));
    const week = settlementWeek(String(form.get('week') ?? ''));
    const paidOn = String(form.get('paidOn') ?? '');
    const reference = String(form.get('reference') ?? '').trim();
    const requestKey = String(form.get('requestKey') ?? '');
    if (!payee) return fail(400, { success: false, message: 'Choose a subcontractor' });
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(paidOn))
      return fail(400, { success: false, field: 'paidOn', message: 'Enter the payment date' });
    if (!reference || reference.length > 200)
      return fail(400, { success: false, field: 'reference', message: 'Enter the transfer reference' });
    if (!/^[A-Za-z0-9-]{8,80}$/u.test(requestKey))
      return fail(400, { success: false, message: 'Reload the page and try again' });
    const context = openFinance(locals);
    try {
      const result = markSettlementPaid(context, { payee, start: week.start, end: week.end, paidOn, reference, requestKey });
      return { success: true, action: 'markPaid', ...result };
    } catch (caught) {
      return failure(caught);
    } finally {
      context.sqlite.close();
    }
  },
};
