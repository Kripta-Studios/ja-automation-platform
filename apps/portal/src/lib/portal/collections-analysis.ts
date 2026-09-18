/** Shared by the register and its authorized export; all money stays in integer minor units. */
export type CollectionRow = Readonly<Record<string, unknown>>;
export const agingBuckets = [
  'current',
  '1_30',
  '31_60',
  '61_90',
  'over_90',
  'undated',
  'credit',
] as const;
export type AgingBucket = (typeof agingBuckets)[number] | 'settled' | 'excluded';
export const agingLabels: Record<AgingBucket, string> = {
  current: 'Not yet overdue',
  '1_30': '1–30 days overdue',
  '31_60': '31–60 days overdue',
  '61_90': '61–90 days overdue',
  over_90: 'Over 90 days overdue',
  undated: 'No due date',
  credit: 'Credit balances',
  settled: 'No outstanding balance',
  excluded: 'Void invoice',
};

export function collectionText(row: CollectionRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && typeof value !== 'object' && String(value).trim())
      return String(value).trim();
  }
  return '';
}

function minor(row: CollectionRow, ...keys: string[]): bigint {
  const value = collectionText(row, ...keys);
  if (!/^-?\d+$/u.test(value)) throw new Error('Invalid ledger amount');
  return BigInt(value);
}

function calendarDay(raw: string): number | null {
  const date = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date)
    return null;
  return timestamp / 86_400_000;
}

export function collectionAging(
  row: CollectionRow,
  asOf: string,
): {
  agingBucket: AgingBucket;
  daysOverdue: number | null;
  balanceAsOf: string;
} {
  const today = calendarDay(asOf);
  if (today === null) throw new Error('Invalid ledger reference date');
  const state = collectionText(row, 'paymentStatus', 'payment_status');
  const balanceAsOf = asOf.slice(0, 10);
  if (state === 'void') return { agingBucket: 'excluded', daysOverdue: null, balanceAsOf };
  const balance = minor(row, 'outstandingMinor', 'outstanding_minor');
  if (balance < 0n) return { agingBucket: 'credit', daysOverdue: null, balanceAsOf };
  if (balance === 0n) return { agingBucket: 'settled', daysOverdue: 0, balanceAsOf };
  const due = calendarDay(collectionText(row, 'dueDate', 'due_date'));
  if (due === null) return { agingBucket: 'undated', daysOverdue: null, balanceAsOf };
  const daysOverdue = Math.max(0, today - due);
  const agingBucket: AgingBucket =
    daysOverdue === 0
      ? 'current'
      : daysOverdue <= 30
        ? '1_30'
        : daysOverdue <= 60
          ? '31_60'
          : daysOverdue <= 90
            ? '61_90'
            : 'over_90';
  return { agingBucket, daysOverdue, balanceAsOf };
}

export type CollectionFilters = {
  project?: string;
  status?: string;
  query?: string;
  currency?: string;
  aging?: string;
};
const normalized = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase();

export function collectionMatches(
  row: CollectionRow,
  filters: CollectionFilters,
  asOf: string,
): boolean {
  if (filters.project && collectionText(row, 'projectId', 'project_id') !== filters.project)
    return false;
  if (filters.currency && collectionText(row, 'currency') !== filters.currency) return false;
  const state = collectionText(row, 'paymentStatus', 'payment_status');
  const aging = collectionAging(row, asOf);
  if (filters.aging && aging.agingBucket !== filters.aging) return false;
  if (filters.status) {
    const matches =
      filters.status === 'overdue'
        ? (aging.daysOverdue ?? 0) > 0
        : filters.status === 'outstanding'
          ? aging.agingBucket !== 'settled' && aging.agingBucket !== 'excluded'
          : filters.status === 'collected'
            ? state !== 'void' &&
              minor(row, 'collectedMinor', 'collected_minor', 'netCollectedMinor') > 0n
            : state === filters.status;
    if (!matches) return false;
  }
  const search = [
    collectionText(row, 'invoiceNumber', 'invoice_number', 'invoiceId'),
    collectionText(row, 'clientNumber', 'client_number'),
    collectionText(row, 'clientName', 'client_name'),
    collectionText(row, 'projectNumber', 'project_number'),
    collectionText(row, 'projectName', 'project_name'),
    collectionText(row, 'streamType', 'stream_type'),
    collectionText(row, 'poNumber', 'po_number'),
  ].join(' ');
  return !filters.query?.trim() || normalized(search).includes(normalized(filters.query.trim()));
}

export function collectionSummaries(rows: readonly CollectionRow[], asOf: string) {
  const currencies = new Map<
    string,
    {
      currency: string;
      outstanding: bigint;
      credits: bigint;
      netOutstanding: bigint;
      overdue: bigint;
      buckets: Record<(typeof agingBuckets)[number], bigint>;
    }
  >();
  for (const row of rows) {
    const currency = collectionText(row, 'currency');
    if (!currency) throw new Error('Missing ledger currency');
    const summary = currencies.get(currency) ?? {
      currency,
      outstanding: 0n,
      credits: 0n,
      netOutstanding: 0n,
      overdue: 0n,
      buckets: {
        current: 0n,
        '1_30': 0n,
        '31_60': 0n,
        '61_90': 0n,
        over_90: 0n,
        undated: 0n,
        credit: 0n,
      },
    };
    const aging = collectionAging(row, asOf);
    if (aging.agingBucket !== 'excluded' && aging.agingBucket !== 'settled') {
      const balance = minor(row, 'outstandingMinor', 'outstanding_minor');
      summary.netOutstanding += balance;
      if (aging.agingBucket === 'credit') summary.credits += balance;
      else summary.outstanding += balance;
      summary.buckets[aging.agingBucket] += balance;
      if ((aging.daysOverdue ?? 0) > 0) summary.overdue += balance;
    }
    currencies.set(currency, summary);
  }
  return [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
