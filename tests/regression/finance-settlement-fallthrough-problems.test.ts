import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccessDeniedError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
} from '@ja/database';
import {
  financeActions,
  financeFailure,
} from '../../apps/portal/src/lib/server/actions/finance-actions';
import { openPortalRepository } from '../../apps/portal/src/lib/server/portal-repository';

vi.mock('../../apps/portal/src/lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/portal/src/lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

afterEach(() => vi.mocked(openPortalRepository).mockReset());

const settlementId = '00000000-0000-4000-8000-000000000456';
const workerId = '00000000-0000-4000-8000-000000000789';
const projectId = '00000000-0000-4000-8000-000000000123';

describe('compensation settlement fallthrough problems', () => {
  it.each([
    [
      new V3ValidationError('Compensation settlement not found'),
      'FINANCE_SETTLEMENT_PLANNING_RECORD_UNAVAILABLE',
      'problem.finance.settlementPlanningRecordUnavailable',
    ],
    [
      Object.assign(new V3ConflictError('Compensation settlement changed before planning update'), {
        currentExpectedPaymentOn: '2026-10-20',
      }),
      'FINANCE_SETTLEMENT_PLANNING_CHANGED',
      'problem.finance.settlementPlanningChanged',
    ],
  ] as const)(
    'keeps the planning attempt when %s is raised by the route',
    async (error, code, key) => {
      const close = vi.fn();
      const update = vi.fn(() => {
        throw error;
      });
      vi.mocked(openPortalRepository).mockReturnValue({
        principal: { role: 'finance_admin' },
        sqlite: { close },
        v3: { setCompensationSettlementExpectedPaymentOn: update },
      } as never);
      const form = { settlementId, expectedPaymentOn: '2026-10-28', expectedPreviousPaymentOn: '' };
      const result = await financeActions.setCompensationSettlementExpectedPaymentOn({
        params: { section: 'finance' },
        request: new Request('http://localhost/app/finance', {
          method: 'POST',
          body: new URLSearchParams(form),
        }),
      } as never);
      expect(update).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(result.status).toBe(409);
      expect(result.data).toMatchObject({
        code,
        messageKey: key,
        actionName: 'setCompensationSettlementExpectedPaymentOn',
        recordId: settlementId,
        values: form,
        remedies: [{ id: 'review_worker_compensation_settlements' }],
      });
      expect(result.data.message).not.toBe(error.message);
      if ('currentExpectedPaymentOn' in error)
        expect(result.data).toMatchObject({
          currentExpectedPaymentOn: '2026-10-20',
          params: { currentExpectedPaymentOn: '2026-10-20' },
        });
    },
  );

  it('returns an explicit unset current date when a stale planning edit follows a clear', () => {
    const error = Object.assign(
      new V3ConflictError('Compensation settlement changed before planning update'),
      { currentExpectedPaymentOn: null },
    );
    const result = financeFailure(error, {
      actionName: 'setCompensationSettlementExpectedPaymentOn',
      recordId: settlementId,
      values: { settlementId, expectedPaymentOn: '2026-11-05' },
    });
    expect(result.data).toMatchObject({
      code: 'FINANCE_SETTLEMENT_PLANNING_CHANGED',
      currentExpectedPaymentOn: null,
      params: { currentExpectedPaymentOn: '' },
      values: { expectedPaymentOn: '2026-11-05' },
    });
  });

  it.each([
    [
      new V3ValidationError('Period end must follow start'),
      400,
      'FINANCE_SETTLEMENT_PERIOD_ORDER_INVALID',
      'problem.finance.settlementPeriodOrderInvalid',
      'correct_field',
      ['periodStart', 'periodEnd'],
    ],
    [
      new V3ValidationError('Active worker or project manager account required'),
      409,
      'FINANCE_SETTLEMENT_WORKER_UNAVAILABLE',
      'problem.finance.settlementWorkerUnavailable',
      'contact_project_owner',
      ['workerId'],
    ],
    [
      new V3ValidationError('Worker is not assigned to the project for the effective period'),
      409,
      'FINANCE_SETTLEMENT_ASSIGNMENT_UNAVAILABLE',
      'problem.finance.settlementAssignmentUnavailable',
      'contact_project_owner',
      ['workerId'],
    ],
  ] as const)(
    'maps %s to scoped settlement guidance',
    (error, status, code, key, remedy, fields) => {
      const values = { workerId, projectId, periodStart: '2026-10-31', periodEnd: '2026-10-01' };
      const result = financeFailure(error, { actionName: 'settleCompensation', projectId, values });
      expect(result.status).toBe(status);
      expect(result.data).toMatchObject({
        code,
        messageKey: key,
        values,
        remedies: [{ id: remedy }],
      });
      for (const field of fields) expect(result.data.fieldErrors[field]).toEqual([key]);
      expect(result.data.message).not.toBe(error.message);
    },
  );

  it.each([
    [
      'ambiguous_assignment',
      'FINANCE_SETTLEMENT_ASSIGNMENT_TERMS_BLOCKED',
      'problem.finance.settlementAssignmentTermsBlocked',
      'contact_project_owner',
    ],
    [
      'ambiguous_compensation_rule',
      'FINANCE_SETTLEMENT_COMPENSATION_TERMS_BLOCKED',
      'problem.finance.settlementCompensationTermsBlocked',
      'review_compensation_rules',
    ],
    [
      'unavailable_compensation_override',
      'FINANCE_SETTLEMENT_COMPENSATION_TERMS_BLOCKED',
      'problem.finance.settlementCompensationTermsBlocked',
      'review_compensation_rules',
    ],
    [
      'unavailable_assignment_compensation_rule',
      'FINANCE_SETTLEMENT_COMPENSATION_TERMS_BLOCKED',
      'problem.finance.settlementCompensationTermsBlocked',
      'review_compensation_rules',
    ],
    [
      'ambiguous_client_rate',
      'FINANCE_SETTLEMENT_CLIENT_TERMS_BLOCKED',
      'problem.finance.settlementClientTermsBlocked',
      'review_client_labor_rates',
    ],
    [
      'unavailable_client_override',
      'FINANCE_SETTLEMENT_CLIENT_TERMS_BLOCKED',
      'problem.finance.settlementClientTermsBlocked',
      'review_client_labor_rates',
    ],
    [
      'unavailable_assignment_client_rule',
      'FINANCE_SETTLEMENT_CLIENT_TERMS_BLOCKED',
      'problem.finance.settlementClientTermsBlocked',
      'review_client_labor_rates',
    ],
  ] as const)(
    'maps commercial cause %s without exposing source detail',
    (cause, code, key, remedy) => {
      const error = new V3ConflictError(`Commercial terms require configuration: ${cause}`);
      const result = financeFailure(error, {
        actionName: 'settleCompensation',
        values: { workerId, projectId },
      });
      expect(result.status).toBe(409);
      expect(result.data).toMatchObject({ code, messageKey: key, remedies: [{ id: remedy }] });
      expect(result.data.message).not.toContain(cause);
      expect(result.data.message).not.toContain(workerId);
    },
  );

  it.each([AccessDeniedError, V3AccessDeniedError])(
    'maps an inactive Finance account from %s',
    (ErrorType) => {
      const result = financeFailure(new ErrorType('Active account required'), {
        actionName: 'settleCompensation',
      });
      expect(result.status).toBe(403);
      expect(result.data).toMatchObject({
        code: 'FINANCE_ACCOUNT_INACTIVE',
        messageKey: 'problem.finance.accountInactive',
        remedies: [{ id: 'contact_finance_owner' }],
      });
    },
  );

  it('keeps planning mappings scoped to the planning action', () => {
    const result = financeFailure(new V3ValidationError('Compensation settlement not found'), {
      actionName: 'recordCompensationPayment',
    });
    expect(result.data.code).toBe('FINANCE_PAYMENT_SETTLEMENT_UNAVAILABLE');
  });
});
