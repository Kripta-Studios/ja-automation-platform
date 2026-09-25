import {
  dailyReportInputSchema,
  technicalReportInputSchema,
  versionedRecordSchema,
} from '@ja/schemas';
import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { actionFail, actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import { openPortalRepository } from '$lib/server/portal-repository';
import { reportActions } from '$lib/server/actions/operations-actions';
import { formObject } from '$lib/server/action-utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
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
    const type = object.type;
    if (object.id !== params.id || (type !== 'daily' && type !== 'technical'))
      return actionFail(400, 'action.validation.report', {}, 'Invalid report update');
    const context = openPortalRepository(locals);
    try {
      if (type === 'daily') {
        const parsed = dailyReportInputSchema.and(versionedRecordSchema).safeParse(object);
        if (!parsed.success)
          return actionFail(
            400,
            'action.validation.dailyReportFields',
            {},
            'Check the daily report fields',
            { fields: parsed.error.flatten().fieldErrors },
          );
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
          'action.validation.technicalReportFields',
          {},
          'Check the PLC report fields',
          { fields: parsed.error.flatten().fieldErrors },
        );
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
      return actionFailure(error);
    } finally {
      context.sqlite.close();
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
