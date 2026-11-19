/**
 * Pure, server-side shaping of the Approvals queue: URL query, search and
 * filters, worker × week grouping and pagination. Inputs are rows the server
 * already authorized; nothing here grants access. Money stays in exact minor
 * units (decimal strings / bigint).
 */
import { weekStartForDate } from './sections/time-entry-actions';
import { currencyTotals, type ApprovalPendingSummary, type CurrencyTotal } from './home-inbox';

export type ApprovalTab = 'time' | 'expenses' | 'reports';
export type ApprovalKind = 'time' | 'expense';
export const APPROVAL_TABS: readonly ApprovalTab[] = ['time', 'expenses', 'reports'];
/** Worker × week groups (or reports) per "page"; "Show more" adds another page. */
export const APPROVAL_PAGE_SIZE = 20;
/** Approved, not invoiced: rows per page. */
export const APPROVED_PAGE_SIZE = 25;
/** Same limit as the approveBatch action (one transaction). */
export const APPROVAL_BATCH_LIMIT = 200;
const MAX_SHOWN = 400;

type Row = Readonly<Record<string, unknown>>;

const text = (value: unknown): string => (value == null ? '' : String(value));

export type ApprovalQueueQuery = {
  tab: ApprovalTab;
  search: string;
  worker: string;
  project: string;
  week: string;
  /** How many groups (or reports / approved rows) to show. */
  show: number;
  /** `approved` opens the "Approved, not invoiced" list (loaded on demand). */
  view: 'pending' | 'approved';
};

export function parseApprovalQueueQuery(
  params: URLSearchParams,
  fallbackTab: ApprovalTab | null = null,
): ApprovalQueueQuery {
  const tab = params.get('tab');
  const view = params.get('view') === 'approved' ? 'approved' : 'pending';
  const pageSize = view === 'approved' ? APPROVED_PAGE_SIZE : APPROVAL_PAGE_SIZE;
  const requested = Number.parseInt(params.get('show') ?? '', 10);
  const show = Number.isFinite(requested)
    ? Math.min(MAX_SHOWN, Math.max(pageSize, Math.ceil(requested / pageSize) * pageSize))
    : pageSize;
  const week = text(params.get('week')).trim();
  return {
    tab: APPROVAL_TABS.includes(tab as ApprovalTab)
      ? (tab as ApprovalTab)
      : (fallbackTab ?? 'time'),
    search: text(params.get('search')).trim().slice(0, 100),
    worker: text(params.get('worker')).trim(),
    project: text(params.get('project')).trim(),
    week: weekStartForDate(week) === week ? week : '',
    show,
    view,
  };
}

/** Lower-case, accent-free text for search ("José" matches "jose"). */
export function searchKey(value: unknown): string {
  return text(value).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

export function rowMatchesTab(row: Row, tab: ApprovalTab): boolean {
  const type = text(row.type);
  return tab === 'time'
    ? type === 'time'
    : tab === 'expenses'
      ? type === 'expense'
      : type === 'daily' || type === 'technical';
}

export function rowWeek(row: Row): string {
  return weekStartForDate(text(row.date)) ?? text(row.date);
}

export type QueueLabels = {
  /** Display name for a worker id. */
  worker: (id: string) => string;
  /** Searchable project text (number, name, client) for a project id. */
  projectSearch: (id: string) => string;
};

export function filterQueueRows<T extends Row>(
  rows: readonly T[],
  query: Pick<ApprovalQueueQuery, 'search' | 'worker' | 'project' | 'week'>,
  labels: QueueLabels,
): T[] {
  const words = searchKey(query.search).split(/\s+/u).filter(Boolean);
  const workerText = new Map<string, string>();
  const projectText = new Map<string, string>();
  return rows.filter((row) => {
    const workerId = text(row.worker_id);
    const projectId = text(row.project_id);
    if (query.worker && workerId !== query.worker) return false;
    if (query.project && projectId !== query.project) return false;
    if (query.week && rowWeek(row) !== query.week) return false;
    if (!words.length) return true;
    let worker = workerText.get(workerId);
    if (worker === undefined)
      workerText.set(workerId, (worker = searchKey(labels.worker(workerId))));
    let project = projectText.get(projectId);
    if (project === undefined)
      projectText.set(projectId, (project = searchKey(labels.projectSearch(projectId))));
    const haystack = `${worker} ${project}`;
    return words.every((word) => haystack.includes(word));
  });
}

export type QueueFilterOptions = {
  workers: Array<[string, string]>;
  projects: Array<[string, string]>;
  weeks: string[];
};

export function queueFilterOptions(
  rows: readonly Row[],
  labels: { worker: (id: string) => string; project: (id: string) => string },
): QueueFilterOptions {
  const workers = new Map<string, string>();
  const projects = new Map<string, string>();
  const weeks = new Set<string>();
  for (const row of rows) {
    workers.set(text(row.worker_id), labels.worker(text(row.worker_id)));
    projects.set(text(row.project_id), labels.project(text(row.project_id)));
    weeks.add(rowWeek(row));
  }
  const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1]);
  return {
    workers: [...workers].sort(byLabel),
    projects: [...projects].sort(byLabel),
    weeks: [...weeks].sort().reverse(),
  };
}

