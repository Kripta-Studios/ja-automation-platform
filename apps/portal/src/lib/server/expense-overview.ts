import { minorToInputText } from '$lib/portal/payment-money';
/**
 * Expenses on the server at scale: the capture list gets only the person's
 * recent items, and the review overview gets per-currency totals, the top
 * groups and one page of a single opened group. Input rows are the already
 * authorized, role-projected `listExpensesForScope` result; nothing here
 * widens what a role can see. Money stays exact (bigint minor units, sent as
 * strings, one total per currency).
 */
import {
  expenseReceiptState as receiptStateOf,
  expenseSearchMatches,
} from '$lib/portal/expense-evidence';
import {
  expenseStatusOf as statusOfRow,
  type ExpenseStatus,
} from '$lib/portal/sections/expense-status';
import type { PortalRow } from '$lib/portal/portal-data';
import { personDisplayName } from '$lib/portal/display-name';
import type {
  ExpenseOverviewData,
  ExpenseOverviewGroup,
  ExpenseOverviewPeriod,
  ExpenseSums,
} from '$lib/portal/expense-overview-types';
import { isRealIsoDate } from './iso-date';

type Row = Record<string, unknown>;
const expenseStatusOf = (row: Row) => statusOfRow(row as PortalRow);
const expenseReceiptState = (row: Row) => receiptStateOf(row as PortalRow);
const text = (row: Row, key: string) => (row[key] === null || row[key] === undefined ? '' : String(row[key]));

export const EXPENSE_GROUPS = 15;
export const EXPENSE_PAGE = 25;
export const CAPTURE_WEEKS = 4;
export const CAPTURE_LIMIT = 100;

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return iso(value);
};
const monday = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return iso(value);
};

/* ------------------------------------------------------------- capture */

/**
 * The person's own capture list: items they own, recorded for their crew or
 * (owner) entered for someone else, from the last `weeks` weeks plus every
 * open draft / returned item, newest first and capped.
 */
export function captureExpenses(
  rows: Row[],
  input: { userId: string; createdByMe: ReadonlySet<string> | null; weeks: number; today?: string; editId?: string },
): { records: Row[]; olderCount: number; weeks: number; from: string } {
  const today = input.today ?? iso(new Date());
  const weeks = Math.min(104, Math.max(CAPTURE_WEEKS, Math.floor(input.weeks) || CAPTURE_WEEKS));
  const from = addDays(monday(today), -7 * weeks);
  const mine = rows.filter(
    (row) =>
      row.approval_state !== 'void' &&
      (text(row, 'worker_id') === input.userId ||
        text(row, 'crew_recorded_by_user_id') === input.userId ||
        Boolean(input.createdByMe?.has(text(row, 'id')))),
  );
  const open = (row: Row) => ['draft', 'needs_changes'].includes(text(row, 'approval_state'));
  const recent = mine
    .filter((row) => text(row, 'spent_on') >= from || open(row) || text(row, 'id') === input.editId)
    .sort((a, b) => text(b, 'spent_on').localeCompare(text(a, 'spent_on')));
  const records = recent.slice(0, CAPTURE_LIMIT);
  return { records, olderCount: mine.length - records.length, weeks, from };
}

/* ------------------------------------------------------------ overview */

