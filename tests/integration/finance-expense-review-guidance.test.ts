import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '@ja/database';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return { ...original, openPortalRepository };
});

const { approvalActions } =
  await import('../../apps/portal/src/lib/server/actions/approval-actions.ts');

const expenseId = '11111111-1111-4111-8111-111111111111';

function event() {
  return {
    params: { section: 'approvals' },
    request: new Request('http://localhost/app/approvals?/financeApprove', {
      method: 'POST',
      body: new URLSearchParams({ type: 'expense', id: expenseId }),
    }),
    locals: {},
  } as never;
}

function actionContext(state: string | undefined, role = 'finance_admin') {
  const approve = vi.fn();
  const close = vi.fn();
  const get = vi
    .fn()
    .mockReturnValue(state === undefined ? undefined : { commercial_classification_state: state });
  openPortalRepository.mockReturnValue({
    principal: { userId: 'finance-1', role },
    repository: { financeApproveExpense: approve },
    sqlite: { prepare: vi.fn().mockReturnValue({ get }), close },
  });
  return { approve, close, get };
}

describe('Finance expense review classification prerequisite', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes classification in an authorized Finance review queue row', () => {
    const value = createB5LifecycleSecurityFixture();
    try {
      const expense = value.repository.createExpense(value.worker, {
        projectId: value.project.id,
        spentOn: '2026-08-20',
        vendor: 'Hotel Essential',
        category: 'hotel',
        description: 'Project lodging',
        currency: 'EUR',
        amountMinor: 10_000n,
        whoPaid: 'worker',
        clientTreatment: 'reimbursable',
        receiptRequired: false,
      });
      value.repository.submitExpense(value.worker, expense.id, expense.version);
      value.repository.operationalApproveExpense(value.manager, expense.id, 'approved');

      expect(
        value.repository.listApprovalQueue(value.finance).find((row) => row.id === expense.id),
      ).toMatchObject({
        id: expense.id,
        type: 'expense',
        review_stage: 'finance',
        commercial_classification_state: 'unclassified',
      });
    } finally {
      closeB5LifecycleSecurityFixture(value);
    }
  });

  it('returns a specific 409 and does not approve an unclassified expense', async () => {
    const { approve, close, get } = actionContext('unclassified');
    const result = await approvalActions.financeApprove(event());
    expect(result).toMatchObject({
      status: 409,
      data: { messageKey: 'action.approval.expenseClassificationRequired' },
    });
    expect(get).toHaveBeenCalledWith(expenseId);
    expect(approve).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('approves a classified expense and preserves generic conflicts for stale states', async () => {
    const { approve } = actionContext('classified');
    expect(await approvalActions.financeApprove(event())).toMatchObject({
      success: true,
      messageKey: 'action.approval.financeReviewRecorded',
    });
    expect(approve).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'finance_admin' }),
      expenseId,
    );

    const stale = actionContext(undefined);
    stale.approve.mockImplementation(() => {
      throw new ConflictError('Approved, classified, unlocked expense required');
    });
    expect(await approvalActions.financeApprove(event())).toMatchObject({
      status: 409,
      data: { messageKey: 'action.error.conflict' },
    });
  });
});
