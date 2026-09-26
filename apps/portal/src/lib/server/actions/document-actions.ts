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

export function documentActionFailure(
  error: unknown,
  actionName?: string,
  values: Record<string, string> = {},
) {
  const mapped = documentProblemFor(error);
  return mapped
    ? actionFail(mapped.status, mapped.key, {}, mapped.message, {
        code: mapped.code,
        actionName,
        values,
        remedies: [{ id: mapped.remedy }],
      })
    : actionFailure(error, { actionName, values });
}

function documentValues(object: Record<string, unknown>) {
  return Object.fromEntries(
    [
      'projectId',
      'artifactType',
      'description',
      'sensitivity',
      'artifactClassification',
      'documentId',
      'reason',
      'viewportScrollY',
    ]
      .filter((field) => typeof object[field] === 'string')
      .map((field) => [field, String(object[field]).slice(0, 5_000)]),
  );
}

function documentInputFailure(
  status: number,
  code: string,
  key: `problem.${string}`,
  message: string,
  actionName: string,
  values: Record<string, string>,
  fields: readonly string[] = [],
  remedy = 'correct_fields',
) {
  return actionFail(status, key, {}, message, {
    code,
    actionName,
    values,
    fieldErrors: Object.fromEntries(fields.map((field) => [field, [key]])),
    remedies: [{ id: remedy }],
  });
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
    const values = documentValues(object);
    if (!['standard', 'finance'].includes(artifactClassification))
      return documentInputFailure(
        400,
        'DOCUMENT_CLASSIFICATION_INVALID',
        'problem.document.classificationInvalid',
        'Choose a valid document access classification.',
        'uploadPrivateDocument',
        values,
        ['artifactClassification'],
      );
    if (!(file instanceof File) || file.size < 1)
      return documentInputFailure(
        400,
        'DOCUMENT_FILE_REQUIRED',
        'problem.document.fileRequired',
        'Choose a private document to upload.',
        'uploadPrivateDocument',
        values,
        ['file'],
      );
    if (!projectId || !artifactType || !description)
      return documentInputFailure(
        400,
        'DOCUMENT_METADATA_REQUIRED',
        'problem.document.metadataRequired',
        'Choose a project, artifact type, and description before uploading.',
        'uploadPrivateDocument',
        values,
        [
          ...(!projectId ? ['projectId'] : []),
          ...(!artifactType ? ['artifactType'] : []),
          ...(!description ? ['description'] : []),
        ],
      );
    if (!['internal', 'sensitive', 'customer_private'].includes(sensitivity))
      return documentInputFailure(
        400,
        'DOCUMENT_SENSITIVITY_INVALID',
        'problem.document.sensitivityInvalid',
        'Choose a valid sensitivity level for this document.',
        'uploadPrivateDocument',
        values,
        ['sensitivity'],
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
      return documentInputFailure(
        400,
        'DOCUMENT_FILE_TYPE_OR_SIZE_INVALID',
        'problem.document.fileTypeOrSizeInvalid',
        'Choose a supported PDF, ZIP, image, or text file no larger than 50 MB.',
        'uploadPrivateDocument',
        values,
        ['file'],
      );
    let bytes: Uint8Array;
    try {
      bytes = await validateReportAttachmentFile(file);
    } catch {
      return documentInputFailure(
        400,
        'DOCUMENT_FILE_CONTENT_INVALID',
        'problem.document.fileContentInvalid',
        'The document filename or content does not match its file type. Choose a valid file and attach it again.',
        'uploadPrivateDocument',
        values,
        ['file'],
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
        return documentInputFailure(
          403,
          'DOCUMENT_FINANCE_ROLE_REQUIRED',
          'problem.document.financeRoleRequired',
          'Only an owner or finance administrator may register a finance document. Contact an authorized administrator.',
          'uploadPrivateDocument',
          values,
          [],
          'contact_document_owner',
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
        return documentInputFailure(
          503,
          'DOCUMENT_STORAGE_UNAVAILABLE',
          'problem.document.storageUnavailable',
          'The document could not be stored safely. Check the document list before trying again.',
          'uploadPrivateDocument',
          values,
          [],
          'review_documents',
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
      return documentActionFailure(error, 'uploadPrivateDocument', values);
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
    const values = documentValues(object);
    if (!documentId)
      return documentInputFailure(
        400,
        'DOCUMENT_ID_REQUIRED',
        'problem.document.idRequired',
        'Select a document before continuing.',
        'archiveDocument',
        values,
        ['documentId'],
      );
    if (reason.length < 3 || reason.length > 500)
      return documentInputFailure(
        400,
        'DOCUMENT_ARCHIVE_REASON_REQUIRED',
        'problem.document.archiveReasonRequired',
        'Enter an archive reason of 3 to 500 characters.',
        'archiveDocument',
        values,
        ['reason'],
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.archiveDocument(context.principal, documentId, reason);
      return actionSuccess('action.documents.archived', {}, 'Document archived');
    } catch (error) {
      return documentActionFailure(error, 'archiveDocument', values);
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
      return documentInputFailure(
        400,
        'DOCUMENT_ID_REQUIRED',
        'problem.document.idRequired',
        'Select a document before continuing.',
        'deleteDocument',
        documentValues(object),
        ['documentId'],
      );

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
      return documentActionFailure(error, 'deleteDocument', documentValues(object));
    } finally {
      context.sqlite.close();
    }
  },
};
