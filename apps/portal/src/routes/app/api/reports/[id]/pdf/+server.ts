import { randomUUID } from 'node:crypto';
import type { RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  privateArtifactProblem,
  servePrivateArtifact,
} from '$lib/server/private-artifact-access';

export const GET: RequestHandler = async ({ locals, params }) => {
  const correlationId = locals.correlationId || randomUUID();
  if (!locals.user || !locals.session)
    return privateArtifactProblem('period_report', 'signInRequired', correlationId);
  if (!params.id) return privateArtifactProblem('period_report', 'unavailable', correlationId);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const repository = context;
    return await servePrivateArtifact({
      sqlite: repository.sqlite,
      principal: repository.principal,
      kind: 'period_report',
      id: params.id,
      expectedMediaType: 'application/pdf',
      // Assigned-project customer reports are protected by the repository
      // object-scope check and download audit. Internal reports remain
      loadMetadata: () => ({
        ...repository.v3.periodReportPdfMetadata(repository.principal, params.id!),
        mediaType: 'application/pdf',
      }),
    });
  } catch (cause) {
    console.error('Unexpected report PDF download failure', {
      correlationId,
      error:
        cause instanceof Error
          ? { name: cause.name, message: cause.message, stack: cause.stack }
          : 'unknown error',
    });
    return privateArtifactProblem('period_report', 'serviceUnavailable', correlationId);
  } finally {
    context?.sqlite.close();
  }
};
