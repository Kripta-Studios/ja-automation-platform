import { json, type RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  artifactDownloadLocation,
  publicWorkerStatementStatus,
  workerStatementRepository,
  workerStatementFailure,
  workerStatementProblem,
  validWorkerStatementArtifactId,
} from '../../worker-statement-api';

function privateHeaders(): Record<string, string> {
  return { 'cache-control': 'private, no-store' };
}

function notFound(): Response {
  // Status and missing responses intentionally share the same shape so artifact IDs cannot be
  // enumerated across workers or deployments.
  return workerStatementProblem('notFound', 404, privateHeaders());
}

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session)
    return workerStatementProblem('signInRequired', 401, privateHeaders());
  const artifactId = params.artifactId;
  if (!validWorkerStatementArtifactId(artifactId)) return notFound();
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
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
    return workerStatementFailure(cause, privateHeaders());
  } finally {
    context?.sqlite.close();
  }
};
