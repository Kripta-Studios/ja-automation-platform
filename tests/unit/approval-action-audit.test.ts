import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  approvalActions,
  approvalFailure,
} from '../../apps/portal/src/lib/server/actions/approval-actions';

const timeId = '11111111-1111-4111-8111-111111111111';
const expenseId = '22222222-2222-4222-8222-222222222222';
const repository = {
  operationalApproveTime: vi.fn(),
  operationalApproveExpense: vi.fn(),
  financeApproveTime: vi.fn(),
  financeApproveExpense: vi.fn(),
};
const close = vi.fn();

function request(values: Record<string, string>): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return new Request('http://local.test/approvals', { method: 'POST', body });
}

async function submit(actionName: keyof typeof approvalActions, values: Record<string, string>) {
  return approvalActions[actionName]({
    params: { section: 'approvals' },
    locals: { user: { id: 'reviewer-1', role: 'owner_admin' } },
    request: request(values),
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(openPortalRepository).mockReturnValue({
    repository,
    principal: { userId: 'reviewer-1', role: 'owner_admin' },
    sqlite: {
      close,
      prepare: () => ({ get: () => ({ commercial_classification_state: 'classified' }) }),
    },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('approval action exception audit', () => {
  it.each([
    ['time', timeId, 'Time entry not found'],
    ['expense', expenseId, 'Expense not found'],
  ] as const)('maps unavailable %s records to the safe queue remedy', (type, id, message) => {
    const result = approvalFailure(new ValidationError(message), type, id, {
      reason: 'Needs explanation',
    });
    expect(result).toMatchObject({
      status: 404,
      data: {
        code: 'APPROVAL_RECORD_UNAVAILABLE',
        messageKey: 'problem.approval.recordUnavailable',
        params: { recordType: type },
        remedies: [{ id: 'review_approval_queue' }],
        values: { reason: 'Needs explanation' },
      },
    });
  });

  it.each([
    ['Active account required', 'APPROVAL_ACCOUNT_INACTIVE', 'contact_project_owner'],
    ['Read-only role', 'APPROVAL_READ_ONLY_ROLE', 'contact_project_reviewer'],
  ])('maps the known access denial %s', (message, code, remedy) => {
    const result = approvalFailure(new AccessDeniedError(message), 'time', timeId);
    expect(result).toMatchObject({
      status: 403,
      data: { code, remedies: [{ id: remedy }] },
    });
  });

  it('directs a read-only Finance reviewer to Finance without exposing its controls', () => {
    const result = approvalFailure(
      new AccessDeniedError('Read-only role'),
      'time',
      timeId,
      { billable: 'yes' },
      'finance',
    );
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'APPROVAL_READ_ONLY_ROLE',
        remedies: [{ id: 'contact_finance_owner' }],
        values: { billable: 'yes' },
      },
    });
  });

  it('sends the current Finance treatment with a stale review conflict', () => {
    const result = approvalFailure(
      new ConflictError('Approved unlocked time required'),
      'time',
      timeId,
      { billable: 'yes' },
      'finance',
      'non_billable',
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'FINANCE_REVIEW_UNAVAILABLE',
        params: { recordType: 'time', currentStatus: 'non_billable' },
        remedies: [{ id: 'review_updated_record', recordId: timeId }],
        values: { billable: 'yes' },
      },
    });
  });

  it('retains an operational reason and reports a missing one beside the field', async () => {
    const result = await submit('approveRecord', {
      id: timeId,
      type: 'time',
      decision: 'rejected',
      reason: '',
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'APPROVAL_REASON_REQUIRED',
        actionName: 'approveRecord',
        values: { decision: 'rejected', reason: '' },
        fieldErrors: { reason: ['problem.approval.reasonRequired'] },
        remedies: [{ id: 'enter_reason' }],
      },
    });
    expect(repository.operationalApproveTime).not.toHaveBeenCalled();
  });

  it('reports an overlong reason without dropping the submitted text', async () => {
    const reason = 'x'.repeat(1001);
    const result = await submit('approveRecord', {
      id: expenseId,
      type: 'expense',
      decision: 'needs_changes',
      reason,
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'APPROVAL_REASON_INVALID',
        values: { reason },
        fieldErrors: { reason: ['problem.approval.reasonInvalid'] },
      },
    });
  });

  it('requires an explicit Finance treatment for approved time', async () => {
    const result = await submit('financeApprove', { id: timeId, type: 'time' });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'FINANCE_REVIEW_TREATMENT_REQUIRED',
        actionName: 'financeApprove',
        params: { recordType: 'time' },
        fieldErrors: { billable: ['problem.approval.financeTreatmentRequired'] },
        remedies: [{ id: 'review_updated_record', recordId: timeId }],
      },
    });
    expect(repository.financeApproveTime).not.toHaveBeenCalled();
  });

  it('retains an invalid Finance treatment and identifies its field', async () => {
    const result = await submit('financeApprove', { id: timeId, type: 'time', billable: 'maybe' });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'FINANCE_REVIEW_FIELDS_INVALID',
        values: { billable: 'maybe' },
        fieldErrors: { billable: ['problem.approval.financeTreatmentRequired'] },
      },
    });
    expect(repository.financeApproveTime).not.toHaveBeenCalled();
  });

  it('records explicit non-billable treatment without changing worker compensation', async () => {
    const result = await submit('financeApprove', { id: timeId, type: 'time', billable: 'no' });
    expect(result).toMatchObject({
      success: true,
      messageKey: 'action.approval.financeReviewRecorded',
    });
    expect(repository.financeApproveTime).toHaveBeenCalledWith(expect.anything(), timeId, false);
  });

  it('keeps an unexpected exception generic and referenceable', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = approvalFailure(new Error('database detail private'), 'expense', expenseId);
      expect(result).toMatchObject({ status: 500, data: { code: 'UNEXPECTED_ERROR' } });
      expect(String((result as { data: { message: string } }).data.message)).not.toContain(
        'database detail private',
      );
    } finally {
      logged.mockRestore();
    }
  });
});
