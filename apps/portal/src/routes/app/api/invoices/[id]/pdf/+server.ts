import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { error, type RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  const invoiceId = (params as { id?: string }).id;
  if (!invoiceId) error(404, 'Invoice not found');
  const context = openPortalRepository(locals);
  try {
    const metadata = context.v3.invoicePdfMetadata(context.principal, invoiceId);
    const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
    const target = resolve(root, metadata.storageKey);
    const rel = relative(root, target);
    if (rel.split(/[\\/]/).includes('..') || rel.startsWith('\\'))
      error(400, 'Invalid invoice path');
    const bytes = await readFile(target);
    if (
      (metadata.byteLength !== undefined && bytes.byteLength !== metadata.byteLength) ||
      createHash('sha256').update(bytes).digest('hex') !== metadata.sha256
    )
      error(409, 'Invoice PDF integrity check failed');
    return new Response(bytes, {
      headers: {
        'content-type': metadata.mediaType,
        'content-length': String(bytes.byteLength),
        'content-disposition': `attachment; filename="${metadata.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } finally {
    context.sqlite.close();
  }
};
