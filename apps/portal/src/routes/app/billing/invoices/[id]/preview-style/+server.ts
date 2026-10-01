import { invoiceDocumentCss } from '@ja/reporting';
import { error } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params }) => {
  if (!locals.user) error(401, 'Sign in to preview this invoice.');
  const context = openPortalRepository(locals);
  try {
    context.repository.invoicePreview(context.principal, params.id);
    return new Response(invoiceDocumentCss, {
      headers: {
        'content-type': 'text/css; charset=utf-8',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    error(404, 'Invoice preview is unavailable.');
  } finally {
    context.sqlite.close();
  }
};
