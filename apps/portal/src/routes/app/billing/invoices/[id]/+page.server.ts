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
    return {
      user: locals.user,
      preview,
      documentSnapshot: invoiceDocumentSnapshot(preview, locale),
    };
  } catch {
    error(404, 'detail.invoice.notFound');
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  updateInvoiceDraftDetails: (event) =>
    billingActions.updateInvoiceDraftDetails({
      ...event,
      params: { ...event.params, section: 'billing' },
    }),
};
