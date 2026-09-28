import { randomUUID } from 'node:crypto';
import type { RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, V3AccessDeniedError, assertLiveSession } from '@ja/database';
import {
  invoiceCollectionLedgerCsv,
  invoiceCollectionLedgerXlsx,
  type InvoiceCollectionLedgerRow,
} from '@ja/reporting';
import type { ProblemData } from '$lib/problem/contract';
import { openPortalRepository } from '$lib/server/portal-repository';
import { isRealIsoDate } from '$lib/server/iso-date';
import { sensitiveExportResponse } from '$lib/server/sensitive-export-response';
import { agingBuckets, collectionAging, collectionMatches } from '$lib/portal/collections-analysis';
import {
  collectionReports,
  collectionsWorkbenchCsv,
  type CollectionReport,
} from '$lib/server/collections-workbench-export';

const financeRoles = new Set(['owner_admin', 'finance_admin']);
const definitions = {
  signInRequired: [
    'SIGN_IN_REQUIRED',
    401,
    'Sign in before downloading the ledger.',
    'sign_in_again',
  ],
  sessionExpired: [
    'SESSION_EXPIRED',
    401,
    'Your session ended. Sign in again before downloading.',
    'sign_in_again',
  ],
  accountDisabled: [
    'ACCOUNT_DISABLED',
    403,
    'Your account is no longer active. Contact the owner for access.',
    'contact_owner',
  ],
  accessDenied: [
    'ACCESS_DENIED',
    403,
    'Only an owner or Finance administrator can download this ledger. Contact an owner to review access.',
    'contact_owner',
  ],
  formatInvalid: [
    'FORMAT_INVALID',
    400,
    'Choose CSV or XLSX for the ledger download.',
    'review_ledger_filters',
  ],
  periodIncomplete: [
    'PERIOD_INCOMPLETE',
    400,
    'Enter both period dates, or remove both to export all dates.',
    'review_ledger_filters',
  ],
  periodDateInvalid: [
    'PERIOD_DATE_INVALID',
    400,
    'Enter real calendar dates for the export period.',
    'review_ledger_filters',
  ],
  periodRangeReversed: [
    'PERIOD_RANGE_REVERSED',
    400,
    'The period end is before the start. Choose an end date on or after the start.',
    'review_ledger_filters',
  ],
  filterDuplicate: [
    'FILTER_DUPLICATE',
    400,
    'A download filter was supplied more than once. Keep one value per filter.',
    'review_ledger_filters',
  ],
  filterTooLong: [
    'FILTER_TOO_LONG',
    400,
    'A ledger filter is too long. Shorten the highlighted field and retry.',
    'review_ledger_filters',
  ],
  reportInvalid: [
    'REPORT_INVALID',
    400,
    'Choose a listed collection report.',
    'review_ledger_filters',
  ],
  reportCsvOnly: [
    'REPORT_CSV_ONLY',
    400,
    'Collection workbench reports can be downloaded as CSV only.',
    'review_ledger_filters',
  ],
  currencyInvalid: [
    'CURRENCY_INVALID',
    400,
    'Choose USD, EUR, or BRL for the currency filter.',
    'review_ledger_filters',
  ],
  agingInvalid: [
    'AGING_INVALID',
    400,
    'Choose a listed receivable aging bucket.',
    'review_ledger_filters',
  ],
  unavailable: [
    'UNAVAILABLE',
    503,
    'We could not prepare the ledger download. No ledger record was changed; retry. Reference: {correlationId}.',
    'retry_ledger_export',
  ],
} as const;

type ProblemName = keyof typeof definitions;
const filterLimits = {
  periodStart: 10,
  periodEnd: 10,
  project: 100,
  client: 100,
  report: 100,
  status: 80,
  q: 200,
  currency: 12,
  aging: 80,
} as const;

