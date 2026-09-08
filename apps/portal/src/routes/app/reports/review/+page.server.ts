import { error, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import {
  PeriodFollowupAccessDeniedError,
  PeriodFollowupConflictError,
  PeriodFollowupNotFoundError,
  PeriodFollowupRepository,
  PeriodFollowupValidationError,
} from '@ja/database';
import { actionFail, actionSuccess } from '$lib/server/actions/action-message';
import { formObject } from '$lib/server/action-utils';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { Actions, PageServerLoad } from './$types';

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .superRefine((value, context) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
      context.addIssue({ code: 'custom', message: 'Invalid date' });
  });
const EVENT = z.enum(['shared', 'exported', 'awaiting_signatory', 'returned', 'disputed']);
const SHA256 = /^[a-f0-9]{64}$/u;

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

function authorized(locals: App.Locals) {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    new PeriodFollowupRepository(context.sqlite).assertReviewAccess(context.principal);
  } catch (errorValue) {
    context.sqlite.close();
    if (errorValue instanceof PeriodFollowupAccessDeniedError)
      error(403, 'Project review required');
    throw errorValue;
  }
  return context;
}

function projectsFor(context: ReturnType<typeof openPortalRepository>) {
  if (context.principal.role === 'owner_admin' || context.principal.role === 'finance_admin')
    return context.repository.listFinanceProjects(context.principal).map((project) => ({
      id: String(project.id),
      label: `${project.project_number} — ${project.name}`,
    }));
  return (
    context.sqlite
      .prepare(
        `SELECT DISTINCT p.id,p.project_number,p.name
           FROM project p JOIN project_member pm ON pm.project_id=p.id
          WHERE p.status IN ('active','planned','paused')
            AND pm.user_id=? AND pm.status='active' AND pm.can_review=1
            AND pm.starts_on<=date('now') AND (pm.ends_on IS NULL OR pm.ends_on>=date('now'))
          ORDER BY p.project_number,p.id`,
      )
      .all(context.principal.userId) as Array<{ id: string; project_number: string; name: string }>
  ).map((project) => ({
    id: project.id,
    label: `${project.project_number} — ${project.name}`,
  }));
}

function responsibleUsersFor(context: ReturnType<typeof openPortalRepository>, projectId: string) {
  if (!projectId) return [];
  const rows =
    context.principal.role === 'owner_admin' || context.principal.role === 'finance_admin'
      ? (context.sqlite
          .prepare(
            `SELECT id,name,role FROM user
               WHERE status='active' AND role IN ('owner_admin','finance_admin','project_manager','worker')
               ORDER BY name,id`,
          )
          .all() as Array<{ id: string; name: string | null; role: string }>)
      : (context.sqlite
          .prepare(
            `SELECT DISTINCT u.id,u.name,u.role
               FROM user u JOIN project_member pm ON pm.user_id=u.id
              WHERE u.status='active' AND u.role IN ('owner_admin','finance_admin','project_manager','worker')
                AND pm.project_id=? AND pm.status='active' AND pm.starts_on<=date('now')
                AND (pm.ends_on IS NULL OR pm.ends_on>=date('now'))
              ORDER BY u.name,u.id`,
          )
          .all(projectId) as Array<{ id: string; name: string | null; role: string }>);
  return rows.map((user) => ({ id: user.id, name: user.name ?? user.id, role: user.role }));
}

function sourceHrefForReason(
  context: ReturnType<typeof openPortalRepository>,
  projectId: string,
  sourceId: string | undefined,
): string | null {
  if (!sourceId || !projectId) return null;
  const source = context.sqlite
    .prepare(
      `SELECT 'time_entry' source_type,id FROM time_entry WHERE id=? AND project_id=?
       UNION ALL SELECT 'expense',id FROM expense WHERE id=? AND project_id=?
       UNION ALL SELECT 'daily_report',id FROM daily_report WHERE id=? AND project_id=?
       UNION ALL SELECT 'technical_report',id FROM technical_report WHERE id=? AND project_id=?
       UNION ALL SELECT 'technical_change',id FROM technical_change WHERE id=? AND project_id=?
       LIMIT 1`,
    )
    .get(
      sourceId,
      projectId,
      sourceId,
      projectId,
      sourceId,
      projectId,
      sourceId,
      projectId,
      sourceId,
      projectId,
    ) as { source_type: string; id: string } | undefined;
  if (!source) return null;
  if (source.source_type === 'time_entry') return `/app/time/${encodeURIComponent(source.id)}`;
  if (source.source_type === 'expense') return `/app/expenses/${encodeURIComponent(source.id)}`;
  return `/app/reports/${encodeURIComponent(source.id)}`;
}