export type QueueGroup<T extends Row> = {
  key: string;
  kind: ApprovalKind;
  workerId: string;
  workerName: string;
  weekStart: string;
  rows: T[];
};

/** Worker × week (Mon–Sun) groups, oldest week first, then by worker name. */
export function groupQueueRows<T extends Row>(
  rows: readonly T[],
  kind: ApprovalKind,
  workerName: (id: string) => string,
): QueueGroup<T>[] {
  const groups = new Map<string, QueueGroup<T>>();
  for (const row of rows) {
    if (text(row.type) !== kind) continue;
    const workerId = text(row.worker_id);
    const weekStart = rowWeek(row);
    const key = `${kind}:${workerId}:${weekStart}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, kind, workerId, workerName: workerName(workerId), weekStart, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  for (const group of groups.values())
    group.rows.sort(
      (a, b) => text(a.date).localeCompare(text(b.date)) || text(a.id).localeCompare(text(b.id)),
    );
  return [...groups.values()].sort(
    (a, b) => a.weekStart.localeCompare(b.weekStart) || a.workerName.localeCompare(b.workerName),
  );
}

export type QueueTotals = {
  timeCount: number;
  minutes: number;
  expenseCount: number;
  expenseTotals: CurrencyTotal[];
};

/** Hours and per-currency expense totals; rows carry `expense_currency`/`expense_amount_minor` only for money roles. */
export function queueTotals(rows: readonly Row[]): QueueTotals {
  let timeCount = 0;
  let minutes = 0;
  let expenseCount = 0;
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    if (text(row.type) === 'time') {
      timeCount += 1;
      const value = Number(row.amount ?? 0);
      if (Number.isFinite(value)) minutes += value;
    } else if (text(row.type) === 'expense') {
      expenseCount += 1;
      const currency = text(row.expense_currency);
      const raw = text(row.expense_amount_minor).trim();
      if (currency && /^-?\d+$/u.test(raw))
        totals.set(currency, (totals.get(currency) ?? 0n) + BigInt(raw));
    }
  }
  return { timeCount, minutes, expenseCount, expenseTotals: currencyTotals(totals) };
}

export type ApprovalWorkerSummary = {
  workerId: string;
  workerName: string;
  projects: string[];
} & QueueTotals;

export type ApprovalQueuePage = {
  query: ApprovalQueueQuery;
  pageSize: number;
  /** Unfiltered pending numbers (same as nav badge and Home). */
  summary: ApprovalPendingSummary;
  /** What this viewer can approve (nav badge, Home, tab badges). */
  reviewable?: ApprovalPendingSummary;
  /**
   * Project managers: supplier/crew hours on their projects that only the
   * owner approves (P8), with the owner's display name.
   */
  ownerOnlyTime?: { count: number; ownerName: string } | null;
  options: QueueFilterOptions;
  filtersActive: boolean;
  /** Pending rows in the active tab that match search/filters. */
  matching: QueueTotals & { reports: number; groups: number };
  groups: Array<{
    key: string;
    kind: 'time' | 'expense';
    workerId: string;
    workerName: string;
    weekStart: string;
    rows: Array<Record<string, unknown>>;
  }>;
  reports: Array<Record<string, unknown>>;
  waiting: { count: number; rows: Array<Record<string, unknown>> };
  /** The viewer's own pending entries in this tab: listed apart, never decidable by them. */
  ownEntries?: { count: number; minutes: number; rows: Array<Record<string, unknown>> };
  /** "Approve all": every matching submitted hour/expense (both tabs), oldest first. */
  approveAll: {
    matching: QueueTotals;
    batch: QueueTotals;
    workers: ApprovalWorkerSummary[];
    tokens: string[];
    ownExcluded: number;
  };
  approved: null | { count: number; rows: Array<Record<string, unknown>> };
  finance: { count: number; rows: Array<Record<string, unknown>> };
};
