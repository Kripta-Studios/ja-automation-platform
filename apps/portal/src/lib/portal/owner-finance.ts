import type { CashMovement } from '../server/cash-calendar';

export type CashFilter =
  | 'all'
  | 'collected'
  | 'receivable'
  | 'overdue'
  | 'not_due'
  | 'payable'
  | 'paid'
  | 'unconfirmed'
  | 'incoming'
  | 'outgoing';
export const cashFilters: CashFilter[] = [
  'all',
  'collected',
  'receivable',
  'overdue',
  'not_due',
  'payable',
  'paid',
  'unconfirmed',
  'incoming',
  'outgoing',
];
export function matchesCashFilter(item: CashMovement, filter: CashFilter, today: string): boolean {
  const incoming = item.kind === 'customer_receipt' || item.kind === 'receipt_reversal';
  const receivable = incoming && item.basis === 'expected';
  const overdue = receivable && Boolean(item.dueDate && item.dueDate < today);
  switch (filter) {
    case 'collected':
      return incoming && item.basis === 'actual';
    case 'receivable':
      return receivable;
    case 'overdue':
      return overdue;
    case 'not_due':
      return receivable && !overdue;
    case 'payable':
      return !incoming && item.basis === 'expected';
    case 'paid':
      return !incoming && item.basis === 'actual';
    case 'unconfirmed':
      return item.basis === 'needs_confirmation';
    case 'incoming':
      return item.basis === 'actual' && BigInt(item.amountMinor) > 0n;
    case 'outgoing':
      return item.basis === 'actual' && BigInt(item.amountMinor) < 0n;
    default:
      return true;
  }
}

/** Exact source sums. Numbers are used only for bounded chart geometry in the UI. */
export function ownerFinanceSummary(
  movements: readonly CashMovement[],
  today: string,
  projectCurrencies: readonly string[] = [],
) {
  const monthStarts = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - 5 + index);
    return date.toISOString().slice(0, 10);
  });
  return {
    today,
    currencies: [...new Set([...projectCurrencies, ...movements.map((item) => item.currency)])]
      .sort()
      .map((currency) => {
        const rows = movements.filter((item) => item.currency === currency);
        const sum = (filter: CashFilter, selected = rows) =>
          selected
            .filter((item) => matchesCashFilter(item, filter, today))
            .reduce((total, item) => total + BigInt(item.amountMinor), 0n)
            .toString();
        return {
          currency,
          collected: sum('collected'),
          receivable: sum('receivable'),
          overdue: sum('overdue'),
          not_due: sum('not_due'),
          payable: (-BigInt(sum('payable'))).toString(),
          paid: (-BigInt(sum('paid'))).toString(),
          unconfirmed: (-BigInt(sum('unconfirmed'))).toString(),
          months: monthStarts.map((from) => {
            const date = new Date(`${from}T00:00:00Z`);
            date.setUTCMonth(date.getUTCMonth() + 1);
            date.setUTCDate(0);
            const to = date.toISOString().slice(0, 10);
            const period = rows.filter((item) => item.date && item.date >= from && item.date <= to);
            return {
              from,
              to,
              incoming: sum('incoming', period),
              outgoing: (-BigInt(sum('outgoing', period))).toString(),
            };
          }),
        };
      }),
  };
}
export type OwnerFinanceSummary = ReturnType<typeof ownerFinanceSummary>;
