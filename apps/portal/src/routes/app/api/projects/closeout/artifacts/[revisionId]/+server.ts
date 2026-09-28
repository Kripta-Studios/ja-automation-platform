import { error, type RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
export const GET: RequestHandler = ({ locals, params }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  if (locals.user.role !== 'owner_admin' && locals.user.role !== 'finance_admin')
    error(403, 'Finance role required');
  const context = openPortalRepository(locals);
  try {
    const artifacts = context.repository.projectCloseoutArtifacts(
      context.principal,
      params.revisionId ?? '',
    );
    if (!artifacts.length) error(404, 'Closeout packages unavailable');
    const artifact = artifacts[0] as { id: string };
    const { row, bytes } = context.repository.downloadProjectCloseoutArtifact(
      context.principal,
      artifact.id,
    ) as { row: Record<string, unknown>; bytes: Uint8Array };
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        'content-type': 'application/zip',
        'content-length': String(bytes.byteLength),
        'content-disposition': `attachment; filename="${String(row.semantic_filename)}"`,
        'cache-control': 'private, no-store',
        pragma: 'no-cache',
        'x-content-type-options': 'nosniff',
      },
    });
  } finally {
    context.sqlite.close();
  }
};
