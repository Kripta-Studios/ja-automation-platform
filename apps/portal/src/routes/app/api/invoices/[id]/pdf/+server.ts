import { randomUUID } from 'node:crypto';
import type { RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import { privateArtifactProblem, servePrivateArtifact } from '$lib/server/private-artifact-access';

export const GET: RequestHandler = async ({ locals, params, url }) => {
  const correlationId = locals.correlationId || randomUUID();
  if (!locals.user || !locals.session)
    return privateArtifactProblem('invoice', 'signInRequired', correlationId);
  const invoiceId = (params as { id?: string }).id;
  if (!invoiceId) return privateArtifactProblem('invoice', 'unavailable', correlationId);
  // ?version=N downloads a kept version of a corrected invoice (migration 0092).
  const versionParam = url.searchParams.get('version');
  const revisionNumber =
    versionParam && /^[1-9]\d{0,4}$/u.test(versionParam) ? Number(versionParam) : undefined;
  if (versionParam && revisionNumber === undefined)
    return privateArtifactProblem('invoice', 'unavailable', correlationId);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const repository = context;
    return await servePrivateArtifact({
      sqlite: repository.sqlite,
      principal: repository.principal,
      kind: 'invoice',
      id: invoiceId,
      expectedMediaType: 'application/pdf',
      loadMetadata: () =>
        repository.v3.invoicePdfMetadata(repository.principal, invoiceId, revisionNumber),
    });
  } catch (cause) {
    console.error('Unexpected invoice PDF download failure', {
      correlationId,
      error:
        cause instanceof Error
          ? { name: cause.name, message: cause.message, stack: cause.stack }
          : 'unknown error',
    });
    return privateArtifactProblem('invoice', 'serviceUnavailable', correlationId);
  } finally {
    context?.sqlite.close();
  }
};
