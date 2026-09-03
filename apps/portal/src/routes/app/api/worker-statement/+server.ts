import { json, type RequestHandler } from '@sveltejs/kit';
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
} from '@ja/database';
import { WORKER_STATEMENT_JOB_KIND } from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import { requiredExportPeriod } from '$lib/server/report-export-request';
import {
  artifactDownloadLocation,
  buildWorkerStatementSnapshot,
  publicWorkerStatementStatus,
  workerStatementRepository,
  workerStatementRequestInput,
} from './worker-statement-api';

function unauthorized(): Response {
  return json(
    { error: 'Sign in required' },
    { status: 401, headers: { 'cache-control': 'no-store' } },
  );
}

function mapError(cause: unknown): Response | null {
  if (cause instanceof AccessDeniedError || cause instanceof V3AccessDeniedError)
    return json({ error: 'Worker statement not found' }, { status: 404 });
  if (cause instanceof ConflictError || cause instanceof V3ConflictError)
    return json({ error: cause.message }, { status: 409 });
  if (cause instanceof ValidationError || cause instanceof V3ValidationError)
    return json({ error: cause.message }, { status: 400 });
  if (
    cause instanceof Error &&
    (/no such table: worker_statement_/iu.test(cause.message) ||
      /Unregistered durable job kind: worker_statement_artifact_render/iu.test(cause.message))
  )
    return json(
      { error: 'Worker statement durable artifacts are not available yet' },
      { status: 503 },
    );
  return null;
}

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) return unauthorized();
  if (locals.user.role !== 'worker')
    return json({ error: 'Worker role required' }, { status: 403 });
  const artifactId = url.searchParams.get('artifactId')?.trim();
  const context = openPortalRepository(locals);
  try {
    const repository = workerStatementRepository(context.sqlite);
    const artifacts = artifactId
      ? [repository.getWorkerStatementArtifact(context.principal, artifactId)]
      : repository.listWorkerStatementArtifacts(context.principal, {
          periodStart: url.searchParams.get('periodStart') ?? undefined,
          periodEnd: url.searchParams.get('periodEnd') ?? undefined,
        });
    return json(
      {
        artifacts: artifacts.map(publicWorkerStatementStatus),
        links: artifacts.map((artifact) => ({
          artifactId: artifact.artifactId,
          format: artifact.format,
          status: artifact.status,
          download: artifactDownloadLocation(url, artifact.artifactId),
        })),
      },
      { status: 200, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (cause) {
    const mapped = mapError(cause);
    if (mapped) return mapped;
    throw cause;
  } finally {
    context.sqlite.close();
  }
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
  if (!locals.user || !locals.session) return unauthorized();
  if (locals.user.role !== 'worker')
    return json({ error: 'Worker role required' }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'A JSON request body is required' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return json({ error: 'A JSON request body is required' }, { status: 400 });
  const values = body as Record<string, unknown>;
  const periodStart = typeof values.periodStart === 'string' ? values.periodStart : '';
  const periodEnd = typeof values.periodEnd === 'string' ? values.periodEnd : '';
  const periodUrl = new URL(url);
  periodUrl.search = `periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`;
  let period: { periodStart: string; periodEnd: string };
  try {
    period = requiredExportPeriod(periodUrl);
  } catch {
    return json({ error: 'A valid periodStart and periodEnd are required' }, { status: 400 });
  }
  if (values.refresh !== undefined && typeof values.refresh !== 'boolean')
    return json({ error: 'refresh must be boolean' }, { status: 400 });
  if (values.requestKey !== undefined && typeof values.requestKey !== 'string')
    return json({ error: 'requestKey must be a string' }, { status: 400 });

  const context = openPortalRepository(locals);
  try {
    const snapshot = buildWorkerStatementSnapshot(
      context,
      { id: context.principal.userId, name: locals.user.name },
      period.periodStart,
      period.periodEnd,
    );
    const jobs = new Map<string, { id: string; created: boolean }>();
    const repository = workerStatementRepository(context.sqlite);
    const artifacts = repository.requestWorkerStatementArtifacts(
      context.principal,
      workerStatementRequestInput(snapshot, {
        refresh: values.refresh === true,
        requestKey: values.requestKey as string | undefined,
      }),
      (artifact) => {
        if (artifact.status !== 'queued') return;
        const queued = context.v3.enqueueJob(
          WORKER_STATEMENT_JOB_KIND,
          `worker-statement:${artifact.artifactId}:attempt:${artifact.currentAttemptNumber}`,
          { artifactId: artifact.artifactId, requestedAttempt: artifact.currentAttemptNumber },
        );
        jobs.set(artifact.artifactId, queued);
      },
    );
    const pending = artifacts.some(
      (artifact) => artifact.status === 'queued' || artifact.status === 'running',
    );
    const headers: Record<string, string> = { 'cache-control': 'private, no-store' };
    if (pending) {
      headers['retry-after'] = '2';
      headers.location = artifactDownloadLocation(url, artifacts[0]?.artifactId ?? '');
    }
    return json(
      {
        artifacts: artifacts.map(publicWorkerStatementStatus),
        jobs: artifacts.map((artifact) => {
          const job = jobs.get(artifact.artifactId);
          return {
            artifactId: artifact.artifactId,
            format: artifact.format,
            ...(job ? { id: job.id, created: job.created } : { id: null, created: false }),
          };
        }),
      },
      { status: pending ? 202 : 200, headers },
    );
  } catch (cause) {
    const mapped = mapError(cause);
    if (mapped) return mapped;
    throw cause;
  } finally {
    context.sqlite.close();
  }
};
