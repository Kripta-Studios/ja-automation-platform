import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  V3AccessDeniedError,
} from '@ja/database';
import { assertRecentStepUp } from '$lib/server/private-artifact-access';
import { openPortalRepository } from '$lib/server/portal-repository';
import { requiredExportPeriod } from '$lib/server/report-export-request';
import {
  artifactDownloadLocation,
  publicWorkerStatementStatus,
  workerStatementRepository,
} from '../worker-statement-api';

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

function durableFailure(cause: unknown): Response | null {
  if (cause instanceof AccessDeniedError || cause instanceof V3AccessDeniedError)
    return json(
      { error: 'Worker statement artifact not found' },
      { status: 404, headers: privateHeaders() },
    );
  if (cause instanceof ConflictError)
    return json({ error: cause.message }, { status: 409, headers: privateHeaders() });
  if (cause instanceof ValidationError)
    return json({ error: cause.message }, { status: 400, headers: privateHeaders() });
  if (cause instanceof Error && /no such table:\s*worker_statement_/iu.test(cause.message))
    return json(
      { error: 'Worker statement durable artifacts are not available yet' },
      { status: 503, headers: privateHeaders() },
    );
  return null;
}

/**
 * Compatibility download shim.
 *
 * Requests are deliberately handled by the collection POST endpoint. A GET here may only look up
 * an artifact that already exists; it must not build a source snapshot, create an artifact/job,
 * render a file, or write an export audit record. Ready artifacts are redirected to the canonical
 * private download route, which owns the final authorization, step-up and integrity boundary.
 */
export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  if (locals.user.role !== 'worker') error(403, 'Worker role required');
  const format = params.format;
  if (format !== 'pdf' && format !== 'csv') error(404, 'Export format not found');
  const { periodStart, periodEnd } = requiredExportPeriod(url);
  const context = openPortalRepository(locals);
  try {
    if (process.env.NODE_ENV === 'production') {
      try {
        assertRecentStepUp(context.sqlite, context.principal);
      } catch (cause) {
        if (cause instanceof V3AccessDeniedError) error(403, cause.message);
        throw cause;
      }
    }

    try {
      const repository = workerStatementRepository(context.sqlite);
      const artifact = repository
        .listWorkerStatementArtifacts(context.principal, { periodStart, periodEnd })
        .find((candidate) => candidate.format === format);
      if (!artifact)
        return json(
          { error: 'Worker statement artifact not found' },
          { status: 404, headers: privateHeaders() },
        );

      if (artifact.status === 'ready') {
        // The canonical download route performs the final private-file authorization and
        // integrity verification. Redirecting keeps this compatibility GET free of audit and
        // quarantine writes while preserving browser download behavior.
        return new Response(null, {
          status: 302,
          headers: {
            ...privateHeaders(),
            location: artifactDownloadLocation(url, artifact.artifactId),
          },
        });
      }

      const status = artifact.status === 'failed' ? 409 : 202;
      const headers = privateHeaders();
      if (status === 202) {
        headers['retry-after'] = '2';
        headers.location = artifactDownloadLocation(url, artifact.artifactId);
      }
      return json(
        {
          artifact: publicWorkerStatementStatus(artifact),
        },
        { status, headers },
      );
    } catch (cause) {
      const mapped = durableFailure(cause);
      if (mapped) return mapped;
      throw cause;
    }
  } finally {
    context.sqlite.close();
  }
};
