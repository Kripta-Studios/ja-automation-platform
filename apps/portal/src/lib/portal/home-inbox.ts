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
};

export type ReadyToInvoice = {
  projects: number;
  totals: CurrencyTotal[];
  /** Hours logged on these projects that still need an approval before invoicing. */
  pendingMinutes?: number;
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
  }>,
): ReadyToInvoice {
  const totals = new Map<string, bigint>();
  const items: Array<ReadyToInvoiceItem & { value: bigint }> = [];
  let pendingTotal = 0;
  for (const row of rows) {
    const raw = text(row.minor).trim();
    const minor = /^\d+$/u.test(raw) ? BigInt(raw) : 0n;
    const pending = Number.isFinite(Number(row.pendingMinutes)) ? Math.max(0, Number(row.pendingMinutes ?? 0)) : 0;
    // Pending-approval work counts too: the invoice screen approves and includes it.
    if (minor <= 0n && pending <= 0) continue;
    if (minor > 0n) totals.set(row.currency, (totals.get(row.currency) ?? 0n) + minor);
    pendingTotal += pending;
    const draft = text(row.draftMinor).trim();
    const unsent = Number.isFinite(Number(row.unsentMinutes)) ? Math.max(0, Number(row.unsentMinutes ?? 0)) : 0;
    items.push({
      projectId: row.projectId,
      label: row.label ?? row.projectId,
      currency: row.currency,
      minor: minor.toString(),
      ...(/^\d+$/u.test(draft) && BigInt(draft) > 0n ? { draftMinor: draft } : {}),
      ...(pending > 0 ? { pendingMinutes: pending } : {}),
      ...(unsent > 0 ? { unsentMinutes: unsent } : {}),
      value: minor,
    });
  }
  items.sort((left, right) =>
    left.value === right.value
      ? (right.pendingMinutes ?? 0) - (left.pendingMinutes ?? 0)
      : left.value > right.value
        ? -1
        : 1,
  );
  return {
    projects: items.length,
    totals: currencyTotals(totals),
    ...(pendingTotal > 0 ? { pendingMinutes: pendingTotal } : {}),
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
