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
  /** Approved work no invoice holds yet (drafts included as holders). */
  minor: string;
  /** Approved work already sitting on an unissued draft of this project. */
  draftMinor?: string;
  /** Submitted hours still waiting for your approval ("Approve & include" on the invoice screen). */
  pendingMinutes?: number;
  /** Draft or sent-back hours the worker has not sent yet (never counted as "to approve"). */
  unsentMinutes?: number;
  /** Approved hours no invoice holds yet (also those without a client rate). */
  approvedMinutes?: number;
  /** Some approved hours have no client rate: the amount is set on the invoice screen. */
  rateMissing?: boolean;
  /** Approved expenses no invoice holds yet that may be re-billed (recorded amounts). */
  approvedExpenses?: { count: number; totals: CurrencyTotal[] };
};

export type ReadyToInvoice = {
  projects: number;
  totals: CurrencyTotal[];
  /** Hours logged on these projects that still need an approval before invoicing. */
  pendingMinutes?: number;
  /** Approved hours whose amount is not known yet (client rate missing). */
  unpricedMinutes?: number;
  /** Approved expenses waiting to be invoiced, per recorded currency. */
  approvedExpenses?: { count: number; totals: CurrencyTotal[] };
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
    draftMinor?: string | null;
    label?: string;
    pendingMinutes?: number | null;
    unsentMinutes?: number | null;
    approvedMinutes?: number | null;
    rateMissing?: boolean;
    approvedExpenses?: { count: number; totals: readonly CurrencyTotal[] } | null;
  }>,
): ReadyToInvoice {
  const totals = new Map<string, bigint>();
  const expenseTotals = new Map<string, bigint>();
  const items: Array<ReadyToInvoiceItem & { value: bigint }> = [];
  const minutesOf = (value: number | null | undefined) =>
    Number.isFinite(Number(value)) ? Math.max(0, Number(value ?? 0)) : 0;
  let pendingTotal = 0;
  let unpricedTotal = 0;
  let expenseCount = 0;
  for (const row of rows) {
    const raw = text(row.minor).trim();
    const minor = /^\d+$/u.test(raw) ? BigInt(raw) : 0n;
    const pending = minutesOf(row.pendingMinutes);
    const approved = minutesOf(row.approvedMinutes);
    // Approved hours without a client rate are ready too: the rate is set on the invoice screen.
    const unpriced = approved > 0 && (row.rateMissing || minor <= 0n) ? approved : 0;
    const expenses =
      row.approvedExpenses && row.approvedExpenses.count > 0 ? row.approvedExpenses : null;
    // Pending-approval work counts too: the invoice screen approves and includes it.
    if (minor <= 0n && pending <= 0 && unpriced <= 0 && !expenses) continue;
    if (minor > 0n) totals.set(row.currency, (totals.get(row.currency) ?? 0n) + minor);
    pendingTotal += pending;
    if (minor <= 0n) unpricedTotal += unpriced;
    if (expenses) {
      expenseCount += expenses.count;
      for (const total of expenses.totals) addMinor(expenseTotals, total.currency, total.minor);
    }
    const draft = text(row.draftMinor).trim();
    const unsent = minutesOf(row.unsentMinutes);
    items.push({
      projectId: row.projectId,
      label: row.label ?? row.projectId,
      currency: row.currency,
      minor: minor.toString(),
      ...(/^\d+$/u.test(draft) && BigInt(draft) > 0n ? { draftMinor: draft } : {}),
      ...(pending > 0 ? { pendingMinutes: pending } : {}),
      ...(unsent > 0 ? { unsentMinutes: unsent } : {}),
      ...(approved > 0 ? { approvedMinutes: approved } : {}),
      ...(unpriced > 0 ? { rateMissing: true } : {}),
      ...(expenses ? { approvedExpenses: { count: expenses.count, totals: [...expenses.totals] } } : {}),
      value: minor,
    });
  }
  const weight = (item: ReadyToInvoiceItem) =>
    (item.rateMissing ? (item.approvedMinutes ?? 0) : 0) + (item.pendingMinutes ?? 0);
  items.sort((left, right) =>
    left.value === right.value
      ? weight(right) - weight(left) ||
        (right.approvedExpenses?.count ?? 0) - (left.approvedExpenses?.count ?? 0)
      : left.value > right.value
        ? -1
        : 1,
  );
  return {
    projects: items.length,
    totals: currencyTotals(totals),
    ...(pendingTotal > 0 ? { pendingMinutes: pendingTotal } : {}),
    ...(unpricedTotal > 0 ? { unpricedMinutes: unpricedTotal } : {}),
    ...(expenseCount > 0
      ? { approvedExpenses: { count: expenseCount, totals: currencyTotals(expenseTotals) } }
      : {}),
    items: items.map(({ value: _value, ...item }) => item),
    topProjectId: items[0]?.projectId ?? null,
  };
}

/**
 * Split a project's approved, unbilled sources into what is still free to invoice and
 * what an unissued draft already holds. Sources held by an issued (live) invoice are
 * dropped. Exact minor units only.
 */
export function splitUnbilledSources(
  sources: ReadonlyArray<Readonly<Record<string, unknown>>>,
  holders: ReadonlyMap<string, string>,
): { readyMinor: string; draftMinor: string } {
  let ready = 0n;
  let draft = 0n;
  for (const source of sources) {
    const raw = text(source.amountMinor).trim();
    if (!/^-?\d+$/u.test(raw)) continue;
    const holder = holders.get(`${text(source.sourceType)}:${text(source.sourceId)}`);
    // T15: approved hours whose correction still waits for approval are left out of the
    // invoice composer; they are not "ready to invoice" either.
    if (!holder && source.waitingCorrection === true) continue;
    if (!holder) ready += BigInt(raw);
    else if (holder === 'draft' || holder === 'approved') draft += BigInt(raw);
  }
  return { readyMinor: ready.toString(), draftMinor: draft.toString() };
}

/** Owner Home "projects at a glance": this week's hours, money ready to invoice, alerts. */
export type ProjectGlance = {
  projectId: string;
  weekMinutes: number;
  pendingApprovals: number;
  currency: string;
  readyMinor: string;
  draftMinor: string;
  missingRate: boolean;
  missingPo: boolean;
};

export type HomeInbox = {
  approvals: ApprovalPendingSummary;
  readyToInvoice: ReadyToInvoice | null;
  /**
   * Round 2 (D6 side effect): hours and expenses the owner or a project manager approved
   * that still need Finance's "bill the client?" decision (Approvals › Finance review).
   * Owner and Finance only.
   */
  billingDecisions?: { count: number; minutes: number };
  projects?: ProjectGlance[];
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
