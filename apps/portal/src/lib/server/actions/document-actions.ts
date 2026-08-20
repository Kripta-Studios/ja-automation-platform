import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fail } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import {
  formObject,
  privateDocumentExtension,
  privateDocumentSignature,
  type PortalActionEvent,
} from '$lib/server/action-utils';

export const documentActions = {
  uploadPrivateDocument: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'documents')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const file = object.file;
    const projectId = String(object.projectId ?? '').trim();
    const artifactType = String(object.artifactType ?? '').trim();
    const description = String(object.description ?? '').trim();
    const sensitivity = String(object.sensitivity ?? 'internal');
    if (!(file instanceof File) || file.size < 1)
      return fail(400, { success: false, message: 'Choose a private document to upload' });
    if (!projectId || !artifactType || !description)
      return fail(400, {
        success: false,
        message: 'Project, artifact type and description are required',
      });
    if (!['internal', 'sensitive', 'customer_private'].includes(sensitivity))
      return fail(400, { success: false, message: 'Document sensitivity is invalid' });
    const allowed = [
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'text/plain',
    ];
    if (!allowed.includes(file.type) || file.size > 50_000_000)
      return fail(400, { success: false, message: 'Unsupported document type or size over 50 MB' });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!privateDocumentSignature(file.type, bytes))
      return fail(400, {
        success: false,
        message: 'Document content does not match its declared type',
      });
    const context = openPortalRepository(locals);
    let createdStorageKey: string | null = null;
    let createdStoragePath: string | null = null;
    let storageFileCreated = false;
    try {
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const lowerType = artifactType.toLowerCase();
      const folder = lowerType.includes('backup')
        ? 'plc-backups'
        : lowerType.includes('report')
          ? 'reports'
          : 'technical';
      const storageKey = `${folder}/${sha256.slice(0, 2)}/${sha256}.${privateDocumentExtension(file.type)}`;
      const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
      const target = resolve(root, storageKey);
      const relativePath = relative(root, target);
      if (
        !relativePath ||
        relativePath.split(/[\\/]/).includes('..') ||
        relativePath.startsWith('\\') ||
        relativePath.startsWith('/')
      )
        return fail(400, { success: false, message: 'Invalid private document path' });
      createdStorageKey = storageKey;
      createdStoragePath = target;
      await mkdir(resolve(target, '..'), { recursive: true });
      try {
        await writeFile(target, bytes, { flag: 'wx' });
        storageFileCreated = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      const document = context.repository.registerPrivateDocument(context.principal, {
        projectId,
        sha256,
        mediaType: file.type,
        byteLength: file.size,
        storageKey,
        originalFilename: file.name.slice(0, 200),
        description,
        artifactType,
        sensitivity: sensitivity as 'internal' | 'sensitive' | 'customer_private',
      });
      if (!document.created && storageFileCreated) {
        await unlink(target);
        storageFileCreated = false;
      }
      return { success: true, message: 'Private document uploaded and hash-registered' };
    } catch (error) {
      if (storageFileCreated && createdStorageKey && createdStoragePath) {
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const relativePath = relative(root, createdStoragePath);
        if (
          relativePath &&
          !relativePath.split(/[\\/]/).includes('..') &&
          !relativePath.startsWith('\\') &&
          !relativePath.startsWith('/')
        )
          await unlink(createdStoragePath).catch(() => undefined);
      }
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
