import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import {
  V3AccessDeniedError,
  V3ConflictError,
  V3NotFoundError,
  V3ValidationError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  removePrivateFileIfPresent,
  writePrivateFileExclusive,
} from '$lib/server/private-artifact-access';
import {
  assertRegularPrivateFile,
  validateReportAttachmentFile,
} from '$lib/server/report-attachment-route';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export function documentProblemFor(error: unknown):
  | Readonly<{
      status: number;
      code: string;
      key: `problem.${string}`;
      message: string;
      remedy: string;
    }>
  | undefined {
  if (!(error instanceof Error)) return undefined;
  const known = (
    status: number,
    code: string,
    key: `problem.${string}`,
    message: string,
    remedy: string,
  ) => ({ status, code, key, message, remedy });
  if (error instanceof V3NotFoundError && /document/i.test(error.message))
    return known(
      404,
      'DOCUMENT_NOT_FOUND',
      'problem.document.notFound',
      'This document is no longer available. Refresh the document list before continuing.',
      'review_documents',
    );
  if (error instanceof V3AccessDeniedError)
    return known(
      403,
      'DOCUMENT_ACCESS_REQUIRED',
      'problem.document.accessRequired',
      'You do not have permission to change this document. Contact its owner or an authorized administrator.',
      'contact_document_owner',
    );
  if (error instanceof V3ConflictError) {
    if (/immutable|traceable|referenced|safely reclaimable/i.test(error.message))
      return known(
        409,
        'DOCUMENT_TRACEABLE_IMMUTABLE',
        'problem.document.traceableImmutable',
        'This document is part of traceable history. Archive or supersede it through the permitted workflow.',
        'review_documents',
      );
    if (/changed|already finalized|existing content/i.test(error.message))
      return known(
        409,
        'DOCUMENT_CHANGED',
        'problem.document.changed',
        'The document changed while this form was open. Review its current state before trying another action.',
        'review_documents',
      );
  }
  if (error instanceof V3ValidationError && /archive reason/i.test(error.message))
    return known(
      400,
      'DOCUMENT_ARCHIVE_REASON_REQUIRED',
      'problem.document.archiveReasonRequired',
      'Enter an archive reason of 3 to 500 characters.',
      'review_documents',
    );
  return undefined;
}

export function documentActionFailure(error: unknown) {
  const mapped = documentProblemFor(error);
  return mapped
    ? actionFail(mapped.status, mapped.key, {}, mapped.message, {
        code: mapped.code,
        remedies: [{ id: mapped.remedy }],
      })
    : actionFailure(error);
}

