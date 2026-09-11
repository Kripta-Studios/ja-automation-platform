import { describe, expect, it } from 'vitest';
import {
  browseRecords,
  recordDate,
  recordState,
} from '../apps/portal/src/lib/portal/ui/record-browser';

describe('shared record browser', () => {
  it('sorts pending reviews before approved history, oldest first within a state', () => {
    const rows = [
      { id: 'approved', approvalState: 'approved', periodStart: '2026-01-01' },
      { id: 'new', approvalState: 'submitted', periodStart: '2026-09-01' },
      { id: 'old', approvalState: 'submitted', periodStart: '2026-08-01' },
    ];
    expect(browseRecords(rows, '', '', 'priority').map((row) => row.id)).toEqual([
      'old',
      'new',
      'approved',
    ]);
    expect(rows[0].id).toBe('approved');
  });
  it('recognizes planning, reimbursement and finance DTO fields', () => {
    expect(recordDate({ starts_at: '2026-09-11T10:00:00Z' })).toBe('2026-09-11T10:00:00Z');
    expect(recordState({ reimbursementState: 'pending' })).toBe('pending');
    expect(
      browseRecords([{ workerName: 'Zoë' }, { workerName: 'Ana' }], '', '', 'name')[0].workerName,
    ).toBe('Ana');
    expect(
      browseRecords(
        [{ client_name: 'Ácme', project_name: 'Line 4', worker_name: 'José' }],
        'acme jose',
        '',
        'priority',
      ),
    ).toHaveLength(1);
    expect(recordState({ browser_status: 'ready_for_signature', state: 'review' })).toBe(
      'ready_for_signature',
    );
  });
  it('uses specific business dates before metadata and filters statuses', () => {
    const rows = [
      { id: 'one', state: 'failed', period_start: '2026-01-01', created_at: '2026-09-10' },
      { id: 'two', state: 'queued', period_start: '2026-02-01', created_at: '2026-09-09' },
    ];
    expect(browseRecords(rows, '', '', 'oldest')[0].id).toBe('one');
    expect(browseRecords(rows, '', 'failed', 'oldest').map((row) => row.id)).toEqual(['one']);
  });
});
