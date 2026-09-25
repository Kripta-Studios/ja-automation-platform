import { describe, expect, it, vi } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  V3ConflictError,
  V3ValidationError,
  ValidationError,
} from '@ja/database';
import { approvalFailure } from '../../apps/portal/src/lib/server/actions/approval-actions';
import {
  financeActions,
  financeFailure,
} from '../../apps/portal/src/lib/server/actions/finance-actions';

function posted(values: Record<string, string>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return new Request('http://local.test/app/finance', { method: 'POST', body: form });
}

describe('approval and Finance problem mapping', () => {
  it('directs a stale operational review to the record without exposing raw conflict details', () => {
    const result = approvalFailure(
      new ConflictError('Time entry changed or is not submitted'),
      'time',
      'time-123',
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'APPROVAL_RECORD_CHANGED',
      messageKey: 'problem.approval.recordChanged',
      remedies: [{ id: 'review_updated_record', recordId: 'time-123' }],
    });
  });

  it('requires classification before Finance review and keeps the remedy in Finance', () => {
    const result = approvalFailure(
      new ConflictError('Approved, classified, unlocked expense required'),
      'expense',
      'expense-123',
    );
    expect(result.data).toMatchObject({
      code: 'FINANCE_REVIEW_UNAVAILABLE',
      remedies: [{ id: 'review_updated_record', recordId: 'expense-123' }],
    });
  });

  it('denies Finance changes without a link to restricted settings', () => {
    const result = financeFailure(new AccessDeniedError('Finance role required'));
    expect(result.status).toBe(403);
    expect(result.data).toMatchObject({
      code: 'FINANCE_ROLE_REQUIRED',
      remedies: [{ id: 'contact_finance_owner' }],
    });
  });

  it('gives a project reviewer denial a contact remedy without a Finance link', () => {
    const result = approvalFailure(
      new AccessDeniedError('Project review required'),
      'expense',
      'expense-123',
      { reason: 'Reviewed on site' },
    );
    expect(result.status).toBe(403);
    expect(result.data).toMatchObject({
      code: 'APPROVAL_REVIEW_PERMISSION_REQUIRED',
      remedies: [{ id: 'contact_project_reviewer' }],
      values: { reason: 'Reviewed on site' },
    });
  });

  it('sends a missing legal-entity assignment to authorized configuration', () => {
    const result = financeFailure(
      new ConflictError('No canonical legal-entity assignment is effective on this date'),
      { recordId: 'expense-123', projectId: 'project-123' },
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'PROJECT_ISSUING_AUTHORITY_REQUIRED',
      remedies: [{ id: 'configure_project_issuer', projectId: 'project-123' }],
    });
  });

  it('separates worker reimbursement from customer recovery and rejects a stale policy', () => {
    const missing = financeFailure(
      new V3ValidationError('Configured worker reimbursement is required'),
    );
    expect(missing.data).toMatchObject({
      code: 'WORKER_REIMBURSEMENT_REQUIRED',
      messageKey: 'problem.finance.workerReimbursementRequired',
    });
    expect(String(missing.data.message)).toContain('Customer recovery is a separate decision');

    const stale = financeFailure(
      new ConflictError('Project changed. Reload its reimbursement policy'),
    );
    expect(stale.status).toBe(409);
    expect(stale.data).toMatchObject({ code: 'WORKER_REIMBURSEMENT_POLICY_CHANGED' });
    expect(String(stale.data.message)).toContain('customer billing is separate');
  });

  it('prevents payment replay with different details', () => {
    const result = financeFailure(new V3ConflictError('Payment idempotency key was already used'), {
      recordId: 'settlement-123',
    });
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'WORKER_PAYMENT_RETRY_CONFLICT',
      remedies: [{ id: 'review_updated_record', recordId: 'settlement-123' }],
    });
  });

  it('keeps an unexpected exception generic even if its text resembles a known denial', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = financeFailure(new Error('Finance role required'));
    expect(result.status).toBe(500);
    expect(result.data).toMatchObject({ code: 'UNEXPECTED_ERROR' });
    logged.mockRestore();
  });

  it('maps assignment policy date and scope blockers with retained values', () => {
    const values = {
      projectMemberId: 'assignment-123',
      effectiveFrom: '2026-09-26',
      effectiveTo: '2026-09-25',
    };
    const ordering = financeFailure(new ValidationError('Policy end must follow start'), {
      recordId: values.projectMemberId,
      values,
    });
    expect(ordering.data).toMatchObject({
      code: 'FINANCE_POLICY_END_BEFORE_START',
      values,
      fieldErrors: { effectiveTo: ['Policy end must follow start'] },
    });
    const scope = financeFailure(
      new ValidationError('Policy dates must fall within the assignment'),
      {
        recordId: values.projectMemberId,
        values,
      },
    );
    const unavailable = financeFailure(new ValidationError('Active project assignment required'), {
      recordId: values.projectMemberId,
      values,
    });
    expect(unavailable.data).toMatchObject({
      code: 'FINANCE_POLICY_ASSIGNMENT_UNAVAILABLE',
      remedies: [{ id: 'review_assignment_policy', recordId: values.projectMemberId }],
    });
    const duplicate = financeFailure(
      new ConflictError('Expense policy already starts on this date'),
      {
        recordId: values.projectMemberId,
        values,
      },
    );
    expect(duplicate.data).toMatchObject({
      code: 'FINANCE_POLICY_DUPLICATE_START',
      fieldErrors: { effectiveFrom: ['A policy already starts on this date'] },
    });
    const overlap = financeFailure(
      new ConflictError('Expense policy dates overlap an existing finite window'),
      {
        recordId: values.projectMemberId,
        values,
      },
    );
    expect(overlap.data).toMatchObject({
      code: 'FINANCE_POLICY_PERIOD_OVERLAP',
      remedies: [{ id: 'review_assignment_policy', recordId: values.projectMemberId }],
    });
    expect(scope.data).toMatchObject({
      code: 'FINANCE_POLICY_OUTSIDE_ASSIGNMENT',
      values,
      remedies: [{ id: 'review_assignment_policy', recordId: values.projectMemberId }],
      fieldErrors: {
        effectiveFrom: ['Policy dates must fall within the assignment'],
        effectiveTo: ['Policy dates must fall within the assignment'],
      },
    });
  });

  it('retains original payment input names and field errors after validation', async () => {
    const result = await financeActions.recordCompensationPayment({
      params: { section: 'finance' },
      request: posted({
        settlementId: 'bad',
        payeeSelection: 'person:bad',
        amount: 'not-a-number',
        paidOn: 'bad',
        reference: '',
      }),
    } as never);
    expect(result).toMatchObject({
      status: 400,
      data: {
        actionName: 'recordCompensationPayment',
        values: { amount: 'not-a-number', payeeSelection: 'person:bad', paidOn: 'bad' },
      },
    });
    expect(
      (result as { data: { fieldErrors: Record<string, string[]> } }).data.fieldErrors,
    ).toMatchObject({
      reference: expect.any(Array),
    });
  });

  it('retains the reimbursement reference and reports its invalid field', async () => {
    const result = await financeActions.recordReimbursement({
      params: { section: 'finance' },
      request: posted({ expenseId: 'bad', amountMinor: '100', reference: '' }),
    } as never);
    expect(result).toMatchObject({
      status: 400,
      data: { actionName: 'recordReimbursement', values: { amountMinor: '100', reference: '' } },
    });
    expect(
      (result as { data: { fieldErrors: Record<string, string[]> } }).data.fieldErrors,
    ).toMatchObject({
      reference: expect.any(Array),
    });
  });

  it('retains input in other Finance validation failures through the shared action wrapper', async () => {
    const result = await financeActions.setProjectReimbursementDefault({
      params: { section: 'finance' },
      request: posted({
        projectId: 'project-123',
        expectedVersion: '0',
        mode: 'at_cost',
        reason: 'x',
      }),
    } as never);
    expect(result).toMatchObject({
      status: 400,
      data: {
        actionName: 'setProjectReimbursementDefault',
        values: { projectId: 'project-123', expectedVersion: '0', mode: 'at_cost', reason: 'x' },
        fieldErrors: { expectedVersion: expect.any(Array), reason: expect.any(Array) },
      },
    });
  });
});