function readinessFor(
  context: ReturnType<typeof openPortalRepository>,
  rule: { id: string; stream_type: string },
  periodStart: string,
  periodEnd: string,
) {
  let readiness;
  try {
    readiness = context.v3.billingReadiness(context.principal, rule.id, periodStart, periodEnd);
  } catch (errorValue) {
    if (!(errorValue instanceof Error) || !/cadence/iu.test(errorValue.message)) throw errorValue;
    readiness = {
      state: 'incomplete' as const,
      reasons: [{ code: 'period_cutoff_mismatch' }],
      projectId: '',
      streamType: rule.stream_type,
    };
  }
  return {
    ...readiness,
    reasons: readiness.reasons.map((reason) => ({
      code: reason.code,
      sourceId: reason.sourceId ?? null,
      sourceHref: sourceHrefForReason(context, readiness.projectId, reason.sourceId),
    })),
  };
}

function financeData(
  context: ReturnType<typeof openPortalRepository>,
  projectId: string,
  periodStart: string,
  periodEnd: string,
) {
  if (context.principal.role !== 'owner_admin' && context.principal.role !== 'finance_admin')
    return { billing: [], invoices: [] };
  const rules = context.sqlite
    .prepare(
      `SELECT id,stream_type,cadence_type
         FROM billing_rule
        WHERE project_id=? AND enabled=1 AND effective_from<=?
          AND (effective_to IS NULL OR effective_to>=?)
        ORDER BY stream_type,id`,
    )
    .all(projectId, periodEnd, periodStart) as Array<{
    id: string;
    stream_type: string;
    cadence_type: string;
  }>;
  const billing = rules.map((rule) => ({
    billingRuleId: rule.id,
    streamType: rule.stream_type,
    cadenceType: rule.cadence_type,
    readiness: readinessFor(context, rule, periodStart, periodEnd),
  }));
  const invoices = context.sqlite
    .prepare(
      `SELECT id,invoice_number,stream_type,state,period_start,period_end
         FROM invoice
        WHERE project_id=? AND period_start<=? AND period_end>=?
        ORDER BY period_start,stream_type,id`,
    )
    .all(projectId, periodEnd, periodStart) as Array<{
    id: string;
    invoice_number: string | null;
    stream_type: string;
    state: string;
    period_start: string;
    period_end: string;
  }>;
  return {
    billing,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      streamType: invoice.stream_type,
      state: invoice.state,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
    })),
  };
}

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
    SHA256.test(row.reportPdfSha256 ?? '') &&
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

function conformityState(
  context: ReturnType<typeof openPortalRepository>,
  reportId: string,
): 'accepted' | 'signed_issue' | 'not_accepted' {
  // The v3 helper intentionally exposes no snapshot binding to PMs. Resolve the
  // exact current report version/hash in this scoped query first, then ask v3
  // for the role-safe evidence status of that exact conformity row.
  const current = currentConformityRow(context, reportId);
  if (!current || current.invalidatedAt) return 'not_accepted';
  const conformity = context.v3.getCustomerConformity(context.principal, current.id);
  if (conformity?.status !== 'active') return 'not_accepted';
  if (
    !['approved', 'final'].includes(current.reportState) ||
    !currentReportPdfIsReady(current) ||
    !conformityPdfMatchesCurrentReport(current)
  )
    return 'signed_issue';
  if (conformity.signatureEvidenceStatus === 'verified') return 'accepted';
  return 'signed_issue';
}

function hasEffectiveVerifiedConformity(
  context: ReturnType<typeof openPortalRepository>,
  reportId: string,
): boolean {
  const current = currentConformityRow(context, reportId);
  if (
    !current ||
    current.invalidatedAt ||
    !['approved', 'final'].includes(current.reportState) ||
    !currentReportPdfIsReady(current) ||
    !conformityPdfMatchesCurrentReport(current)
  )
    return false;
  const conformity = context.v3.getCustomerConformity(context.principal, current.id);
  return conformity?.status === 'active' && conformity.signatureEvidenceStatus === 'verified';
}

