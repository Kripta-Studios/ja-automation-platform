import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { base } from '$app/paths';
import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) redirect(303, `${base}/app/login`);
  if (!params.id) error(400, 'Report id is required');
  const context = openPortalRepository(locals);
  try {
    const metadata = context.v3.periodReportPdfMetadata(context.principal, params.id);
    const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
    const target = resolve(root, metadata.storageKey);
    const relativePath = relative(root, target);
    if (
      !relativePath ||
      relativePath.split(/[\\/]/).includes('..') ||
      relativePath.startsWith('\\') ||
      relativePath.startsWith('/')
    )
      error(400, 'Invalid report path');
    const bytes = await readFile(target);
    if (
      bytes.byteLength !== metadata.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== metadata.sha256
    )
      error(500, 'Report integrity check failed');
    return new Response(bytes, {
      headers: {
        'content-type': 'application/pdf',
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
