import { json } from '@sveltejs/kit';
import { V3NotFoundError, V3ValidationError } from '@ja/database';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
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

function errorResponse(cause: unknown): Response {
  if (cause instanceof V3NotFoundError) return json({ error: 'Report not found' }, { status: 404 });
  const failure = actionFailure(cause);
  return json(
    { error: failure.data?.message ?? 'Report attachment upload failed' },
    { status: failure.status },
  );
}

function isAuthenticated(locals: App.Locals): boolean {
  return Boolean(locals.user && locals.session);
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!isAuthenticated(locals)) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!params.id) return json({ error: 'Report not found' }, { status: 404 });

  let context: ReturnType<typeof openPortalRepository> | undefined;
  let reservationId: string | null = null;
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
      if (cancelledStorageKey)
        await removePrivateFileIfPresent(safeDocumentRoot(), cancelledStorageKey).catch(
          () => undefined,
        );
    }
    return errorResponse(cause);
  } finally {
    context?.sqlite.close();
  }
};
