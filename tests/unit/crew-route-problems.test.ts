import { beforeEach, describe, expect, it, vi } from 'vitest';

const scenario = vi.hoisted(() => ({
  message: '',
  kind: 'conflict' as 'conflict' | 'validation' | 'access' | 'unexpected',
  allocation: null as null | {
    id: string;
    expenseId: string;
    vendor: string;
    totalMinor: number;
    currency: string;
    allocations: { timeEntryId: string; workerName: string; amountMinor: number }[];
  },
}));

vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  const verdict = () => {
    if (!scenario.message) return;
    if (scenario.kind === 'unexpected') throw new Error(scenario.message);
    if (scenario.kind === 'validation') throw new original.ValidationError(scenario.message);
    if (scenario.kind === 'access') throw new original.AccessDeniedError(scenario.message);
    throw new original.ConflictError(scenario.message);
  };
  return {
    ...original,
    CrewLeaderRepository: class {
      grant() {
        verdict();
        return { id: 'grant-1' };
      }
      createBatch() {
        verdict();
        return { created: [], replayed: false };
      }
      updateDraft() {
        verdict();
        return { id: 'time-1', version: 2 };
      }
      createCorrectedDraft() {
        verdict();
        return { id: 'correction-1', version: 1 };
      }
      submit() {
        verdict();
        return { id: 'time-1', version: 2 };
      }
      entryDetail() {
        verdict();
        return { projectId: 'project-1', workDate: '2026-09-25' };
      }
    },
    CrewSharedExpenseAllocationRepository: class {
      create() {
        verdict();
        return { id: 'allocation-1', replayed: false };
      }
      allocationForReceipt() {
        return scenario.allocation;
      }
    },
  };
});

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { role: 'worker', userId: 'chief-1' },
    sqlite: { close: () => {} },
  }),
}));

import { actions as crewActions } from '../../apps/portal/src/routes/app/crew/+page.server';
import { actions as detailActions } from '../../apps/portal/src/routes/app/crew/time/[id]/+page.server';

function request(form: FormData): Request {
  return new Request('http://localhost/j-aautomation/app/crew', { method: 'POST', body: form });
}

beforeEach(() => {
  scenario.message = '';
  scenario.kind = 'conflict';
  scenario.allocation = null;
});

