import { createHash } from 'node:crypto';
import { uuidSchema } from '@ja/schemas';
import { json } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import {
  removePrivateFileIfPresent,
  writePrivateFileExclusive,
} from '$lib/server/private-artifact-access';
import { assertRegularPrivateFile } from '$lib/server/report-attachment-route';
import type { RequestHandler } from './$types';

const receiptSignature = (mediaType: string, bytes: Uint8Array): boolean => {
  const startsWith = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);
  if (mediaType === 'application/pdf')
    return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  if (mediaType === 'image/jpeg') return startsWith(0xff, 0xd8, 0xff);
  if (mediaType === 'image/png') return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mediaType === 'image/webp')
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
    );
  if (mediaType === 'image/heic' || mediaType === 'image/heif') {
    const brand = new TextDecoder().decode(bytes.slice(8, 16));
    return (
      new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp' &&
      /heic|heix|hevc|mif1|msf1/.test(brand)
    );
  }
  return false;
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.JA_OFFLINE_ENABLED?.trim().toLowerCase() === 'false')
    return json(
      { offlineEnabled: false, error: 'Offline capture is disabled for this deployment' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  const form = await request.formData();
  const projectId = form.get('projectId');
  const attachmentId = form.get('attachmentId');
  const file = form.get('file');
  const uploadedFile = file instanceof File ? file : null;
  if (
    typeof projectId !== 'string' ||
    !uuidSchema.safeParse(projectId).success ||
    typeof attachmentId !== 'string' ||
    !uuidSchema.safeParse(attachmentId).success ||
    !uploadedFile
  )
    return json({ error: 'Invalid offline attachment' }, { status: 400 });
  if (uploadedFile.size < 1 || uploadedFile.size > 10_000_000)
    return json({ error: 'Receipt must be between 1 byte and 10 MB' }, { status: 400 });
  const uploadedMediaType = uploadedFile.type;
  const uploadedSize = uploadedFile.size;
  const uploadedName = uploadedFile.name;
  const allowed = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ]);
  if (!allowed.has(uploadedMediaType))
    return json({ error: 'Unsupported receipt type' }, { status: 400 });
  const bytes = new Uint8Array(await uploadedFile.arrayBuffer());
  if (!receiptSignature(uploadedMediaType, bytes))
    return json({ error: 'Receipt content does not match its media type' }, { status: 400 });

  const context = openPortalRepository(locals);
  let createdStoragePath: string | null = null;
  let createdStorageKey: string | null = null;
  let fileCreated = false;
  let reservationId: string | null = null;
  try {
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    const reservation = context.v3.reserveUpload(context.principal, {
      projectId,
      originalFilename: uploadedName.slice(0, 200),
      artifactType: 'receipt',
      description: 'Expense receipt',
      sensitivity: 'internal',
    });
    reservationId = reservation.reservationId;

    const storageKey = reservation.storageKey;
    createdStorageKey = storageKey;
    const root = process.env.JA_DOCUMENT_ROOT ?? 'data/documents';
    try {
      createdStoragePath = await writePrivateFileExclusive(root, storageKey, bytes);
      fileCreated = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // A retried request may encounter its own already-published file. Verify
      // the winner before allowing the database reservation to reference it.
      await assertRegularPrivateFile(root, storageKey, sha256, uploadedSize, uploadedMediaType);
    }

    context.v3.finalizeUpload(context.principal, reservation.reservationId, {
      sha256,
      mediaType: uploadedMediaType,
      byteLength: uploadedSize,
    });
    reservationId = null;

    return json({ attachmentId, documentId: reservation.reservationId });
  } catch (error) {
    if (reservationId) {
      try {
        context.v3.cancelUploadReservation(context.principal, reservationId);
      } catch {
        // Preserve the original upload error; stale cleanup remains available.
      }
    }
    if (fileCreated && createdStoragePath && createdStorageKey) {
      const root = process.env.JA_DOCUMENT_ROOT ?? 'data/documents';
      await removePrivateFileIfPresent(root, createdStorageKey).catch(() => undefined);
    }
    const failure = actionFailure(error);
    return json(
      { error: failure?.data?.message ?? 'Receipt upload failed' },
      { status: failure?.status ?? 400 },
    );
  } finally {
    context.sqlite.close();
  }
};
