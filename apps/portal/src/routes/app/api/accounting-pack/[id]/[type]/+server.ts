import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { error, type RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';

const types = new Set(['pdf', 'xlsx', 'invoice_csv', 'expense_csv', 'json']);

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  const routeParams = params as { id?: string; type?: string };
  const exportType = routeParams.type;
  const packId = routeParams.id;
  if (!packId || !exportType || !types.has(exportType)) error(404, 'Export not found');
  const context = openPortalRepository(locals);
  try {
    const metadata = context.v3.accountingPackExport(
      context.principal,
      packId,
      exportType as 'pdf' | 'xlsx' | 'invoice_csv' | 'expense_csv' | 'json',
    );
    const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
    const target = resolve(root, metadata.storageKey);
    const rel = relative(root, target);
    if (rel.split(/[\\/]/).includes('..') || rel.startsWith('\\'))
      error(400, 'Invalid export path');
    const bytes = await readFile(target);
    if (
      bytes.byteLength !== metadata.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== metadata.sha256
    )
      error(409, 'Export integrity check failed');
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
