import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@ja/database';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { openPortalRepository } from '$lib/server/portal-repository';
import {
  financeActions,
  financeFailure,
} from '../../apps/portal/src/lib/server/actions/finance-actions';

const expenseId = '22222222-2222-4222-8222-222222222222';
const untrustedProjectId = '33333333-3333-4333-8333-333333333333';
const setPlanning = vi.fn();
const close = vi.fn();

async function submit(values: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return financeActions.setExpensePlanningDates({
    request: new Request(
      `http://localhost/app/finance?view=commercial&project=${untrustedProjectId}`,
      { method: 'POST', body },
    ),
    params: { section: 'finance' },
    locals: { user: { id: 'finance-1', role: 'finance_admin' } },
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  setPlanning.mockImplementation(() => {
    throw new ValidationError('Expense not found');
  });
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'finance-1', role: 'finance_admin' },
    repository: { setExpensePlanningDates: setPlanning },
    sqlite: { close },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('Finance planning for an expense deleted while the form was open', () => {
  const values = {
    expenseId,
    expectedReimbursementOn: '2026-10-10',
    expectedRecoveryOn: '2026-10-20',
    expectedVersion: '2',
  };

  it('returns a typed native-form 404 with retained dates and a list-only remedy', async () => {
    const result = await submit(values);
    expect(result).toMatchObject({
      status: 404,
      data: {
        success: false,
        code: 'FINANCE_EXPENSE_PLANNING_RECORD_UNAVAILABLE',
        messageKey: 'problem.finance.expensePlanningRecordUnavailable',
        message:
          'This expense is no longer available. No planning dates were saved. Review the current Finance expense list and choose an available expense.',
        actionName: 'setExpensePlanningDates',
        values,
        params: {},
        fieldErrors: {},
        remedies: [{ id: 'review_finance_expenses' }],
      },
    });
    expect(result.data?.correlationId).toEqual(expect.any(String));
    expect(result.data?.messageKey).not.toBe('action.error.invalid');
    expect(JSON.stringify(result.data?.remedies)).not.toContain(expenseId);
    expect(JSON.stringify(result.data?.remedies)).not.toContain(untrustedProjectId);
    expect(setPlanning).toHaveBeenCalledWith(expect.objectContaining({ userId: 'finance-1' }), {
      expenseId,
      expectedReimbursementOn: '2026-10-10',
      expectedRecoveryOn: '2026-10-20',
      expectedVersion: 2,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('leaves another action with the same repository message on its existing path', () => {
    const result = financeFailure(new ValidationError('Expense not found'), {
      actionName: 'recordReimbursement',
      recordId: expenseId,
      projectId: untrustedProjectId,
    });
    expect(result).toMatchObject({
      status: 400,
      data: { messageKey: 'action.error.invalid' },
    });
    expect(result.data?.code).not.toBe('FINANCE_EXPENSE_PLANNING_RECORD_UNAVAILABLE');
  });

  it('does not treat a different validation failure as a deleted expense', async () => {
    setPlanning.mockImplementationOnce(() => {
      throw new ValidationError('Expense version is invalid');
    });
    const result = await submit(values);
    expect(result).toMatchObject({
      status: 400,
      data: { messageKey: 'action.error.invalid', actionName: 'setExpensePlanningDates' },
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
