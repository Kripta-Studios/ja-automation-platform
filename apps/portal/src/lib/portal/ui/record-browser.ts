import { normalizeSelectSearch } from '../searchable-selects';

type Row = Record<string, unknown>;
export type RecordBrowserState = {
  search: string;
  status: string;
  order: string;
  page: number;
};

/** Validate persisted preferences before restoring a register's own context. */
export function restoreRecordBrowserState(
  saved: Record<string, unknown> | null,
  defaults: RecordBrowserState,
  filtersEnabled: boolean,
): RecordBrowserState {
  return {
    search: filtersEnabled && typeof saved?.search === 'string' ? saved.search : defaults.search,
    status: filtersEnabled && typeof saved?.status === 'string' ? saved.status : defaults.status,
    order:
      typeof saved?.order === 'string' &&
      ['priority', 'oldest', 'newest', 'name', 'status'].includes(saved.order)
        ? saved.order
        : defaults.order,
    page: Number.isSafeInteger(saved?.page) && Number(saved?.page) >= 0 ? Number(saved?.page) : 0,
  };
}

/**
 * A requested row may override only local criteria that hide that authorized
 * row. Controlled lists remain under their parent's filter/order authority.
 */
export function focusRecordBrowser<T extends Row>(
  rows: readonly T[],
  state: RecordBrowserState,
  focusId: string,
  pageSize: number,
  filtersEnabled: boolean,
  controlled: boolean,
): RecordBrowserState | null {
  const target = rows.find((row) => String(row.id) === focusId);
  if (!focusId || !target) return null;
  const next = { ...state };
  if (!controlled && filtersEnabled) {
    if (next.status && recordState(target) !== next.status) next.status = '';
    if (!browseRecords([target], next.search, '', next.order).length) next.search = '';
  }
  const filtered = controlled
    ? [...rows]
    : browseRecords(
        rows,
        filtersEnabled ? next.search : '',
        filtersEnabled ? next.status : '',
        next.order,
      );
  const index = filtered.findIndex((row) => String(row.id) === focusId);
  return index < 0 ? null : { ...next, page: Math.floor(index / pageSize) };
}

function first(row: Row, keys: string[]): string {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim())
      return String(row[key]);
  }
  return '';
}
export const recordState = (row: Row): string =>
  first(row, [
    'browser_status',
    'approval_state',
    'approvalState',
    'reimbursement_state',
    'reimbursementState',
    'status',
    'state',
    'availability',
  ]);
export const recordDate = (row: Row): string =>
  first(row, [
    'date',
    'work_date',
    'workDate',
    'spent_on',
    'spentOn',
    'issue_date',
    'issueDate',
    'period_start',
    'periodStart',
    'starts_at',
    'startsAt',
    'starts_on',
    'startsOn',
    'due_on',
    'dueOn',
    'created_at',
    'createdAt',
  ]);
const name = (row: Row): string =>
  first(row, [
    'name',
    'display_name',
    'displayName',
    'worker_name',
    'workerName',
    'project_name',
    'projectName',
    'invoice_number',
    'invoiceNumber',
    'title',
  ]);
const priorities: Record<string, number> = {
  submitted: 0,
  pending: 0,
  failed: 0,
  needs_changes: 1,
  draft: 2,
  queued: 3,
  running: 3,
  approved: 4,
  ready: 4,
  active: 4,
  published: 4,
  paid: 5,
  reimbursed: 5,
  settled: 5,
  final: 5,
  archived: 6,
  cancelled: 6,
};

/** Handles both SQL row names and the explicit camelCase finance projections. */
export function browseRecords<T extends Row>(
  rows: readonly T[],
  search: string,
  status: string,
  order: string,
): T[] {
  const words = normalizeSelectSearch(search).split(/\s+/u).filter(Boolean);
  return rows
    .filter((row) => {
      if (status && recordState(row) !== status) return false;
      const haystack = normalizeSelectSearch(
        Object.values(row)
          .filter((value) => typeof value !== 'object')
          .join(' '),
      );
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) => {
      if (order === 'name') return name(a).localeCompare(name(b));
      if (order === 'status')
        return (
          recordState(a).localeCompare(recordState(b)) || recordDate(a).localeCompare(recordDate(b))
        );
      if (order === 'newest') return recordDate(b).localeCompare(recordDate(a));
      if (order === 'oldest') return recordDate(a).localeCompare(recordDate(b));
      return (
        (priorities[recordState(a)] ?? 4) - (priorities[recordState(b)] ?? 4) ||
        recordDate(a).localeCompare(recordDate(b)) ||
        name(a).localeCompare(name(b))
      );
    });
}
