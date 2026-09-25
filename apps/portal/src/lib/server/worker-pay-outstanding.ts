type Settlement = Readonly<{
  state?: unknown;
  currency?: unknown;
  remainingAmountMinor?: unknown;
}>;

type Expense = Readonly<{
  approvalState?: unknown;
  reimbursementState?: unknown;
  currency?: unknown;
  reimbursementAmountMinor?: unknown;
}>;

export type WorkerPayOutstanding = Readonly<{
  currency: string;
  settlementMinor: string;
  reimbursementMinor: string;
}>;

const positiveMinor = (value: unknown): bigint => {
  if (!/^-?\d+$/.test(String(value ?? ''))) return 0n;
  const amount = BigInt(String(value));
  return amount > 0n ? amount : 0n;
};

/** Own, reviewed obligations only. Never add different currencies together. */
export const workerPayOutstanding = (
  settlements: readonly Settlement[],
  expenses: readonly Expense[],
): WorkerPayOutstanding[] => {
  const byCurrency = new Map<string, { settlementMinor: bigint; reimbursementMinor: bigint }>();
  const amountFor = (currency: unknown) => {
    const key = String(currency ?? '').trim();
    if (!/^[A-Z]{3}$/.test(key)) return null;
    const amount = byCurrency.get(key) ?? { settlementMinor: 0n, reimbursementMinor: 0n };
    byCurrency.set(key, amount);
    return amount;
  };

  for (const row of settlements) {
    if (row.state !== 'settled') continue;
    const amount = positiveMinor(row.remainingAmountMinor);
    if (amount === 0n) continue;
    const group = amountFor(row.currency);
    if (group) group.settlementMinor += amount;
  }
  for (const row of expenses) {
    if (!['approved', 'locked'].includes(String(row.approvalState))) continue;
    if (!['pending', 'scheduled'].includes(String(row.reimbursementState))) continue;
    const amount = positiveMinor(row.reimbursementAmountMinor);
    if (amount === 0n) continue;
    const group = amountFor(row.currency);
    if (group) group.reimbursementMinor += amount;
  }
  return [...byCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({
      currency,
      settlementMinor: amount.settlementMinor.toString(),
      reimbursementMinor: amount.reimbursementMinor.toString(),
    }));
};
