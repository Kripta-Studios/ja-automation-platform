import { json, type RequestHandler } from '@sveltejs/kit';
import { WORKER_STATEMENT_JOB_KIND } from '@ja/reporting';
import { reportLocaleSchema } from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { requiredExportPeriod } from '$lib/server/report-export-request';
import {
  artifactDownloadLocation,
  buildWorkerStatementSnapshot,
  publicWorkerStatementStatus,
  workerStatementArtifactLocale,
  workerStatementRepository,
  workerStatementRequestInput,
  workerStatementFailure,
  workerStatementProblem,
  validWorkerStatementArtifactId,
  validWorkerStatementRequestKey,
} from './worker-statement-api';

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) return workerStatementProblem('signInRequired', 401);
  if (locals.user.role !== 'worker' && locals.user.role !== 'project_manager')
    return workerStatementProblem('roleRequired', 403);
  const artifactId = url.searchParams.get('artifactId');
  if (artifactId !== null && !validWorkerStatementArtifactId(artifactId))
    return workerStatementProblem('notFound', 404);
  const requestKey = url.searchParams.get('requestKey');
  if (requestKey !== null && !validWorkerStatementRequestKey(requestKey))
    return workerStatementProblem('requestKeyInvalid', 400);
  if (artifactId !== null && requestKey) return workerStatementProblem('requestInvalid', 400);
  const localeResult = reportLocaleSchema.safeParse(url.searchParams.get('locale') ?? 'en');
  if (!localeResult.success) return workerStatementProblem('localeInvalid', 400);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const repository = workerStatementRepository(context.sqlite);
    const artifacts =
      artifactId !== null
        ? [repository.getWorkerStatementArtifact(context.principal, artifactId)]
        : repository
            .listWorkerStatementArtifacts(context.principal, {
              periodStart: url.searchParams.get('periodStart') ?? undefined,
              periodEnd: url.searchParams.get('periodEnd') ?? undefined,
            })
            .filter(
              (artifact) =>
                workerStatementArtifactLocale(artifact) === localeResult.data &&
                (requestKey === null || artifact.requestKey === `${requestKey}:${artifact.format}`),
            );
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
    return workerStatementFailure(cause);
  } finally {
    context?.sqlite.close();
  }
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
  if (!locals.user || !locals.session) return workerStatementProblem('signInRequired', 401);
  if (locals.user.role !== 'worker' && locals.user.role !== 'project_manager')
    return workerStatementProblem('roleRequired', 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return workerStatementProblem('requestInvalid', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return workerStatementProblem('requestInvalid', 400);
  const values = body as Record<string, unknown>;
  const periodStart = typeof values.periodStart === 'string' ? values.periodStart : '';
  const periodEnd = typeof values.periodEnd === 'string' ? values.periodEnd : '';
  const periodUrl = new URL(url);
  periodUrl.search = `periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`;
  let period: { periodStart: string; periodEnd: string };
  try {
    period = requiredExportPeriod(periodUrl);
  } catch {
    return workerStatementProblem('periodInvalid', 400);
  }
  if (values.refresh !== undefined && typeof values.refresh !== 'boolean')
    return workerStatementProblem('refreshInvalid', 400);
  if (values.requestKey !== undefined && !validWorkerStatementRequestKey(values.requestKey))
    return workerStatementProblem('requestKeyInvalid', 400);
  let requestedAt: Date | undefined;
  if (values.requestIssuedAt !== undefined) {
    if (
      typeof values.requestIssuedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(values.requestIssuedAt)
    )
      return workerStatementProblem('requestInvalid', 400);
    requestedAt = new Date(values.requestIssuedAt);
    if (
      !Number.isFinite(requestedAt.getTime()) ||
      requestedAt.toISOString() !== values.requestIssuedAt
    )
      return workerStatementProblem('requestInvalid', 400);
  }
  const localeResult = reportLocaleSchema.safeParse(values.locale ?? 'en');
  if (!localeResult.success) return workerStatementProblem('localeInvalid', 400);

  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    const opened = openPortalRepository(locals);
    context = opened;
    const snapshot = buildWorkerStatementSnapshot(
      context,
      { id: context.principal.userId, name: locals.user.name },
      period.periodStart,
      period.periodEnd,
      localeResult.data,
    );
    const jobs = new Map<string, { id: string; created: boolean }>();
    const repository = workerStatementRepository(context.sqlite);
    const artifacts = repository.requestWorkerStatementArtifacts(
      context.principal,
      workerStatementRequestInput(snapshot, {
        refresh: values.refresh === true,
        requestKey: values.requestKey as string | undefined,
        now: requestedAt,
      }),
      (artifact) => {
        if (artifact.status !== 'queued') return;
        const queued = opened.v3.enqueueJob(
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
    return workerStatementFailure(cause);
  } finally {
    context?.sqlite.close();
  }
};
