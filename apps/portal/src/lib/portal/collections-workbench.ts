import {
  calendarDay,
  collectionAging,
  collectionSummaries,
  collectionText as text,
  type CollectionRow,
} from './collections-analysis';

export const forecastBuckets = [
  'past',
  'next_7',
  'next_30',
  'next_60',
  'next_90',
  'later',
  'undated',
] as const;
export const forecastLabels = {
  past: 'Collection date passed',
  next_7: 'Today through 7 days',
  next_30: '8–30 days ahead',
  next_60: '31–60 days ahead',
  next_90: '61–90 days ahead',
  later: 'Beyond 90 days',
  undated: 'Collection date missing',
};

/** Internal portfolio summary, not a customer statement or an allocation of credits. */
export function customerBalances(rows: readonly CollectionRow[], asOf: string) {
  const groups = new Map<string, CollectionRow[]>();
  for (const row of rows) {
    const aging = collectionAging(row, asOf);
    if (['excluded', 'settled'].includes(aging.agingBucket)) continue;
    const clientId = text(row, 'clientId', 'client_id');
    // Never merge unrelated customers merely because their names happen to match.
    const key = JSON.stringify([
      clientId || text(row, 'clientNumber', 'client_number') || text(row, 'invoiceId'),
      text(row, 'currency'),
    ]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([id, group]) => {
      const first = group[0]!;
      const summary = collectionSummaries(group, asOf)[0]!;
      return {
        id,
        clientId: text(first, 'clientId', 'client_id'),
        clientNumber: text(first, 'clientNumber', 'client_number'),
        clientName: text(first, 'clientName', 'client_name'),
        ...summary,
        openDocuments: group.length,
        oldestDaysOverdue: Math.max(
          0,
          ...group.map((row) => collectionAging(row, asOf).daysOverdue ?? 0),
        ),
      };
    })
    .sort(
      (a, b) =>
        a.currency.localeCompare(b.currency) ||
        b.oldestDaysOverdue - a.oldestDaysOverdue ||
        a.clientNumber.localeCompare(b.clientNumber),
    );
}

/** Scheduled remaining receivables only. No bank balance or predicted probability is implied. */
export function collectionForecast(rows: readonly CollectionRow[], asOf: string) {
  const today = calendarDay(asOf);
  if (today === null) throw new Error('Invalid ledger reference date');
  const groups = new Map<
    string,
    {
      currency: string;
      total: bigint;
      explicit: bigint;
      dueFallback: bigint;
      buckets: Record<(typeof forecastBuckets)[number], bigint>;
    }
  >();
  for (const row of rows) {
    const aging = collectionAging(row, asOf);
    if (['excluded', 'settled', 'credit'].includes(aging.agingBucket)) continue;
    const currency = text(row, 'currency');
    if (!currency) throw new Error('Missing ledger currency');
    const group = groups.get(currency) ?? {
      currency,
      total: 0n,
      explicit: 0n,
      dueFallback: 0n,
      buckets: {
        past: 0n,
        next_7: 0n,
        next_30: 0n,
        next_60: 0n,
        next_90: 0n,
        later: 0n,
        undated: 0n,
      },
    };
    const expected = calendarDay(text(row, 'expectedCollectionDate', 'expected_collection_on'));
    const due = calendarDay(text(row, 'dueDate', 'due_date'));
    const day = expected ?? due;
    const days = day === null ? null : day - today;
    const bucket =
      days === null
        ? 'undated'
        : days < 0
          ? 'past'
          : days <= 7
            ? 'next_7'
            : days <= 30
              ? 'next_30'
              : days <= 60
                ? 'next_60'
                : days <= 90
                  ? 'next_90'
                  : 'later';
    const amount = BigInt(text(row, 'outstandingMinor', 'outstanding_minor'));
    group.total += amount;
    group.buckets[bucket] += amount;
    if (expected !== null) group.explicit += amount;
    else if (due !== null) group.dueFallback += amount;
    groups.set(currency, group);
  }
  return [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function collectionPriorities(rows: readonly CollectionRow[], asOf: string) {
  return rows
    .flatMap((row) => {
      const aging = collectionAging(row, asOf);
      if (['excluded', 'settled', 'credit'].includes(aging.agingBucket)) return [];
      const expected = calendarDay(text(row, 'expectedCollectionDate', 'expected_collection_on'));
      const today = calendarDay(asOf)!;
      const reason =
        (aging.daysOverdue ?? 0) > 0
          ? 'Overdue invoice'
          : expected !== null && expected < today
            ? 'Collection date passed'
            : aging.agingBucket === 'undated'
              ? 'No due date'
              : '';
      return reason
        ? [{ ...row, reason, daysOverdue: aging.daysOverdue, balanceAsOf: aging.balanceAsOf }]
        : [];
    })
    .sort(
      (a, b) =>
        text(a, 'currency').localeCompare(text(b, 'currency')) ||
        (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0) ||
        text(a, 'invoiceNumber', 'invoiceId').localeCompare(text(b, 'invoiceNumber', 'invoiceId')),
    );
}
