import { json } from '@sveltejs/kit';
import {
  V3AccessDeniedError,
  V3ConflictError,
  V3NotFoundError,
  V3ValidationError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { privateDocumentResponse } from '$lib/server/private-artifact-access';
import { assertRegularPrivateFile, safeDocumentRoot } from '$lib/server/report-attachment-route';
import type { RequestHandler } from './$types';

function unavailable(cause: unknown): Response {
  if (
    cause instanceof V3NotFoundError ||
    cause instanceof V3AccessDeniedError ||
    cause instanceof V3ValidationError
  )
    return json({ error: 'Document not found' }, { status: 404 });
  if (cause instanceof V3ConflictError)
    return json({ error: 'Document is unavailable' }, { status: 409 });
  if (
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    ['ENOENT', 'ELOOP', 'ENOTDIR', 'EPERM', 'EACCES'].includes(
      String((cause as { code?: unknown }).code),
    )
  )
    return json({ error: 'Document is unavailable' }, { status: 409 });
  return json({ error: 'Document is unavailable' }, { status: 409 });
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!params.id) return json({ error: 'Document not found' }, { status: 404 });

  const context = openPortalRepository(locals);
  try {
    // Authorization and scanner-state fencing happen before the descriptor-safe
    // read; the successful-download audit is recorded only after integrity verification.
    const metadata = context.v3.authorizeDocument(context.principal, params.id);
    const bytes = await assertRegularPrivateFile(
      safeDocumentRoot(),
      metadata.storageKey,
      metadata.sha256,
      metadata.byteLength,
      metadata.mediaType,
    );
    context.v3.recordDocumentDownload(context.principal, params.id);
    return privateDocumentResponse(
      bytes,
      metadata,
      url.searchParams.get('view') === '1' ? 'inline' : 'attachment',
    );
  } catch (cause) {
    return unavailable(cause);
  } finally {
    context.sqlite.close();
  }
};
