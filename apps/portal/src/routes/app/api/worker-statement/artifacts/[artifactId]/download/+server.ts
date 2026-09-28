import type { RequestHandler } from '@sveltejs/kit';
import { ConflictError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  canRetryWorkerStatementArtifact,
  readWorkerStatementArtifact,
  workerStatementArtifactFailureName,
  workerStatementRepository,
  workerStatementFailure,
  workerStatementProblem,
  validWorkerStatementArtifactId,
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
  return workerStatementProblem('notFound', 404, privateHeaders());
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[\r\n"]/gu, '_').replace(/[^A-Za-z0-9._-]/gu, '_');
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const GET: RequestHandler = ({ locals, params }) => {
  if (!locals.user || !locals.session)
    return workerStatementProblem('signInRequired', 401, privateHeaders());
  const artifactId = params.artifactId;
  if (!validWorkerStatementArtifactId(artifactId)) return notFound();
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const repository = workerStatementRepository(context.sqlite);
    // Authorization, durable-run provenance and DB metadata verification all
    // happen before the final private-file read. Own-worker statement downloads
    // The projection is already worker-safe; ordinary session and scope checks apply.
    let metadata: ReturnType<typeof repository.resolveWorkerStatementDownload>;
    try {
      metadata = repository.resolveWorkerStatementDownload(context.principal, artifactId);
    } catch (cause) {
      if (
        cause instanceof ConflictError &&
        cause.message === 'Worker statement artifact is not ready'
      ) {
        const artifact = repository.getWorkerStatementArtifact(context.principal, artifactId);
        if (artifact.status === 'failed')
          return workerStatementProblem(
            workerStatementArtifactFailureName(artifact),
            409,
            privateHeaders(),
            {
              remedies: canRetryWorkerStatementArtifact(artifact)
                ? [{ id: 'retry_statement' }]
                : [{ id: 'contact_finance_owner' }],
            },
          );
        return workerStatementProblem('artifactPending', 409, privateHeaders());
      }
      throw cause;
    }
    let bytes: Buffer;
    try {
      bytes = readWorkerStatementArtifact(
        process.env.JA_DOCUMENT_ROOT ?? 'data/documents',
        metadata,
      );
    } catch {
      return workerStatementProblem('integrityFailed', 409, privateHeaders());
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
    return workerStatementFailure(cause, privateHeaders());
  } finally {
    context?.sqlite.close();
  }
};
