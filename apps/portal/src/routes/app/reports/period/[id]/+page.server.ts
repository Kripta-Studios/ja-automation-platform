import { accountingPackPeriodSchema, uuidSchema } from '@ja/schemas';
import { error, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { actionFail, actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import { openPortalRepository } from '$lib/server/portal-repository';
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
    const conformity =
      locals.user.role === 'worker'
        ? null
        : context.v3.getCustomerConformityForPeriodReport(context.principal, params.id);
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
        snapshotVersion: metadata?.snapshot_version ?? null,
        snapshotSha256: metadata?.snapshot_sha256 ?? null,
        pdfReady,
        conformity,
      },
    };
  } catch {
    error(404, 'detail.periodReport.notFound');
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  approve: async ({ locals, request, params }) => {
    const parsed = z
      .object({
        expectedSnapshotVersion: z.coerce.number().int().positive(),
        expectedSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict()
      .safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.periodReportApproval',
        {},
        'Valid period report snapshot binding is required',
      );
    const context = openPortalRepository(locals);
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
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  sign: async ({ locals, request, params }) => {
    const parsed = z
      .object({
        signerName: z.string().trim().min(1).max(200),
        signerIdentity: z.string().trim().max(320).optional(),
      })
      .strict()
      .safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.customerSignoff', {}, 'Signer name is required');
    const context = openPortalRepository(locals);
    try {
      const signed = context.v3.recordCustomerConformity(context.principal, {
        periodReportId: params.id,
        signerName: parsed.data.signerName,
        ...(parsed.data.signerIdentity ? { signerIdentity: parsed.data.signerIdentity } : {}),
        signedAt: new Date().toISOString(),
      });
      return actionSuccess(
        'action.reports.customerSignoffRecorded',
        { conformityId: signed.id },
        'Customer sign-off recorded against this immutable report version',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  invalidateSignoff: async ({ locals, request }) => {
    const parsed = z
      .object({
        conformityId: z.string().trim().min(1).max(200),
        reason: z.string().trim().min(1).max(2000),
      })
      .strict()
      .safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.customerSignoffInvalidation',
        {},
        'Conformity and invalidation reason are required',
      );
    const context = openPortalRepository(locals);
    try {
      const invalidated = context.v3.invalidateCustomerConformity(context.principal, parsed.data);
      return actionSuccess(
        'action.reports.customerSignoffInvalidated',
        { conformityId: invalidated.conformityId },
        'Customer sign-off invalidated; the immutable signed record was retained',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  refresh: async ({ locals, request }) => {
    const parsed = accountingPackPeriodSchema
      .extend({ projectId: uuidSchema })
      .safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.projectReportingPeriod',
        {},
        'Project and reporting period are required',
      );
    const context = openPortalRepository(locals);
    try {
      const reports = context.v3.refreshPeriodReports(context.principal, {
        ...parsed.data,
      });
      const queued = context.v3.enqueueJob(
        'period_close_report',
        `period-report-refresh:${parsed.data.projectId}:${parsed.data.periodStart}:${parsed.data.periodEnd}:${parsed.data.reportLocale}`,
        parsed.data,
      );
      return actionSuccess(
        'action.reports.periodReportsRefreshed',
        {
          reports: reports.length,
          jobId: queued.id,
          jobCreated: queued.created,
          jobState: 'queued',
        },
        `${reports.length} report snapshots recalculated from the current source data and queued for rendering`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
