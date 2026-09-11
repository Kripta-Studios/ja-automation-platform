import { describe, expect, it } from 'vitest';
import {
  operationalMatches,
  operationalNewestFirst,
  operationalOldestFirst,
  operationalPage,
  operationalSort,
  operationalStatusMatches,
} from '../apps/portal/src/lib/portal/sections/operational-register';

describe('operational register helpers', () => {
  const rows = [
    { id: 'a', project_name: 'São Paulo', date: '2026-09-03' },
    { id: 'b', project_name: 'Málaga', date: '2026-09-01' },
  ];

  it('matches accents without changing displayed data', () => {
    expect(operationalMatches(rows[0]!, 'sao', ['project_name'])).toBe(true);
    expect(operationalMatches(rows[1]!, 'MALAGA', ['project_name'])).toBe(true);
  });

  it('orders and pages compact registers deterministically', () => {
    expect(operationalNewestFirst(rows, ['date']).map((row) => row.id)).toEqual(['a', 'b']);
    expect(operationalOldestFirst(rows, ['date']).map((row) => row.id)).toEqual(['b', 'a']);
    expect(operationalPage(Array.from({ length: 9 }), 2).rows).toHaveLength(1);
  });

  it('orders by business date, name or status without mutating the source', () => {
    const operationalRows = [
      {
        id: 'approved-zoe',
        work_date: '2026-09-02',
        worker_name: 'Zoë',
        approval_state: 'approved',
      },
      {
        id: 'submitted-ana',
        work_date: '2026-09-01',
        worker_name: 'Ana',
        approval_state: 'submitted',
      },
    ];

    expect(
      operationalSort(
        operationalRows,
        'oldest',
        ['work_date'],
        ['worker_name'],
        ['approval_state'],
      ).map((row) => row.id),
    ).toEqual(['submitted-ana', 'approved-zoe']);
    expect(
      operationalSort(
        operationalRows,
        'name',
        ['work_date'],
        ['worker_name'],
        ['approval_state'],
      ).map((row) => row.id),
    ).toEqual(['submitted-ana', 'approved-zoe']);
    expect(
      operationalSort(
        operationalRows,
        'status',
        ['work_date'],
        ['worker_name'],
        ['approval_state'],
      ).map((row) => row.id),
    ).toEqual(['approved-zoe', 'submitted-ana']);
    expect(operationalRows.map((row) => row.id)).toEqual(['approved-zoe', 'submitted-ana']);
  });

  it('matches a combined attention filter without including completed history', () => {
    const attention = ['draft', 'submitted', 'needs_changes'];
    expect(operationalStatusMatches('draft', 'attention', attention)).toBe(true);
    expect(operationalStatusMatches('submitted', 'attention', attention)).toBe(true);
    expect(operationalStatusMatches('needs_changes', 'attention', attention)).toBe(true);
    expect(operationalStatusMatches('approved', 'attention', attention)).toBe(false);
    expect(operationalStatusMatches('approved', '', attention)).toBe(true);
  });
});
