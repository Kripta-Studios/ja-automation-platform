import { accountingPackPeriodSchema, uuidSchema } from '@ja/schemas';
import { error, redirect } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import {
  AccessDeniedError,
  PeriodFollowupConflictError,
  PeriodFollowupRepository,
  PeriodFollowupValidationError,
  PeriodFollowupAccessDeniedError,
  PeriodFollowupNotFoundError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
} from '@ja/database';
import { actionFail, actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import { resolvePortalLocalePreference } from '$lib/i18n/context';
import { openPortalRepository } from '$lib/server/portal-repository';
import { formObject, privateDocumentSignature } from '$lib/server/action-utils';
import {
  removePrivateFileIfPresent,
  writePrivateFileExclusive,
} from '$lib/server/private-artifact-access';
import { assertRegularPrivateFile } from '$lib/server/report-attachment-route';
import type { Actions, PageServerLoad } from './$types';

type Operation = 'recordFollowup' | 'approve' | 'sign' | 'invalidateSignoff' | 'refresh';
type Values = Record<string, string>;

function scalarValues(source: Record<string, unknown>, fields: readonly string[]): Values {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = source[field];
      return typeof value === 'string' || typeof value === 'number' ? [[field, String(value)]] : [];
    }),
  );
}

function periodProblem(
  status: number,
  code: string,
  key: `problem.${string}`,
  message: string,
  operation: Operation,
  values: Values,
  remedy: string,
  fieldErrors: Record<string, string[]> = {},
  extra: Record<string, unknown> = {},
) {
  return actionFail(status, key, {}, message, {
    operation,
    values,
    code,
    remedies: [{ id: remedy }],
    fieldErrors,
    ...extra,
  });
}

