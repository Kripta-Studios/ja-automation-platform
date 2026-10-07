import { describe, expect, it } from 'vitest';
import { assistantRecordsFromPage } from './records';

describe('authorized page record options', () => {
  it('uses only known project projections and returns stable IDs plus labels', () => {
    const source = {
      projects: [
        { id: 'p1', name: 'BBS', internalCost: '900' },
        { id: 'p2', name: 'BBS' },
      ],
      overview: { project: { id: 'p1', name: 'BBS' } },
      arbitrary: { projects: [{ id: 'hidden', name: 'Hidden' }] },
      assignments: [{ id: 'assignment', projectId: 'p3' }],
    };
    expect(assistantRecordsFromPage(source, 'project')).toEqual([
      { kind: 'project', id: 'p1', label: 'BBS · p1' },
      { kind: 'project', id: 'p2', label: 'BBS · p2' },
    ]);
    expect(source.projects[0]?.internalCost).toBe('900');
  });

  it('does not reinterpret generic records or unrelated foreign keys', () => {
    const data = {
      section: 'projects',
      records: [{ id: 'r1' }],
      record: { id: 'r2' },
      projects: [{ projectId: 'p1', name: 'Project' }],
    };
    expect(assistantRecordsFromPage(data, 'time', '/app/projects/p1')).toEqual([]);
    expect(assistantRecordsFromPage(data, 'project')).toEqual([]);
  });

  it('reads the matching operational register only', () => {
    const data = {
      section: 'expenses',
      records: [{ id: 'e1', description: 'Lunch', expense_date: '2026-10-07', amount: '25' }],
    };
    expect(assistantRecordsFromPage(data, 'expense')).toEqual([
      { kind: 'expense', id: 'e1', label: 'Lunch · 2026-10-07 · e1' },
    ]);
    expect(assistantRecordsFromPage(data, 'time')).toEqual([]);
  });

  it('recognizes authorized detail rows without parsing IDs from the URL', () => {
    const data = { record: { id: 't1', work_date: '2026-10-07' } };
    expect(assistantRecordsFromPage(data, 'time', '/j-aautomation/app/time/other-id')).toEqual([
      { kind: 'time', id: 't1', label: '2026-10-07 · t1' },
    ]);
    expect(assistantRecordsFromPage({}, 'time', '/app/time/t1')).toEqual([]);
  });

  it('never mixes period report IDs into daily or technical report options', () => {
    const data = {
      periodReports: [{ id: 'period' }],
      detail: { report: { id: 'daily', report_date: '2026-10-07' } },
    };
    expect(assistantRecordsFromPage(data, 'report').map((record) => record.id)).toEqual(['daily']);
  });

  it('rejects malformed IDs, arrays and absent projections', () => {
    const data = {
      projects: [
        null,
        ['array'],
        { id: { nested: 'id' } },
        { id: 'bad\nvalue' },
        { id: '', name: 'Empty' },
        { id: 'x'.repeat(201) },
      ],
    };
    expect(assistantRecordsFromPage(data, 'project')).toEqual([]);
    expect(assistantRecordsFromPage(null, 'invoice')).toEqual([]);
  });
});
