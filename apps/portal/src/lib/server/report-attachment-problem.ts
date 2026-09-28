import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import {
  V3AccessDeniedError,
  V3ConflictError,
  V3NotFoundError,
  V3ValidationError,
} from '@ja/database';
import { englishCoverageKey } from '$lib/i18n/coverage-translations';

type AttachmentProblem = Readonly<{
  status: number;
  code: string;
  messageKey: `problem.reportAttachment.${string}`;
  remedy: string;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
}>;

export function reportAttachmentProblemFor(error: unknown): AttachmentProblem | undefined {
  if (error instanceof V3NotFoundError)
    return {
      status: 404,
      code: 'REPORT_ATTACHMENT_RECORD_UNAVAILABLE',
      messageKey: 'problem.reportAttachment.recordUnavailable',
      remedy: 'review_report',
    };
  if (error instanceof V3AccessDeniedError)
    return {
      status: 403,
      code: 'REPORT_ATTACHMENT_ACCESS_REQUIRED',
      messageKey: 'problem.reportAttachment.accessRequired',
      remedy: 'contact_report_owner',
    };
  if (error instanceof V3ValidationError) {
    if (/^Daily reports accept daily attachments only$/i.test(error.message))
      return {
        status: 400,
        code: 'REPORT_ATTACHMENT_DAILY_KIND_REQUIRED',
        messageKey: 'problem.reportAttachment.dailyKindRequired',
        remedy: 'correct_fields',
        fieldErrors: { attachmentKind: ['problem.reportAttachment.dailyKindRequired'] },
      };
    if (/^Technical attachment kind is invalid$/i.test(error.message))
      return {
        status: 400,
        code: 'REPORT_ATTACHMENT_TECHNICAL_KIND_INVALID',
        messageKey: 'problem.reportAttachment.technicalKindInvalid',
        remedy: 'correct_fields',
        fieldErrors: { attachmentKind: ['problem.reportAttachment.technicalKindInvalid'] },
      };
    return /file|filename|content|size|type|media|byte/i.test(error.message)
      ? {
          status: 400,
          code: 'REPORT_ATTACHMENT_FILE_INVALID',
          messageKey: 'problem.reportAttachment.fileInvalid',
          remedy: 'choose_valid_file',
        }
      : {
          status: 400,
          code: 'REPORT_ATTACHMENT_FIELDS_INVALID',
          messageKey: 'problem.reportAttachment.fieldsInvalid',
          remedy: 'correct_fields',
        };
  }
  if (error instanceof V3ConflictError) {
    if (/attachment content already exists/i.test(error.message))
      return {
        status: 409,
        code: 'REPORT_ATTACHMENT_DUPLICATE_CONTENT',
        messageKey: 'problem.reportAttachment.duplicateContent',
        remedy: 'review_attachments',
      };
    if (/report changed|changed before attaching/i.test(error.message))
      return {
        status: 409,
        code: 'REPORT_ATTACHMENT_STALE_VERSION',
        messageKey: 'problem.reportAttachment.staleVersion',
        remedy: 'review_updated_report',
      };
    if (/approved or finalized/i.test(error.message))
      return {
        status: 409,
        code: 'REPORT_ATTACHMENT_REPORT_LOCKED',
        messageKey: 'problem.reportAttachment.reportLocked',
        remedy: 'review_report_correction',
      };
    if (/predecessor|successor|supersed/i.test(error.message))
      return {
        status: 409,
        code: 'REPORT_ATTACHMENT_PREDECESSOR_CHANGED',
        messageKey: 'problem.reportAttachment.predecessorChanged',
        remedy: 'review_attachments',
      };
    if (/committed.*immutable/i.test(error.message))
      return {
        status: 409,
        code: 'REPORT_ATTACHMENT_IMMUTABLE',
        messageKey: 'problem.reportAttachment.immutable',
        remedy: 'review_report_correction',
      };
    return {
      status: 409,
      code: 'REPORT_ATTACHMENT_CHANGED',
      messageKey: 'problem.reportAttachment.changed',
      remedy: 'review_attachments',
    };
  }
  return undefined;
}

export function reportAttachmentFailureResponse(error: unknown): Response {
  const correlationId = randomUUID();
  const problem = reportAttachmentProblemFor(error);
  if (!problem) console.error('Unexpected report attachment failure', { correlationId, error });
  const status = problem?.status ?? 500;
  const code = problem?.code ?? 'REPORT_ATTACHMENT_UNEXPECTED';
  const messageKey = problem?.messageKey ?? 'problem.reportAttachment.unexpected';
  const remedies = problem ? [{ id: problem.remedy }] : [{ id: 'review_attachments' }];
  const message = englishCoverageKey(messageKey);
  return json(
    {
      success: false,
      code,
      messageKey,
      params: {},
      fieldErrors: problem?.fieldErrors ?? {},
      remedies,
      correlationId,
      error: message,
    },
    { status },
  );
}

export function reportAttachmentSignInResponse(): Response {
  const messageKey = 'problem.reportAttachment.signInRequired';
  return json(
    {
      success: false,
      code: 'REPORT_ATTACHMENT_SIGN_IN_REQUIRED',
      messageKey,
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'sign_in_again' }],
      correlationId: randomUUID(),
      error: englishCoverageKey(messageKey),
    },
    { status: 401 },
  );
}