function mappedPeriodFailure(error: unknown, operation: Operation, values: Values) {
  if (error instanceof AccessDeniedError && error.message === 'Sign in required')
    return periodProblem(
      401,
      'PERIOD_REPORT_SIGN_IN_REQUIRED',
      'problem.period.signInRequired',
      'Your session ended. Sign in again, then review the report before submitting another action.',
      operation,
      values,
      'sign_in_again',
    );
  if (
    error instanceof AccessDeniedError ||
    error instanceof PeriodFollowupAccessDeniedError ||
    error instanceof V3AccessDeniedError
  )
    return periodProblem(
      403,
      'PERIOD_REPORT_PERMISSION_REQUIRED',
      'problem.period.permissionRequired',
      'Your role or project access does not permit this report action. Ask the project owner to review access.',
      operation,
      values,
      'contact_project_owner',
    );
  if (error instanceof PeriodFollowupNotFoundError)
    return periodProblem(
      404,
      'PERIOD_REPORT_NOT_FOUND',
      'problem.period.notFound',
      'This period report is no longer available. Review the report list.',
      operation,
      values,
      'review_reports',
    );
  if (error instanceof PeriodFollowupValidationError) {
    const responsible = /staff member|assigned to the project/iu.test(error.message);
    return periodProblem(
      400,
      responsible ? 'PERIOD_FOLLOWUP_RESPONSIBLE_UNAVAILABLE' : 'PERIOD_FOLLOWUP_FIELDS_INVALID',
      responsible
        ? 'problem.period.responsibleUnavailable'
        : 'problem.period.followupFieldsInvalid',
      responsible
        ? 'The responsible staff member is no longer active or assigned to this project. Review the current report before recording follow-up.'
        : 'Review the follow-up date and required details before saving.',
      operation,
      values,
      'review_followup',
    );
  }
  if (error instanceof PeriodFollowupConflictError) {
    const message = error.message;
    if (/Invalidate the signed conformity/iu.test(message))
      return periodProblem(
        409,
        'PERIOD_FOLLOWUP_CONFORMITY_ACTIVE',
        'problem.period.followupConformityActive',
        'A verified customer sign-off is active. An authorized finance user must review and explicitly invalidate it before a return or dispute can be recorded.',
        operation,
        values,
        'review_signoff',
      );
    if (/Idempotency key/iu.test(message))
      return periodProblem(
        409,
        'PERIOD_FOLLOWUP_RETRY_KEY_USED',
        'problem.period.followupRetryKeyUsed',
        'A different follow-up already used this request key. Review the latest history before submitting a new event.',
        operation,
        values,
        'review_followup',
      );
    if (/history changed/iu.test(message))
      return periodProblem(
        409,
        'PERIOD_FOLLOWUP_HISTORY_CHANGED',
        'problem.period.followupHistoryChanged',
        'The follow-up history changed while this form was open. Review the latest event before recording another.',
        operation,
        values,
        'review_followup',
      );
    if (/PDF is required/iu.test(message))
      return periodProblem(
        409,
        'PERIOD_FOLLOWUP_PDF_NOT_READY',
        'problem.period.followupPdfNotReady',
        'A ready customer PDF is required before dispatch or signatory follow-up can be recorded.',
        operation,
        values,
        'review_report',
      );
    return periodProblem(
      409,
      'PERIOD_FOLLOWUP_SNAPSHOT_CHANGED',
      'problem.period.followupSnapshotChanged',
      'The customer report version changed while this form was open. Review the updated report before recording follow-up.',
      operation,
      values,
      'review_report',
    );
  }
  if (error instanceof V3ConflictError) {
    const message = error.message;
    if (operation === 'approve')
      return periodProblem(
        409,
        'PERIOD_REPORT_APPROVAL_CHANGED',
        'problem.period.approvalChanged',
        'The report version or approval state changed. Review the current report before approving it.',
        operation,
        values,
        'review_report',
      );
    if (operation === 'invalidateSignoff')
      return periodProblem(
        409,
        'PERIOD_SIGNOFF_ALREADY_INVALIDATED',
        'problem.period.signoffAlreadyInvalidated',
        'This customer sign-off has already been invalidated. Review its current status.',
        operation,
        values,
        'review_signoff',
      );
    if (operation === 'sign') {
      if (message === 'Upload conflicts with existing content')
        return periodProblem(
          409,
          'PERIOD_SIGNOFF_DUPLICATE_CONTENT',
          'problem.period.signoffDuplicateContent',
          'This signed PDF was already uploaded, so this upload was not accepted. Review the current sign-off, then choose a different signed copy if evidence is still needed.',
          operation,
          values,
          'review_signoff',
        );
      const evidence = /evidence|signed PDF/iu.test(message);
      const existing = /already|exists/iu.test(message);
      const reportNotReady = /report.*not ready|PDF artifact/iu.test(message);
      return periodProblem(
        409,
        existing
          ? 'PERIOD_SIGNOFF_ALREADY_EXISTS'
          : reportNotReady
            ? 'PERIOD_SIGNOFF_REPORT_NOT_READY'
            : evidence
              ? 'PERIOD_SIGNOFF_EVIDENCE_UNAVAILABLE'
              : 'PERIOD_SIGNOFF_REPORT_CHANGED',
        existing
          ? 'problem.period.signoffAlreadyExists'
          : reportNotReady
            ? 'problem.period.signoffReportNotReady'
            : evidence
              ? 'problem.period.signoffEvidenceUnavailable'
              : 'problem.period.signoffReportChanged',
        existing
          ? 'A customer sign-off or evidence attachment already exists for this report version. Review its current status.'
          : reportNotReady
            ? 'The current customer report or its PDF is not ready for sign-off. Review the report before uploading again.'
            : evidence
              ? 'The signed PDF could not be verified for this report version. Review the report and attach a complete signed copy.'
              : 'The report or customer sign-off changed while this form was open. Review its current status before trying again.',
        operation,
        values,
        'review_signoff',
      );
    }
    if (operation === 'refresh')
      return periodProblem(
        409,
        'PERIOD_REFRESH_CHANGED',
        'problem.period.refreshChanged',
        'The report or its source records changed during recalculation. Review the current period before trying again.',
        operation,
        values,
        'review_report',
      );
    return periodProblem(
      409,
      'PERIOD_REPORT_CHANGED',
      'problem.period.changed',
      'This report changed while the form was open. Review its current status before continuing.',
      operation,
      values,
      'review_report',
    );
  }
  if (error instanceof V3ValidationError)
    return periodProblem(
      400,
      operation === 'refresh' ? 'PERIOD_REFRESH_NOT_READY' : 'PERIOD_REPORT_FIELDS_INVALID',
      operation === 'refresh' ? 'problem.period.refreshNotReady' : 'problem.period.fieldsInvalid',
      operation === 'refresh'
        ? 'This period has no report ready to recalculate, or the selected dates are invalid. Review the current period and approved source records.'
        : 'Review the report details before continuing.',
      operation,
      values,
      'review_report',
    );
  return null;
}

