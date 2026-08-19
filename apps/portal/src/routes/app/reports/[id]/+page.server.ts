import {
  dailyReportInputSchema,
  technicalReportInputSchema,
  versionedRecordSchema,
} from '@ja/schemas';
import { error, fail, redirect } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { formObject } from '$lib/server/action-utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    return {
      user: locals.user,
      detail: context.repository.reportDetail(context.principal, params.id),
    };
  } catch {
    error(404, 'Report not found or unavailable');
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
      return fail(400, { success: false, message: 'Invalid report update' });
    const context = openPortalRepository(locals);
    try {
      if (type === 'daily') {
        const parsed = dailyReportInputSchema.and(versionedRecordSchema).safeParse(object);
        if (!parsed.success)
          return fail(400, {
            success: false,
            message: 'Check the daily report fields',
            fields: parsed.error.flatten().fieldErrors,
          });
        const result = context.repository.updateDailyReport(context.principal, parsed.data);
        const changedFields = 'changedFields' in result ? result.changedFields : [];
        return {
          success: true,
          message:
            changedFields.length > 0
              ? `Report updated. Review requested for: ${changedFields.join(', ')}`
              : 'No report fields changed',
        };
      }
      const parsed = technicalReportInputSchema.and(versionedRecordSchema).safeParse(object);
      if (!parsed.success)
        return fail(400, {
          success: false,
          message: 'Check the PLC report fields',
          fields: parsed.error.flatten().fieldErrors,
        });
      const result = context.repository.updateTechnicalReport(context.principal, parsed.data);
      const changedFields = 'changedFields' in result ? result.changedFields : [];
      return {
        success: true,
        message:
          changedFields.length > 0
            ? `Report updated. Review requested for: ${changedFields.join(', ')}`
            : 'No report fields changed',
      };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deleteReport: async ({ locals, request, params }) => {
    const object = await formObject(request);
    const type = object.type;
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success || object.id !== params.id || (type !== 'daily' && type !== 'technical'))
      return fail(400, { success: false, message: 'Invalid report deletion' });
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteReport(context.principal, type, parsed.data.id, parsed.data.version);
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
    throw redirect(303, '/j-aautomation/app/reports');
  },
};
