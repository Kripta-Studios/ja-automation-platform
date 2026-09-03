import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { WORKER_STATEMENT_JOB_KIND } from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  artifactDownloadLocation,
  publicWorkerStatementStatus,
  workerStatementRepository,
} from '../../../worker-statement-api';

function headers(url: URL, artifactId: string): Record<string, string> {
  return {
    'cache-control': 'private, no-store',
    'retry-after': '2',
    location: artifactDownloadLocation(url, artifactId),
  };
}

function notFound(): Response {
  return json(
    { error: 'Worker statement artifact not found' },
    { status: 404, headers: { 'cache-control': 'private, no-store' } },
  );
}

function mapError(cause: unknown): Response | null {
  if (cause instanceof AccessDeniedError) return notFound();
  if (cause instanceof ConflictError)
    return json(
      { error: cause.message },
      { status: 409, headers: { 'cache-control': 'private, no-store' } },
    );
  if (cause instanceof ValidationError)
    return json(
      { error: cause.message },
      { status: 400, headers: { 'cache-control': 'private, no-store' } },
    );
  if (
    cause instanceof Error &&
    (/no such table: worker_statement_/iu.test(cause.message) ||
      /Unregistered durable job kind: worker_statement_artifact_render/iu.test(cause.message))
  )
    return json(
      { error: 'Worker statement durable artifacts are not available yet' },
      { status: 503, headers: { 'cache-control': 'private, no-store' } },
    );
  return null;
}

export const POST: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session)
    return json(
      { error: 'Sign in required' },
      { status: 401, headers: { 'cache-control': 'private, no-store' } },
    );
  const artifactId = params.artifactId?.trim() ?? '';
  if (!artifactId) return notFound();
  const context = openPortalRepository(locals);
  try {
    const repository = workerStatementRepository(context.sqlite);
    const job: { id: string; created: boolean } | null = { id: '', created: false };
    const artifact = repository.retryWorkerStatementArtifact(
      context.principal,
      artifactId,
      (persisted) => {
        if (persisted.status !== 'queued') return;
        const queued = context.v3.enqueueJob(
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
    const mapped = mapError(cause);
    if (mapped) return mapped;
    throw cause;
  } finally {
    context.sqlite.close();
  }
};
