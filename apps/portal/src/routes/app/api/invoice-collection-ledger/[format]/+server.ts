import { error, type RequestHandler } from '@sveltejs/kit';
import {
  invoiceCollectionLedgerCsv,
  invoiceCollectionLedgerXlsx,
  type InvoiceCollectionLedgerRow,
} from '@ja/reporting';
import { openPortalRepository } from '$lib/server/portal-repository';
import { optionalExportPeriod } from '$lib/server/report-export-request';
import { sensitiveExportResponse } from '$lib/server/sensitive-export-response';
import { agingBuckets, collectionAging, collectionMatches } from '$lib/portal/collections-analysis';
import {
  collectionReports,
  collectionsWorkbenchCsv,
  type CollectionReport,
} from '$lib/server/collections-workbench-export';

const financeRoles = new Set(['owner_admin', 'finance_admin']);

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
    const client = url.searchParams.get('client')?.trim() ?? '';
    const report = url.searchParams.get('report')?.trim() ?? '';
    const status = url.searchParams.get('status')?.trim() ?? '';
    const query = url.searchParams.get('q')?.trim() ?? '';
    const currency = url.searchParams.get('currency')?.trim() ?? '';
    const aging = url.searchParams.get('aging')?.trim() ?? '';
    if (
      ['project', 'client', 'report', 'status', 'q', 'currency', 'aging'].some(
        (key) => url.searchParams.getAll(key).length > 1,
      ) ||
      project.length > 100 ||
      client.length > 100 ||
      status.length > 80 ||
      query.length > 200
    )
      error(400, 'Invalid ledger filter');
    if (report && (!(collectionReports as readonly string[]).includes(report) || format !== 'csv'))
      error(400, 'Invalid collection report');
    if (currency && !['USD', 'EUR', 'BRL'].includes(currency))
      error(400, 'Invalid ledger currency');
    if (aging && !(agingBuckets as readonly string[]).includes(aging))
      error(400, 'Invalid aging bucket');
    // Without an explicit historical period, export current balances exactly as the register does.
    // Legacy explicit period exports retain their original point-in-time collection cutoff.
    const asOf = period?.periodEnd ?? new Date().toISOString().slice(0, 10);
    const ledger = authorizedLedger
      .filter((row) =>
        collectionMatches(row, { project, client, status, query, currency, aging }, asOf),
      )
      .map((row) => ({ ...row, ...collectionAging(row, asOf) }));
    const bytes = report
      ? collectionsWorkbenchCsv(ledger, asOf, report as CollectionReport)
      : format === 'xlsx'
        ? invoiceCollectionLedgerXlsx(ledger)
        : invoiceCollectionLedgerCsv(ledger);
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
      filename: report
        ? `ja-collections-${report}-${period?.periodStart ?? 'all'}-${asOf}.csv`
        : filename,
      bytes,
      periodStart: period?.periodStart ?? 'all',
      periodEnd: period?.periodEnd ?? 'all',
    });
  } finally {
    context.sqlite.close();
  }
};
