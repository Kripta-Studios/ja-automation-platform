import {
  dailyReportInputSchema,
  technicalReportInputSchema,
  versionedRecordSchema,
} from '@ja/schemas';
import { error, redirect } from '@sveltejs/kit';
import { actionFail, actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import { openPortalRepository } from '$lib/server/portal-repository';
import { formObject } from '$lib/server/action-utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const detail = context.repository.reportDetail(context.principal, params.id);
    const reportType = detail.type === 'technical' ? 'technical' : 'daily';
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
      detail: { ...detail, attachments },
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
          changedFields.length > 0 ? 'action.reports.submitted' : 'action.reports.dailyDraftSaved',
          changedFields.length > 0 ? { changedFields: changedFields.join(', ') } : {},
          changedFields.length > 0
            ? `Report updated. Review requested for: ${changedFields.join(', ')}`
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
          ? 'action.reports.submitted'
          : 'action.reports.technicalDraftSaved',
        changedFields.length > 0 ? { changedFields: changedFields.join(', ') } : {},
        changedFields.length > 0
          ? `Report updated. Review requested for: ${changedFields.join(', ')}`
          : 'No report fields changed',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