const periods: ExpenseOverviewPeriod[] = ['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'custom'];
const statuses: ExpenseStatus[] = ['draft', 'submitted', 'needs_changes', 'approved', 'reimbursed', 'rejected'];

export function expensePeriod(
  params: URLSearchParams,
  today = iso(new Date()),
): { period: ExpenseOverviewPeriod; from: string; to: string } {
  const requested = params.get('period') as ExpenseOverviewPeriod | null;
  const rawFrom = params.get('from') ?? '';
  const rawTo = params.get('to') ?? '';
  const period: ExpenseOverviewPeriod =
    requested && periods.includes(requested) ? requested : rawFrom || rawTo ? 'custom' : 'thisMonth';
  const thisMonday = monday(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = addDays(`${addDays(`${today.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
  if (period === 'thisWeek') return { period, from: thisMonday, to: addDays(thisMonday, 6) };
  if (period === 'lastWeek') return { period, from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
  if (period === 'lastMonth') {
    const end = addDays(monthStart, -1);
    return { period, from: `${end.slice(0, 7)}-01`, to: end };
  }
  if (period === 'custom') {
    const from = isRealIsoDate(rawFrom) ? rawFrom : monthStart;
    const to = isRealIsoDate(rawTo) && rawTo >= from ? rawTo : from > monthEnd ? from : monthEnd;
    return { period, from, to };
  }
  return { period, from: monthStart, to: monthEnd };
}

/** Replaced originals and rejected claims are listed but never counted in totals. */
const counts = (row: Row) => !text(row, 'active_correction_id') && row.approval_state !== 'rejected';

function addSum(target: Map<string, bigint>, row: Row) {
  if (!counts(row)) return;
  const minor = text(row, 'amount_minor');
  if (!/^-?\d+$/u.test(minor)) return;
  const currency = text(row, 'currency') || 'USD';
  target.set(currency, (target.get(currency) ?? 0n) + BigInt(minor));
}
const toSums = (sums: Map<string, bigint>): ExpenseSums =>
  [...sums.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, minor]) => [currency, minor.toString()]);
function breakdown(rows: Row[]) {
  const map = new Map<ExpenseStatus, number>();
  for (const row of rows) map.set(expenseStatusOf(row), (map.get(expenseStatusOf(row)) ?? 0) + 1);
  return statuses.filter((status) => map.has(status)).map((status) => ({ status, count: map.get(status)! }));
}

const itemFields = [
  'id',
  'category',
  'spent_on',
  'project_id',
  'project_number',
  'project_name',
  'worker_id',
  'worker_name',
  'vendor',
  'amount_minor',
  'currency',
  'approval_state',
  'reimbursement_state',
  'reimbursed_at',
  'receipt_document_id',
  'receipt_required',
  'active_correction_id',
] as const;
const project = (row: Row): Row =>
  Object.fromEntries(itemFields.filter((key) => key in row).map((key) => [key, row[key]]));

export function buildExpenseOverview(rows: Row[], params: URLSearchParams, today?: string): ExpenseOverviewData {
  const window = expensePeriod(params, today);
  const filters = {
    project: params.get('project')?.trim() ?? '',
    worker: params.get('worker')?.trim() ?? '',
    status: params.get('status')?.trim() ?? '',
    category: params.get('category')?.trim() ?? '',
    receipt: params.get('receipt') === 'missing' ? 'missing' : '',
    find: (params.get('find') ?? '').trim().slice(0, 100),
  };
  const group: ExpenseOverviewGroup = params.get('group') === 'project' ? 'project' : 'worker';
  const show = Math.min(
    500,
    Math.max(EXPENSE_GROUPS, Math.ceil((Number(params.get('show')) || EXPENSE_GROUPS) / EXPENSE_GROUPS) * EXPENSE_GROUPS),
  );

  // Search: vendor, worker, project, client, category, note, date, or the amount ("125", "125.50", "125,5").
  const amountNeedle = /^\d+(?:[.,]\d{0,2})?$/u.test(filters.find) ? filters.find.replace(',', '.') : '';
  const amountText = (row: Row) => {
    const minor = text(row, 'amount_minor');
    if (!/^-?\d+$/u.test(minor)) return '';
    const value = BigInt(minor);
    const abs = value < 0n ? -value : value;
    return minorToInputText(abs.toString(), text(row, 'currency') || 'USD');
  };
  const matches = (row: Row) =>
    expenseSearchMatches(row, filters.find) ||
    Boolean(amountNeedle && amountText(row).startsWith(amountNeedle));
  const live = rows.filter((row) => row.approval_state !== 'void');
  // Period + project/worker/category + search; quick-filter counts use this scope.
  const scoped = live.filter((row) => {
    const date = text(row, 'spent_on');
    return (
      date >= window.from &&
      date <= window.to &&
      (!filters.project || text(row, 'project_id') === filters.project) &&
      (!filters.worker || text(row, 'worker_id') === filters.worker) &&
      (!filters.category || text(row, 'category') === filters.category) &&
      matches(row)
    );
  });
  const quick = {
    missing: scoped.filter((row) => expenseReceiptState(row) !== 'attached').length,
    needsChanges: scoped.filter((row) => expenseStatusOf(row) === 'needs_changes').length,
    submitted: scoped.filter((row) => expenseStatusOf(row) === 'submitted').length,
  };
  const inPeriod = scoped.filter(
    (row) =>
      (!filters.status || expenseStatusOf(row) === filters.status) &&
      (!filters.receipt || expenseReceiptState(row) !== 'attached'),
  );

  const total = new Map<string, bigint>();
  for (const row of inPeriod) addSum(total, row);
  const main = [...total.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))[0]?.[0] ?? '';

  const groupKey = (row: Row) => (group === 'worker' ? text(row, 'worker_id') : text(row, 'project_id'));
  const groupName = (row: Row) =>
    group === 'worker'
      ? personDisplayName(text(row, 'worker_name'))
      : `${text(row, 'project_number')} · ${text(row, 'project_name')}`;
  const grouped = new Map<string, { id: string; name: string; rows: Row[]; sums: Map<string, bigint> }>();
  for (const row of inPeriod) {
    const id = groupKey(row);
    const entry = grouped.get(id) ?? { id, name: groupName(row), rows: [] as Row[], sums: new Map<string, bigint>() };
    entry.rows.push(row);
    addSum(entry.sums, row);
    grouped.set(id, entry);
  }
  const sorted = [...grouped.values()].sort((a, b) => {
    const x = a.sums.get(main) ?? 0n;
    const y = b.sums.get(main) ?? 0n;
    return y > x ? 1 : y < x ? -1 : b.rows.length - a.rows.length || a.name.localeCompare(b.name);
  });
  const shown = sorted.slice(0, show);
  const hidden = sorted.slice(show);
  let others: ExpenseOverviewData['others'] = null;
  if (hidden.length) {
    const sums = new Map<string, bigint>();
    let items = 0;
    for (const item of hidden) {
      items += item.rows.length;
      for (const row of item.rows) addSum(sums, row);
    }
    others = { count: hidden.length, items, sums: toSums(sums) };
  }

  const byCategory = new Map<string, { rows: number; sums: Map<string, bigint> }>();
  for (const row of inPeriod) {
    const key = text(row, 'category');
    const entry = byCategory.get(key) ?? { rows: 0, sums: new Map() };
    entry.rows += 1;
    addSum(entry.sums, row);
    byCategory.set(key, entry);
  }
  const max = [...byCategory.values()].reduce((top, item) => {
    const value = item.sums.get(main) ?? 0n;
    return value > top ? value : top;
  }, 0n);
  const categories = [...byCategory.entries()]
    .map(([category, item]) => ({
      category,
      count: item.rows,
      sums: toSums(item.sums),
      share: max > 0n ? Number(((item.sums.get(main) ?? 0n) * 1000n) / max) / 10 : 0,
    }))
    .sort((a, b) => b.share - a.share || b.count - a.count);

  let open: ExpenseOverviewData['open'] = null;
  const openId = params.get('open') ?? '';
  const opened = openId ? grouped.get(openId) : undefined;
  if (opened) {
    const items = [...opened.rows].sort(
      (a, b) => text(b, 'spent_on').localeCompare(text(a, 'spent_on')) || text(a, 'id').localeCompare(text(b, 'id')),
    );
    const pages = Math.max(1, Math.ceil(items.length / EXPENSE_PAGE));
    const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get('opage')) || 1)));
    open = {
      id: opened.id,
      name: opened.name,
      page,
      pageSize: EXPENSE_PAGE,
      count: items.length,
      items: items.slice((page - 1) * EXPENSE_PAGE, page * EXPENSE_PAGE).map(project) as PortalRow[],
    };
  }

  return {
    ...window,
    ...filters,
    group,
    show,
    count: inPeriod.length,
    sums: toSums(total),
    breakdown: breakdown(inPeriod),
    quick,
    groupCount: sorted.length,
    groups: shown.map((item) => ({
      id: item.id,
      name: item.name,
      count: item.rows.length,
      sums: toSums(item.sums),
      breakdown: breakdown(item.rows),
    })),
    others,
    categories,
    open,
  };
}
