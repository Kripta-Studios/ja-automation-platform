import { error, type RequestHandler } from '@sveltejs/kit';
import { invoicePdf, type InvoiceTemplateSnapshot } from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import { servePrivateArtifact } from '$lib/server/private-artifact-access';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  const invoiceId = (params as { id?: string }).id;
  if (!invoiceId) error(404, 'Invoice not found');
  const context = openPortalRepository(locals);
  try {
    return await servePrivateArtifact({
      sqlite: context.sqlite,
      principal: context.principal,
      kind: 'invoice',
      id: invoiceId,
      expectedMediaType: 'application/pdf',
      requireStepUp: true,
      loadMetadata: () => context.v3.invoicePdfMetadata(context.principal, invoiceId),
      generateBytes: () => {
        const snapshot = context.v3.invoiceSnapshot(context.principal, invoiceId);
        return invoicePdf(snapshot as InvoiceTemplateSnapshot);
      },
    });
  } finally {
    context.sqlite.close();
  }
};