function openPeriodContext(locals: App.Locals, operation: Operation, values: Values) {
  try {
    return { context: openPortalRepository(locals) } as const;
  } catch (error) {
    return {
      failure:
        mappedPeriodFailure(error, operation, values) ??
        actionFailure(error, { operation, values }),
    } as const;
  }
}

const signatureDateIssue = 'Signature date must be a real date not in the future';
const signatureDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .superRefine((value, ctx) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
    if (
      parsed.toISOString().slice(0, 10) !== value ||
      value > new Date().toISOString().slice(0, 10)
    )
      ctx.addIssue({
        code: 'custom',
        message: signatureDateIssue,
      });
  });

type CurrentConformityRow = {
  id: string;
  reportState: string;
  reportPdfStorageKey: string | null;
  reportPdfSha256: string | null;
  reportPdfByteLength: number | null;
  conformityPdfStorageKey: string;
  conformityPdfSha256: string;
  conformityPdfByteLength: number;
  invalidatedAt: string | null;
};

function currentConformityRow(
  context: ReturnType<typeof openPortalRepository>,
  reportId: string,
): CurrentConformityRow | undefined {
  return context.sqlite
    .prepare(
      `SELECT c.id,
              r.state reportState,
              r.pdf_storage_key reportPdfStorageKey,
              r.pdf_sha256 reportPdfSha256,
              r.pdf_byte_length reportPdfByteLength,
              c.report_pdf_storage_key conformityPdfStorageKey,
              c.report_pdf_sha256 conformityPdfSha256,
              c.report_pdf_byte_length conformityPdfByteLength,
              invalidation.occurred_at invalidatedAt
         FROM customer_conformity c
         JOIN period_report r ON r.id=c.period_report_id
         LEFT JOIN customer_conformity_invalidation invalidation
           ON invalidation.conformity_id=c.id
        WHERE c.period_report_id=?
          AND c.snapshot_version=r.snapshot_version
          AND c.snapshot_sha256=r.snapshot_sha256
        ORDER BY (invalidation.id IS NULL) DESC,c.created_at DESC,c.id DESC
        LIMIT 1`,
    )
    .get(reportId) as CurrentConformityRow | undefined;
}

function currentReportPdfIsReady(row: CurrentConformityRow): boolean {
  return (
    ['review', 'approved', 'final'].includes(row.reportState) &&
    Boolean(row.reportPdfStorageKey && row.reportPdfSha256) &&
    /^[a-f0-9]{64}$/u.test(row.reportPdfSha256 ?? '') &&
    Number.isSafeInteger(row.reportPdfByteLength) &&
    Number(row.reportPdfByteLength) > 0
  );
}

function conformityPdfMatchesCurrentReport(row: CurrentConformityRow): boolean {
  return (
    row.conformityPdfStorageKey === row.reportPdfStorageKey &&
    row.conformityPdfSha256 === row.reportPdfSha256 &&
    Number(row.conformityPdfByteLength) === Number(row.reportPdfByteLength)
  );
}

function currentConformityForReport(
  context: ReturnType<typeof openPortalRepository>,
  reportId: string,
) {
  const current = currentConformityRow(context, reportId);
  if (
    !current ||
    !['approved', 'final'].includes(current.reportState) ||
    !currentReportPdfIsReady(current) ||
    !conformityPdfMatchesCurrentReport(current)
  )
    return null;
  // Keep invalidated evidence visible as history. Acceptance checks below
  // independently require an active conformity with verified evidence.
  return context.v3.getCustomerConformity(context.principal, current.id);
}

function hasEffectiveVerifiedConformity(
  context: ReturnType<typeof openPortalRepository>,
  reportId: string,
): boolean {
  const conformity = currentConformityForReport(context, reportId);
  return conformity?.status === 'active' && conformity.signatureEvidenceStatus === 'verified';
}

type RecoverableSignoffEvidence = Readonly<{
  id: string;
  state: 'pending_scan' | 'ready';
}>;