export const documentActions = {
  uploadPrivateDocument: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'documents')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const file = object.file;
    const projectId = String(object.projectId ?? '').trim();
    const artifactType = String(object.artifactType ?? '').trim();
    const description = String(object.description ?? '').trim();
    const sensitivity = String(object.sensitivity ?? 'internal');
    const artifactClassification = String(object.artifactClassification ?? 'standard');
    if (!['standard', 'finance'].includes(artifactClassification))
      return actionFail(
        400,
        'action.validation.documentSensitivity',
        {},
        'Document classification is invalid',
      );
    if (!(file instanceof File) || file.size < 1)
      return actionFail(
        400,
        'action.validation.documentRequired',
        {},
        'Choose a private document to upload',
      );
    if (!projectId || !artifactType || !description)
      return actionFail(
        400,
        'action.validation.documentMetadata',
        {},
        'Project, artifact type and description are required',
      );
    if (!['internal', 'sensitive', 'customer_private'].includes(sensitivity))
      return actionFail(
        400,
        'action.validation.documentSensitivity',
        {},
        'Document sensitivity is invalid',
      );
    const allowed = [
      'application/pdf',
      'application/zip',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'text/plain',
    ];
    if (!allowed.includes(file.type) || file.size > 50_000_000)
      return actionFail(
        400,
        'action.validation.documentTypeOrSize',
        {},
        'Unsupported document type or size over 50 MB',
      );
    let bytes: Uint8Array;
    try {
      bytes = await validateReportAttachmentFile(file);
    } catch {
      return actionFail(
        400,
        'action.validation.documentContent',
        {},
        'Document filename or content does not match its declared type',
      );
    }
    const context = openPortalRepository(locals);
    let createdStorageKey: string | null = null;
    let createdStoragePath: string | null = null;
    let storageFileCreated = false;
    let reservationId: string | null = null;
    try {
      if (
        artifactClassification === 'finance' &&
        !['owner_admin', 'finance_admin'].includes(context.principal.role)
      )
        return actionFail(
          403,
          'action.error.financeRoleRequired',
          {},
          'Finance document access required',
        );
      const sha256 = createHash('sha256').update(bytes).digest('hex');

      const reservation = context.v3.reserveUpload(context.principal, {
        projectId,
        originalFilename: file.name,
        artifactType,
        description,
        artifactClassification: artifactClassification === 'finance' ? 'finance' : undefined,
        sensitivity: sensitivity as 'internal' | 'sensitive' | 'customer_private',
      });
      reservationId = reservation.reservationId;

      const storageKey = reservation.storageKey;
      const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
      const target = resolve(root, storageKey);
      const relativePath = relative(root, target);
      if (
        !relativePath ||
        relativePath.split(/[\\/]/).includes('..') ||
        relativePath.startsWith('\\') ||
        relativePath.startsWith('/')
      ) {
        context.v3.cancelUploadReservation(context.principal, reservation.reservationId);
        return actionFail(
          400,
          'action.validation.documentPath',
          {},
          'Invalid private document path',
        );
      }

      createdStorageKey = storageKey;
      createdStoragePath = target;
      try {
        await writePrivateFileExclusive(root, storageKey, bytes);
        storageFileCreated = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // O_EXCL means another publisher won the reservation path.  Never let
        // that collision finalize metadata until the existing regular file is
        // independently verified against this upload's hash, length and media.
        await assertRegularPrivateFile(root, storageKey, sha256, file.size, file.type);
      }

      context.v3.finalizeUpload(context.principal, reservation.reservationId, {
        sha256,
        mediaType: file.type,
        byteLength: file.size,
      });
      reservationId = null;

      return actionSuccess(
        'action.documents.uploaded',
        {},
        'Private document uploaded and hash-registered',
      );
    } catch (error) {
      if (reservationId) {
        try {
          context.v3.cancelUploadReservation(context.principal, reservationId);
        } catch {
          // Preserve the upload error; the scheduled stale-reservation cleanup
          // remains responsible for a reservation that could not be cancelled.
        }
      }
      if (storageFileCreated && createdStorageKey && createdStoragePath) {
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const relativePath = relative(root, createdStoragePath);
        if (
          relativePath &&
          !relativePath.split(/[\\/]/).includes('..') &&
          !relativePath.startsWith('\\') &&
          !relativePath.startsWith('/')
        )
          await removePrivateFileIfPresent(root, createdStorageKey).catch(() => undefined);
      }
      return documentActionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  archiveDocument: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'documents')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const documentId = String(object.documentId ?? '').trim();
    const reason = String(object.reason ?? '').trim();
    if (!documentId || reason.length < 3 || reason.length > 500)
      return actionFail(400, 'action.validation.documentArchive', {}, 'Enter an archive reason');
    const context = openPortalRepository(locals);
    try {
      context.v3.archiveDocument(context.principal, documentId, reason);
      return actionSuccess('action.documents.archived', {}, 'Document archived');
    } catch (error) {
      return documentActionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deleteDocument: async ({ locals, request, params }: PortalActionEvent) => {
    if (
      params.section !== 'documents' &&
      params.section !== 'expenses' &&
      params.section !== 'projects'
    )
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const documentId = String(object.documentId ?? '').trim();
    if (!documentId)
      return actionFail(400, 'action.validation.documentIdRequired', {}, 'Document ID required');

    const context = openPortalRepository(locals);
    try {
      const deleted = context.v3.deleteDocument(context.principal, documentId);
      const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
      const target = resolve(root, deleted.storageKey);
      const relativePath = relative(root, target);
      if (
        !relativePath ||
        relativePath.split(/[\\/]/).includes('..') ||
        relativePath.startsWith('\\') ||
        relativePath.startsWith('/')
      )
        throw new Error('Invalid private document path');
      await removePrivateFileIfPresent(root, deleted.storageKey);
      return actionSuccess('action.documents.deleted', {}, 'Document deleted');
    } catch (error) {
      return documentActionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
