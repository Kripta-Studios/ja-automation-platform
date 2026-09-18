import { toCsv } from '@ja/reporting';
import { agingBuckets, collectionText, type CollectionRow } from '$lib/portal/collections-analysis';
import {
  customerBalances,
  collectionForecast,
  collectionPriorities,
  forecastBuckets,
} from '$lib/portal/collections-workbench';

export const collectionReports = ['customers', 'forecast', 'priorities'] as const;
export type CollectionReport = (typeof collectionReports)[number];

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
    ];
    records = customerBalances(rows, asOf).map((row) => ({
      balanceAsOf: asOf,
      clientId: row.clientId,
      clientNumber: row.clientNumber,
      clientName: row.clientName,
      currency: row.currency,
      openDocuments: row.openDocuments,
      grossReceivablesMinor: row.outstanding.toString(),
      creditBalancesMinor: row.credits.toString(),
      netOutstandingMinor: row.netOutstanding.toString(),
      overdueMinor: row.overdue.toString(),
      oldestDaysOverdue: row.oldestDaysOverdue,
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
    ];
    records = collectionForecast(rows, asOf).map((row) => ({
      balanceAsOf: asOf,
      currency: row.currency,
      grossReceivablesMinor: row.total.toString(),
      explicitCollectionDateMinor: row.explicit.toString(),
      dueDateFallbackMinor: row.dueFallback.toString(),
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
    ];
    records = collectionPriorities(rows, asOf).map((row) =>
      Object.fromEntries(headers.map((key) => [key, collectionText(row, key)])),
    );
  }
  return new TextEncoder().encode(toCsv(records, headers));
}
