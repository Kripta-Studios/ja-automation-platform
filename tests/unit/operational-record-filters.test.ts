import { describe, expect, it } from 'vitest';
import {
  availableWorkerSelection,
  recordWorkerOptions,
} from '../../apps/portal/src/lib/portal/sections/operational-record-filters.ts';

describe('operational register worker filters', () => {
  const visibleRecords = [
    { project_id: 'mag', worker_id: 'b', worker_name: 'Bea', author_name: 'Bea' },
    { project_id: 'mag', worker_id: 'a', worker_name: 'Ana', author_name: 'Ana' },
    { project_id: 'mag', worker_id: 'a', worker_name: 'Ana', author_name: 'Ana' },
    { project_id: 'other', worker_id: 'c', worker_name: 'Carlos', author_name: 'Carlos' },
  ];

  it('shows distinct named workers only for the selected visible project', () => {
    const mag = recordWorkerOptions(visibleRecords, 'mag', ['worker_name']);
    expect(mag).toEqual([
      ['a', 'Ana'],
      ['b', 'Bea'],
    ]);
    expect(availableWorkerSelection('a', mag)).toBe('a');
    expect(availableWorkerSelection('c', mag)).toBe('');
    expect(recordWorkerOptions(visibleRecords, 'other', ['author_name'])).toEqual([
      ['c', 'Carlos'],
    ]);
  });

  it('does not turn an unseen roster member into a filter option', () => {
    expect(recordWorkerOptions(visibleRecords, 'mag', ['author_name']).map(([id]) => id)).toEqual([
      'a',
      'b',
    ]);
    expect(
      availableWorkerSelection(
        'unseen',
        recordWorkerOptions(visibleRecords, 'mag', ['author_name']),
      ),
    ).toBe('');
  });
});
