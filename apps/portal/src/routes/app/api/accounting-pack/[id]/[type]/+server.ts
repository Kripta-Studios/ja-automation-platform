import { error, type RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import { servePrivateArtifact } from '$lib/server/private-artifact-access';

const types = new Set(['pdf', 'xlsx', 'invoice_csv', 'expense_csv', 'json']);

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  const routeParams = params as { id?: string; type?: string };
  const exportType = routeParams.type;
  const packId = routeParams.id;
  if (!packId || !exportType || !types.has(exportType)) error(404, 'Export not found');
  const context = openPortalRepository(locals);
  try {
    return await servePrivateArtifact({
      sqlite: context.sqlite,
      principal: context.principal,
      kind: 'accounting_pack',
      id: packId,
      requireStepUp: true,
      loadMetadata: () =>
        context.v3.accountingPackExport(
          context.principal,
          packId,
          exportType as 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
        ),
    });
  } finally {
    context.sqlite.close();
  }
};
