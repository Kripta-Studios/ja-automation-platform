import { error, redirect } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import { assertLiveSession, AccessDeniedError } from '@ja/database';
import { invoiceDocumentSnapshot } from '$lib/server/invoice-draft-preview';
import { billingActionFailure, billingActions } from '$lib/server/actions/billing-actions';
import { actionFail } from '$lib/server/actions/action-message';
import { formObject } from '$lib/server/action-utils';
import { base } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    const preview = context.repository.invoicePreview(context.principal, params.id);
    const requested = url.searchParams.get('lang')?.trim().toLowerCase();
    const locale = requested === 'es' || requested === 'pt' ? requested : 'en';
    const state = String((preview.invoice as Record<string, unknown>).state ?? '');
    // Exact issue blockers (real issue path in a rolled-back savepoint) for the Issue button.
    const issueCheck =
      ['draft', 'approved'].includes(state) &&
      ['owner_admin', 'finance_admin'].includes(context.principal.role)
        ? context.repository.invoiceIssueDryRun(context.principal, params.id)
        : null;
    // Current balance for the one-step "Record payment" panel (finance roles only).
    let balance: {
      outstandingMinor: string;
      collectedMinor: string;
      creditedMinor: string;
      currency: string;
      /** Payments and reversals in date order, for the read-only history (T12 round 2). */
      history: Array<{ kind: 'payment' | 'reversal'; date: string; amountMinor: string }>;
    } | null = null;
    if (
      ['issued', 'sent', 'partially_paid', 'overdue', 'paid'].includes(state) &&
      ['owner_admin', 'finance_admin', 'auditor_read_only'].includes(context.principal.role)
    ) {
      const row = context.v3
        .masterLedger(context.principal, { projectId: String((preview.invoice as Record<string, unknown>).project_id ?? '') })
        .find((entry) => entry.invoiceId === params.id);
      if (row)
        balance = {
          // What the client still owes: net of payments and of credit notes (T12).
          outstandingMinor: String(row.netOutstandingMinor ?? row.outstandingMinor),
          collectedMinor: String(row.collectedMinor),
          creditedMinor: String(row.appliedCreditMinor ?? '0'),
          currency: String(row.currency),
          history: [
            ...((row.payments ?? []) as Array<Record<string, unknown>>).map((payment) => ({
              kind: 'payment' as const,
              date: String(payment.received_at ?? '').slice(0, 10),
              amountMinor: String(payment.grossAmountMinor ?? '0'),
            })),
            ...((row.paymentReversals ?? []) as Array<Record<string, unknown>>).map((reversal) => ({
              kind: 'reversal' as const,
              date: String(reversal.effectiveAt ?? '').slice(0, 10),
              amountMinor: String(reversal.amountMinor ?? '0'),
            })),
          ].sort((a, b) => a.date.localeCompare(b.date)),
        };
    }
    return {
      user: locals.user,
      preview,
      issueCheck,
      balance,
      documentSnapshot: invoiceDocumentSnapshot(preview, locale),
    };
  } catch {
    error(404, 'detail.invoice.notFound');
  } finally {
    context.sqlite.close();
  }
};

const asBilling = <T extends { params: Record<string, string> }>(event: T) => ({
  ...event,
  params: { ...event.params, section: 'billing' },
});

export const actions: Actions = {
  updateInvoiceDraftDetails: (event) => billingActions.updateInvoiceDraftDetails(asBilling(event)),
  issueInvoice: (event) => billingActions.issueReviewedInvoice(asBilling(event)),
  sendInvoice: (event) => billingActions.sendInvoice(asBilling(event)),
  recordPayment: (event) => billingActions.recordPayment(asBilling(event)),
  deleteInvoice: (event) => billingActions.deleteInvoice(asBilling(event)),
  /** Round 2: rebuild a stale draft from the current hours, rates and settings. */
  refreshInvoiceDraft: async ({ locals, request, params, url }) => {
    const extra = { actionName: 'refreshInvoiceDraft', correlationId: locals.correlationId };
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        ...extra,
        code: 'INVOICE_SIGN_IN_REQUIRED',
      });
    const object = await formObject(request).catch(() => null);
    const version = Number(object?.version);
    if (!object || !Number.isSafeInteger(version) || version < 1)
      return actionFail(400, 'action.error.validation', {}, 'Reload the invoice and try again.', {
        ...extra,
        code: 'INVOICE_REFRESH_VERSION_REQUIRED',
      });
    const context = openPortalRepository(locals);
    let target: string;
    try {
      const result = context.repository.refreshInvoiceDraft(context.principal, params.id, version);
      const lang = url.searchParams.get('lang');
      target = `${base}/app/billing/invoices/${encodeURIComponent(result.id)}?refreshed=1${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`;
    } catch (caught) {
      return billingActionFailure(caught, 'refreshInvoiceDraft', context.principal.role);
    } finally {
      context.sqlite.close();
    }
    redirect(303, target);
  },
};
