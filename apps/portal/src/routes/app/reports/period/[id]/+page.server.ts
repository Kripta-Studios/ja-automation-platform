import { accountingPackPeriodSchema, uuidSchema } from '@ja/schemas';
import { error, fail, redirect } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { runArtifactJobs } from '$lib/server/artifact-jobs';
import { formObject } from '$lib/server/action-utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const report = context.v3.periodReportSnapshot(context.principal, params.id);
    const metadata = context.v3
      .listPeriodReports(context.principal)
      .find((row) => String(row.id) === params.id);
    let pdfReady = false;
    try {
      context.v3.periodReportPdfMetadata(context.principal, params.id);
      pdfReady = true;
    } catch {
      pdfReady = false;
    }
    return {
      user: locals.user,
      report: {
        ...report,
        id: params.id,
        state: metadata?.state ?? 'review',
        pdfReady,
      },
    };
  } catch {
    error(404, 'Period report not found or unavailable');
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  refresh: async ({ locals, request }) => {
    const parsed = accountingPackPeriodSchema
      .extend({ projectId: uuidSchema })
      .safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, { success: false, message: 'Project and reporting period are required' });
    const context = openPortalRepository(locals);
    try {
      const reports = context.v3.refreshPeriodReports(context.principal, {
        ...parsed.data,
      });
      context.v3.enqueueJob(
        'period_close_report',
        `period-report-refresh:${parsed.data.projectId}:${parsed.data.periodStart}:${parsed.data.periodEnd}:${parsed.data.reportLocale}`,
        parsed.data,
      );
      const jobs = runArtifactJobs(context);
      return {
        success: true,
        message: `${reports.length} report snapshots recalculated from the current source data; ${jobs.processed} artifact jobs processed`,
      };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