function problemResponse(
  name: ProblemName,
  correlationId?: string,
  fieldErrors: ProblemData['fieldErrors'] = {},
): Response {
  const [suffix, status, message, remedy] = definitions[name];
  const reference = correlationId || randomUUID();
  const problem: ProblemData = {
    code: `COLLECTION_LEDGER_EXPORT_${suffix}`,
    messageKey: `problem.collectionsLedgerExport.${name}`,
    message: message.replace('{correlationId}', reference),
    params: name === 'unavailable' ? { correlationId: reference } : {},
    fieldErrors,
    remedies: [{ id: remedy }],
    correlationId: reference,
  };
  return new Response(JSON.stringify({ success: false, ...problem }), {
    status,
    headers: {
      'content-type': 'application/problem+json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session)
    return problemResponse('signInRequired', locals.correlationId);

  let context: ReturnType<typeof openPortalRepository> | null = null;
  try {
    context = openPortalRepository(locals);
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    if (!financeRoles.has(context.principal.role))
      return problemResponse('accessDenied', locals.correlationId);

    const format = params.format;
    if (format !== 'csv' && format !== 'xlsx')
      return problemResponse('formatInvalid', locals.correlationId, {
        format: ['problem.collectionsLedgerExport.formatInvalid'],
      });

    const duplicateFields = Object.keys(filterLimits).filter(
      (field) => url.searchParams.getAll(field).length > 1,
    );
    if (duplicateFields.length)
      return problemResponse(
        'filterDuplicate',
        locals.correlationId,
        Object.fromEntries(
          duplicateFields.map((field) => [
            field,
            ['problem.collectionsLedgerExport.filterDuplicate'],
          ]),
        ),
      );

    const raw = Object.fromEntries(
      Object.keys(filterLimits).map((field) => [field, url.searchParams.get(field) ?? '']),
    );
    const fieldErrors: Record<string, string[]> = {};
    let primary: ProblemName | null = null;
    function invalid(field: string, issue: ProblemName): void {
      fieldErrors[field] ??= [`problem.collectionsLedgerExport.${issue}`];
      primary ??= issue;
    }

    for (const [field, maxLength] of Object.entries(filterLimits)) {
      if (raw[field]!.length > maxLength) invalid(field, 'filterTooLong');
    }
    const periodStart = raw.periodStart!;
    const periodEnd = raw.periodEnd!;
    const hasPeriod = Boolean(periodStart || periodEnd);
    if (hasPeriod && (!periodStart || !periodEnd)) {
      if (!periodStart) invalid('periodStart', 'periodIncomplete');
      if (!periodEnd) invalid('periodEnd', 'periodIncomplete');
    } else if (hasPeriod) {
      if (!isRealIsoDate(periodStart)) invalid('periodStart', 'periodDateInvalid');
      if (!isRealIsoDate(periodEnd)) invalid('periodEnd', 'periodDateInvalid');
      if (isRealIsoDate(periodStart) && isRealIsoDate(periodEnd) && periodStart > periodEnd)
        invalid('periodEnd', 'periodRangeReversed');
    }
    const report = raw.report!.trim();
    const currency = raw.currency!.trim();
    const aging = raw.aging!.trim();
    if (report && !(collectionReports as readonly string[]).includes(report))
      invalid('report', 'reportInvalid');
    if (report && format !== 'csv') invalid('report', 'reportCsvOnly');
    if (currency && !['USD', 'EUR', 'BRL'].includes(currency))
      invalid('currency', 'currencyInvalid');
    if (aging && !(agingBuckets as readonly string[]).includes(aging))
      invalid('aging', 'agingInvalid');
    if (primary) return problemResponse(primary, locals.correlationId, fieldErrors);

    // No ledger query, rendering, or audit runs for invalid filters.
    const period = hasPeriod ? { periodStart, periodEnd } : null;
    const authorizedLedger = context.v3.masterLedger(
      context.principal,
      period ? { start: period.periodStart, end: period.periodEnd } : {},
    ) as unknown as readonly InvoiceCollectionLedgerRow[];
    const project = raw.project!.trim();
    const client = raw.client!.trim();
    const status = raw.status!.trim();
    const query = raw.q!.trim();
    // Without a historical period, current balances match the on-screen register.
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
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError) {
      if (caught.message === 'Live authenticated session required')
        return problemResponse('sessionExpired', locals.correlationId);
      if (caught.message === 'Active account required')
        return problemResponse('accountDisabled', locals.correlationId);
      return problemResponse('accessDenied', locals.correlationId);
    }
    const reference = locals.correlationId || randomUUID();
    console.error('Unexpected collection ledger export failure', {
      correlationId: reference,
      cause: caught,
    });
    return problemResponse('unavailable', reference);
  } finally {
    context?.sqlite.close();
  }
};
