import type { ProblemData } from '$lib/problem/contract';
import { privateDownloadFilename, typedPrivateDownloadProblem } from './private-document-download.ts';

export type WorkerStatementDownloadFormat = 'pdf' | 'csv';

const messageKeys: Readonly<Record<string, ProblemData['messageKey']>> = {
  WORKER_STATEMENT_SIGN_IN_REQUIRED: 'problem.workerStatement.signInRequired',
  WORKER_STATEMENT_ROLE_REQUIRED: 'problem.workerStatement.roleRequired',
  WORKER_STATEMENT_NOT_FOUND: 'problem.workerStatement.notFound',
  WORKER_STATEMENT_ARTIFACT_PENDING: 'problem.workerStatement.artifactPending',
  WORKER_STATEMENT_ARTIFACT_FAILED: 'problem.workerStatement.artifactFailed',
  WORKER_STATEMENT_RENDER_FAILED: 'problem.workerStatement.renderFailed',
  WORKER_STATEMENT_PROCESSING_INTERRUPTED: 'problem.workerStatement.processingInterrupted',
  WORKER_STATEMENT_INTEGRITY_FAILED: 'problem.workerStatement.integrityFailed',
  WORKER_STATEMENT_SERVICE_UNAVAILABLE: 'problem.workerStatement.serviceUnavailable',
  WORKER_STATEMENT_SOURCE_INVALID: 'problem.workerStatement.sourceInvalid',
  WORKER_STATEMENT_UNEXPECTED: 'problem.workerStatement.unexpected',
};

const permittedRemedies = new Set([
  'sign_in',
  'review_workspace',
  'review_my_pay',
  'check_statement_status',
  'retry_statement',
  'contact_finance_owner',
]);

export function workerStatementDownloadProblem(
  payload: unknown,
  responseReference?: unknown,
): ProblemData | null {
  const problem = typedPrivateDownloadProblem(
    payload,
    messageKeys,
    permittedRemedies,
    responseReference,
  );
  if (!problem) return null;
  return problem.code === 'WORKER_STATEMENT_UNEXPECTED' && problem.correlationId
    ? { ...problem, params: { correlationId: problem.correlationId } }
    : problem;
}

export function workerStatementDownloadFallback(
  kind: 'network' | 'invalid' | 'signIn' | 'statusUnknown',
  reference?: unknown,
): ProblemData {
  const definitions = {
    network: {
      code: 'WORKER_STATEMENT_DOWNLOAD_NETWORK_UNAVAILABLE',
      messageKey: 'problem.workerStatement.downloadNetworkUnavailable',
      remedies: [{ id: 'retry_download' }],
    },
    invalid: {
      code: 'WORKER_STATEMENT_DOWNLOAD_INVALID_RESPONSE',
      messageKey: 'problem.workerStatement.downloadInvalidResponse',
      remedies: [{ id: 'review_my_pay' }],
    },
    signIn: {
      code: 'WORKER_STATEMENT_SIGN_IN_REQUIRED',
      messageKey: 'problem.workerStatement.signInRequired',
      remedies: [{ id: 'sign_in' }],
    },
    statusUnknown: {
      code: 'WORKER_STATEMENT_DOWNLOAD_STATUS_UNKNOWN',
      messageKey: 'problem.workerStatement.downloadStatusUnknown',
      remedies: [{ id: 'check_statement_status' }],
    },
  } as const;
  const definition = definitions[kind];
  return {
    ...definition,
    params: {},
    fieldErrors: {},
    correlationId:
      typeof reference === 'string' && /^[A-Za-z0-9._:-]{8,96}$/u.test(reference)
        ? reference
        : '',
  };
}

/** The download route serves only these two formats with a known byte length. */
export async function verifiedWorkerStatementFile(
  response: Response,
  format: WorkerStatementDownloadFormat,
): Promise<{ file: Blob; filename: string } | null> {
  const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const disposition = response.headers.get('content-disposition');
  const length = response.headers.get('content-length');
  const expectedType = format === 'pdf' ? 'application/pdf' : 'text/csv';
  if (
    !response.ok ||
    type !== expectedType ||
    !/^attachment(?:\s*;|\s*$)/iu.test(disposition ?? '') ||
    !length ||
    !/^[1-9]\d*$/u.test(length)
  )
    return null;

  const file = await response.blob();
  if (!Number.isSafeInteger(Number(length)) || file.size !== Number(length)) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (format === 'pdf') {
    if (bytes.byteLength < 8) return null;
    const head = new TextDecoder('ascii').decode(bytes.subarray(0, 5));
    const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 1024)));
    if (head !== '%PDF-' || !tail.includes('%%EOF')) return null;
  } else {
    if (bytes.includes(0)) return null;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  }

  const semantic = privateDownloadFilename(disposition, `worker-statement.${format}`);
  const base = semantic.replace(/\.[^.]*$/u, '').replace(/^\.+/u, '').trim();
  return { file, filename: `${base || 'worker-statement'}.${format}` };
}
