import { describe, expect, it } from 'vitest';
import {
  filterQueueRows,
  groupQueueRows,
  parseApprovalQueueQuery,
  queueFilterOptions,
  queueTotals,
  searchKey,
} from '../../apps/portal/src/lib/portal/approval-queue-page';

const workers: Record<string, string> = { w1: 'José Núñez', w2: 'Ana Lima' };
const projects: Record<string, string> = {
  p1: 'P-001 São Paulo plant Acme',
  p2: 'P-002 Valencia line Beta',
};
const labels = {
  worker: (id: string) => workers[id] ?? '',
  projectSearch: (id: string) => projects[id] ?? '',
};

const rows = [
  { type: 'time', id: 't1', worker_id: 'w1', project_id: 'p1', date: '2026-11-10', amount: 480 },
  { type: 'time', id: 't2', worker_id: 'w1', project_id: 'p2', date: '2026-11-11', amount: 240 },
  { type: 'time', id: 't3', worker_id: 'w2', project_id: 'p1', date: '2026-11-03', amount: 60 },
  {
    type: 'expense',
    id: 'e1',
    worker_id: 'w2',
    project_id: 'p2',
    date: '2026-11-12',
    expense_currency: 'EUR',
    expense_amount_minor: '1250',
  },
  { type: 'daily', id: 'd1', worker_id: 'w1', project_id: 'p1', date: '2026-11-12' },
];

describe('approval queue page shaping', () => {
  it('parses tab, filters and paging from the URL with safe defaults', () => {
    const query = parseApprovalQueueQuery(
      new URLSearchParams('tab=expenses&search=%20jose%20&week=2026-11-09&show=33&view=approved'),
    );
    expect(query).toMatchObject({
      tab: 'expenses',
      search: 'jose',
      week: '2026-11-09',
      view: 'approved',
      show: 50,
    });
    expect(
      parseApprovalQueueQuery(new URLSearchParams('tab=bogus&week=2026-11-11&show=-4')),
    ).toMatchObject({ tab: 'time', week: '', show: 20, view: 'pending' });
    expect(parseApprovalQueueQuery(new URLSearchParams(''), 'reports').tab).toBe('reports');
    expect(parseApprovalQueueQuery(new URLSearchParams('show=999999')).show).toBe(400);
  });

  it('searches worker, project and client without accents or case', () => {
    expect(searchKey('José NÚÑEZ')).toBe('jose nunez');
    const ids = (search: string) =>
      filterQueueRows(rows, { search, worker: '', project: '', week: '' }, labels).map(
        (row) => row.id,
      );
    expect(ids('jose')).toEqual(['t1', 't2', 'd1']);
    expect(ids('sao paulo')).toEqual(['t1', 't3', 'd1']);
    expect(ids('beta ana')).toEqual(['e1']);
    expect(ids('nobody')).toEqual([]);
  });

  it('applies worker, project and week filters together', () => {
    const found = filterQueueRows(
      rows,
      { search: '', worker: 'w1', project: 'p1', week: '2026-11-09' },
      labels,
    ).map((row) => row.id);
    expect(found).toEqual(['t1', 'd1']);
  });

  it('groups by worker and Monday week, oldest week first', () => {
    const groups = groupQueueRows(rows, 'time', (id) => workers[id] ?? '');
    expect(groups.map((group) => [group.key, group.rows.map((row) => row.id)])).toEqual([
      ['time:w2:2026-11-02', ['t3']],
      ['time:w1:2026-11-09', ['t1', 't2']],
    ]);
  });

  it('builds filter options and exact totals per currency', () => {
    const options = queueFilterOptions(rows, {
      worker: (id) => workers[id] ?? '',
      project: (id) => projects[id] ?? '',
    });
    expect(options.workers.map(([id]) => id)).toEqual(['w2', 'w1']);
    expect(options.weeks).toEqual(['2026-11-09', '2026-11-02']);
    expect(queueTotals(rows)).toEqual({
      timeCount: 3,
      minutes: 780,
      expenseCount: 1,
      expenseTotals: [{ currency: 'EUR', minor: '1250' }],
    });
  });
});
