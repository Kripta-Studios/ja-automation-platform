import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { open as openFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, ConflictError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';

function privateArtifactHeaders(): Record<string, string> {
  return {
    'cache-control': 'private, no-store',
    pragma: 'no-cache',
    expires: '0',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': 'sandbox',
  };
}

function notFound(): Response {
  // Missing and unauthorized variants intentionally share the same response to prevent IDOR
  // discovery. No filesystem access occurs before repository authorization succeeds.
  return json(
    { error: 'Localized PDF variant not found' },
    { status: 404, headers: privateArtifactHeaders() },
  );
}

function pdfMagicValid(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  const header = Buffer.from(bytes.subarray(0, 5)).toString('ascii');
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - 1024))).toString('latin1');
  return header === '%PDF-' && tail.includes('%%EOF');
}

function contentDispositionFilename(filename: string): string {
  const fallback = filename.replace(/[\r\n"]/gu, '_').replace(/[^A-Za-z0-9._-]/gu, '_');
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function assertNoSymlinkParents(root: string, directory: string): Promise<void> {
  const rootPath = resolve(root);
  const targetDirectory = resolve(directory);
  const relativeDirectory = relative(rootPath, targetDirectory);
  if (
    relativeDirectory.split(/[\\/]/u).some((segment) => segment === '..') ||
    relativeDirectory.startsWith('/') ||
    relativeDirectory.startsWith('\\')
  )
    throw new Error('Localized PDF path escaped private root');
  const rootStats = await lstat(rootPath);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory())
    throw new Error('Localized PDF root must be a real directory');
  let cursor = rootPath;
  for (const component of relativeDirectory.split(/[\\/]/u).filter(Boolean)) {
    cursor = resolve(cursor, component);
    const stats = await lstat(cursor);
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new Error('Localized PDF parent must be a real directory');
  }
}

async function readRegularFileNoFollow(path: string): Promise<Buffer> {
  const noFollow = (fsConstants as typeof fsConstants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const handle = await openFile(path, fsConstants.O_RDONLY | noFollow);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new Error('Localized PDF destination is not a regular file');
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user || !locals.session)
    return json({ error: 'Sign in required' }, { status: 401, headers: privateArtifactHeaders() });
  const variantId = params.variantId?.trim() ?? '';
  if (!variantId) return notFound();
  const context = openPortalRepository(locals);
  try {
    let metadata;
    try {
      metadata = context.localizedPdf.resolveLocalizedPdfDownload(context.principal, variantId);
    } catch (cause) {
      if (cause instanceof AccessDeniedError) return notFound();
      if (cause instanceof ConflictError)
        return json({ error: cause.message }, { status: 409, headers: privateArtifactHeaders() });
      throw cause;
    }

    const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
    const target = resolve(root, metadata.storageKey);
    const relativeTarget = relative(root, target);
    if (
      !relativeTarget ||
      relativeTarget.split(/[\\/]/u).includes('..') ||
      relativeTarget.startsWith('\\') ||
      relativeTarget.startsWith('/')
    )
      return json(
        { error: 'Localized PDF artifact is unavailable' },
        { status: 409, headers: privateArtifactHeaders() },
      );
    try {
      await assertNoSymlinkParents(root, dirname(target));
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink())
        return json(
          { error: 'Localized PDF artifact is unavailable' },
          { status: 409, headers: privateArtifactHeaders() },
        );
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
        return json(
          { error: 'Localized PDF artifact is not ready' },
          { status: 409, headers: privateArtifactHeaders() },
        );
      throw cause;
    }
    let bytes: Buffer;
    try {
      bytes = await readRegularFileNoFollow(target);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
        return json(
          { error: 'Localized PDF artifact is not ready' },
          { status: 409, headers: privateArtifactHeaders() },
        );
      throw cause;
    }
    if (
      bytes.byteLength !== metadata.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== metadata.contentSha256 ||
      !pdfMagicValid(bytes)
    ) {
      // Re-enter the repository verifier so a race between its check and this final read also
      // records the integrity incident and atomically blocks the ready manifest.
      try {
        context.localizedPdf.resolveLocalizedPdfDownload(context.principal, variantId);
      } catch {
        // The public response remains a generic conflict regardless of the internal race cause.
      }
      return json(
        { error: 'Localized PDF artifact integrity check failed' },
        { status: 409, headers: privateArtifactHeaders() },
      );
    }
    // Copy into a standalone ArrayBuffer so the Fetch body cannot retain a Node Buffer's
    // pooled/shared backing memory (and stays compatible with the DOM BodyInit type).
    const responseBytes = new Uint8Array(bytes.byteLength);
    responseBytes.set(bytes);
    return new Response(responseBytes.buffer as ArrayBuffer, {
      headers: {
        'content-type': metadata.mediaType,
        'content-length': String(bytes.byteLength),
        'content-disposition': contentDispositionFilename(metadata.semanticFilename),
        ...privateArtifactHeaders(),
      },
    });
  } finally {
    context.sqlite.close();
  }
};
