import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { AccessDeniedError, ConflictError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actions } from '../../apps/portal/src/routes/app/expenses/[id]/+page.server';

const expenseId = '11111111-1111-4111-8111-111111111111';
const correctionId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const repository = {
  expenseDetail: vi.fn(),
  createCorrectionDraft: vi.fn(),
  ownerOverrideCorrectionDraft: vi.fn(),
  withdrawCorrectionDraft: vi.fn(),
  submitExpense: vi.fn(),
};
const close = vi.fn();
const linkedTimeMatch = vi.fn();

function request(values: Record<string, string>): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return new Request('http://local.test/action', { method: 'POST', body });
}

async function submit(name: keyof typeof actions, values: Record<string, string>) {
  const action = actions[name];
  if (!action) throw new Error(`Missing action ${name}`);
  return action({
    request: request(values),
    params: { id: name === 'withdrawCorrectionDraft' ? correctionId : expenseId },
    locals: { user: { id: 'worker-1', role: 'worker' } },
  } as never);
}

function correction(values: Record<string, string> = {}) {
  return {
    recordType: 'expense',
    correctionFields: 'expense',
    originalId: expenseId,
    requestId,
    vendor: 'New vendor',
    spentOn: '2026-09-25',
    category: 'parking',
    amount: '12.34',
    description: 'Parking at site',
    occurredTimeLocal: '',
    paymentMethod: '',
    timeEntryId: '',
    reason: 'Correct vendor',
    ...values,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  repository.expenseDetail.mockReturnValue({
    id: expenseId,
    project_id: 'project-1',
    worker_id: 'worker-1',
    vendor: 'Old vendor',
    spent_on: '2026-09-25',
    category: 'parking',
    amount_minor: 1234,
    description: 'Parking at site',
    occurred_time_local: null,
    payment_method: null,
    time_entry_id: null,
  });
  vi.mocked(openPortalRepository).mockReturnValue({
    repository,
    principal: { userId: 'worker-1', role: 'worker' },
    sqlite: { close, prepare: () => ({ get: linkedTimeMatch }) },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('expense detail action problems', () => {
  it('keeps the corrected draft redirect on success', async () => {
    repository.createCorrectionDraft.mockReturnValue({ correctionId });
    await expect(submit('createCorrectionDraft', correction())).rejects.toMatchObject({
      status: 303,
      location: `/j-aautomation/app/expenses/${correctionId}`,
    });
  });

  it('retains correction entries and identifies an existing draft', async () => {
    repository.createCorrectionDraft.mockImplementation(() => {
      throw new ConflictError('A correction draft already exists for this original record');
    });
    const result = await submit('createCorrectionDraft', correction());
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'EXPENSE_CORRECTION_ALREADY_EXISTS',
        messageKey: 'problem.expenseDetail.correctionAlreadyExists',
        actionName: 'createCorrectionDraft',
        values: { vendor: 'New vendor', reason: 'Correct vendor', requestId },
        remedies: [{ id: 'review_expense', recordId: expenseId }],
      },
    });
    expect((result as { data: { correlationId: string } }).data.correlationId).toBeTruthy();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ['Reimbursed expense requires an explicit adjustment', 'EXPENSE_CORRECTION_REIMBURSED'],
    [
      'Financially finalized records require a finance correction',
      'EXPENSE_CORRECTION_FINANCIALLY_FINALIZED',
    ],
    [
      'Only approved or reviewer-returned expenses can create a correction draft',
      'EXPENSE_CORRECTION_STATE_BLOCKED',
    ],
    ['Correction request payload conflicts with prior replay', 'EXPENSE_CORRECTION_RETRY_CHANGED'],
  ])('maps the exact correction blocker %s', async (message, code) => {
    repository.createCorrectionDraft.mockImplementation(() => {
      throw new ConflictError(message);
    });
    const result = await submit('createCorrectionDraft', correction());
    expect(result).toMatchObject({ status: 409, data: { code } });
  });

  it('reports correction fields and retains the entered amount', async () => {
    const result = await submit('createCorrectionDraft', correction({ amount: '-2' }));
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_CORRECTION_AMOUNT_INVALID',
        values: { amount: '-2', vendor: 'New vendor' },
        fieldErrors: { amount: ['problem.expense.amountInvalid'] },
      },
    });
    expect(repository.createCorrectionDraft).not.toHaveBeenCalled();
  });

  it('locates a missing correction vendor without exposing a raw validator message', async () => {
    const result = await submit('createCorrectionDraft', correction({ vendor: '' }));
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_CORRECTION_FIELDS_INVALID',
        values: { vendor: '' },
        fieldErrors: { vendor: ['problem.expenseDetail.correctionFieldsInvalid'] },
      },
    });
  });

  it('blocks a retained time link when the corrected date no longer matches', async () => {
    const timeEntryId = '44444444-4444-4444-8444-444444444444';
    const result = await submit(
      'createCorrectionDraft',
      correction({ spentOn: '2026-09-26', timeEntryId }),
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'EXPENSE_CORRECTION_TIME_LINK_INVALID',
        values: { spentOn: '2026-09-26', timeEntryId },
        fieldErrors: { timeEntryId: ['problem.expense.timeLinkInvalid'] },
        remedies: [{ id: 'review_expense_fields', recordId: expenseId }],
      },
    });
    expect(linkedTimeMatch).toHaveBeenCalledWith(
      timeEntryId,
      'project-1',
      'worker-1',
      '2026-09-26',
    );
    expect(repository.createCorrectionDraft).not.toHaveBeenCalled();
  });

  it('maps a linked-time change detected inside the repository transaction', async () => {
    linkedTimeMatch.mockReturnValue({ 1: 1 });
    repository.createCorrectionDraft.mockImplementation(() => {
      throw new AccessDeniedError('A matching active time record is required');
    });
    const result = await submit(
      'createCorrectionDraft',
      correction({ timeEntryId: '44444444-4444-4444-8444-444444444444' }),
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'EXPENSE_CORRECTION_TIME_LINK_INVALID',
        fieldErrors: { timeEntryId: ['problem.expense.timeLinkInvalid'] },
      },
    });
  });

  it('keeps the withdrawal reason after a stale correction', async () => {
    repository.withdrawCorrectionDraft.mockImplementation(() => {
      throw new ConflictError('Correction draft changed before withdrawal');
    });
    const result = await submit('withdrawCorrectionDraft', {
      recordType: 'expense',
      correctionId,
      version: '2',
      reason: 'New correction required',
    });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'EXPENSE_CORRECTION_WITHDRAW_CHANGED',
        actionName: 'withdrawCorrectionDraft',
        values: { reason: 'New correction required' },
        remedies: [{ id: 'review_expense', recordId: correctionId }],
      },
    });
  });

  it('returns to the original expense after a successful withdrawal', async () => {
    repository.withdrawCorrectionDraft.mockReturnValue({ originalId: expenseId });
    await expect(
      submit('withdrawCorrectionDraft', {
        recordType: 'expense',
        correctionId,
        version: '2',
        reason: 'New correction required',
      }),
    ).rejects.toMatchObject({
      status: 303,
      location: `/j-aautomation/app/expenses/${expenseId}`,
    });
  });

  it('reports a short withdrawal reason beside the field', async () => {
    const result = await submit('withdrawCorrectionDraft', {
      recordType: 'expense',
      correctionId,
      version: '2',
      reason: 'x',
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_CORRECTION_WITHDRAW_REASON_INVALID',
        values: { reason: 'x' },
        fieldErrors: { reason: ['problem.expenseDetail.withdrawReasonInvalid'] },
      },
    });
    expect(repository.withdrawCorrectionDraft).not.toHaveBeenCalled();
  });

  it('keeps access denial role-safe', async () => {
    repository.withdrawCorrectionDraft.mockImplementation(() => {
      throw new AccessDeniedError('Correction withdrawal access required');
    });
    const result = await submit('withdrawCorrectionDraft', {
      recordType: 'expense',
      correctionId,
      version: '2',
      reason: 'New correction required',
    });
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'EXPENSE_CORRECTION_WITHDRAW_ACCESS_REQUIRED',
        remedies: [{ id: 'contact_project_owner' }],
      },
    });
    expect((result as { data: { message: string } }).data.message).not.toContain('admin');
  });

  it('retains a stale submission and presents review guidance', async () => {
    repository.submitExpense.mockImplementation(() => {
      throw new ConflictError('Expense changed, lacks receipt, or cannot be submitted');
    });
    const result = await submit('submitExpense', { id: expenseId, version: '3' });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'EXPENSE_SUBMISSION_BLOCKED',
        actionName: 'submitExpense',
        values: { id: expenseId, version: '3' },
        remedies: [{ id: 'review_expense', recordId: expenseId }],
      },
    });
  });

  it('returns to the expense after successful submission', async () => {
    repository.submitExpense.mockReturnValue({ id: expenseId });
    await expect(submit('submitExpense', { id: expenseId, version: '3' })).rejects.toMatchObject({
      status: 303,
      location: `/j-aautomation/app/expenses/${expenseId}`,
    });
  });

  it('maps an invalid expense version to the record field error', async () => {
    const result = await submit('submitExpense', { id: expenseId, version: 'bad' });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'EXPENSE_RECORD_INVALID',
        messageKey: 'problem.expense.recordInvalid',
        actionName: 'submitExpense',
        values: { version: 'bad' },
        fieldErrors: { version: ['problem.expense.recordInvalid'] },
      },
    });
    expect(repository.submitExpense).not.toHaveBeenCalled();
  });

  it('keeps unknown exceptions safe and referenceable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    repository.submitExpense.mockImplementation(() => {
      throw new Error('private database detail');
    });
    try {
      const result = await submit('submitExpense', { id: expenseId, version: '3' });
      expect(result).toMatchObject({
        status: 500,
        data: { code: 'UNEXPECTED_ERROR', messageKey: 'problem.error.unexpected' },
      });
      expect((result as { data: { message: string } }).data.message).not.toContain(
        'private database detail',
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
