import { normalizeSelectSearch } from '$lib/portal/searchable-selects';
import { personDisplayName, proposedPersonName } from '$lib/portal/person-name';

/**
 * Server-side scope for the People directory (`/projects?view=team`).
 *
 * The directory used to ship every person and every assignment to the browser
 * (about 2 MB for 170 people) and filter there. With 100+ workers the Owner must
 * get one page of 25 people, filtered on the server; a person page ships only
 * that person. Filters live in the URL: `pq`, `prole`, `pstatus`, `project`, `ppage`.
 */
export const PEOPLE_PAGE_SIZE = 25;
const OWNER_EMAIL = 'antonny.luty@j-aautomation.com';

type Row = Record<string, unknown>;

export type PeopleStatusFilter = 'active' | 'inactive' | 'all';
export type PeopleQuery = Readonly<{
  q: string;
  role: string;
  status: PeopleStatusFilter;
  project: string;
  page: number;
}>;

export type PeopleDirectoryMeta = Readonly<{
  q: string;
  role: string;
  status: PeopleStatusFilter;
  project: string;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Every person the viewer may see (any status). */
  total: number;
  activeTotal: number;
  /** People matching the current filters (all pages). */
  filtered: number;
  roleOptions: string[];
  projectOptions: Array<{ id: string; name: string }>;
  nameFixCount: number;
}>;

function text(row: Row | undefined, ...keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return '';
}

/**
 * URL keys are prefixed (`pq`, `prole`, `pstatus`, `ppage`) because `q` is the
 * global search and `status` already scopes the project list on this route.
 */
export function peopleQueryFrom(url: URL): PeopleQuery {
  const status = url.searchParams.get('pstatus');
  const page = Number.parseInt(url.searchParams.get('ppage') ?? '1', 10);
  return {
    q: (url.searchParams.get('pq') ?? '').trim().slice(0, 120),
    role: (url.searchParams.get('prole') ?? '').trim().slice(0, 40),
    status: status === 'inactive' || status === 'all' ? status : 'active',
    project: (url.searchParams.get('project') ?? '').trim().slice(0, 64),
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

export function personAccessRole(worker: Row): string {
  const profile = text(worker, 'workforce_profile');
  if (profile === 'external_technician' || profile === 'supplier_coordinator') return profile;
  return text(worker, 'role') || 'worker';
}

function isCurrent(assignment: Row, today: string): boolean {
  const ends = text(assignment, 'ends_on');
  return text(assignment, 'status') === 'active' && (!ends || ends >= today);
}

function needsNameFix(worker: Row): boolean {
  return (
    (text(worker, 'status') || 'active') === 'active' &&
    text(worker, 'email').toLowerCase() !== OWNER_EMAIL &&
    Boolean(proposedPersonName(worker.name, worker.email))
  );
}

export function pagePeopleDirectory<W extends Row, A extends Row>(
  workers: readonly W[],
  assignments: readonly A[],
  query: PeopleQuery,
  today = new Date().toISOString().slice(0, 10),
): {
  rows: W[];
  assignments: A[];
  nameFixWorkers: W[];
  meta: PeopleDirectoryMeta;
} {
  const byWorker = new Map<string, A[]>();
  for (const assignment of assignments) {
    const id = text(assignment, 'worker_id', 'user_id');
    if (!id) continue;
    const list = byWorker.get(id);
    if (list) list.push(assignment);
    else byWorker.set(id, [assignment]);
  }
  const needle = normalizeSelectSearch(query.q);
  const filtered = workers
    .filter((worker) => {
      const id = text(worker, 'id', 'worker_id', 'user_id');
      const status = text(worker, 'status') || 'active';
      if (query.status === 'active' && status !== 'active') return false;
      if (query.status === 'inactive' && status === 'active') return false;
      if (query.role && personAccessRole(worker) !== query.role) return false;
      const own = byWorker.get(id) ?? [];
      if (
        query.project &&
        !own.some(
          (assignment) =>
            text(assignment, 'project_id') === query.project && isCurrent(assignment, today),
        )
      )
        return false;
      if (!needle) return true;
      return normalizeSelectSearch(
        [
          personDisplayName(worker.name ?? worker.worker_name, worker.email),
          text(worker, 'name', 'worker_name'),
          text(worker, 'email'),
          text(worker, 'phone'),
          text(worker, 'company'),
          ...own.map((assignment) =>
            [text(assignment, 'project_number'), text(assignment, 'project_name')].join(' '),
          ),
        ].join(' '),
      ).includes(needle);
    })
    .map((worker) => ({
      worker,
      sortKey: personDisplayName(worker.name ?? worker.worker_name, worker.email) || '',
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map((entry) => entry.worker);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PEOPLE_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const rows = filtered.slice((page - 1) * PEOPLE_PAGE_SIZE, page * PEOPLE_PAGE_SIZE);
  const rowIds = new Set(rows.map((worker) => text(worker, 'id', 'worker_id', 'user_id')));
  const projectOptions = new Map<string, string>();
  for (const assignment of assignments) {
    const id = text(assignment, 'project_id');
    const label = [text(assignment, 'project_number'), text(assignment, 'project_name')]
      .filter(Boolean)
      .join(' · ');
    if (id && label) projectOptions.set(id, label);
  }
  const nameFixWorkers = workers.filter(needsNameFix);
  return {
    rows,
    assignments: assignments.filter((assignment) =>
      rowIds.has(text(assignment, 'worker_id', 'user_id')),
    ),
    nameFixWorkers,
    meta: {
      q: query.q,
      role: query.role,
      status: query.status,
      project: query.project,
      page,
      pageSize: PEOPLE_PAGE_SIZE,
      pageCount,
      total: workers.length,
      activeTotal: workers.filter((worker) => (text(worker, 'status') || 'active') === 'active')
        .length,
      filtered: filtered.length,
      roleOptions: [...new Set(workers.map(personAccessRole))].sort(),
      projectOptions: [...projectOptions]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      nameFixCount: nameFixWorkers.length,
    },
  };
}
