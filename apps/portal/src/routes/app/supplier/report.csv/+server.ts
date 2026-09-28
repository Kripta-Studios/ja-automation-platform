import type { RequestHandler } from './$types';
import type { ProblemData } from '$lib/problem/contract';
import {
  AccessDeniedError,
  V3AccessDeniedError,
  ValidationError,
  V3ValidationError,
  assertLiveSession,
} from '@ja/database';
import { randomUUID } from 'node:crypto';
import { resolvePortalLocalePreference } from '$lib/i18n/context';
import { openSupplierContext, supplierPeriod } from '$lib/server/supplier-context';
import { supplierCsv, supplierHoursFromMinutes } from '$lib/server/supplier-csv';
import { supplierCopy, supplierStateLabel, supplierCategoryLabel } from '../copy';

const privateHeaders = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
};

function problem(
  code: string,
  messageKey: ProblemData['messageKey'],
  message: string,
  correlationId: string,
  remedies: ProblemData['remedies'],
  params: ProblemData['params'] = {},
  fieldErrors: ProblemData['fieldErrors'] = {},
): ProblemData {
  return { code, messageKey, message, params, fieldErrors, remedies, correlationId };
}

function supplierReportProblemResponse(problemData: ProblemData, status: number): Response {
  return new Response(JSON.stringify({ success: false, ...problemData }), {
    status,
    headers: {
      ...privateHeaders,
      'content-type': 'application/problem+json; charset=utf-8',
      'x-correlation-id': problemData.correlationId,
    },
  });
}

function unavailableProjectResponse(
  ctx: ReturnType<typeof openSupplierContext>,
  projectId: string,
  reference: string,
): Response {
  const owner = ctx.principal.role === 'owner_admin';
  const record = owner
    ? (ctx.sqlite.prepare('SELECT name,status FROM project WHERE id=?').get(projectId) as
        | { name: string; status: string }
        | undefined)
    : undefined;
  return supplierReportProblemResponse(
    owner && record
      ? problem(
          'SUPPLIER_REPORT_PROJECT_UNAVAILABLE',
          'problem.supplier.reportProjectUnavailable',
          `${record.name} is ${record.status}. Choose an available operational project or review its status.`,
          reference,
          [{ id: 'review_supplier_project', projectId }],
          { projectName: record.name, status: record.status },
        )
      : problem(
          'SUPPLIER_REPORT_PROJECT_SCOPE_CHANGED',
          'problem.supplier.reportProjectScopeChanged',
          'This project is no longer available in your operational report scope. Choose an available project or ask the owner to review your access.',
          reference,
          [{ id: 'contact_owner' }],
        ),
    404,
  );
}

