import { describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { timeActionFailure } from '../../apps/portal/src/lib/server/actions/time-actions';
import { reportActionFailure } from '../../apps/portal/src/lib/server/actions/operations-actions';

describe('time and operations known repository problems', () => {
  it.each([
    [
      new AccessDeniedError('Active account required'),
      403,
      'TIME_ACCOUNT_INACTIVE',
      'contact_owner',
    ],
    [new AccessDeniedError('Read-only role'), 403, 'TIME_READ_ONLY_ROLE', 'contact_project_owner'],
    [new ValidationError('Time entry not found'), 404, 'TIME_RECORD_UNAVAILABLE', 'review_time'],
    [
      new AccessDeniedError('Owner administration required'),
      403,
      'TIME_OWNER_ENTRY_REQUIRED',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Live authenticated session required'),
      401,
      'TIME_SESSION_ENDED',
      'sign_in_again',
    ],
    [
      new AccessDeniedError('Time entry ownership required'),
      403,
      'TIME_OWNERSHIP_REQUIRED',
      'contact_project_owner',
    ],
    [
      new ConflictError('Correction drafts are immutable and cannot be deleted'),
      409,
      'TIME_CORRECTION_DRAFT_IMMUTABLE',
      'review_time',
    ],
  ] as const)('maps %s to a specific time problem', (error, status, code, remedy) => {
    const response = timeActionFailure(error, {
      workerId: 'worker-1',
      workDate: '2026-09-25',
      summary: 'Retain my draft',
      secret: 'do-not-return',
    });
    expect(response.status).toBe(status);
    expect(response.data).toMatchObject({
      code,
      messageKey: expect.stringMatching(/^problem\.time\./),
      remedies: [{ id: remedy }],
      values: { workerId: 'worker-1', workDate: '2026-09-25', summary: 'Retain my draft' },
    });
    expect(response.data.message).not.toBe(error.message);
    expect(JSON.stringify(response.data)).not.toContain('do-not-return');
    expect(JSON.parse(JSON.stringify(response.data))).toEqual(response.data);
  });

  it('points a worker ownership failure at the selected worker', () => {
    const response = timeActionFailure(new AccessDeniedError('Time entry ownership required'), {
      workerId: 'worker-1',
    });
    expect(response.data.fieldErrors).toEqual({
      workerId: ['problem.time.ownershipRequired'],
    });
  });

  it.each([
    [
      new AccessDeniedError('Read-only role'),
      403,
      'REPORT_READ_ONLY_ROLE',
      'contact_project_owner',
    ],
    [new ValidationError('Record not found'), 404, 'RECORD_UNAVAILABLE', 'review_report'],
    [
      new AccessDeniedError('Record creator access required'),
      403,
      'RECORD_DELETE_CREATOR_REQUIRED',
      'contact_project_owner',
    ],
    [
      new ConflictError('Financially linked records cannot be deleted'),
      409,
      'RECORD_FINANCIALLY_LINKED',
      'contact_finance',
    ],
    [
      new ConflictError('Correction drafts are immutable and cannot be deleted'),
      409,
      'RECORD_CORRECTION_DRAFT_IMMUTABLE',
      'review_report',
    ],
    [
      new ConflictError('Technical reports with changes cannot be deleted'),
      409,
      'REPORT_TECHNICAL_CHANGES_LINKED',
      'review_report',
    ],
    [
      new ConflictError('Record approval history cannot be deleted'),
      409,
      'RECORD_REVIEW_HISTORY_LOCKED',
      'review_report',
    ],
    [
      new ConflictError('This time entry is linked to another record and cannot be deleted'),
      409,
      'TIME_DELETE_LINKED_RECORD',
      'review_time',
    ],
    [
      new AccessDeniedError('Report access required'),
      403,
      'REPORT_ACCESS_REQUIRED',
      'contact_project_owner',
    ],
    [
      new AccessDeniedError('Report submission access required'),
      403,
      'REPORT_SUBMISSION_ACCESS_REQUIRED',
      'contact_project_owner',
    ],
  ] as const)('maps %s to a specific operations problem', (error, status, code, remedy) => {
    const response = reportActionFailure(error, {
      recordType: 'daily_report',
      recordId: 'report-1',
      summary: 'Retain my report',
      secret: 'do-not-return',
    });
    expect(response.status).toBe(status);
    expect(response.data).toMatchObject({
      code,
      messageKey: expect.stringMatching(/^problem\.report\./),
      remedies: [{ id: remedy }],
      values: { recordType: 'daily_report', recordId: 'report-1', summary: 'Retain my report' },
    });
    expect(response.data.message).not.toBe(error.message);
    expect(JSON.stringify(response.data)).not.toContain('do-not-return');
  });

  it.each([
    ['time_entry', 'review_time'],
    ['expense', 'review_expense'],
  ] as const)('points %s delete conflicts at its own review page', (recordType, remedy) => {
    const response = reportActionFailure(new ValidationError('Record not found'), { recordType });
    expect(response.data.remedies).toEqual([{ id: remedy }]);
  });

  it('uses record wording for approval history shared by time, expense, and reports', () => {
    const response = reportActionFailure(
      new ConflictError('Record approval history cannot be deleted'),
      { recordType: 'expense' },
    );
    expect(response.data.messageKey).toBe('problem.report.recordReviewHistoryLocked');
    expect(response.data.message).toContain('This record');
    expect(response.data.remedies).toEqual([{ id: 'review_expense' }]);
  });

  it('leaves an unexpected exception on the safe generic path', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = timeActionFailure(new Error('private database detail'), {
        summary: 'Retain my draft',
      });
      expect(response.status).toBe(500);
      expect(response.data).toMatchObject({
        code: 'UNEXPECTED_ERROR',
        values: { summary: 'Retain my draft' },
      });
      expect(JSON.stringify(response.data)).not.toContain('private database detail');
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
