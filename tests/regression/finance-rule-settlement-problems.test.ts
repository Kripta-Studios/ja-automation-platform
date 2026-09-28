import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, V3ConflictError, V3ValidationError } from '@ja/database';
import {
  financeActions,
  financeFailure,
} from '../../apps/portal/src/lib/server/actions/finance-actions';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';
import { openPortalRepository } from '../../apps/portal/src/lib/server/portal-repository';

vi.mock('../../apps/portal/src/lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/portal/src/lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

afterEach(() => vi.mocked(openPortalRepository).mockReset());

const projectId = '00000000-0000-4000-8000-000000000123';
const recordId = '00000000-0000-4000-8000-000000000456';
const values = {
  projectId,
  workerId: '00000000-0000-4000-8000-000000000789',
  currency: 'EUR',
  effectiveFrom: '2026-10-01',
  effectiveTo: '2026-10-31',
};

const cases = [
  {
    action: 'createCompensationRule',
    error: new V3ValidationError('Active worker or project manager account required'),
    code: 'FINANCE_RULE_WORKER_UNAVAILABLE',
    key: 'problem.finance.ruleWorkerUnavailable',
    field: 'workerId',
    remedy: 'contact_project_owner',
  },
  {
    action: 'createInternalCostRule',
    error: new V3ValidationError('Worker is not assigned to the project for the effective period'),
    code: 'FINANCE_RULE_ASSIGNMENT_UNAVAILABLE',
    key: 'problem.finance.ruleAssignmentUnavailable',
    field: 'projectId',
    remedy: 'contact_project_owner',
  },
  {
    action: 'createCompensationRule',
    error: new V3ValidationError('Compensation currency must match the project currency'),
    code: 'FINANCE_COMPENSATION_RULE_PROJECT_CURRENCY_MISMATCH',
    key: 'problem.finance.compensationRuleCurrencyMismatch',
    field: 'currency',
    remedy: 'correct_field',
  },
  {
    action: 'createInternalCostRule',
    error: new V3ValidationError('Internal cost currency must match the project currency'),
    code: 'FINANCE_INTERNAL_COST_RULE_PROJECT_CURRENCY_MISMATCH',
    key: 'problem.finance.internalCostRuleCurrencyMismatch',
    field: 'currency',
    remedy: 'correct_field',
  },
  {
    action: 'createClientLaborRate',
    error: new V3ValidationError('Client rate currency must match the project currency'),
    code: 'FINANCE_CLIENT_LABOR_RATE_PROJECT_CURRENCY_MISMATCH',
    key: 'problem.finance.clientLaborRateCurrencyMismatch',
    field: 'currency',
    remedy: 'correct_field',
  },
  {
    action: 'createProjectCommercialPolicy',
    error: new ConflictError(
      'Commercial policy effective date must follow the current policy tail',
    ),
    code: 'FINANCE_COMMERCIAL_POLICY_DATE_BEFORE_TAIL',
    key: 'problem.finance.commercialPolicyDateBeforeTail',
    field: 'effectiveFrom',
    remedy: 'review_project_commercial_policy',
  },
  {
    action: 'createProjectCommercialPolicy',
    error: new ConflictError('Commercial policy changed or overlaps the current tail'),
    code: 'FINANCE_COMMERCIAL_POLICY_CHANGED',
    key: 'problem.finance.commercialPolicyChanged',
    field: null,
    remedy: 'review_project_commercial_policy',
  },
  {
    action: 'settleCompensation',
    error: new V3ConflictError(`Active time correction ${recordId} blocks compensation settlement`),
    code: 'FINANCE_SETTLEMENT_TIME_CORRECTION_OPEN',
    key: 'problem.finance.settlementTimeCorrectionOpen',
    field: null,
    remedy: 'review_approved_time',
  },
  {
    action: 'settleCompensation',
    error: new V3ValidationError(`Missing compensation rule for ${recordId}`),
    code: 'FINANCE_SETTLEMENT_COMPENSATION_RULE_MISSING',
    key: 'problem.finance.settlementCompensationRuleMissing',
    field: null,
    remedy: 'review_compensation_rules',
  },
  {
    action: 'settleCompensation',
    error: new V3ValidationError(`Compensation currency mismatch for ${recordId}`),
    code: 'FINANCE_SETTLEMENT_COMPENSATION_CURRENCY_MISMATCH',
    key: 'problem.finance.settlementCompensationCurrencyMismatch',
    field: null,
    remedy: 'review_compensation_rules',
  },
  {
    action: 'settleCompensation',
    error: new V3ConflictError(
      `Client labor rate is required before percentage compensation can settle for ${recordId}`,
    ),
    code: 'FINANCE_SETTLEMENT_CLIENT_RATE_MISSING',
    key: 'problem.finance.settlementClientRateMissing',
    field: null,
    remedy: 'review_client_labor_rates',
  },
  {
    action: 'settleCompensation',
    error: new V3ValidationError('No approved time is available to settle'),
    code: 'FINANCE_SETTLEMENT_NO_APPROVED_TIME',
    key: 'problem.finance.settlementNoApprovedTime',
    field: null,
    remedy: 'review_approved_time',
  },
  {
    action: 'settleCompensation',
    error: new V3ConflictError(
      `Settlement ${recordId} is already settled with different final truth`,
    ),
    code: 'FINANCE_SETTLEMENT_FINAL_TRUTH_CHANGED',
    key: 'problem.finance.settlementFinalTruthChanged',
    field: null,
    remedy: 'review_worker_compensation_settlements',
  },
  {
    action: 'recordCompensationPayment',
    error: new V3ValidationError('Compensation settlement not found'),
    code: 'FINANCE_PAYMENT_SETTLEMENT_UNAVAILABLE',
    key: 'problem.finance.paymentSettlementUnavailable',
    field: null,
    remedy: 'review_worker_compensation_settlements',
  },
  {
    action: 'recordCompensationPayment',
    error: new V3ValidationError('Person payee must be the settlement worker'),
    code: 'FINANCE_PAYMENT_PERSON_PAYEE_MISMATCH',
    key: 'problem.finance.paymentPersonPayeeMismatch',
    field: 'payeeSelection',
    remedy: 'review_worker_compensation_settlements',
  },
  {
    action: 'recordCompensationPayment',
    error: new V3ValidationError('Supplier payee must be linked to the settlement worker'),
    code: 'FINANCE_PAYMENT_SUPPLIER_PAYEE_MISMATCH',
    key: 'problem.finance.paymentSupplierPayeeMismatch',
    field: 'payeeSelection',
    remedy: 'review_worker_compensation_settlements',
  },
] as const;

describe('Finance rule, settlement, commercial policy, and payment problems', () => {
  it.each(cases)('maps $action / $code with retained form values', (item) => {
    const result = financeFailure(item.error, {
      actionName: item.action,
      projectId,
      values,
    });
    expect(result.status).toBe(item.field === 'payeeSelection' ? 400 : 409);
    expect(result.data).toMatchObject({
      code: item.code,
      messageKey: item.key,
      actionName: item.action,
      values,
      remedies: [{ id: item.remedy }],
    });
    if (item.field) expect(result.data.fieldErrors).toEqual({ [item.field]: [item.key] });
    else expect(result.data.fieldErrors).toEqual({});
    expect(result.data.message).not.toBe(item.error.message);
    expect(result.data.message).not.toContain(recordId);
    expect(result.data.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    for (const locale of ['en', 'es', 'pt'] as const) {
      const localized = translate(locale, item.key);
      expect(localized).not.toBe(item.key);
      expect(localized).not.toContain(recordId);
      expect(localized.length).toBeGreaterThan(30);
      if (item.field)
        expect(translate(locale, result.data.fieldErrors[item.field][0])).toBe(localized);
    }
  });

  it('does not apply a rule-specific diagnostic to an unrelated Finance action', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = financeFailure(
        new V3ValidationError('Compensation currency must match the project currency'),
        { actionName: 'recordReimbursement', values },
      );
      expect(result.data.code).not.toBe('FINANCE_COMPENSATION_RULE_PROJECT_CURRENCY_MISMATCH');
    } finally {
      warning.mockRestore();
    }
  });

  it.each([
    {
      action: 'createCompensationRule',
      form: { ...values, ruleType: 'Hourly', rateMinor: '5000' },
      method: 'createCompensationRule',
      error: new V3ValidationError(
        'Worker is not assigned to the project for the effective period',
      ),
      code: 'FINANCE_RULE_ASSIGNMENT_UNAVAILABLE',
    },
    {
      action: 'createInternalCostRule',
      form: { ...values, hourlyRateMinor: '5000' },
      method: 'createInternalCostRule',
      error: new V3ValidationError('Internal cost currency must match the project currency'),
      code: 'FINANCE_INTERNAL_COST_RULE_PROJECT_CURRENCY_MISMATCH',
    },
    {
      action: 'createClientLaborRate',
      form: { ...values, hourlyRateMinor: '5000', eligibleForPercentage: 'on' },
      method: 'createClientLaborRate',
      error: new V3ValidationError('Client rate currency must match the project currency'),
      code: 'FINANCE_CLIENT_LABOR_RATE_PROJECT_CURRENCY_MISMATCH',
    },
    {
      action: 'createProjectCommercialPolicy',
      form: {
        projectId,
        effectiveFrom: '2026-10-01',
        overtimeEnabled: 'false',
        overtimeThresholdMinutes: '',
        travelClientBillable: 'true',
        customerSignoffRequired: 'false',
      },
      method: 'createProjectCommercialPolicy',
      error: new ConflictError(
        'Commercial policy effective date must follow the current policy tail',
      ),
      code: 'FINANCE_COMMERCIAL_POLICY_DATE_BEFORE_TAIL',
    },
    {
      action: 'settleCompensation',
      form: {
        workerId: values.workerId,
        projectId,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      },
      method: 'settleCompensation',
      error: new V3ValidationError('No approved time is available to settle'),
      code: 'FINANCE_SETTLEMENT_NO_APPROVED_TIME',
    },
  ] as const)(
    'returns $code from the $action form with submitted values',
    async ({ action, form, method, error, code }) => {
      const throwProblem = vi.fn(() => {
        throw error;
      });
      const close = vi.fn();
      vi.mocked(openPortalRepository).mockReturnValue({
        principal: { userId: 'finance', role: 'finance_admin', projectIds: new Set() },
        sqlite: { close },
        v3: { [method]: throwProblem },
        repository: { [method]: throwProblem },
      } as never);
      const actionHandler = financeActions[action];
      expect(actionHandler).toBeDefined();
      const result = await actionHandler!({
        locals: {},
        params: { section: 'finance' },
        request: new Request('http://localhost/app/finance', {
          method: 'POST',
          body: new URLSearchParams(form),
        }),
      } as never);
      expect(throwProblem).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(result.data).toMatchObject({
        code,
        actionName: action,
        values: form,
      });
    },
  );
});
