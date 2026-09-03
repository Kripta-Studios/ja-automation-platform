import { error, type RequestHandler } from '@sveltejs/kit';
import { V3AccessDeniedError } from '@ja/database';
import {
  invoiceCollectionLedgerCsv,
  invoiceCollectionLedgerXlsx,
  type InvoiceCollectionLedgerRow,
} from '@ja/reporting';
import { assertRecentStepUp } from '$lib/server/private-artifact-access';
import { openPortalRepository } from '$lib/server/portal-repository';
import { optionalExportPeriod } from '$lib/server/report-export-request';
import { sensitiveExportResponse } from '$lib/server/sensitive-export-response';

const financeRoles = new Set(['owner_admin', 'finance_admin']);

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  if (!financeRoles.has(String(locals.user.role ?? ''))) error(403, 'Finance role required');
  const format = params.format;
  if (format !== 'csv' && format !== 'xlsx') error(404, 'Export format not found');
  const period = optionalExportPeriod(url);
  const context = openPortalRepository(locals);
  try {
    try {
      assertRecentStepUp(context.sqlite, context.principal);
    } catch (cause) {
      if (cause instanceof V3AccessDeniedError) error(403, cause.message);
      throw cause;
    }
    // masterLedger is the accepted exact-money/reversal-aware query contract;
    // it independently re-checks Finance/Owner authorization on this request.
    // The on-screen ledger is unfiltered; only apply an issue-date window when
    // the caller supplied one. Do not treat invoice billing weeks as issued-at.
    const ledger = context.v3.masterLedger(
      context.principal,
      period ? { start: period.periodStart, end: period.periodEnd } : {},
    ) as unknown as readonly InvoiceCollectionLedgerRow[];
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