export const GET: RequestHandler = ({ locals, url, cookies }) => {
  const reference = locals.correlationId || randomUUID();
  if (!locals.user || !locals.session)
    return supplierReportProblemResponse(
      problem(
        'SUPPLIER_REPORT_SIGN_IN_REQUIRED',
        'problem.supplier.reportSignInRequired',
        'Your session ended. Sign in again to download the operational report.',
        reference,
        [{ id: 'sign_in_again' }],
      ),
      401,
    );

  let ctx: ReturnType<typeof openSupplierContext> | undefined;
  let scopeChecked = false;
  let selectedSupplierId: string | undefined;
  try {
    ctx = openSupplierContext(locals);
    assertLiveSession(ctx.sqlite, ctx.principal, AccessDeniedError);
    // Validate supplier scope before returning any report-specific input guidance.
    const projects = ctx.supplier.listProjects(ctx.principal);
    scopeChecked = true;
    const projectId = url.searchParams.get('projectId')?.trim();
    if (!projectId)
      return supplierReportProblemResponse(
        problem(
          'SUPPLIER_REPORT_PROJECT_REQUIRED',
          'problem.supplier.reportProjectRequired',
          'Choose an operational project before downloading this report.',
          reference,
          [{ id: 'choose_operational_project' }],
          {},
          { projectId: ['problem.supplier.reportProjectRequired'] },
        ),
        400,
      );
    if (!projects.some((project) => project.id === projectId))
      return unavailableProjectResponse(ctx, projectId, reference);
    const locale = resolvePortalLocalePreference(
      url.searchParams.get('lang'),
      cookies.get('ja.portal.locale'),
      cookies.get('ja-portal-locale'),
    );
    const c = supplierCopy[locale];
    const period = supplierPeriod(url, reference);
    if (period.periodProblem) return supplierReportProblemResponse(period.periodProblem, 400);
    const supplierId = url.searchParams.get('supplierId') || undefined;
    selectedSupplierId = supplierId;
    if (supplierId && ctx.principal.role === 'owner_admin') {
      const supplierExists = ctx.sqlite
        .prepare('SELECT 1 FROM supplier WHERE id=?')
        .get(supplierId);
      if (!supplierExists)
        return supplierReportProblemResponse(
          problem(
            'SUPPLIER_REPORT_SUPPLIER_UNAVAILABLE',
            'problem.supplier.reportSupplierUnavailable',
            'The selected supplier is no longer available. Choose another supplier or clear the filter.',
            reference,
            [{ id: 'choose_supplier' }],
            {},
            { supplierId: ['problem.supplier.reportSupplierUnavailable'] },
          ),
          404,
        );
    }
    const report = ctx.supplier.operationalReport(ctx.principal, {
      projectId,
      supplierId,
      from: period.from,
      to: period.to,
    });
    const hasIntervals = report.rows.some((row) => row.startTime && row.endTime);
    const body = supplierCsv([
      [
        c.project,
        c.worker,
        c.date,
        c.category,
        ...(hasIntervals ? [c.startTime, c.endTime, c.breakHours, c.breakMinutes] : []),
        c.actualHours,
        c.minutes,
        c.summary,
        c.state,
        c.recordedBy,
      ],
      ...report.rows.map((row) => [
        report.project.name,
        row.workerName,
        row.workDate,
        supplierCategoryLabel(locale, row.category),
        ...(hasIntervals
          ? [
              row.startTime ?? '',
              row.endTime ?? '',
              row.startTime && row.endTime ? supplierHoursFromMinutes(row.breakMinutes ?? 0) : '',
              row.startTime && row.endTime ? (row.breakMinutes ?? 0) : '',
            ]
          : []),
        supplierHoursFromMinutes(row.minutes),
        row.minutes,
        row.summary,
        row.isSuperseded
          ? `${supplierStateLabel(locale, row.state)} (${c.superseded})`
          : supplierStateLabel(locale, row.state),
        row.recordedByName,
      ]),
    ]);
    // Report generation may outlive a grant or project status change. Recheck
    // immediately before returning the CSV so stale rows never leave this route.
    assertLiveSession(ctx.sqlite, ctx.principal, AccessDeniedError);
    if (!ctx.supplier.listProjects(ctx.principal).some((project) => project.id === projectId))
      return unavailableProjectResponse(ctx, projectId, reference);
    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="operational-report-${report.from}-${report.to}.csv"`,
        ...privateHeaders,
      },
    });
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError) {
      let sessionEnded = false;
      if (ctx) {
        try {
          assertLiveSession(ctx.sqlite, ctx.principal, AccessDeniedError);
        } catch (sessionCaught) {
          if (sessionCaught instanceof AccessDeniedError) sessionEnded = true;
          else {
            console.error('Unexpected supplier report session check failure', {
              correlationId: reference,
              caught: sessionCaught,
            });
            return supplierReportProblemResponse(
              problem(
                'SUPPLIER_REPORT_SERVICE_UNAVAILABLE',
                'problem.supplier.reportServiceUnavailable',
                'The operational report could not be prepared. No records were changed. Try again later.',
                reference,
                [{ id: 'retry_supplier_report_download' }],
                { correlationId: reference },
              ),
              503,
            );
          }
        }
      }
      return supplierReportProblemResponse(
        sessionEnded
          ? problem(
              'SUPPLIER_REPORT_SIGN_IN_REQUIRED',
              'problem.supplier.reportSignInRequired',
              'Your session ended. Sign in again to download the operational report.',
              reference,
              [{ id: 'sign_in_again' }],
            )
          : scopeChecked
            ? problem(
                'SUPPLIER_REPORT_PROJECT_SCOPE_CHANGED',
                'problem.supplier.reportProjectScopeChanged',
                'This report is no longer available in your current project scope. Ask the owner to review your access.',
                reference,
                [{ id: 'contact_owner' }],
              )
            : problem(
                'SUPPLIER_REPORT_ROLE_REQUIRED',
                'problem.supplier.reportRoleRequired',
                'Your current account cannot download this operational report. Ask the owner to review your supplier access.',
                reference,
                [{ id: 'contact_owner' }],
              ),
        sessionEnded ? 401 : scopeChecked ? 404 : 403,
      );
    }
    if (
      (caught instanceof ValidationError || caught instanceof V3ValidationError) &&
      selectedSupplierId &&
      ctx?.principal.role === 'owner_admin' &&
      caught.message === 'Supplier not found'
    )
      return supplierReportProblemResponse(
        problem(
          'SUPPLIER_REPORT_SUPPLIER_UNAVAILABLE',
          'problem.supplier.reportSupplierUnavailable',
          'The selected supplier is no longer available. Choose another supplier or clear the filter.',
          reference,
          [{ id: 'choose_supplier' }],
          {},
          { supplierId: ['problem.supplier.reportSupplierUnavailable'] },
        ),
        404,
      );
    if (caught instanceof ValidationError || caught instanceof V3ValidationError)
      return supplierReportProblemResponse(
        problem(
          'SUPPLIER_REPORT_PROJECT_SCOPE_CHANGED',
          'problem.supplier.reportProjectScopeChanged',
          'The selected report inputs are no longer available. Review the current project and filters before downloading again.',
          reference,
          [{ id: 'choose_operational_project' }],
        ),
        409,
      );
    console.error('Unexpected supplier report CSV failure', { correlationId: reference, caught });
    return supplierReportProblemResponse(
      problem(
        'SUPPLIER_REPORT_SERVICE_UNAVAILABLE',
        'problem.supplier.reportServiceUnavailable',
        'The operational report could not be generated. No records were changed. Check the report page before trying again.',
        reference,
        [{ id: 'retry_supplier_report_download' }],
        { correlationId: reference },
      ),
      503,
    );
  } finally {
    try {
      ctx?.sqlite.close();
    } catch (caught) {
      // A connection cleanup failure must not turn a private typed response into a raw 500.
      console.error('Supplier report context close failed', { correlationId: reference, caught });
    }
  }
};