function recoverableSignoffEvidence(
  context: ReturnType<typeof openPortalRepository>,
  input: Readonly<{
    projectId: string;
    reportId: string;
    snapshotVersion: number;
    snapshotSha256: string;
    requestedId?: string;
  }>,
): RecoverableSignoffEvidence | null {
  const candidates = context.sqlite
    .prepare(
      `SELECT d.id,d.description,d.state,d.scan_status,d.media_type,d.sha256,d.byte_length
         FROM document d
        WHERE d.owner_id=? AND d.project_id=?
          AND d.artifact_type='customer_signoff_evidence'
          AND d.sensitivity='customer_private'
          AND ((d.state='quarantined' AND d.scan_status='pending')
            OR (d.state='committed' AND d.scan_status IN ('clean','not_scanned')))
          AND NOT EXISTS(
            SELECT 1 FROM customer_conformity c WHERE c.signature_document_id=d.id
          )
          AND NOT EXISTS(
            SELECT 1 FROM customer_conformity_evidence_attachment a
             WHERE a.signature_document_id=d.id
          )
          ${input.requestedId ? 'AND d.id=?' : ''}
        ORDER BY d.created_at DESC,d.id DESC`,
    )
    .all(
      context.principal.userId,
      input.projectId,
      ...(input.requestedId ? [input.requestedId] : []),
    ) as Array<{
    id: string;
    description: string | null;
    state: string;
    scan_status: string | null;
    media_type: string;
    sha256: string;
    byte_length: number;
  }>;
  for (const candidate of candidates) {
    if (
      candidate.media_type !== 'application/pdf' ||
      !/^[a-f0-9]{64}$/u.test(candidate.sha256) ||
      !Number.isSafeInteger(candidate.byte_length) ||
      candidate.byte_length < 1
    )
      continue;
    let binding: Record<string, unknown>;
    try {
      const parsed = JSON.parse(candidate.description ?? '') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      binding = parsed as Record<string, unknown>;
    } catch {
      continue;
    }
    if (
      binding.kind !== 'customer_signoff_evidence_binding_v1' ||
      binding.periodReportId !== input.reportId ||
      binding.snapshotVersion !== input.snapshotVersion ||
      binding.snapshotSha256 !== input.snapshotSha256
    )
      continue;
    return {
      id: candidate.id,
      state: candidate.state === 'quarantined' ? 'pending_scan' : 'ready',
    };
  }
  return null;
}

