import { json } from '@sveltejs/kit';
import { V3NotFoundError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  reportAttachmentFailureResponse,
  reportAttachmentSignInResponse,
} from '$lib/server/report-attachment-problem';
import { removePrivateFileIfPresent } from '$lib/server/private-artifact-access';
import { reportAttachmentTypeForId } from '$lib/server/report-attachment-route';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.user || !locals.session) return reportAttachmentSignInResponse();
  if (!params.id || !params.documentId)
    return reportAttachmentFailureResponse(new V3NotFoundError('Report attachment not found'));
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
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
    return reportAttachmentFailureResponse(cause);
  } finally {
    context?.sqlite.close();
  }
};
