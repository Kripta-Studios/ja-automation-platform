import { describe, expect, it } from 'vitest';
import {
  operationalMatches,
  operationalNewestFirst,
  operationalOldestFirst,
  operationalPage,
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
});
