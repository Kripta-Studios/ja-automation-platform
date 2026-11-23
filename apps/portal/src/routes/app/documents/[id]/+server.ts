import { AccessDeniedError, assertLiveSession } from '@ja/database';
import { isDocumentNavigation } from '$lib/server/document-navigation';
import { openPortalRepository } from '$lib/server/portal-repository';
import { privateDocumentResponse } from '$lib/server/private-artifact-access';
import {
  privateDocumentFailure,
  privateDocumentProblem,
} from '$lib/server/private-document-problem';
import { assertRegularPrivateFile, safeDocumentRoot } from '$lib/server/report-attachment-route';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url, request }) => {
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
    const failure = privateDocumentFailure(
      cause,
      stage,
      locals.correlationId,
      context?.principal.role === 'owner_admin',
    );
    // T18: a person who opened the link in the browser gets the styled page,
    // not the JSON problem body (fetch and download callers keep the JSON).
    if ((failure.status === 403 || failure.status === 404) && isDocumentNavigation(request)) {
      const lang = url.searchParams.get('lang');
      return new Response(null, {
        status: 303,
        headers: {
          location: `/j-aautomation/app/document-unavailable?from=${encodeURIComponent(`/documents/${params.id}`)}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`,
        },
      });
    }
    return failure;
  } finally {
    context?.sqlite.close();
  }
};
