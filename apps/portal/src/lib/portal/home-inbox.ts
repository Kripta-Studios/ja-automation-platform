/**
 * Pure projections for the Home task inbox and the navigation "Approve" badge.
 * Inputs are rows the server already authorized; nothing here grants access.
 * Money stays in exact integer minor units (decimal strings / bigint).
 */
export type CurrencyTotal = { currency: string; minor: string };

export type ApprovalPendingSummary = {
  time: { count: number; minutes: number };
  expenses: { count: number; totals: CurrencyTotal[] };
  reports: number;
  total: number;
};

type QueueRow = Readonly<Record<string, unknown>>;

const text = (value: unknown): string => (value == null ? '' : String(value));

function addMinor(totals: Map<string, bigint>, currency: string, minor: unknown): void {
  if (!currency) return;
  const raw = text(minor).trim();
  if (!/^-?\d+$/u.test(raw)) return;
  totals.set(currency, (totals.get(currency) ?? 0n) + BigInt(raw));
}

export function currencyTotals(totals: ReadonlyMap<string, bigint>): CurrencyTotal[] {
  return [...totals.entries()]
    .filter(([, minor]) => minor !== 0n)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, minor]) => ({ currency, minor: minor.toString() }));
}

/**
 * Work that waits for the reviewer: submitted operational records and reports.
 * Matches the Approvals screen tabs (records returned for changes wait on the
 * worker, and later finance-stage rows are not a reviewer decision).
 */
export function isPendingApproval(row: QueueRow): boolean {
  return (
    text(row.approval_state) === 'submitted' &&
    ['operational', 'report'].includes(text(row.review_stage))
  );
}

export function pendingApprovalSummary(rows: readonly QueueRow[]): ApprovalPendingSummary {
  let timeCount = 0;
  let minutes = 0;
  let expenseCount = 0;
  let reports = 0;
  const expenseTotals = new Map<string, bigint>();
  for (const row of rows) {
    if (!isPendingApproval(row)) continue;
    const type = text(row.type);
    if (type === 'time') {
      timeCount += 1;
      const value = Number(row.amount ?? row.minutes ?? 0);
      if (Number.isFinite(value)) minutes += value;
    } else if (type === 'expense') {
      expenseCount += 1;
      addMinor(
        expenseTotals,
        text(row.expense_currency ?? row.currency),
        row.expense_amount_minor ?? row.amount_minor,
      );
    } else if (type === 'daily' || type === 'technical') reports += 1;
  }
  return {
    time: { count: timeCount, minutes },
    expenses: { count: expenseCount, totals: currencyTotals(expenseTotals) },
    reports,
    total: timeCount + expenseCount + reports,
  };
}

export type ReadyToInvoiceItem = {
  projectId: string;
  label: string;
  currency: string;
  minor: string;
};

export type ReadyToInvoice = {
  projects: number;
  totals: CurrencyTotal[];
  /** One row per project with approved, unbilled work; largest first. */
  items: ReadyToInvoiceItem[];
  /** The project with the largest amount, to open the invoice draft directly. */
  topProjectId: string | null;
};

export function readyToInvoiceSummary(
  rows: ReadonlyArray<{
    projectId: string;
    currency: string;
    minor: string | null | undefined;
    label?: string;
  }>,
): ReadyToInvoice {
  const totals = new Map<string, bigint>();
  const items: Array<ReadyToInvoiceItem & { value: bigint }> = [];
  for (const row of rows) {
    const raw = text(row.minor).trim();
    if (!/^\d+$/u.test(raw)) continue;
    const minor = BigInt(raw);
    if (minor <= 0n) continue;
    totals.set(row.currency, (totals.get(row.currency) ?? 0n) + minor);
    items.push({
      projectId: row.projectId,
      label: row.label ?? row.projectId,
      currency: row.currency,
      minor: raw,
      value: minor,
    });
  }
  items.sort((left, right) => (left.value === right.value ? 0 : left.value > right.value ? -1 : 1));
  return {
    projects: items.length,
    totals: currencyTotals(totals),
    items: items.map((item) => ({
      projectId: item.projectId,
      label: item.label,
      currency: item.currency,
      minor: item.minor,
    })),
    topProjectId: items[0]?.projectId ?? null,
  };
}

export type HomeInbox = {
  approvals: ApprovalPendingSummary;
  readyToInvoice: ReadyToInvoice | null;
};

export type WorkerWeekStatus = {
  weekStart: string;
  weekEnd: string;
  today: string;
  time: { draft: number; submitted: number; approved: number; needsChanges: number };
  expenses: {
    draft: number;
    submitted: number;
    approved: number;
    needsChanges: number;
    totals: CurrencyTotal[];
  };
};

const stateKey = (state: string): 'draft' | 'submitted' | 'approved' | 'needsChanges' | null =>
  state === 'draft'
    ? 'draft'
    : state === 'submitted'
      ? 'submitted'
      : state === 'approved' || state === 'locked'
        ? 'approved'
        : state === 'needs_changes'
          ? 'needsChanges'
          : null;

/** The worker's own week: minutes per state and expense counts/totals per state. */
export function workerWeekStatus(
  input: Readonly<{
    weekStart: string;
    weekEnd: string;
    today: string;
    workerId: string;
    time: readonly QueueRow[];
    expenses: readonly QueueRow[];
  }>,
): WorkerWeekStatus {
  const inWeek = (date: unknown) => {
    const value = text(date).slice(0, 10);
    return value >= input.weekStart && value <= input.weekEnd;
  };
  const time = { draft: 0, submitted: 0, approved: 0, needsChanges: 0 };
  for (const row of input.time) {
    if (text(row.worker_id) !== input.workerId || !inWeek(row.work_date)) continue;
    if (row.active_correction_id) continue;
    const key = stateKey(text(row.approval_state));
    const minutes = Number(row.minutes ?? 0);
    if (key && Number.isFinite(minutes)) time[key] += minutes;
  }
  const expenses = { draft: 0, submitted: 0, approved: 0, needsChanges: 0 };
  const totals = new Map<string, bigint>();
  for (const row of input.expenses) {
    if (text(row.worker_id) !== input.workerId || !inWeek(row.spent_on)) continue;
    const key = stateKey(text(row.approval_state));
    if (!key) continue;
    expenses[key] += 1;
    addMinor(totals, text(row.currency), row.amount_minor);
  }
  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    today: input.today,
    time,
    expenses: { ...expenses, totals: currencyTotals(totals) },
  };
}
