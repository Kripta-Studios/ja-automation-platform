import { formatMinorPlain, isCurrency } from '@ja/billing-engine';
import { toCsv } from '@ja/reporting';
import {
  agingBuckets,
  agingLabels,
  collectionText,
  type CollectionRow,
} from '$lib/portal/collections-analysis';
import {
  customerBalances,
  collectionForecast,
  collectionPriorities,
  forecastBuckets,
  forecastLabels,
} from '$lib/portal/collections-workbench';

export const collectionReports = ['customers', 'forecast', 'priorities'] as const;
export type CollectionReport = (typeof collectionReports)[number];

/** Exact major-unit display using each ledger currency's own minor units (JPY has none). */
function currencyAmount(minor: bigint, currency: string): string {
  if (isCurrency(currency)) return formatMinorPlain(minor, currency);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function collectionsWorkbenchCsv(
  rows: readonly CollectionRow[],
  asOf: string,
  report: CollectionReport,
): Uint8Array {
  let records: Record<string, string | number>[];
  let headers: string[];
  if (report === 'customers') {
    headers = [
      'balanceAsOf',
      'clientId',
      'clientNumber',
      'clientName',
      'currency',
      'openDocuments',
      'grossReceivablesMinor',
      'creditBalancesMinor',
      'netOutstandingMinor',
      'overdueMinor',
      'oldestDaysOverdue',
      ...agingBuckets.map((bucket) => `${bucket}Minor`),
      'Gross receivables (currency units)',
      'Credit balances (currency units)',
      'Net outstanding (currency units)',
      'Overdue (currency units)',
      ...agingBuckets.map((bucket) => `${agingLabels[bucket]} (currency units)`),
    ];
    records = customerBalances(rows, asOf).map((row) => ({
      balanceAsOf: asOf,
      clientId: row.clientId,
      clientNumber: row.clientNumber,
      clientName: row.clientName,
      currency: row.currency,
      openDocuments: row.openDocuments,
      'Gross receivables (currency units)': currencyAmount(row.outstanding, row.currency),
      grossReceivablesMinor: row.outstanding.toString(),
      'Credit balances (currency units)': currencyAmount(row.credits, row.currency),
      creditBalancesMinor: row.credits.toString(),
      'Net outstanding (currency units)': currencyAmount(row.netOutstanding, row.currency),
      netOutstandingMinor: row.netOutstanding.toString(),
      'Overdue (currency units)': currencyAmount(row.overdue, row.currency),
      overdueMinor: row.overdue.toString(),
      oldestDaysOverdue: row.oldestDaysOverdue,
      ...Object.fromEntries(
        agingBuckets.map((bucket) => [
          `${agingLabels[bucket]} (currency units)`,
          currencyAmount(row.buckets[bucket], row.currency),
        ]),
      ),
      ...Object.fromEntries(
        agingBuckets.map((bucket) => [`${bucket}Minor`, row.buckets[bucket].toString()]),
      ),
    }));
  } else if (report === 'forecast') {
    headers = [
      'balanceAsOf',
      'currency',
      'grossReceivablesMinor',
      'explicitCollectionDateMinor',
      'dueDateFallbackMinor',
      ...forecastBuckets.map((bucket) => `${bucket}Minor`),
      'Gross receivables (currency units)',
      'Explicit collection date (currency units)',
      'Due date fallback (currency units)',
      ...forecastBuckets.map((bucket) => `${forecastLabels[bucket]} (currency units)`),
    ];
    records = collectionForecast(rows, asOf).map((row) => ({
      balanceAsOf: asOf,
      currency: row.currency,
      'Gross receivables (currency units)': currencyAmount(row.total, row.currency),
      grossReceivablesMinor: row.total.toString(),
      'Explicit collection date (currency units)': currencyAmount(row.explicit, row.currency),
      explicitCollectionDateMinor: row.explicit.toString(),
      'Due date fallback (currency units)': currencyAmount(row.dueFallback, row.currency),
      dueDateFallbackMinor: row.dueFallback.toString(),
      ...Object.fromEntries(
        forecastBuckets.map((bucket) => [
          `${forecastLabels[bucket]} (currency units)`,
          currencyAmount(row.buckets[bucket], row.currency),
        ]),
      ),
      ...Object.fromEntries(
        forecastBuckets.map((bucket) => [`${bucket}Minor`, row.buckets[bucket].toString()]),
      ),
    }));
  } else {
    headers = [
      'balanceAsOf',
      'invoiceId',
      'invoiceNumber',
      'clientName',
      'projectName',
      'currency',
      'outstandingMinor',
      'dueDate',
      'expectedCollectionDate',
      'daysOverdue',
      'reason',
      'Outstanding (currency units)',
    ];
    records = collectionPriorities(rows, asOf).map((row) => ({
      ...Object.fromEntries(headers.map((key) => [key, collectionText(row, key)])),
      'Outstanding (currency units)': /^-?\d+$/u.test(collectionText(row, 'outstandingMinor'))
        ? currencyAmount(
            BigInt(collectionText(row, 'outstandingMinor')),
            collectionText(row, 'currency'),
          )
        : '',
    }));
  }
  return new TextEncoder().encode(
    toCsv(records, headers, {
      numericColumns: headers.filter((header) => header.endsWith('(currency units)')),
    }),
  );
}
