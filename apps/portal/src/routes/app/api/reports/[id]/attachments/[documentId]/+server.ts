import { json } from '@sveltejs/kit';
import {
  V3AccessDeniedError,
  V3ConflictError,
  V3NotFoundError,
  V3ValidationError,
} from '@ja/database';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import {
  assertRegularPrivateFile,
  reportAttachmentTypeForId,
  safeDocumentRoot,
} from '$lib/server/report-attachment-route';
import { contentDispositionFilename } from '$lib/server/private-artifact-access';
import type { RequestHandler } from './$types';

function failureResponse(cause: unknown): Response {
  if (cause instanceof V3NotFoundError || cause instanceof V3AccessDeniedError)
    return json({ error: 'Report attachment not found' }, { status: 404 });
  if (cause instanceof V3ValidationError && /not ready|processing/iu.test(cause.message))
    return json({ error: 'Report attachment is not ready' }, { status: 409 });
  if (cause instanceof V3ConflictError && /integrity|unavailable/iu.test(cause.message))
    return json({ error: 'Report attachment is unavailable' }, { status: 409 });
  if (
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    ['ENOENT', 'ELOOP', 'EPERM'].includes(String((cause as { code?: unknown }).code))
  )
    return json({ error: 'Report attachment is unavailable' }, { status: 409 });
  const failure = actionFailure(cause);
  return json(
    { error: failure.data?.message ?? 'Report attachment is unavailable' },
    { status: failure.status },
  );
}

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!params.id || !params.documentId)
    return json({ error: 'Report attachment not found' }, { status: 404 });
  const context = openPortalRepository(locals);
  try {
    const reportType = reportAttachmentTypeForId(context.sqlite, params.id);
    // v3 performs report-aware RBAC, scanner-state fencing, project scoping,
    // and records the access audit before this route touches the filesystem.
    const metadata = context.v3.authorizeReportAttachment(
      context.principal,
      reportType,
      params.id,
      params.documentId,
    );
    const bytes = await assertRegularPrivateFile(
      safeDocumentRoot(),
      metadata.storageKey,
      metadata.sha256,
      metadata.byteLength,
      metadata.mediaType,
    );
    return new Response(bytes.buffer as ArrayBuffer, {
      headers: {
        'content-type': metadata.mediaType,
        'content-length': String(bytes.byteLength),
        'content-disposition': contentDispositionFilename(metadata.filename),
        'cache-control': 'private, no-store',
        pragma: 'no-cache',
        expires: '0',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
        'content-security-policy': 'sandbox',
      },
    });
  } catch (cause) {
    return failureResponse(cause);
  } finally {
    context.sqlite.close();
  }
};
