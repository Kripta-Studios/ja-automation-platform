import { json, type RequestHandler } from '@sveltejs/kit';
import { WORKER_STATEMENT_JOB_KIND } from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  artifactDownloadLocation,
  publicWorkerStatementStatus,
  workerStatementRepository,
  workerStatementFailure,
  workerStatementProblem,
  validWorkerStatementArtifactId,
} from '../../../worker-statement-api';

function headers(url: URL, artifactId: string): Record<string, string> {
  return {
    'cache-control': 'private, no-store',
    'retry-after': '2',
    location: artifactDownloadLocation(url, artifactId),
  };
}

function notFound(): Response {
  return workerStatementProblem('notFound', 404);
}

export const POST: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) return workerStatementProblem('signInRequired', 401);
  const artifactId = params.artifactId;
  if (!validWorkerStatementArtifactId(artifactId)) return notFound();
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    const opened = openPortalRepository(locals);
    context = opened;
    const repository = workerStatementRepository(context.sqlite);
    const job: { id: string; created: boolean } | null = { id: '', created: false };
    const artifact = repository.retryWorkerStatementArtifact(
      context.principal,
      artifactId,
      (persisted) => {
        if (persisted.status !== 'queued') return;
        const queued = opened.v3.enqueueJob(
          WORKER_STATEMENT_JOB_KIND,
          `worker-statement:${persisted.artifactId}:attempt:${persisted.currentAttemptNumber}`,
          { artifactId: persisted.artifactId, requestedAttempt: persisted.currentAttemptNumber },
        );
        job.id = queued.id;
        job.created = queued.created;
      },
    );
    return json(
      {
        artifact: publicWorkerStatementStatus(artifact),
        job: job.id ? job : null,
      },
      { status: 202, headers: headers(url, artifact.artifactId) },
    );
  } catch (cause) {
    return workerStatementFailure(cause);
  } finally {
    context?.sqlite.close();
  }
};
