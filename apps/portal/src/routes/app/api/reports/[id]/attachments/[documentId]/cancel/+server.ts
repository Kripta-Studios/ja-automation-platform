import { json } from '@sveltejs/kit';
import { V3NotFoundError } from '@ja/database';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { removePrivateFileIfPresent } from '$lib/server/private-artifact-access';
import { reportAttachmentTypeForId } from '$lib/server/report-attachment-route';
import type { RequestHandler } from './$types';

function failureResponse(cause: unknown): Response {
  if (cause instanceof V3NotFoundError)
    return json({ error: 'Report attachment not found' }, { status: 404 });
  const failure = actionFailure(cause);
  return json(
    { error: failure.data?.message ?? 'Report attachment cancellation failed' },
    { status: failure.status },
  );
}

export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!params.id || !params.documentId)
    return json({ error: 'Report attachment not found' }, { status: 404 });
  const context = openPortalRepository(locals);
  try {
    const reportType = reportAttachmentTypeForId(context.sqlite, params.id);
    // Deriving the report type first ensures a document id cannot be replayed
    // against a different report kind or an unrelated report URL.
    const link = context.sqlite
      .prepare(
        'SELECT 1 FROM report_document_link WHERE report_type=? AND report_id=? AND document_id=?',
      )
      .get(reportType, params.id, params.documentId);
    if (!link) throw new V3NotFoundError('Report attachment not found');
    const cancelled = context.v3.cancelReportAttachment(context.principal, params.documentId);
    await removePrivateFileIfPresent(
      process.env.JA_DOCUMENT_ROOT ?? 'data/documents',
      cancelled.storageKey,
    ).catch(() => undefined);
    return json({ success: true, documentId: cancelled.documentId, cancelled: true });
  } catch (cause) {
    return failureResponse(cause);
  } finally {
    context.sqlite.close();
  }
};
