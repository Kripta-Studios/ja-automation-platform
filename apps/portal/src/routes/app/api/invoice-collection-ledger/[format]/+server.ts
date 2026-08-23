import { error, type RequestHandler } from '@sveltejs/kit';
import {
  invoiceCollectionLedgerCsv,
  invoiceCollectionLedgerXlsx,
  type InvoiceCollectionLedgerRow,
} from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import { requiredExportPeriod } from '$lib/server/report-export-request';
import { sensitiveExportResponse } from '$lib/server/sensitive-export-response';

const financeRoles = new Set(['owner_admin', 'finance_admin']);

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  if (!financeRoles.has(String(locals.user.role ?? ''))) error(403, 'Finance role required');
  const format = params.format;
  if (format !== 'csv' && format !== 'xlsx') error(404, 'Export format not found');
  const { periodStart, periodEnd } = requiredExportPeriod(url);
  const context = openPortalRepository(locals);
  try {
    // masterLedger is the accepted exact-money/reversal-aware query contract;
    // it independently re-checks Finance/Owner authorization on this request.
    const ledger = context.v3.masterLedger(context.principal, {
      start: periodStart,
      end: periodEnd,
    }) as unknown as readonly InvoiceCollectionLedgerRow[];
    const bytes =
      format === 'xlsx' ? invoiceCollectionLedgerXlsx(ledger) : invoiceCollectionLedgerCsv(ledger);
    const filename = `ja-invoice-collection-ledger-${periodStart}-${periodEnd}.${format}`;
    return sensitiveExportResponse({
      sqlite: context.sqlite,
      principal: context.principal,
      auditEntityType: 'invoice',
      auditEntityId: `invoice-collection-ledger:${periodStart}:${periodEnd}`,
      exportKind: 'invoice_collection_ledger',
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
