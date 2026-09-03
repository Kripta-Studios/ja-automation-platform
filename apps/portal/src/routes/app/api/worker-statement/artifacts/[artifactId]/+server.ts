import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  artifactDownloadLocation,
  publicWorkerStatementStatus,
  workerStatementRepository,
} from '../../worker-statement-api';

function privateHeaders(): Record<string, string> {
  return { 'cache-control': 'private, no-store' };
}

function notFound(): Response {
  // Status and missing responses intentionally share the same shape so artifact IDs cannot be
  // enumerated across workers or deployments.
  return json(
    { error: 'Worker statement artifact not found' },
    { status: 404, headers: privateHeaders() },
  );
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

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session)
    return json({ error: 'Sign in required' }, { status: 401, headers: privateHeaders() });
  const artifactId = params.artifactId?.trim() ?? '';
  if (!artifactId) return notFound();
  const context = openPortalRepository(locals);
  try {
    const artifact = workerStatementRepository(context.sqlite).getWorkerStatementArtifact(
      context.principal,
      artifactId,
    );
    return json(
      {
        artifact: publicWorkerStatementStatus(artifact),
        download: artifactDownloadLocation(url, artifact.artifactId),
      },
      { status: 200, headers: privateHeaders() },
    );
  } catch (cause) {
    const mapped = mapError(cause);
    if (mapped) return mapped;
    throw cause;
  } finally {
    context.sqlite.close();
  }
};
