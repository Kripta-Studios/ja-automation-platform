import type { PortalRow, ReportWindow, ReportWindowTab } from '../portal-data';
import {
  operationalMatches,
  operationalSort,
  operationalStatusMatches,
  type OperationalOrder,
} from './operational-register';
import { recordWorkerOptions } from './operational-record-filters';

/**
 * Reports register at scale: the server applies the register filters and ships
 * at most `limit` rows per tab (daily / technical). The browser applies the
 * exact same filter functions to the shipped window, and asks the server again
 * when its filters no longer match the window's key.
 */
export const REPORT_WINDOW_STEP = 50;
export const REPORT_WINDOW_MAX = 1000;
export const REPORT_ATTENTION_STATES = ['draft', 'submitted', 'needs_changes'] as const;

export type ReportFieldFilters = {
  search: string;
  project: string;
  worker: string;
  client: string;
  from: string;
  to: string;
  status: string;
  order: OperationalOrder;
};

const orders: readonly OperationalOrder[] = ['newest', 'oldest', 'name', 'status'];

function text(row: PortalRow, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? '' : String(value);
}

export function reportFiltersFromUrl(params: URLSearchParams): ReportFieldFilters {
  const read = (key: string) => (params.get(key) ?? '').trim();
  const order = read('order') as OperationalOrder;
  return {
    search: read('q'),
    project: read('project'),
    worker: read('worker'),
    client: read('client'),
    from: read('from'),
    to: read('to'),
    status: read('status'),
    order: orders.includes(order) ? order : 'newest',
  };
}

export function reportWindowLimit(params: URLSearchParams): number {
  const requested = Math.trunc(Number(params.get('limit')));
  return Number.isFinite(requested) && requested > REPORT_WINDOW_STEP
    ? Math.min(REPORT_WINDOW_MAX, Math.ceil(requested / REPORT_WINDOW_STEP) * REPORT_WINDOW_STEP)
    : REPORT_WINDOW_STEP;
}

export function reportWindowKey(filters: ReportFieldFilters): string {
  return JSON.stringify([
    filters.search.trim(),
    filters.project,
    filters.worker,
    filters.client,
    filters.from,
    filters.to,
    filters.status,
    filters.order || 'newest',
  ]);
}

export const UNFILTERED_REPORT_WINDOW_KEY = reportWindowKey({
  search: '',
  project: '',
  worker: '',
  client: '',
  from: '',
  to: '',
  status: '',
  order: 'newest',
});

export const isTechnicalReport = (row: PortalRow) =>
  String(row.type ?? '').toLowerCase() === 'technical';

/** The register filter + order, shared by the server window and the browser. */
export function filterFieldReports<T extends PortalRow>(
  rows: readonly T[],
  filters: ReportFieldFilters,
): T[] {
  return operationalSort(
    rows.filter(
      (row) =>
        (!filters.project || text(row, 'project_id') === filters.project) &&
        (!filters.worker || text(row, 'worker_id') === filters.worker) &&
        (!filters.client || text(row, 'client_name') === filters.client) &&
        (!filters.from || text(row, 'date') >= filters.from) &&
        (!filters.to || text(row, 'date') <= filters.to) &&
        operationalStatusMatches(row.approval_state, filters.status, REPORT_ATTENTION_STATES) &&
        operationalMatches(row, filters.search, [
          'title',
          'project_number',
          'project_name',
          'client_name',
          'author_name',
          'created_by_name',
          'reviewed_by_name',
          'date',
        ]),
    ),
    filters.order,
    ['date'],
    ['author_name', 'project_name', 'title'],
    ['approval_state'],
  );
}

/** Server side: one bounded window of the visible field reports. */
export function buildReportWindow(
  records: readonly PortalRow[],
  filters: ReportFieldFilters,
  limit: number,
): { records: PortalRow[]; window: ReportWindow } {
  const isPending = (row: PortalRow) =>
    (REPORT_ATTENTION_STATES as readonly string[]).includes(String(row.approval_state));
  const shipped = new Map<string, PortalRow>();
  const tab = (rows: readonly PortalRow[]): ReportWindowTab => {
    const matches = filterFieldReports(rows, filters);
    for (const row of matches.slice(0, limit)) shipped.set(String(row.id), row);
    return {
      shown: Math.min(limit, matches.length),
      total: matches.length,
      pending: rows.filter(isPending).length,
      workers: recordWorkerOptions(rows, filters.project, ['author_name', 'created_by_name']),
    };
  };
  const daily = tab(records.filter((row) => !isTechnicalReport(row)));
  const technical = tab(records.filter(isTechnicalReport));
  return {
    records: [...shipped.values()],
    window: {
      key: reportWindowKey(filters),
      limit,
      daily,
      technical,
      clientOptions: [
        ...new Set(records.map((row) => text(row, 'client_name')).filter(Boolean)),
      ].sort(),
    },
  };
}

/** Whether the shipped window already holds every visible row (no refetch needed). */
export function reportWindowComplete(window: ReportWindow): boolean {
  return (
    window.key === UNFILTERED_REPORT_WINDOW_KEY &&
    window.daily.shown >= window.daily.total &&
    window.technical.shown >= window.technical.total
  );
}
