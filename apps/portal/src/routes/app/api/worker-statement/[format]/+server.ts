import { json, type RequestHandler } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import { requiredExportPeriod } from '$lib/server/report-export-request';
import {
  artifactDownloadLocation,
  canRetryWorkerStatementArtifact,
  publicWorkerStatementStatus,
  workerStatementArtifactFailureName,
  workerStatementRepository,
  workerStatementFailure,
  workerStatementProblem,
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

/**
 * Compatibility download shim.
 *
 * Requests are deliberately handled by the collection POST endpoint. A GET here may only look up
 * an artifact that already exists; it must not build a source snapshot, create an artifact/job,
 * render a file, or write an export audit record. Ready artifacts are redirected to the canonical
 * private download route, which owns the final authorization and integrity boundary.
 */
export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session)
    return workerStatementProblem('signInRequired', 401, privateHeaders());
  if (locals.user.role !== 'worker' && locals.user.role !== 'project_manager')
    return workerStatementProblem('roleRequired', 403, privateHeaders());
  const format = params.format;
  if (format !== 'pdf' && format !== 'csv')
    return workerStatementProblem('notFound', 404, privateHeaders());
  let periodStart: string;
  let periodEnd: string;
  try {
    ({ periodStart, periodEnd } = requiredExportPeriod(url));
  } catch {
    return workerStatementProblem('periodInvalid', 400, privateHeaders());
  }
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const repository = workerStatementRepository(context.sqlite);
    const artifact = repository
      .listWorkerStatementArtifacts(context.principal, { periodStart, periodEnd })
      .find((candidate) => candidate.format === format);
    if (!artifact) return workerStatementProblem('notFound', 404, privateHeaders());

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
    if (status === 409)
      return workerStatementProblem(workerStatementArtifactFailureName(artifact), 409, headers, {
        artifact: publicWorkerStatementStatus(artifact),
        remedies: canRetryWorkerStatementArtifact(artifact)
          ? [{ id: 'retry_statement' }]
          : [{ id: 'contact_finance_owner' }],
      });
    return json({ artifact: publicWorkerStatementStatus(artifact) }, { status, headers });
  } catch (cause) {
    return workerStatementFailure(cause, privateHeaders());
  } finally {
    context?.sqlite.close();
  }
};