export const load: PageServerLoad = ({ locals, params, url, cookies }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const report = context.v3.periodReportSnapshot(context.principal, params.id);
    const metadata = context.v3
      .listPeriodReports(context.principal)
      .find((row) => String(row.id) === params.id);
    let pdfReady = false;
    const conformity =
      locals.user.role === 'worker' || metadata?.audience !== 'customer'
        ? null
        : currentConformityForReport(context, params.id);
    const followup =
      locals.user.role === 'worker' || metadata?.audience !== 'customer'
        ? null
        : new PeriodFollowupRepository(context.sqlite).getReportFollowup(
            context.principal,
            params.id,
          );
    const projectId = String((report as { project?: { id?: unknown } }).project?.id ?? '');
    const snapshotVersion = Number(metadata?.snapshot_version);
    const snapshotSha256 = String(metadata?.snapshot_sha256 ?? '');
    const pendingSignoffEvidence =
      (locals.user.role === 'owner_admin' || locals.user.role === 'finance_admin') &&
      metadata?.audience === 'customer' &&
      ['approved', 'final'].includes(String(metadata.state)) &&
      projectId &&
      Number.isInteger(snapshotVersion) &&
      snapshotVersion > 0 &&
      /^[a-f0-9]{64}$/u.test(snapshotSha256)
        ? recoverableSignoffEvidence(context, {
            projectId,
            reportId: params.id,
            snapshotVersion,
            snapshotSha256,
          })
        : null;
    try {
      context.v3.periodReportPdfMetadata(context.principal, params.id);
      pdfReady = true;
    } catch {
      pdfReady = false;
    }
    return {
      user: locals.user,
      locale: resolvePortalLocalePreference(
        url.searchParams.get('lang'),
        cookies.get('ja.portal.locale'),
        cookies.get('ja-portal-locale'),
      ),
      pendingSignoffEvidence,
      report: {
        ...report,
        id: params.id,
        state: metadata?.state ?? 'review',
        snapshotVersion: metadata?.snapshot_version ?? null,
        snapshotSha256: metadata?.snapshot_sha256 ?? null,
        pdfReady,
        conformity,
        followup,
      },
    };
  } catch {
    error(404, 'detail.periodReport.notFound');
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  recordFollowup: async ({ locals, request, params }) => {
    const object = await formObject(request);
    const values = scalarValues(object, [
      'expectedLatestEventId',
      'idempotencyKey',
      'eventType',
      'method',
      'eventDate',
      'reference',
      'signatoryName',
      'reason',
      'responsibleUserId',
      'nextFollowUpOn',
    ]);
    const parsed = z
      .object({
        expectedSnapshotVersion: z.coerce.number().int().positive(),
        expectedSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/u),
        expectedLatestEventId: z.string().trim().max(200),
        idempotencyKey: z.string().trim().min(1).max(200),
        eventType: z.enum(['shared', 'exported', 'awaiting_signatory', 'returned', 'disputed']),
        method: z.string().trim().max(200).optional(),
        eventDate: z.string().trim().max(10).optional(),
        reference: z.string().trim().max(500).optional(),
        signatoryName: z.string().trim().max(200).optional(),
        reason: z.string().trim().max(2000).optional(),
        responsibleUserId: z.string().trim().min(1).max(200),
        nextFollowUpOn: z.string().trim().max(10).optional(),
      })
      .strict()
      .safeParse({
        ...object,
        expectedLatestEventId: object.expectedLatestEventId ?? '',
      });
    if (!parsed.success)
      return periodProblem(
        400,
        'PERIOD_FOLLOWUP_FIELDS_INVALID',
        'problem.period.followupFieldsInvalid',
        'Review the follow-up date and required details before saving.',
        'recordFollowup',
        values,
        'review_followup',
        Object.fromEntries(
          parsed.error.issues.flatMap((issue) =>
            typeof issue.path[0] === 'string' ? [[issue.path[0], [issue.message]]] : [],
          ),
        ),
      );
    const opened = openPeriodContext(locals, 'recordFollowup', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      if (parsed.data.eventType === 'returned' || parsed.data.eventType === 'disputed') {
        if (hasEffectiveVerifiedConformity(context, params.id))
          throw new PeriodFollowupConflictError(
            'Invalidate the signed conformity through its explicit lifecycle before returning or disputing this report',
          );
      }
      const event = new PeriodFollowupRepository(context.sqlite).recordEvent(context.principal, {
        ...parsed.data,
        periodReportId: params.id,
        expectedLatestEventId: parsed.data.expectedLatestEventId || null,
      });
      return actionSuccess(
        'action.reports.periodFollowupRecorded',
        { eventType: event.eventType },
        'Follow-up recorded',
      );
    } catch (errorValue) {
      return (
        mappedPeriodFailure(errorValue, 'recordFollowup', values) ??
        actionFailure(errorValue, { operation: 'recordFollowup', values })
      );
    } finally {
      context.sqlite.close();
    }
  },
  approve: async ({ locals, request, params }) => {
    const object = await formObject(request);
    const values = scalarValues(object, ['expectedSnapshotVersion', 'expectedSnapshotSha256']);
    const parsed = z
      .object({
        expectedSnapshotVersion: z.coerce.number().int().positive(),
        expectedSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict()
      .safeParse(object);
    if (!parsed.success)
      return periodProblem(
        400,
        'PERIOD_REPORT_APPROVAL_BINDING_INVALID',
        'problem.period.approvalBindingInvalid',
        'The report version in this form is invalid. Review the current report before approving it.',
        'approve',
        values,
        'review_report',
      );
    const opened = openPeriodContext(locals, 'approve', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      const approved = context.v3.approvePeriodReport(context.principal, {
        periodReportId: params.id,
        ...parsed.data,
      });
      return actionSuccess(
        approved.changed
          ? 'action.reports.periodReportApproved'
          : 'action.reports.periodReportAlreadyApproved',
        {
          reportId: approved.id,
          snapshotVersion: approved.snapshotVersion,
        },
        approved.changed
          ? 'Period report approved for customer conformity'
          : 'Period report was already approved for this snapshot version',
      );
    } catch (error) {
      return (
        mappedPeriodFailure(error, 'approve', values) ??
        actionFailure(error, { operation: 'approve', values })
      );
    } finally {
      context.sqlite.close();
    }
  },
  sign: async ({ locals, request, params }) => {
    const object = await formObject(request);
    const values = scalarValues(object, [
      'conformityId',
      'reason',
      'signerName',
      'signerIdentity',
      'signatureDate',
      'pendingSignatureDocumentId',
    ]);
    const pendingEvidence = z.string().uuid().safeParse(object.pendingSignatureDocumentId);
    const pendingSignatureDocumentId = pendingEvidence.success ? pendingEvidence.data : null;
    const attachment = z
      .object({
        conformityId: z.string().trim().min(1).max(200),
        reason: z.string().trim().min(1).max(2000),
      })
      .strict()
      .safeParse({
        conformityId: object.conformityId,
        reason: object.reason,
      });
    const attachmentRequested = object.conformityId !== undefined || object.reason !== undefined;
    const parsed = z
      .object({
        signerName: z.string().trim().min(1).max(200),
        signerIdentity: z.string().trim().max(320).optional(),
        signatureDate: signatureDateSchema,
      })
      .strict()
      .safeParse({
        signerName: object.signerName,
        signatureDate: object.signatureDate,
        ...(object.signerIdentity ? { signerIdentity: object.signerIdentity } : {}),
      });
    if ((attachmentRequested && !attachment.success) || (!attachmentRequested && !parsed.success))
      return periodProblem(
        400,
        'PERIOD_SIGNOFF_FIELDS_INVALID',
        'problem.period.signoffFieldsInvalid',
        'Review the signer details, signature date, and attachment reason. Reattach the signed PDF if it was selected.',
        'sign',
        values,
        'reattach_signed_pdf',
        Object.fromEntries(
          (attachmentRequested ? attachment.error?.issues : parsed.error?.issues)?.flatMap(
            (issue) =>
              typeof issue.path[0] === 'string' ? [[issue.path[0], [issue.message]]] : [],
          ) ?? [],
        ),
      );
    const signedCopy = object.signatureFile;
    let bytes: Uint8Array | null = null;
    if (!pendingSignatureDocumentId) {
      if (
        !(signedCopy instanceof File) ||
        signedCopy.size < 1 ||
        signedCopy.size > 20_000_000 ||
        signedCopy.type !== 'application/pdf'
      )
        return periodProblem(
          400,
          'PERIOD_SIGNOFF_PDF_REQUIRED',
          'problem.period.signoffPdfRequired',
          'Select a signed PDF copy up to 20 MB, then submit again.',
          'sign',
          values,
          'reattach_signed_pdf',
          { signatureFile: ['Please select a complete PDF file up to 20 MB.'] },
        );
      bytes = new Uint8Array(await signedCopy.arrayBuffer());
      const trailer = new TextDecoder('latin1').decode(
        bytes.slice(Math.max(0, bytes.length - 1024)),
      );
      if (!privateDocumentSignature(signedCopy.type, bytes) || !trailer.includes('%%EOF'))
        return periodProblem(
          400,
          'PERIOD_SIGNOFF_PDF_INCOMPLETE',
          'problem.period.signoffPdfIncomplete',
          'The selected file is not a complete PDF. Select a complete signed copy and submit again.',
          'sign',
          values,
          'reattach_signed_pdf',
          { signatureFile: ['Select a complete PDF file.'] },
        );
    }
    const opened = openPeriodContext(locals, 'sign', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    let reservationId: string | null = null;
    let storageKey: string | null = null;
    let storageFileCreated = false;
    let finalized = false;
    let conformityRecorded = false;
    let preservePendingEvidence = false;
    let projectId: string | null = null;
    let boundSnapshotVersion: number | null = null;
    let boundSnapshotSha256 = '';
    try {
      projectId = String(
        (
          context.v3.periodReportSnapshot(context.principal, params.id) as {
            project?: { id?: unknown };
          }
        )?.project?.id ?? '',
      );
      const reportBinding = context.v3
        .listPeriodReports(context.principal)
        .find((report) => String(report.id) === params.id);
      const snapshotVersion = Number(reportBinding?.snapshot_version);
      const snapshotSha256 = String(reportBinding?.snapshot_sha256 ?? '');
      if (
        !Number.isInteger(snapshotVersion) ||
        snapshotVersion < 1 ||
        !/^[a-f0-9]{64}$/u.test(snapshotSha256)
      )
        throw new Error('Customer report snapshot binding is unavailable');
      boundSnapshotVersion = snapshotVersion;
      boundSnapshotSha256 = snapshotSha256;
      if (pendingSignatureDocumentId) {
        const recoverable = recoverableSignoffEvidence(context, {
          projectId,
          reportId: params.id,
          snapshotVersion,
          snapshotSha256,
          requestedId: pendingSignatureDocumentId,
        });
        if (!recoverable)
          return periodProblem(
            409,
            'PERIOD_SIGNOFF_RETRY_UNAVAILABLE',
            'problem.period.signoffRetryUnavailable',
            'The saved signed PDF cannot be used for this report version. Review the current report and select a signed copy if sign-off is still needed.',
            'sign',
            values,
            'review_signoff',
          );
        reservationId = pendingSignatureDocumentId;
        finalized = true;
        if (recoverable.state === 'pending_scan')
          return periodProblem(
            409,
            'PERIOD_SIGNOFF_SCAN_PENDING',
            'problem.period.signoffScanPending',
            'The signed PDF is awaiting its security scan. Check the sign-off status and retry after the scan completes; do not upload the file again.',
            'sign',
            values,
            'wait_for_scan',
            {},
            {
              scanPending: true,
              pendingSignatureDocumentId,
              pendingSnapshotVersion: snapshotVersion,
              pendingSnapshotSha256: snapshotSha256,
            },
          );
      } else {
        if (!(signedCopy instanceof File) || !bytes)
          throw new Error('Signed-copy validation was not completed');
        const reservation = context.v3.reserveUpload(context.principal, {
          projectId,
          originalFilename: signedCopy.name,
          artifactType: 'customer_signoff_evidence',
          description: JSON.stringify({
            kind: 'customer_signoff_evidence_binding_v1',
            periodReportId: params.id,
            snapshotVersion,
            snapshotSha256,
          }),
          sensitivity: 'customer_private',
        });
        reservationId = reservation.reservationId;
        storageKey = reservation.storageKey;
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const target = resolve(root, storageKey);
        const pathWithinRoot = relative(root, target);
        if (
          !pathWithinRoot ||
          pathWithinRoot.split(/[\\/]/u).includes('..') ||
          pathWithinRoot.startsWith('/') ||
          pathWithinRoot.startsWith('\\')
        )
          throw new Error('Invalid private signed-copy path');
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        try {
          await writePrivateFileExclusive(root, storageKey, bytes);
          storageFileCreated = true;
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
          await assertRegularPrivateFile(
            root,
            storageKey,
            sha256,
            bytes.byteLength,
            'application/pdf',
          );
        }
        context.v3.finalizeUpload(context.principal, reservationId, {
          sha256,
          mediaType: 'application/pdf',
          byteLength: bytes.byteLength,
        });
        finalized = true;
      }
      const signatureDocumentId = pendingSignatureDocumentId ?? reservationId;
      let signed;
      if (attachment.success) {
        signed = context.v3.attachLegacyCustomerConformityEvidence(context.principal, {
          expectedPeriodReportId: params.id,
          conformityId: attachment.data.conformityId,
          signatureDocumentId,
          reason: attachment.data.reason,
        });
      } else {
        // The classifier above already returns a localized 400 for this
        // branch. Keep the local guard so TypeScript and future changes cannot
        // turn a malformed attachment request into a new acceptance.
        if (!parsed.success)
          return periodProblem(
            400,
            'PERIOD_SIGNOFF_FIELDS_INVALID',
            'problem.period.signoffFieldsInvalid',
            'Review the signer details, signature date, and attachment reason. Reattach the signed PDF if it was selected.',
            'sign',
            values,
            'reattach_signed_pdf',
          );
        signed = context.v3.recordCustomerConformity(context.principal, {
          periodReportId: params.id,
          signatureDocumentId,
          signerName: parsed.data.signerName,
          ...(parsed.data.signerIdentity ? { signerIdentity: parsed.data.signerIdentity } : {}),
          signedAt: `${parsed.data.signatureDate}T00:00:00.000Z`,
        });
      }
      conformityRecorded = true;
      return actionSuccess(
        attachment.success
          ? 'action.reports.customerSignoffEvidenceAttached'
          : 'action.reports.customerSignoffRecorded',
        { conformityId: signed.id },
        attachment.success
          ? 'Verified signed-copy evidence attached to this historical immutable conformity'
          : 'Verified signed-copy evidence recorded against this immutable report version',
      );
    } catch (error) {
      const pending = reservationId
        ? (context.sqlite
            .prepare(
              `SELECT project_id,owner_id,state,scan_status,artifact_type
                 FROM document WHERE id=?`,
            )
            .get(reservationId) as
            | {
                project_id: string | null;
                owner_id: string;
                state: string;
                scan_status: string | null;
                artifact_type: string | null;
              }
            | undefined)
        : undefined;
      if (
        projectId &&
        pending?.project_id === projectId &&
        pending.owner_id === context.principal.userId &&
        pending.state === 'quarantined' &&
        pending.scan_status === 'pending' &&
        pending.artifact_type === 'customer_signoff_evidence'
      ) {
        preservePendingEvidence = true;
        return periodProblem(
          409,
          'PERIOD_SIGNOFF_SCAN_PENDING',
          'problem.period.signoffScanPending',
          'The signed PDF is awaiting its security scan. Check the sign-off status and retry after the scan completes; do not upload the file again.',
          'sign',
          values,
          'wait_for_scan',
          {},
          {
            scanPending: true,
            pendingSignatureDocumentId: reservationId,
            pendingSnapshotVersion: boundSnapshotVersion,
            pendingSnapshotSha256: boundSnapshotSha256,
          },
        );
      }
      return (
        mappedPeriodFailure(error, 'sign', values) ??
        actionFailure(error, { operation: 'sign', values })
      );
    } finally {
      if (reservationId && !finalized) {
        try {
          context.v3.cancelUploadReservation(context.principal, reservationId);
        } catch {
          // Preserve the action error; scheduled reservation cleanup handles a
          // rare failed cancellation without deleting a possibly valid file.
        }
      }
      if (storageFileCreated && storageKey && !finalized) {
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        await removePrivateFileIfPresent(root, storageKey).catch(() => undefined);
      }
      if (
        storageFileCreated &&
        storageKey &&
        reservationId &&
        finalized &&
        !conformityRecorded &&
        !preservePendingEvidence
      ) {
        try {
          const discarded = context.v3.discardUnboundCustomerSignoffEvidence(
            context.principal,
            reservationId,
          );
          await removePrivateFileIfPresent(
            resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents'),
            discarded.storageKey,
          );
        } catch {
          // A quarantine, scanner transition, download, or concurrent conformity
          // reference makes deletion unsafe; preserve the private artifact.
        }
      }
      context.sqlite.close();
    }
  },
  invalidateSignoff: async ({ locals, request }) => {
    const object = await formObject(request);
    const values = scalarValues(object, ['conformityId', 'reason']);
    const parsed = z
      .object({
        conformityId: z.string().trim().min(1).max(200),
        reason: z.string().trim().min(1).max(2000),
      })
      .strict()
      .safeParse(object);
    if (!parsed.success)
      return periodProblem(
        400,
        'PERIOD_SIGNOFF_INVALIDATION_REASON_REQUIRED',
        'problem.period.invalidationReasonRequired',
        'Enter a reason before invalidating this customer sign-off.',
        'invalidateSignoff',
        values,
        'review_signoff',
        { reason: ['Please complete this field.'] },
      );
    const opened = openPeriodContext(locals, 'invalidateSignoff', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      const invalidated = context.v3.invalidateCustomerConformity(context.principal, parsed.data);
      return actionSuccess(
        'action.reports.customerSignoffInvalidated',
        { conformityId: invalidated.conformityId },
        'Customer sign-off invalidated; the immutable signed record was retained',
      );
    } catch (error) {
      return (
        mappedPeriodFailure(error, 'invalidateSignoff', values) ??
        actionFailure(error, { operation: 'invalidateSignoff', values })
      );
    } finally {
      context.sqlite.close();
    }
  },
  refresh: async ({ locals, request }) => {
    const formData = await request.formData();
    const values = scalarValues(Object.fromEntries(formData), [
      'projectId',
      'periodStart',
      'periodEnd',
      'contentMode',
      'reportLocale',
    ]);
    const parsed = accountingPackPeriodSchema
      .extend({
        projectId: uuidSchema,
        contentMode: z
          .enum([
            'hours_only',
            'hours_activity',
            'hours_activity_selected_technical',
            'hours_activity_all_technical',
          ])
          .default('hours_activity_all_technical'),
        technicalReportIds: z.array(uuidSchema).default([]),
      })
      .safeParse({
        ...Object.fromEntries(formData),
        technicalReportIds: formData.getAll('technicalReportIds').map(String),
      });
    if (!parsed.success)
      return periodProblem(
        400,
        'PERIOD_REFRESH_FIELDS_INVALID',
        'problem.period.refreshFieldsInvalid',
        'Review the project, reporting dates, and language before recalculating.',
        'refresh',
        values,
        'review_report',
      );
    const opened = openPeriodContext(locals, 'refresh', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      const result = context.v3.refreshAndQueuePeriodReports(context.principal, parsed.data);
      return actionSuccess(
        'action.reports.periodReportsRefreshed',
        {
          reports: result.reports.length,
          jobId: result.jobId,
          jobCreated: result.jobCreated,
          jobState: result.jobState,
        },
        `${result.reports.length} report snapshots recalculated. Rendering job: ${result.jobState}.`,
      );
    } catch (error) {
      return (
        mappedPeriodFailure(error, 'refresh', values) ??
        actionFailure(error, { operation: 'refresh', values })
      );
    } finally {
      context.sqlite.close();
    }
  },
};