function c1Failure(errorValue: unknown, values: Record<string, unknown>) {
  if (errorValue instanceof PeriodFollowupAccessDeniedError)
    return actionFail(
      403,
      'action.error.forbidden',
      {},
      'You do not have permission to perform this action.',
      { values },
    );
  if (errorValue instanceof PeriodFollowupConflictError)
    return actionFail(
      409,
      'action.error.conflict',
      {},
      'The report or follow-up history changed. Refresh and try again.',
      { values },
    );
  if (errorValue instanceof PeriodFollowupNotFoundError)
    return actionFail(404, 'action.error.invalid', {}, 'The period report was not found.', {
      values,
    });
  if (errorValue instanceof PeriodFollowupValidationError)
    return actionFail(
      400,
      'action.error.invalid',
      {},
      'Check the follow-up fields and try again.',
      { values },
    );
  throw errorValue;
}

export const load: PageServerLoad = ({ locals, url }) => {
  const context = authorized(locals);
  try {
    const projectId = url.searchParams.get('project')?.trim() ?? '';
    const periodStartValue = url.searchParams.get('from')?.trim() ?? '';
    const periodEndValue = url.searchParams.get('to')?.trim() ?? '';
    const projects = projectsFor(context);
    if (!projectId || !periodStartValue || !periodEndValue)
      return {
        projects,
        selectedProjectId: projectId,
        periodStart: periodStartValue,
        periodEnd: periodEndValue,
        responsibleUsers: [],
        review: null,
        finance: { billing: [], invoices: [] },
      };
    const dates = z.object({ periodStart: DATE, periodEnd: DATE }).safeParse({
      periodStart: periodStartValue,
      periodEnd: periodEndValue,
    });
    if (!dates.success || periodEndValue < periodStartValue) error(400, 'Invalid date range');
    const repository = new PeriodFollowupRepository(context.sqlite);
    const review = repository.reviewProjectPeriod(
      context.principal,
      projectId,
      periodStartValue,
      periodEndValue,
    );
    const reports = review.reports.map((report) => ({
      ...report,
      conformityState: conformityState(context, report.reportId),
    }));
    return {
      projects,
      selectedProjectId: projectId,
      periodStart: periodStartValue,
      periodEnd: periodEndValue,
      responsibleUsers: responsibleUsersFor(context, projectId),
      review: { ...review, reports },
      finance: financeData(context, projectId, periodStartValue, periodEndValue),
      userRole: context.principal.role,
    };
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  recordFollowup: async ({ locals, request }) => {
    const object = await formObject(request);
    const values = Object.fromEntries(
      Object.entries(object).map(([key, value]) => [
        key,
        value instanceof File ? value.name : String(value ?? ''),
      ]),
    );
    const parsed = z
      .object({
        periodReportId: z.string().trim().min(1).max(200),
        expectedSnapshotVersion: z.coerce.number().int().positive(),
        expectedSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/u),
        expectedLatestEventId: z.string().trim().max(200),
        idempotencyKey: z.string().trim().min(1).max(200),
        eventType: EVENT,
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
      return actionFail(
        400,
        'action.error.invalid',
        {},
        'Check the follow-up fields and try again.',
        { values },
      );
    const context = openPortalRepository(locals);
    try {
      const repository = new PeriodFollowupRepository(context.sqlite);
      if (parsed.data.eventType === 'returned' || parsed.data.eventType === 'disputed') {
        if (hasEffectiveVerifiedConformity(context, parsed.data.periodReportId))
          throw new PeriodFollowupConflictError(
            'Invalidate the signed conformity through its explicit lifecycle before returning or disputing this report',
          );
      }
      const event = repository.recordEvent(context.principal, {
        ...parsed.data,
        expectedLatestEventId: parsed.data.expectedLatestEventId || null,
      });
      return actionSuccess(
        'action.reports.periodFollowupRecorded',
        { eventType: event.eventType },
        'Follow-up recorded',
      );
    } catch (errorValue) {
      return c1Failure(errorValue, values);
    } finally {
      context.sqlite.close();
    }
  },
};
