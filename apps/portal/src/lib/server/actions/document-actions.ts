import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  removePrivateFileIfPresent,
  writePrivateFileExclusive,
} from '$lib/server/private-artifact-access';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import {
  formObject,
  privateDocumentSignature,
  type PortalActionEvent,
} from '$lib/server/action-utils';

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
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!privateDocumentSignature(file.type, bytes))
      return actionFail(
        400,
        'action.validation.documentContent',
        {},
        'Document content does not match its declared type',
      );
    const context = openPortalRepository(locals);
    let createdStorageKey: string | null = null;
    let createdStoragePath: string | null = null;
    let storageFileCreated = false;
    let reservationId: string | null = null;
    try {
      const sha256 = createHash('sha256').update(bytes).digest('hex');

      const reservation = context.v3.reserveUpload(context.principal, {
        projectId,
        originalFilename: file.name,
        artifactType,
        description,
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
      return actionFailure(error);
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
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
