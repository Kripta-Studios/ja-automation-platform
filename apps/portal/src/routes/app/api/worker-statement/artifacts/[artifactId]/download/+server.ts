import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  readWorkerStatementArtifact,
  workerStatementRepository,
} from '../../../worker-statement-api';

function privateHeaders(): Record<string, string> {
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
  return json(
    { error: 'Worker statement artifact not found' },
    { status: 404, headers: privateHeaders() },
  );
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[\r\n"]/gu, '_').replace(/[^A-Za-z0-9._-]/gu, '_');
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function mapError(cause: unknown): Response | null {
  if (cause instanceof AccessDeniedError) return notFound();
  if (cause instanceof ConflictError)
    return json({ error: cause.message }, { status: 409, headers: privateHeaders() });
  if (cause instanceof ValidationError)
    return json({ error: cause.message }, { status: 400, headers: privateHeaders() });
  if (
    cause instanceof Error &&
    (/no such table: worker_statement_/iu.test(cause.message) ||
      /Unregistered durable job kind: worker_statement_artifact_render/iu.test(cause.message))
  )
    return json(
      { error: 'Worker statement durable artifacts are not available yet' },
      { status: 503, headers: privateHeaders() },
    );
  return null;
}

export const GET: RequestHandler = ({ locals, params }) => {
  if (!locals.user || !locals.session)
    return json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders() });
  const artifactId = params.artifactId?.trim() ?? '';
  if (!artifactId) return notFound();
  const context = openPortalRepository(locals);
  try {
    const repository = workerStatementRepository(context.sqlite);
    // Authorization, durable-run provenance and DB metadata verification all
    // happen before the final private-file read. Own-worker statement downloads
    // do not require step-up; the projection is already worker-safe.
    const metadata = repository.resolveWorkerStatementDownload(context.principal, artifactId);
    let bytes: Buffer;
    try {
      bytes = readWorkerStatementArtifact(
        process.env.JA_DOCUMENT_ROOT ?? 'data/documents',
        metadata,
      );
    } catch {
      return json(
        { error: 'Worker statement artifact integrity check failed' },
        { status: 409, headers: privateHeaders() },
      );
    }
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new Response(body.buffer as ArrayBuffer, {
      headers: {
        ...privateHeaders(),
        'content-type': metadata.mediaType,
        'content-length': String(bytes.byteLength),
        'content-disposition': contentDisposition(metadata.semanticFilename),
      },
    });
  } catch (cause) {
    const mapped = mapError(cause);
    if (mapped) return mapped;
    throw cause;
  } finally {
    context.sqlite.close();
  }
};
