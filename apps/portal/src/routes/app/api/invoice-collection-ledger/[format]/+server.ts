import { error, type RequestHandler } from '@sveltejs/kit';
import {
  invoiceCollectionLedgerCsv,
  invoiceCollectionLedgerXlsx,
  type InvoiceCollectionLedgerRow,
} from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import { optionalExportPeriod } from '$lib/server/report-export-request';
import { sensitiveExportResponse } from '$lib/server/sensitive-export-response';

const financeRoles = new Set(['owner_admin', 'finance_admin']);

function normalized(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  if (!financeRoles.has(String(locals.user.role ?? ''))) error(403, 'Finance role required');
  const format = params.format;
  if (format !== 'csv' && format !== 'xlsx') error(404, 'Export format not found');
  const period = optionalExportPeriod(url);
  const context = openPortalRepository(locals);
  try {
    // masterLedger is the accepted exact-money/reversal-aware query contract;
    // it independently re-checks Finance/Owner authorization on this request.
    // Keep the export scope aligned with the authorized on-screen register.
    // Do not treat invoice billing weeks as issued-at.
    const authorizedLedger = context.v3.masterLedger(
      context.principal,
      period ? { start: period.periodStart, end: period.periodEnd } : {},
    ) as unknown as readonly InvoiceCollectionLedgerRow[];
    const project = url.searchParams.get('project')?.trim() ?? '';
    const status = url.searchParams.get('status')?.trim() ?? '';
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (project.length > 100 || status.length > 80 || query.length > 200)
      error(400, 'Invalid ledger filter');
    const ledger = authorizedLedger.filter((row) => {
      const record = row as unknown as Record<string, unknown>;
      const matchesProject =
        !project || String(record.projectId ?? record.project_id ?? '') === project;
      const recordStatus = String(record.paymentStatus ?? record.payment_status ?? '');
      const matchesStatus =
        !status ||
        (status === 'collected'
          ? ['paid', 'partially_paid'].includes(recordStatus)
          : status === 'outstanding'
            ? ['unpaid', 'partially_paid', 'overdue'].includes(recordStatus)
            : recordStatus === status);
      const searchable = normalized(
        [
          record.invoiceNumber ?? record.invoice_number ?? record.invoiceId,
          record.clientNumber ?? record.client_number,
          record.clientName ?? record.client_name,
          record.projectNumber ?? record.project_number,
          record.projectName ?? record.project_name,
          record.streamType ?? record.stream_type,
        ].join(' '),
      );
      return matchesProject && matchesStatus && (!query || searchable.includes(normalized(query)));
    });
    const bytes =
      format === 'xlsx' ? invoiceCollectionLedgerXlsx(ledger) : invoiceCollectionLedgerCsv(ledger);
    const filename = period
      ? `ja-invoice-collection-ledger-${period.periodStart}-${period.periodEnd}.${format}`
      : `ja-invoice-collection-ledger-all.${format}`;
    return sensitiveExportResponse({
      sqlite: context.sqlite,
      principal: context.principal,
      auditEntityType: 'invoice',
      auditEntityId: `invoice-collection-ledger:${period?.periodStart ?? 'all'}:${period?.periodEnd ?? 'all'}`,
      exportKind: 'invoice_collection_ledger',
      format,
      filename,
      bytes,
      periodStart: period?.periodStart ?? 'all',
      periodEnd: period?.periodEnd ?? 'all',
    });
  } finally {
    context.sqlite.close();
  }
};
