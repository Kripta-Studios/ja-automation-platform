import { error, redirect } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import { assertLiveSession, AccessDeniedError } from '@ja/database';
import { invoiceDocumentSnapshot } from '$lib/server/invoice-draft-preview';
import { billingActions } from '$lib/server/actions/billing-actions';
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
    let balance: { outstandingMinor: string; collectedMinor: string; currency: string } | null =
      null;
    if (
      ['issued', 'sent', 'partially_paid', 'overdue', 'paid'].includes(state) &&
      ['owner_admin', 'finance_admin', 'auditor_read_only'].includes(context.principal.role)
    ) {
      const row = context.v3
        .masterLedger(context.principal, { projectId: String((preview.invoice as Record<string, unknown>).project_id ?? '') })
        .find((entry) => entry.invoiceId === params.id);
      if (row)
        balance = {
          outstandingMinor: String(row.outstandingMinor),
          collectedMinor: String(row.collectedMinor),
          currency: String(row.currency),
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
};
