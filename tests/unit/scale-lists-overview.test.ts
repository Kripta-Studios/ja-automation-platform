import { describe, expect, it } from 'vitest';
import {
  buildTimeOverview,
  overviewEntries,
  overviewFilters,
  overviewPeriod,
  OTHER_KEY,
} from '$lib/server/time-overview';
import { buildExpenseOverview, captureExpenses } from '$lib/server/expense-overview';
import { suggestedOrder } from '$lib/portal/searchable-selects';

const timeRow = (i: number, worker: number, project: number, minutes = 60, state = 'submitted') => ({
  id: `t${i}`,
  worker_id: `w${worker}`,
  worker_name: `Wörker ${String(worker).padStart(3, '0')}`,
  project_id: `p${project}`,
  project_number: `P-${project}`,
  project_name: `Project ${project}`,
  work_date: '2026-11-17',
  category: 'regular',
  minutes,
  approval_state: state,
  rate_minor: 999,
});

describe('hours overview at scale', () => {
  const rows = Array.from({ length: 600 }, (_, i) => timeRow(i, i % 40, i % 25, 30 + (i % 40) * 5));
  const params = new URLSearchParams('view=overview&period=this_week');
  const period = overviewPeriod(params, '2026-11-17');

  it('sends top rows, top columns + Other and no per-entry list without a drill-down', () => {
    const filters = overviewFilters(params);
    const { entries, workers } = overviewEntries(rows, filters);
    const data = buildTimeOverview({ entries, workers, period, filters, params, today: '2026-11-17' });
    expect(data.rows).toHaveLength(15);
    expect(data.rowCount).toBe(40);
    expect(data.others?.count).toBe(25);
    expect(data.columns).toHaveLength(10);
    expect(data.otherColumn?.count).toBe(15);
    expect(data.drill).toBeNull();
    // Rows sorted by hours, largest first; totals add up.
    expect(data.rows[0]!.bucket.minutes).toBeGreaterThanOrEqual(data.rows[1]!.bucket.minutes);
    const shown = data.rows.reduce((sum, row) => sum + row.bucket.minutes, 0);
    expect(shown + data.others!.bucket.minutes).toBe(data.total.minutes);
    // Operational fields only.
    expect(JSON.stringify(data)).not.toMatch(/rate_minor|999/u);
  });

  it('pages the drill-down and supports the Other column', () => {
    const p = new URLSearchParams(`${params}&cell=*|${OTHER_KEY}&cpage=2`);
    const filters = overviewFilters(p);
    const { entries, workers } = overviewEntries(rows, filters);
    const data = buildTimeOverview({ entries, workers, period, filters, params: p, today: '2026-11-17' });
    expect(data.drill?.page).toBe(2);
    expect(data.drill?.entries.length).toBeLessThanOrEqual(25);
    expect(data.drill?.count).toBe(data.otherColumn?.bucket.entries);
  });

  it('search is accent-insensitive on worker and project', () => {
    const p = new URLSearchParams(`${params}&find=worker 007`);
    const { entries } = overviewEntries(rows, overviewFilters(p));
    expect(new Set(entries.map((entry) => entry.worker_id))).toEqual(new Set(['w7']));
    const q = new URLSearchParams(`${params}&find=p-24`);
    expect(overviewEntries(rows, overviewFilters(q)).entries.every((e) => e.project_id === 'p24')).toBe(true);
  });
});

const expenseRow = (i: number, worker: number, spent = '2026-11-10', state = 'submitted', currency = 'USD') => ({
  id: `e${i}`,
  worker_id: `w${worker}`,
  worker_name: `Person ${worker}`,
  project_id: `p${i % 3}`,
  project_number: `P-${i % 3}`,
  project_name: 'Plant',
  category: i % 2 ? 'meals' : 'fuel',
  vendor: i === 7 ? 'Café Ñandú' : 'Shell',
  spent_on: spent,
  amount_minor: String(1000 + i),
  currency,
  approval_state: state,
});

describe('expenses at scale', () => {
  const rows = Array.from({ length: 300 }, (_, i) => expenseRow(i, i % 60, i % 2 ? '2026-11-10' : '2026-11-12', 'submitted', i % 5 ? 'USD' : 'EUR'));

  it('overview aggregates exactly per currency, top 15 groups, one opened group paged', () => {
    const data = buildExpenseOverview(rows, new URLSearchParams('view=overview&open=w1&opage=1'), '2026-11-17');
    expect(data.count).toBe(300);
    const usd = rows.filter((row) => row.currency === 'USD').reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);
    expect(data.sums.find(([currency]) => currency === 'USD')?.[1]).toBe(usd.toString());
    expect(data.groups).toHaveLength(15);
    expect(data.groupCount).toBe(60);
    expect(data.others?.count).toBe(45);
    expect(data.open?.id).toBe('w1');
    expect(data.open?.items.length).toBe(5);
  });

  it('search matches vendor without accents and amounts', () => {
    expect(buildExpenseOverview(rows, new URLSearchParams('find=cafe nandu'), '2026-11-17').count).toBe(1);
    expect(buildExpenseOverview(rows, new URLSearchParams('find=10.07'), '2026-11-17').count).toBe(1);
  });

  it('capture keeps only the person’s recent and open items', () => {
    const mine = [
      expenseRow(1, 9, '2026-11-16'),
      expenseRow(2, 9, '2026-06-01', 'approved'),
      expenseRow(3, 9, '2026-05-01', 'draft'),
      expenseRow(4, 8, '2026-11-16'),
    ];
    const result = captureExpenses(mine, { userId: 'w9', createdByMe: null, weeks: 4, today: '2026-11-17' });
    expect(result.records.map((row) => row.id)).toEqual(['e1', 'e3']);
    expect(result.olderCount).toBe(1);
  });
});

describe('long pickers', () => {
  it('puts the empty choice, recent picks, then assigned people first', () => {
    const options = [
      { value: '' },
      { value: 'a' },
      { value: 'b', priority: true },
      { value: 'c' },
      { value: 'd' },
    ];
    expect(suggestedOrder(options, ['d'])).toEqual({ order: [0, 4, 2, 1, 3], suggested: 2 });
  });
});
