import { AccessDeniedError, assertLiveSession } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { privateDocumentResponse } from '$lib/server/private-artifact-access';
import {
  privateDocumentFailure,
  privateDocumentProblem,
} from '$lib/server/private-document-problem';
import { assertRegularPrivateFile, safeDocumentRoot } from '$lib/server/report-attachment-route';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url }) => {
  if (!locals.user || !locals.session)
    return privateDocumentProblem('signInRequired', locals.correlationId);
  if (!params.id) return privateDocumentProblem('unavailable', locals.correlationId);

  let context: ReturnType<typeof openPortalRepository> | null = null;
  let stage: 'authorization' | 'file' | 'audit' = 'authorization';
  try {
    context = openPortalRepository(locals);
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    // Keep the compatibility URL on the identical authorization, descriptor
    // reader and private-response boundary as the API URL.
    const metadata = context.v3.authorizeDocument(context.principal, params.id);
    stage = 'file';
    const bytes = await assertRegularPrivateFile(
      safeDocumentRoot(),
      metadata.storageKey,
      metadata.sha256,
      metadata.byteLength,
      metadata.mediaType,
    );
    stage = 'audit';
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    context.v3.recordDocumentDownload(context.principal, params.id);
    return privateDocumentResponse(
      bytes,
      metadata,
      url.searchParams.get('view') === '1' ? 'inline' : 'attachment',
    );
  } catch (cause) {
    return privateDocumentFailure(
      cause,
      stage,
      locals.correlationId,
      context?.principal.role === 'owner_admin',
    );
  } finally {
    context?.sqlite.close();
  }
};