describe('crew route problem contract', () => {
  it.each([
    [
      'Start date must be a date',
      'CREW_GRANT_START_DATE_INVALID',
      'problem.crew.grantStartDateInvalid',
      'startsOn',
    ],
    [
      'Start date must be a real date',
      'CREW_GRANT_START_DATE_INVALID',
      'problem.crew.grantStartDateInvalid',
      'startsOn',
    ],
    [
      'End date must be a date',
      'CREW_GRANT_END_DATE_INVALID',
      'problem.crew.grantEndDateInvalid',
      'endsOn',
    ],
    [
      'End date must be a real date',
      'CREW_GRANT_END_DATE_INVALID',
      'problem.crew.grantEndDateInvalid',
      'endsOn',
    ],
  ])('maps invalid delegation date: %s', async (message, code, messageKey, field) => {
    scenario.message = message;
    scenario.kind = 'validation';
    const form = new FormData();
    form.set('projectId', 'project-1');
    form.set('chiefUserId', 'chief-1');
    form.set('workerUserId', 'worker-1');
    form.set('startsOn', '2026-02-30');
    form.set('endsOn', '2026-13-01');
    const response = await crewActions.grant!({
      locals: { user: { id: 'chief-1' } },
      request: request(form),
    } as never);
    expect(response).toMatchObject({
      status: 400,
      data: {
        code,
        messageKey,
        operation: 'grant',
        actionName: 'grant',
        values: {
          projectId: 'project-1',
          workerUserId: 'worker-1',
          startsOn: '2026-02-30',
          endsOn: '2026-13-01',
        },
        fieldErrors: { [field]: [messageKey] },
        remedies: [{ id: 'review_delegations' }],
      },
    });
  });

  it.each([
    [
      'Batch request is required',
      'validation',
      'CREW_BATCH_REQUEST_REQUIRED',
      'problem.crew.batchRequestRequired',
      {},
      'review_crew_day',
      400,
    ],
    [
      'Live authenticated session required',
      'access',
      'CREW_SESSION_EXPIRED',
      'problem.crew.sessionExpired',
      {},
      'sign_in_again',
      401,
    ],
  ] as const)(
    'maps batch blocker: %s',
    async (message, kind, code, messageKey, fieldErrors, remedy, status) => {
      scenario.message = message;
      scenario.kind = kind;
      const form = new FormData();
      form.set('requestId', '');
      form.set('projectId', 'project-1');
      form.set('workDate', '2026-09-25');
      form.set('mode', 'shared');
      form.set('sharedHours', '7.5');
      form.set('summary', 'Maintenance');
      form.append('workerIds', 'worker-1');
      const response = await crewActions.createBatch!({
        locals: { user: { id: 'chief-1' } },
        request: request(form),
      } as never);
      expect(response).toMatchObject({
        status,
        data: {
          code,
          messageKey,
          operation: 'createBatch',
          actionName: 'createBatch',
          values: { sharedHours: '7.5', summary: 'Maintenance' },
          workerIds: ['worker-1'],
          fieldErrors,
          remedies: [{ id: remedy }],
        },
      });
    },
  );

  it.each([
    [
      'Work date must be a date',
      'update',
      'CREW_WORK_DATE_INVALID',
      'problem.crew.workDateInvalid',
      'workDate',
      400,
      'review_time',
    ],
    [
      'Work date must be a real date',
      'update',
      'CREW_WORK_DATE_INVALID',
      'problem.crew.workDateInvalid',
      'workDate',
      400,
      'review_time',
    ],
    [
      'Work performed is required',
      'update',
      'CREW_SUMMARY_REQUIRED',
      'problem.crew.summaryRequired',
      'summary',
      400,
      'review_time',
    ],
    [
      'Correction reason is required',
      'correct',
      'CREW_CORRECTION_REASON_REQUIRED',
      'problem.crew.correctionReasonRequired',
      'reason',
      400,
      'review_time',
    ],
    [
      'Active account required',
      'update',
      'CREW_ACCOUNT_INACTIVE',
      'problem.crew.accountInactive',
      '',
      403,
      'contact_project_owner',
    ],
    [
      'Live authenticated session required',
      'update',
      'CREW_SESSION_EXPIRED',
      'problem.crew.sessionExpired',
      '',
      401,
      'sign_in_again',
    ],
    [
      'Valid project timezone required for crew access',
      'update',
      'CREW_PROJECT_TIMEZONE_REQUIRED',
      'problem.crew.projectTimezoneRequired',
      '',
      409,
      'contact_project_owner',
    ],
  ] as const)(
    'maps detail blocker: %s',
    async (message, operation, code, messageKey, field, status, remedy) => {
      scenario.message = message;
      scenario.kind = field ? 'validation' : 'access';
      const form = new FormData();
      form.set('version', '1');
      form.set('requestId', 'correction-1');
      form.set('workDate', '2026-02-30');
      form.set('category', 'regular');
      form.set('minutes', '450');
      form.set('summary', 'Completed work');
      form.set('reason', 'Incorrect date');
      const response = await detailActions[operation]!({
        locals: { user: { id: 'chief-1' } },
        params: { id: 'time-1' },
        request: request(form),
      } as never);
      expect(response).toMatchObject({
        status,
        data: {
          code,
          messageKey,
          operation,
          actionName: operation,
          values: {
            version: '1',
            workDate: '2026-02-30',
            summary: 'Completed work',
            reason: 'Incorrect date',
          },
          fieldErrors: field ? { [field]: [messageKey] } : {},
          remedies: [{ id: remedy }],
        },
      });
    },
  );

  it('returns a precise stale batch problem with retained entries', async () => {
    scenario.message = 'Batch request was used with different values';
    const form = new FormData();
    form.set('requestId', 'request-1234567890');
    form.set('projectId', 'project-1');
    form.set('workDate', '2026-09-25');
    form.set('mode', 'shared');
    form.set('sharedHours', '7.5');
    form.set('summary', 'Maintenance');
    form.set('category', 'regular');
    form.set('workerIds', 'worker-1');
    const response = await crewActions.createBatch!({
      locals: { user: { id: 'chief-1' } },
      request: request(form),
    } as never);
    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'CREW_BATCH_RETRY_CHANGED',
      messageKey: 'problem.crew.batchRetryChanged',
      operation: 'createBatch',
      remedies: [{ id: 'review_crew_day' }],
      values: { sharedHours: '7.5', summary: 'Maintenance' },
      workerIds: ['worker-1'],
    });
  });

  it('explains a receipt allocation mismatch beside the selected rows', async () => {
    scenario.message = 'Crew allocations must equal the receipt amount exactly';
    scenario.kind = 'validation';
    const form = new FormData();
    form.set('requestId', 'request-1234567890');
    form.set('expenseId', 'expense-1');
    form.set('timeEntryIds', 'time-1');
    form.set('timeEntryIds', 'time-2');
    form.set('amount_time-2', '4.00');
    const response = await crewActions.allocateReceipt!({
      locals: { user: { id: 'chief-1' } },
      request: request(form),
    } as never);
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      code: 'CREW_RECEIPT_TOTAL_MISMATCH',
      fieldErrors: { timeEntryIds: [expect.any(String)] },
      remedies: [{ id: 'review_receipts' }],
    });
  });

  it('identifies a same-chief allocation made after the form opened and retains the attempted split', async () => {
    scenario.message = 'Unallocated chief-entered receipt required';
    scenario.kind = 'access';
    scenario.allocation = {
      id: 'allocation-1',
      expenseId: 'expense-1',
      vendor: 'Crew parking',
      totalMinor: 1250,
      currency: 'EUR',
      allocations: [
        { timeEntryId: 'time-1', workerName: 'Worker A', amountMinor: 800 },
        { timeEntryId: 'time-2', workerName: 'Worker B', amountMinor: 450 },
      ],
    };
    const form = new FormData();
    form.set('projectId', 'project-1');
    form.set('workDate', '2026-09-25');
    form.set('requestId', 'request-1234567890');
    form.set('expenseId', 'expense-1');
    form.append('timeEntryIds', 'time-1');
    form.append('timeEntryIds', 'time-2');
    form.set('amount_time-1', '7.00');
    form.set('amount_time-2', '5.50');
    const response = await crewActions.allocateReceipt!({
      locals: { user: { id: 'chief-1' } },
      request: request(form),
    } as never);
    expect(response).toMatchObject({
      status: 409,
      data: {
        code: 'CREW_RECEIPT_ALREADY_ALLOCATED',
        messageKey: 'problem.crew.receiptAlreadyAllocated',
        params: {},
        fieldErrors: { expenseId: ['problem.crew.receiptAlreadyAllocated'] },
        remedies: [{ id: 'review_saved_allocation', recordId: 'allocation-1' }],
        currentAllocation: { id: 'allocation-1', expenseId: 'expense-1' },
        operation: 'allocateReceipt',
        timeEntryIds: ['time-1', 'time-2'],
        values: {
          expenseId: 'expense-1',
          requestId: 'request-1234567890',
          'amount_time-1': '7.00',
          'amount_time-2': '5.50',
        },
      },
    });
  });

  it('does not disclose an allocation outside the current chief scope', async () => {
    scenario.message = 'Unallocated chief-entered receipt required';
    scenario.kind = 'access';
    const form = new FormData();
    form.set('projectId', 'project-1');
    form.set('workDate', '2026-09-25');
    form.set('requestId', 'request-1234567890');
    form.set('expenseId', 'other-receipt');
    form.append('timeEntryIds', 'time-1');
    form.append('timeEntryIds', 'time-2');
    form.set('amount_time-1', '8.00');
    form.set('amount_time-2', '4.50');
    const response = await crewActions.allocateReceipt!({
      locals: { user: { id: 'chief-1' } },
      request: request(form),
    } as never);
    expect(response).toMatchObject({
      status: 409,
      data: {
        code: 'CREW_RECEIPT_UNAVAILABLE',
        remedies: [{ id: 'review_receipts' }],
        timeEntryIds: ['time-1', 'time-2'],
      },
    });
    expect(response.data).not.toHaveProperty('currentAllocation');
  });

  it('offers a saved-allocation review after an uncertain receipt save', async () => {
    scenario.message = 'unexpected repository failure';
    scenario.kind = 'unexpected';
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const form = new FormData();
      form.set('projectId', 'project-1');
      form.set('workDate', '2026-09-25');
      form.set('requestId', 'request-1234567890');
      form.set('expenseId', 'expense-1');
      form.append('timeEntryIds', 'time-1');
      form.append('timeEntryIds', 'time-2');
      form.set('amount_time-1', '8.00');
      form.set('amount_time-2', '4.50');
      const response = await crewActions.allocateReceipt!({
        locals: { user: { id: 'chief-1' } },
        request: request(form),
      } as never);
      expect(response).toMatchObject({
        status: 500,
        data: {
          code: 'UNEXPECTED_ERROR',
          remedies: [{ id: 'review_receipts' }],
          values: { expenseId: 'expense-1', requestId: 'request-1234567890' },
          timeEntryIds: ['time-1', 'time-2'],
        },
      });
      expect(response.data?.message).not.toContain('unexpected repository failure');
      expect(logging).toHaveBeenCalled();
    } finally {
      logging.mockRestore();
    }
  });

  it('blocks a stale draft edit without changing its posted version', async () => {
    scenario.message = 'This crew draft changed. Reload it before saving.';
    const form = new FormData();
    form.set('version', '1');
    form.set('workDate', '2026-09-25');
    form.set('category', 'regular');
    form.set('minutes', '450');
    form.set('summary', 'Completed work');
    const response = await detailActions.update!({
      locals: { user: { id: 'chief-1' } },
      params: { id: 'time-1' },
      request: request(form),
    } as never);
    expect(response.status).toBe(409);
    expect(response.data).toMatchObject({
      code: 'CREW_DRAFT_CHANGED',
      values: { version: '1', summary: 'Completed work' },
      remedies: [{ id: 'review_time' }],
    });
  });

  it('keeps successful action redirects out of the failure mapper', async () => {
    const form = new FormData();
    form.set('version', '1');
    await expect(
      detailActions.submit!({
        locals: { user: { id: 'chief-1' } },
        params: { id: 'time-1' },
        request: request(form),
      } as never),
    ).rejects.toMatchObject({ status: 303 });
  });
});
