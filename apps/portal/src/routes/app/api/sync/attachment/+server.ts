import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { uuidSchema } from '@ja/schemas';
import { json } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
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

const extensionFor = (mediaType: string): string =>
  mediaType === 'application/pdf'
    ? 'pdf'
    : mediaType === 'image/png'
      ? 'png'
      : mediaType === 'image/webp'
        ? 'webp'
        : mediaType === 'image/heic'
          ? 'heic'
          : mediaType === 'image/heif'
            ? 'heif'
            : 'jpg';

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  const form = await request.formData();
  const projectId = form.get('projectId');
  const attachmentId = form.get('attachmentId');
  const file = form.get('file');
  if (
    typeof projectId !== 'string' ||
    !uuidSchema.safeParse(projectId).success ||
    typeof attachmentId !== 'string' ||
    !uuidSchema.safeParse(attachmentId).success ||
    !(file instanceof File)
  )
    return json({ error: 'Invalid offline attachment' }, { status: 400 });
  if (file.size < 1 || file.size > 10_000_000)
    return json({ error: 'Receipt must be between 1 byte and 10 MB' }, { status: 400 });
  const allowed = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ]);
  if (!allowed.has(file.type)) return json({ error: 'Unsupported receipt type' }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!receiptSignature(file.type, bytes))
    return json({ error: 'Receipt content does not match its media type' }, { status: 400 });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const storageKey = `${sha256.slice(0, 2)}/${sha256}.${extensionFor(file.type)}`;
  const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
  const target = resolve(root, storageKey);
  const targetRelativePath = relative(root, target);
  if (
    !targetRelativePath ||
    targetRelativePath.split(/[\\/]/).includes('..') ||
    targetRelativePath.startsWith('\\') ||
    targetRelativePath.startsWith('/')
  )
    return json({ error: 'Invalid receipt storage path' }, { status: 400 });
  let fileCreated = false;
  const context = openPortalRepository(locals);
  try {
    await mkdir(resolve(root, sha256.slice(0, 2)), { recursive: true });
    try {
      await writeFile(target, bytes, { flag: 'wx' });
      fileCreated = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const document = context.repository.registerReceipt(context.principal, {
      projectId,
      sha256,
      mediaType: file.type,
      byteLength: file.size,
      storageKey,
      originalFilename: file.name.slice(0, 200),
    });
    return json({ attachmentId, documentId: document.id });
  } catch (error) {
    if (fileCreated) await unlink(target).catch(() => undefined);
    const failure = actionFailure(error);
    return json(
      { error: failure?.data?.message ?? 'Receipt upload failed' },
      { status: failure?.status ?? 400 },
    );
  } finally {
    context.sqlite.close();
  }
};
