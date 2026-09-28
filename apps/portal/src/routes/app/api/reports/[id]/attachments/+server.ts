import { json } from '@sveltejs/kit';
import { V3NotFoundError, V3ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  reportAttachmentFailureResponse,
  reportAttachmentSignInResponse,
} from '$lib/server/report-attachment-problem';
import {
  assertReportVersion,
  attachmentHash,
  attachmentMediaType,
  parseReportAttachmentMetadata,
  reportAttachmentTypeForId,
  safeDocumentRoot,
  validateReportAttachmentFile,
} from '$lib/server/report-attachment-route';
import {
  removePrivateFileIfPresent,
  writePrivateFileExclusive,
} from '$lib/server/private-artifact-access';
import type { RequestHandler } from './$types';

function isAuthenticated(locals: App.Locals): boolean {
  return Boolean(locals.user && locals.session);
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!isAuthenticated(locals)) return reportAttachmentSignInResponse();
  if (!params.id) return reportAttachmentFailureResponse(new V3NotFoundError('Report not found'));

  let context: ReturnType<typeof openPortalRepository> | undefined;
  let reservationId: string | null = null;
  let storageFileCreated = false;
  try {
    context = openPortalRepository(locals);
    const reportType = reportAttachmentTypeForId(context.sqlite, params.id);
    const form = await request.formData();
    const fileValue = form.get('file');
    if (!(fileValue instanceof File))
      throw new V3ValidationError('A report attachment file is required');
    const metadata = parseReportAttachmentMetadata(form);
    const file = fileValue;
    // The report version is checked before the reservation so stale UI cannot
    // create an orphaned attachment while a report is being edited elsewhere.
    assertReportVersion(context.sqlite, reportType, params.id, metadata.version);
    // Reservation deliberately happens before reading the multipart file bytes.
    // This keeps the DB link and filesystem key under the v3 lifecycle.
    const reservation = context.v3.reserveReportAttachment(context.principal, {
      reportType,
      reportId: params.id,
      attachmentKind: metadata.attachmentKind,
      originalFilename: file.name,
      description: metadata.notes,
      supersedesDocumentId: metadata.supersedesDocumentId,
      sensitivity: 'internal',
    });
    reservationId = reservation.reservationId;

    const bytes = await validateReportAttachmentFile(file);
    const root = safeDocumentRoot();
    await writePrivateFileExclusive(root, reservation.storageKey, bytes);
    storageFileCreated = true;
    // Re-check after the potentially long file read/write.  If the report was
    // edited concurrently, cancellation removes both the temporary link and
    // the exact reserved file rather than publishing against stale truth.
    assertReportVersion(context.sqlite, reportType, params.id, metadata.version);
    const finalized = context.v3.finalizeReportAttachment(
      context.principal,
      reservation.reservationId,
      {
        sha256: attachmentHash(bytes),
        mediaType: attachmentMediaType(file),
        byteLength: bytes.byteLength,
      },
    );
    reservationId = null;
    return json(
      {
        success: true,
        documentId: finalized.documentId,
        state: finalized.state,
        scanStatus: finalized.scanStatus,
      },
      { status: 201 },
    );
  } catch (cause) {
    if (context && reservationId) {
      let cancelledStorageKey: string | null = null;
      try {
        const cancelled = context.v3.cancelReportAttachment(context.principal, reservationId);
        cancelledStorageKey = cancelled.storageKey;
      } catch {
        // Preserve the original failure.  Do not remove a path unless the
        // database returned the exact reserved key during cancellation.
      }
      // Never delete a pre-existing winner after an EEXIST collision. Only
      // remove a file that this request successfully published before a later
      // database finalization step failed.
      if (storageFileCreated && cancelledStorageKey)
        await removePrivateFileIfPresent(safeDocumentRoot(), cancelledStorageKey).catch(
          () => undefined,
        );
    }
    return reportAttachmentFailureResponse(cause);
  } finally {
    context?.sqlite.close();
  }
};
