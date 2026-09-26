import {
  dailyReportInputSchema,
  technicalReportInputSchema,
  versionedRecordSchema,
} from '@ja/schemas';
import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { actionFail, actionSuccess } from '$lib/server/actions/action-message';
import { openPortalRepository } from '$lib/server/portal-repository';
import { reportActionFailure, reportActions } from '$lib/server/actions/operations-actions';
import { formObject } from '$lib/server/action-utils';
import { resolvePortalLocalePreference } from '$lib/i18n/context';
import type { Actions, PageServerLoad } from './$types';

function reportValues(object: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(object).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [[key, value]]
        : key === 'safetyRelated' && typeof value === 'boolean'
          ? [[key, value ? 'on' : 'off']]
          : [],
    ),
  );
}

export const load: PageServerLoad = ({ locals, params, url, cookies }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const detail = context.repository.reportDetail(context.principal, params.id);
    const reportType = detail.type === 'technical' ? 'technical' : 'daily';
    const correctionActor = context.sqlite
      .prepare(
        `SELECT actor_user_id FROM record_correction_link
        WHERE record_type=? AND correction_id=? LIMIT 1`,
      )
      .get(`${reportType}_report`, params.id) as { actor_user_id: string } | undefined;
    // listReportAttachments is the authorization boundary.  The small
    // read-only enrichment query is deliberately constrained to the returned
    // document ids so the detail page never becomes a document oracle.
    const links = context.v3.listReportAttachments(context.principal, reportType, params.id);
    const documentIds = links.map((link) => link.document_id);
    const metadataById = new Map<
      string,
      {
        sha256: string;
        description: string | null;
        version: number;
        uploader_name: string | null;
      }
    >();
    if (documentIds.length > 0) {
      const placeholders = documentIds.map(() => '?').join(',');
      const rows = context.sqlite
        .prepare(
          `SELECT d.id document_id,d.sha256,d.description,d.version,u.name uploader_name
           FROM document d
           JOIN report_document_link l ON l.document_id=d.id
           LEFT JOIN user u ON u.id=l.created_by
           WHERE d.id IN (${placeholders})`,
        )
        .all(...documentIds) as Array<{
        document_id: string;
        sha256: string;
        description: string | null;
        version: number;
        uploader_name: string | null;
      }>;
      for (const row of rows) metadataById.set(row.document_id, row);
    }
    const attachments = links.map((link) => ({
      ...link,
      sha256: metadataById.get(link.document_id)?.sha256 ?? null,
      notes: metadataById.get(link.document_id)?.description ?? null,
      version: metadataById.get(link.document_id)?.version ?? null,
      uploader_name: metadataById.get(link.document_id)?.uploader_name ?? null,
    }));
    return {
      user: locals.user,
      locale: resolvePortalLocalePreference(
        url.searchParams.get('lang'),
        cookies.get('ja.portal.locale'),
        cookies.get('ja-portal-locale'),
      ),
      correctionRequestId: randomUUID(),
      detail: {
        ...detail,
        attachments,
        canWithdrawCorrection:
          detail.report.approval_state === 'draft' &&
          (correctionActor?.actor_user_id === context.principal.userId ||
            context.principal.role === 'owner_admin'),
        canSubmitDraft:
          ['draft', 'needs_changes'].includes(String(detail.report.approval_state)) &&
          (String(detail.report.worker_id ?? detail.report.author_id) ===
            context.principal.userId ||
            context.principal.role === 'owner_admin'),
      },
    };
  } catch {
    error(404, 'detail.report.notFound');
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  updateReport: async ({ locals, request, params }) => {
    const object = await formObject(request);
    object.safetyRelated = object.safetyRelated === 'on';
    const values = reportValues(object);
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        actionName: 'updateReport',
        values,
        code: 'REPORT_SIGN_IN_REQUIRED',
        remedies: [{ id: 'sign_in_again' }],
      });
    const type = object.type;
    if (object.id !== params.id || (type !== 'daily' && type !== 'technical'))
      return actionFail(
        400,
        'problem.report.routeMismatch',
        {},
        'This report link and form no longer match. Review the current report.',
        {
          actionName: 'updateReport',
          values,
          code: 'REPORT_ROUTE_MISMATCH',
          remedies: [{ id: 'review_report' }],
        },
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      if (type === 'daily') {
        const parsed = dailyReportInputSchema.and(versionedRecordSchema).safeParse(object);
        if (!parsed.success)
          return actionFail(
            400,
            'problem.report.fieldsInvalid',
            {},
            'Review the highlighted daily report fields before saving.',
            {
              actionName: 'updateReport',
              values,
              code: 'REPORT_FIELDS_INVALID',
              fieldErrors: parsed.error.flatten().fieldErrors,
              remedies: [{ id: 'review_report_fields' }],
            },
          );
        context = openPortalRepository(locals);
        const result = context.repository.updateDailyReport(context.principal, parsed.data);
        const changedFields = 'changedFields' in result ? result.changedFields : [];
        return actionSuccess(
          changedFields.length > 0
            ? 'action.reports.changesSaved'
            : 'action.reports.dailyDraftSaved',
          changedFields.length > 0 ? { changedFields: changedFields.join(', ') } : {},
          changedFields.length > 0
            ? `Changes saved. Submit for review when ready: ${changedFields.join(', ')}`
            : 'No report fields changed',
        );
      }
      const parsed = technicalReportInputSchema.and(versionedRecordSchema).safeParse(object);
      if (!parsed.success)
        return actionFail(
          400,
          'problem.report.fieldsInvalid',
          {},
          'Review the highlighted report fields before saving.',
          {
            actionName: 'updateReport',
            values,
            code: 'REPORT_FIELDS_INVALID',
            fieldErrors: parsed.error.flatten().fieldErrors,
            remedies: [{ id: 'review_report_fields' }],
          },
        );
      context = openPortalRepository(locals);
      const result = context.repository.updateTechnicalReport(context.principal, parsed.data);
      const changedFields = 'changedFields' in result ? result.changedFields : [];
      return actionSuccess(
        changedFields.length > 0
          ? 'action.reports.changesSaved'
          : 'action.reports.technicalDraftSaved',
        changedFields.length > 0 ? { changedFields: changedFields.join(', ') } : {},
        changedFields.length > 0
          ? `Changes saved. Submit for review when ready: ${changedFields.join(', ')}`
          : 'No report fields changed',
      );
    } catch (error) {
      return reportActionFailure(error, { ...values, actionName: 'updateReport' });
    } finally {
      context?.sqlite.close();
    }
  },
  createCorrectionDraft: async (event) => {
    const result = await reportActions.createCorrectionDraft({
      ...event,
      params: { ...event.params, section: 'reports' },
    });
    if ('success' in result && result.success === true)
      redirect(
        303,
        `/j-aautomation/app/reports/${encodeURIComponent(String(result.messageParams.correctionId))}`,
      );
    return result;
  },
  withdrawCorrectionDraft: async (event) => {
    const result = await reportActions.withdrawCorrectionDraft({
      ...event,
      params: { ...event.params, section: 'reports' },
    });
    if ('success' in result && result.success === true)
      redirect(
        303,
        `/j-aautomation/app/reports/${encodeURIComponent(String(result.messageParams.originalId))}`,
      );
    return result;
  },
  submitReport: async (event) => {
    const result = await reportActions.submitReport({
      ...event,
      params: { ...event.params, section: 'reports' },
    });
    if ('success' in result && result.success === true)
      redirect(303, `/j-aautomation/app/reports/${encodeURIComponent(event.params.id)}`);
    return result;
  },
};
