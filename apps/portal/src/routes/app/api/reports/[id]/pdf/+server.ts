import { base } from '$app/paths';
import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import { servePrivateArtifact } from '$lib/server/private-artifact-access';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) redirect(303, `${base}/app/login`);
  if (!locals.session) error(401, 'Sign in required');
  if (!params.id) error(400, 'Report id is required');
  const context = openPortalRepository(locals);
  try {
    return await servePrivateArtifact({
      sqlite: context.sqlite,
      principal: context.principal,
      kind: 'period_report',
      id: params.id,
      expectedMediaType: 'application/pdf',
      loadMetadata: () => ({
        ...context.v3.periodReportPdfMetadata(context.principal, params.id!),
        mediaType: 'application/pdf',
      }),
    });
  } finally {
    context.sqlite.close();
  }
};
