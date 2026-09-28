import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import {
  AccessDeniedError,
  V3AccessDeniedError,
  V3ConflictError,
  V3NotFoundError,
  V3ValidationError,
} from '@ja/database';
import type { ProblemData } from '$lib/problem/contract';

type DownloadProblemKind =
  | 'signInRequired'
  | 'unavailable'
  | 'fileMissing'
  | 'integrityBlocked'
  | 'serviceUnavailable';
type DownloadStage = 'authorization' | 'file' | 'audit';

const definitions = {
  signInRequired: {
    status: 401,
    code: 'DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED',
    messageKey: 'problem.document.downloadSignInRequired',
    message: 'Your session ended. Sign in again, then return to Documents to download the file.',
    error: 'Unauthorized',
  },
  unavailable: {
    status: 404,
    code: 'DOCUMENT_DOWNLOAD_UNAVAILABLE',
    messageKey: 'problem.document.downloadUnavailable',
    message: 'This document is unavailable. Refresh Documents and choose a file you can access.',
    error: 'Document not found',
  },
  fileMissing: {
    status: 409,
    code: 'DOCUMENT_DOWNLOAD_FILE_MISSING',
    messageKey: 'problem.document.downloadFileMissing',
    message:
      'The file for this document is missing. Ask the owner to review the document record before trying again.',
    error: 'Document is unavailable',
  },
  integrityBlocked: {
    status: 409,
    code: 'DOCUMENT_DOWNLOAD_INTEGRITY_BLOCKED',
    messageKey: 'problem.document.downloadIntegrityBlocked',
    message:
      'This document could not be verified, so its download was blocked. Ask the owner to review the document before trying again.',
    error: 'Document is unavailable',
  },
  serviceUnavailable: {
    status: 503,
    code: 'DOCUMENT_DOWNLOAD_SERVICE_UNAVAILABLE',
    messageKey: 'problem.document.downloadServiceUnavailable',
    message:
      'We could not prepare this download. The document was not changed; try again later. Reference: {correlationId}.',
    error: 'Document is unavailable',
  },
} as const satisfies Record<
  DownloadProblemKind,
  {
    status: number;
    code: string;
    messageKey: ProblemData['messageKey'];
    message: string;
    error: string;
  }
>;

/** Preserve the legacy error field while giving API and UI clients one typed contract. */
export function privateDocumentProblem(
  kind: DownloadProblemKind,
  correlationId?: string,
  owner = false,
): Response {
  const definition = definitions[kind];
  const reference = correlationId || randomUUID();
  const params: ProblemData['params'] =
    kind === 'serviceUnavailable' ? { correlationId: reference } : {};
  const remedy =
    kind === 'signInRequired'
      ? 'sign_in_again'
      : kind === 'unavailable'
        ? 'review_documents'
        : kind === 'serviceUnavailable'
          ? 'retry_download'
          : owner
            ? 'review_documents'
            : 'contact_owner';
  const problem: ProblemData = {
    code: definition.code,
    messageKey: definition.messageKey,
    message: definition.message.replace('{correlationId}', reference),
    params,
    fieldErrors: {},
    remedies: [{ id: remedy }],
    correlationId: reference,
  };
  return json(
    { error: definition.error, success: false, ...problem },
    {
      status: definition.status,
      headers: {
        'cache-control': 'private, no-store',
        pragma: 'no-cache',
        expires: '0',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
        'content-security-policy': 'sandbox',
      },
    },
  );
}

function isRepositoryDenial(cause: unknown): boolean {
  return (
    cause instanceof V3NotFoundError ||
    cause instanceof V3AccessDeniedError ||
    cause instanceof V3ValidationError ||
    cause instanceof V3ConflictError
  );
}

function fileCode(cause: unknown): string | undefined {
  return cause && typeof cause === 'object' && 'code' in cause
    ? String((cause as { code?: unknown }).code)
    : undefined;
}

/** A storage-state explanation is allowed only after authorizeDocument returned metadata. */
export function privateDocumentFailure(
  cause: unknown,
  stage: DownloadStage,
  correlationId?: string,
  owner = false,
): Response {
  if (
    (cause instanceof AccessDeniedError || cause instanceof V3AccessDeniedError) &&
    cause.message === 'Live authenticated session required'
  )
    return privateDocumentProblem('signInRequired', correlationId);
  if (stage === 'authorization' && isRepositoryDenial(cause))
    return privateDocumentProblem('unavailable', correlationId);
  if (stage === 'file') {
    const code = fileCode(cause);
    if (code === 'ENOENT') return privateDocumentProblem('fileMissing', correlationId, owner);
    if (isRepositoryDenial(cause) || ['ELOOP', 'ENOTDIR', 'EPERM', 'EACCES'].includes(code ?? ''))
      return privateDocumentProblem('integrityBlocked', correlationId, owner);
  }
  const reference = correlationId || randomUUID();
  console.error('Unexpected private document download failure', {
    correlationId: reference,
    cause,
  });
  return privateDocumentProblem('serviceUnavailable', reference);
}
