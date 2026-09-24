import { error, type RequestHandler } from '@sveltejs/kit';
import { invoicePdf } from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import { draftInvoiceTemplateSnapshot } from '$lib/server/invoice-draft-preview';

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  const invoiceId = params.id;
  if (!invoiceId) error(404, 'Invoice not found');
  const requested = url.searchParams.get('lang')?.trim().toLowerCase();
  const locale = requested === 'es' || requested === 'pt' ? requested : 'en';
  const context = openPortalRepository(locals);
  try {
    const preview = context.repository.invoicePreview(context.principal, invoiceId);
    let snapshot;
    try {
      snapshot = draftInvoiceTemplateSnapshot(preview, locale);
    } catch (caught) {
      if (caught instanceof Error && caught.message.includes('canonical issuing'))
        error(409, caught.message);
      error(409, 'Draft PDF preview is unavailable because its lines or totals changed');
    }
    const bytes = invoicePdf(snapshot);
    return new Response(Uint8Array.from(bytes).buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="draft-preview-${invoiceId}-${locale}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } finally {
    context.sqlite.close();
  }
};
