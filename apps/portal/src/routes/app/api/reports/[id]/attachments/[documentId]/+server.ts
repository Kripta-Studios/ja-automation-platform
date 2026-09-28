import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import {
  AccessDeniedError,
  V3AccessDeniedError,
  V3ConflictError,
  V3NotFoundError,
  V3ValidationError,
  assertLiveSession,
} from '@ja/database';
import type { ProblemData } from '$lib/problem/contract';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  assertRegularPrivateFile,
  reportAttachmentTypeForId,
  safeDocumentRoot,
} from '$lib/server/report-attachment-route';
import { contentDispositionFilename } from '$lib/server/private-artifact-access';
import type { RequestHandler } from './$types';

type DownloadProblem = Readonly<{
  status: number;
  code: string;
  messageKey: `problem.reportAttachment.${string}`;
  fallback: string;
  legacyError?: string;
  remedy: string;
}>;

type DownloadStage = 'authorization' | 'file' | 'audit' | 'response';

const problems = {
  signIn: {
    status: 401,
    code: 'REPORT_ATTACHMENT_SIGN_IN_REQUIRED',
    messageKey: 'problem.reportAttachment.signInRequired',
    fallback:
      'Your session ended. Sign in again and review the current attachments before continuing.',
    legacyError: 'Unauthorized',
    remedy: 'sign_in_again',
  },
  notFound: {
    status: 404,
    code: 'REPORT_ATTACHMENT_DOWNLOAD_NOT_FOUND',
    messageKey: 'problem.reportAttachment.downloadNotFound',
    fallback:
      'This report attachment could not be found or opened. Review the attachments you can access on the current report.',
    legacyError: 'Report attachment not found',
    remedy: 'review_report',
  },
  notReady: {
    status: 409,
    code: 'REPORT_ATTACHMENT_DOWNLOAD_NOT_READY',
    messageKey: 'problem.reportAttachment.downloadNotReady',
    fallback:
      'This attachment is not ready to download. It may still be processing or may no longer be attached. Review its current status on the report.',
    legacyError: 'Report attachment is not ready',
    remedy: 'review_attachments',
  },
  unavailable: {
    status: 409,
    code: 'REPORT_ATTACHMENT_DOWNLOAD_UNAVAILABLE',
    messageKey: 'problem.reportAttachment.downloadUnavailable',
    fallback:
      'The attachment could not be verified for download. Review the report and contact its owner if you still need the file.',
    legacyError: 'Report attachment is unavailable',
    remedy: 'contact_report_owner',
  },
  unexpected: {
    status: 500,
    code: 'REPORT_ATTACHMENT_DOWNLOAD_UNEXPECTED',
    messageKey: 'problem.reportAttachment.downloadUnexpected',
    fallback: 'We could not confirm this download. Review the report before trying again.',
    remedy: 'review_report',
  },
} as const satisfies Record<string, DownloadProblem>;

const privateFailureHeaders = {
  'cache-control': 'private, no-store',
  pragma: 'no-cache',
  expires: '0',
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin',
};

function downloadProblemResponse(problem: DownloadProblem, correlationId: string): Response {
  const params: ProblemData['params'] = problem === problems.unexpected ? { correlationId } : {};
  const message =
    problem === problems.unexpected
      ? `${problem.fallback} Reference: ${correlationId}.`
      : problem.fallback;
  const body = {
    success: false,
    code: problem.code,
    messageKey: problem.messageKey,
    params,
    fieldErrors: {},
    remedies: [{ id: problem.remedy }],
    correlationId,
    message,
    // Existing download clients read `error`; keep it while adding ProblemData.
    error: problem.legacyError ?? message,
  } satisfies ProblemData & { success: false; error: string };
  return json(body, { status: problem.status, headers: privateFailureHeaders });
}

function failureResponse(cause: unknown, correlationId: string, stage: DownloadStage): Response {
  // Once the file is verified, audit and response failures need a reference ID.
  // A 409 would incorrectly suggest a user-correctable attachment state.
  if (stage === 'audit' || stage === 'response') {
    console.error(
      stage === 'audit'
        ? 'Report attachment download audit failed'
        : 'Report attachment download response failed',
      { correlationId, error: cause },
    );
    return downloadProblemResponse(problems.unexpected, correlationId);
  }
  if (
    (cause instanceof AccessDeniedError || cause instanceof V3AccessDeniedError) &&
    cause.message === 'Live authenticated session required'
  )
    return downloadProblemResponse(problems.signIn, correlationId);
  // The same 404 body for absent and inaccessible records avoids disclosing whether
  // a report or attachment exists to a caller without its project access.
  if (
    cause instanceof V3NotFoundError ||
    cause instanceof V3AccessDeniedError ||
    cause instanceof AccessDeniedError
  )
    return downloadProblemResponse(problems.notFound, correlationId);
  if (cause instanceof V3ValidationError && /not ready|processing/iu.test(cause.message))
    return downloadProblemResponse(problems.notReady, correlationId);
  if (cause instanceof V3ConflictError || cause instanceof V3ValidationError) {
    console.warn('Report attachment download unavailable', { correlationId, error: cause });
    return downloadProblemResponse(problems.unavailable, correlationId);
  }
  if (
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    ['ENOENT', 'ELOOP', 'ENOTDIR', 'EPERM', 'EACCES'].includes(
      String((cause as { code?: unknown }).code),
    )
  ) {
    console.warn('Report attachment download unavailable', { correlationId, error: cause });
    return downloadProblemResponse(problems.unavailable, correlationId);
  }
  console.error('Unexpected report attachment download failure', { correlationId, error: cause });
  return downloadProblemResponse(problems.unexpected, correlationId);
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const correlationId = locals.correlationId || randomUUID();
  if (!locals.user || !locals.session)
    return downloadProblemResponse(problems.signIn, correlationId);
  if (!params.id || !params.documentId)
    return downloadProblemResponse(problems.notFound, correlationId);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  let stage: DownloadStage = 'authorization';
  try {
    context = openPortalRepository(locals);
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    const reportType = reportAttachmentTypeForId(context.sqlite, params.id);
    // v3 performs report-aware RBAC, scanner-state fencing and project scoping
    // before the filesystem read. The successful-download audit is written only
    // after descriptor-safe integrity verification below.
    const metadata = context.v3.authorizeReportAttachment(
      context.principal,
      reportType,
      params.id,
      params.documentId,
    );
    stage = 'file';
    const bytes = await assertRegularPrivateFile(
      safeDocumentRoot(),
      metadata.storageKey,
      metadata.sha256,
      metadata.byteLength,
      metadata.mediaType,
    );
    stage = 'audit';
    context.v3.recordReportAttachmentDownload(
      context.principal,
      reportType,
      params.id,
      params.documentId,
    );
    stage = 'response';
    return new Response(bytes.buffer as ArrayBuffer, {
      headers: {
        'content-type': metadata.mediaType,
        'content-length': String(bytes.byteLength),
        'content-disposition': contentDispositionFilename(metadata.filename),
        'cache-control': 'private, no-store',
        pragma: 'no-cache',
        expires: '0',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
        'content-security-policy': 'sandbox',
      },
    });
  } catch (cause) {
    return failureResponse(cause, correlationId, stage);
  } finally {
    context?.sqlite.close();
  }
};
