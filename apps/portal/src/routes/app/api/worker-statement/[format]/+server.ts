import { error, type RequestHandler } from '@sveltejs/kit';
import {
  workerStatementCsv,
  workerStatementPdf,
  type WorkerStatementSnapshot,
} from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import { requiredExportPeriod, semanticFilenamePart } from '$lib/server/report-export-request';
import { sensitiveExportResponse } from '$lib/server/sensitive-export-response';

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  if (locals.user.role !== 'worker') error(403, 'Worker role required');
  const format = params.format;
  if (format !== 'pdf' && format !== 'csv') error(404, 'Export format not found');
  const { periodStart, periodEnd } = requiredExportPeriod(url);
  const context = openPortalRepository(locals);
  try {
    // These repository calls re-check active identity and self-scope on every
    // request. No worker ID is accepted from the URL or query string.
    const pay = context.v3.workerPay(context.principal, periodStart, periodEnd);
    const settlements = context.v3.listCompensationSettlements(
      context.principal,
      periodStart,
      periodEnd,
    );
    const expenses = context.repository.listWorkerStatementExpenses(
      context.principal,
      periodStart,
      periodEnd,
    );
    const snapshot: WorkerStatementSnapshot = {
      worker: { id: context.principal.userId, name: locals.user.name },
      periodStart,
      periodEnd,
      currency: String(pay.currency),
      approvedMinutes: pay.approvedMinutes,
      pendingMinutes: pay.pendingMinutes,
      estimatedApprovedMinor: pay.estimatedApprovedMinor,
      estimatedPendingMinor: pay.estimatedPendingMinor,
      approvedReimbursementMinor: pay.approvedReimbursementMinor,
      pendingReimbursementMinor: pay.pendingReimbursementMinor,
      missingCompensationRules: pay.missingCompensationRules,
      settlements: settlements.map((row) => ({
        id: String(row.id),
        projectNumber: String(row.projectNumber),
        projectName: String(row.projectName),
        periodStart: String(row.periodStart),
        periodEnd: String(row.periodEnd),
        amountMinor: String(row.amountMinor),
        currency: String(row.currency),
        state: String(row.state),
        settledAt: row.settledAt === null ? null : String(row.settledAt),
      })),
      expenses,
    };
    const bytes = format === 'pdf' ? workerStatementPdf(snapshot) : workerStatementCsv(snapshot);
    const worker = semanticFilenamePart(locals.user.name, 'worker');
    const filename = `ja-worker-statement-${worker}-${periodStart}-${periodEnd}.${format}`;
    return sensitiveExportResponse({
      sqlite: context.sqlite,
      principal: context.principal,
      auditEntityType: 'document',
      auditEntityId: `worker-statement:${context.principal.userId}:${periodStart}:${periodEnd}`,
      exportKind: 'worker_compensation_statement',
      format,
      filename,
      bytes,
      periodStart,
      periodEnd,
    });
  } finally {
    context.sqlite.close();
  }
};
