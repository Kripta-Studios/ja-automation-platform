import { randomUUID } from 'node:crypto';
import { base } from '$app/paths';
import { error, isRedirect, redirect } from '@sveltejs/kit';
import {
  DigitalWorkAccessDeniedError,
  DigitalWorkNotFoundError,
  DigitalWorkersRepository,
  PeriodFollowupAccessDeniedError,
  PeriodFollowupRepository,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { Actions, PageServerLoad } from './$types';
import {
  formValues,
  workflowActionFailure,
  workflowInputFailure,
} from '$lib/portal/workflow/server';

function allowed(role: string): boolean {
  return ['owner_admin', 'finance_admin', 'auditor_read_only'].includes(role);
}

function actionRedirect(id: string, formData: FormData): never {
  const locale = String(formData.get('lang') ?? 'en');
  const query = new URLSearchParams();
  if (locale === 'en' || locale === 'es' || locale === 'pt') query.set('lang', locale);
  redirect(
    303,
    `${base}/app/workflow/cases/${encodeURIComponent(id)}${query.size ? `?${query}` : ''}`,
  );
}

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user || !locals.session) redirect(303, `${base}/app/login`);
  const context = openPortalRepository(locals);
  try {
    if (!allowed(context.principal.role)) error(403, 'Finance case access required');
    const repository = new DigitalWorkersRepository(context.sqlite);
    let financeCase: ReturnType<DigitalWorkersRepository['caseDetail']>;
    try {
      financeCase = repository.caseDetail(context.principal, params.id);
    } catch (caught) {
      if (caught instanceof DigitalWorkNotFoundError) error(404, 'Finance case not found');
      if (caught instanceof DigitalWorkAccessDeniedError)
        error(403, 'Finance case access required');
      throw caught;
    }
    const project = context.sqlite
      .prepare('SELECT project_number,name FROM project WHERE id=?')
      .get(financeCase.projectId) as { project_number: string; name: string } | undefined;
    const isAuditor = context.principal.role === 'auditor_read_only';
    let periodReports: Array<{
      reportId: string;
      reportType: string;
      periodStart: string;
      periodEnd: string;
      state: string;
      snapshotVersion: number;
      pdfReady: boolean;
    }> = [];
    let periodReviewAccess = false;
    if (!isAuditor) {
      try {
        const review = new PeriodFollowupRepository(context.sqlite).reviewProjectPeriod(
          context.principal,
          financeCase.projectId,
          financeCase.periodStart,
          financeCase.periodEnd,
        );
        periodReviewAccess = true;
        periodReports = review.reports.map((row) => ({
          reportId: row.reportId,
          reportType: row.reportType,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          state: row.state,
          snapshotVersion: row.snapshotVersion,
          pdfReady: row.pdfReady,
        }));
      } catch (caught) {
        if (!(caught instanceof PeriodFollowupAccessDeniedError)) throw caught;
      }
    }
    return {
      financeCase,
      projectNumber: project?.project_number ?? '',
      projectName: project?.name ?? '',
      isAuditor,
      periodReviewAccess,
      periodReports,
      readOnly: isAuditor,
      requestKeys: {
        reconcile: randomUUID(),
        recordReview: randomUUID(),
        prepareDraft: randomUUID(),
      },
    };
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  reconcile: async ({ request, locals, params }) => {
    if (!locals.user || !locals.session) redirect(303, `${base}/app/login`);
    const formData = await request.formData();
    const saved = formValues(formData);
    const context = openPortalRepository(locals);
    try {
      if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
        return workflowActionFailure(
          new DigitalWorkAccessDeniedError('Finance case access required'),
          'reconcileCase',
          saved,
        );
      const expectedVersion = Number(formData.get('expectedVersion'));
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'reconcileCase',
          saved,
        );
      new DigitalWorkersRepository(context.sqlite).reconcileCase(context.principal, {
        caseId: params.id,
        expectedVersion,
        requestKey: String(formData.get('requestKey') ?? ''),
      });
      actionRedirect(params.id, formData);
    } catch (caught) {
      if (isRedirect(caught)) throw caught;
      return workflowActionFailure(caught, 'reconcileCase', saved);
    } finally {
      context.sqlite.close();
    }
  },
  recordReview: async ({ request, locals, params }) => {
    if (!locals.user || !locals.session) redirect(303, `${base}/app/login`);
    const formData = await request.formData();
    const saved = formValues(formData);
    const context = openPortalRepository(locals);
    try {
      if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
        return workflowActionFailure(
          new DigitalWorkAccessDeniedError('Finance case review required'),
          'recordCaseReview',
          saved,
        );
      const expectedVersion = Number(formData.get('expectedVersion'));
      const reason = String(formData.get('reason') ?? '').trim();
      const manifestSha256 = String(formData.get('manifestSha256') ?? '').trim();
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !manifestSha256)
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'recordCaseReview',
          saved,
        );
      if (!reason)
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.reasonMissing',
          'recordCaseReview',
          saved,
        );
      new DigitalWorkersRepository(context.sqlite).recordCaseReview(context.principal, {
        caseId: params.id,
        expectedVersion,
        manifestSha256,
        reason,
        requestKey: String(formData.get('requestKey') ?? ''),
      });
      actionRedirect(params.id, formData);
    } catch (caught) {
      if (isRedirect(caught)) throw caught;
      return workflowActionFailure(caught, 'recordCaseReview', saved);
    } finally {
      context.sqlite.close();
    }
  },
  prepareDraft: async ({ request, locals, params }) => {
    if (!locals.user || !locals.session) redirect(303, `${base}/app/login`);
    const formData = await request.formData();
    const saved = formValues(formData);
    const context = openPortalRepository(locals);
    try {
      if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
        return workflowActionFailure(
          new DigitalWorkAccessDeniedError('Finance case draft required'),
          'prepareInvoiceDraft',
          saved,
        );
      const expectedVersion = Number(formData.get('expectedVersion'));
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        return workflowInputFailure(
          400,
          'problem.digitalWorkers.invalidSelection',
          'prepareInvoiceDraft',
          saved,
        );
      new DigitalWorkersRepository(context.sqlite).prepareInvoiceDraft(context.principal, {
        caseId: params.id,
        expectedVersion,
        requestKey: String(formData.get('requestKey') ?? ''),
      });
      actionRedirect(params.id, formData);
    } catch (caught) {
      if (isRedirect(caught)) throw caught;
      return workflowActionFailure(caught, 'prepareInvoiceDraft', saved);
    } finally {
      context.sqlite.close();
    }
  },
};
