import { describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import {
  timeActionFailure,
  timeActions,
} from '../../apps/portal/src/lib/server/actions/time-actions';
import {
  expenseActionFailure,
  expenseActions,
} from '../../apps/portal/src/lib/server/actions/expense-actions';
import {
  reportActionFailure,
  reportActions,
} from '../../apps/portal/src/lib/server/actions/operations-actions';

describe('operational action problems', () => {
  it('returns the same serializable value and field shape from a native time POST', async () => {
    const form = new FormData();
    form.set('projectId', 'selected-project');
    form.set('workDate', 'invalid-date');
    form.set('summary', 'Work already entered');
    const response = await timeActions.createTime({
      request: new Request('http://localhost/app/time?/createTime', { method: 'POST', body: form }),
      params: { section: 'time' },
    } as never);
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      code: 'ACTION_VALIDATION_TIME_FIELDS',
      values: {
        projectId: 'selected-project',
        workDate: 'invalid-date',
        summary: 'Work already entered',
      },
      fieldErrors: expect.any(Object),
      remedies: [],
    });
    expect(JSON.parse(JSON.stringify(response.data))).toEqual(response.data);
  });

  it('keeps native report text after field validation', async () => {
    const form = new FormData();
    form.set('projectId', 'selected-project');
    form.set('workDate', 'invalid-date');
    form.set('tasksCompleted', 'Electrical inspection');
    const response = await reportActions.createDailyReport({
      request: new Request('http://localhost/app/reports?/createDailyReport', {
        method: 'POST',
        body: form,
      }),
      params: { section: 'reports' },
    } as never);
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      values: {
        projectId: 'selected-project',
        workDate: 'invalid-date',
        tasksCompleted: 'Electrical inspection',
      },
      fieldErrors: expect.any(Object),
    });
  });

  it('retains receipt guidance without serializing a native uploaded file', async () => {
    const form = new FormData();
    form.set('projectId', 'bad-project');
    form.set('spentOn', 'invalid-date');
    form.set('amount', '12.50');
    form.set('receipt', new File(['private receipt'], 'receipt.pdf', { type: 'application/pdf' }));
    const response = await expenseActions.createExpense({
      request: new Request('http://localhost/app/expenses?/createExpense', {
        method: 'POST',
        body: form,
      }),
      params: { section: 'expenses' },
    } as never);
    expect(response.status).toBe(400);
    expect(response.data.values).toMatchObject({ amount: '12.50', receiptNeedsReattach: true });
    expect(JSON.stringify(response.data)).not.toContain('private receipt');
  });

  it('returns a review step and retained scalar inputs for a stale week', () => {
    const response = timeActionFailure(
      new ConflictError('Week changed. Refresh and review its drafts before submitting'),
      {
        workerId: 'worker-1',
        weekStart: '2026-09-21',
        entries: '[{"id":"time-1","version":1}]',
        unwanted: new File(['secret'], 'secret.txt'),
      },
    );

    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'TIME_WEEK_CHANGED',
      messageKey: 'problem.time.weekChanged',
      remedies: [{ id: 'review_week' }],
      values: { workerId: 'worker-1', weekStart: '2026-09-21' },
    });
    expect(JSON.stringify(response.data)).not.toContain('secret');
  });

  it('distinguishes a linked meal conflict from the week version conflict', () => {
    const response = timeActionFailure(
      new ConflictError('Linked meal no longer matches its time entry'),
      { weekStart: '2026-09-21' },
    );
    expect(response.data).toMatchObject({
      code: 'TIME_LINKED_MEAL_CHANGED',
      remedies: [{ id: 'review_week' }],
    });
  });

  it('explains assignment and date access without exposing project settings', () => {
    const response = timeActionFailure(
      new AccessDeniedError('Active project assignment required'),
      { projectId: 'project-1', workDate: '2026-09-25' },
    );
    expect(response.status).toBe(403);
    expect(response.data).toMatchObject({
      code: 'TIME_ASSIGNMENT_REQUIRED',
      fieldErrors: { workDate: [expect.any(String)] },
      remedies: [{ id: 'contact_project_owner' }],
    });
  });

  it('does not serialize a receipt and tells the form it must be reattached', () => {
    const response = expenseActionFailure(new ValidationError('A committed receipt is required'), {
      projectId: 'project-1',
      spentOn: '2026-09-25',
      amount: '12.50',
      receipt: new File(['private receipt'], 'receipt.pdf'),
    });
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      code: 'EXPENSE_RECEIPT_REQUIRED',
      fieldErrors: { receipt: [expect.any(String)] },
      remedies: [{ id: 'attach_receipt' }],
      values: { amount: '12.50', receiptNeedsReattach: true },
    });
    expect(JSON.stringify(response.data)).not.toContain('private receipt');
  });

  it('keeps a submitted report in the audited correction flow', () => {
    const response = reportActionFailure(
      new ConflictError(
        'Submitted or approved reports require an audited correction draft before editing',
      ),
      { id: 'report-1', version: '2', title: 'Inspection' },
    );
    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'REPORT_CORRECTION_REQUIRED',
      remedies: [{ id: 'request_report_correction' }],
      values: { title: 'Inspection' },
    });
  });

  it('points safety report errors at the missing visible fields', () => {
    const response = reportActionFailure(
      new ValidationError('Safety-related changes require validation and rollback details'),
      { projectId: 'project-1', reportDate: '2026-09-25', validation: 'Tested', rollbackPlan: '' },
    );
    expect(response.data).toMatchObject({
      code: 'REPORT_SAFETY_DETAILS_REQUIRED',
      fields: { rollbackPlan: [expect.any(String)] },
    });
    expect(response.data.fields).not.toHaveProperty('validation');
    expect(response.data.fields).not.toHaveProperty('validationNotes');
  });

  it('uses the safety problem when schema validation runs before repository validation', async () => {
    const form = new FormData();
    form.set('projectId', '11111111-1111-4111-8111-111111111111');
    form.set('reportDate', '2026-09-25');
    form.set('systemName', 'Junkers PLC');
    form.set('changeSummary', 'Updated alarm logic');
    form.set('safetyRelated', 'on');
    const response = await reportActions.createTechnicalReport({
      request: new Request('http://localhost/app/reports?/createTechnicalReport', {
        method: 'POST',
        body: form,
      }),
      params: { section: 'reports' },
    } as never);

    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      code: 'REPORT_SAFETY_DETAILS_REQUIRED',
      fieldErrors: {
        validation: [expect.any(String)],
        rollbackPlan: [expect.any(String)],
      },
      remedies: [{ id: 'review_report' }],
      values: { systemName: 'Junkers PLC' },
    });
  });

  it('returns current-version review guidance for stale report submission', () => {
    const response = reportActionFailure(
      new ConflictError('Report changed or cannot be submitted'),
      { id: 'report-1', version: '1', type: 'daily' },
    );
    expect(response.data).toMatchObject({
      code: 'REPORT_SUBMISSION_CHANGED',
      remedies: [{ id: 'review_report' }],
    });
  });

  it('keeps unexpected technical details in the server log', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = expenseActionFailure(new Error('database token private'), { amount: '10' });
    expect(response.status).toBe(500);
    expect(response.data.code).toBe('UNEXPECTED_ERROR');
    expect(JSON.stringify(response.data)).not.toContain('database token private');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
