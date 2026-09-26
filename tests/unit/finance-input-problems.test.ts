import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import { openPortalRepository } from '$lib/server/portal-repository';
import { V3ConflictError } from '@ja/database';
import { financeActions } from '../../apps/portal/src/lib/server/actions/finance-actions';

const close = vi.fn();
const repository = { setExpensePlanningDates: vi.fn() };

function request(values: Record<string, string> = {}): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return new Request('http://local.test/finance', { method: 'POST', body });
}

async function submit(
  actionName: keyof typeof financeActions,
  values: Record<string, string> = {},
) {
  return financeActions[actionName]({
    params: { section: 'finance' },
    locals: { user: { id: 'finance-1', role: 'finance_admin' } },
    request: request(values),
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'finance-1', role: 'finance_admin' },
    sqlite: { close },
    repository,
    v3: {},
  } as unknown as ReturnType<typeof openPortalRepository>);
});

const invalidActions = [
  [
    'setProjectReimbursementDefault',
    'FINANCE_PROJECT_REIMBURSEMENT_FIELDS_INVALID',
    'projectReimbursement',
  ],
  [
    'setWorkerReimbursementOverride',
    'FINANCE_WORKER_REIMBURSEMENT_FIELDS_INVALID',
    'workerReimbursement',
  ],
  [
    'createAssignmentExpensePolicy',
    'FINANCE_ASSIGNMENT_EXPENSE_POLICY_FIELDS_INVALID',
    'assignmentExpensePolicy',
  ],
  [
    'setAssignmentCommercialFallback',
    'FINANCE_ASSIGNMENT_COMMERCIAL_FALLBACK_FIELDS_INVALID',
    'assignmentCommercialFallback',
  ],
  [
    'setAssignmentCommercialRuleReferences',
    'FINANCE_ASSIGNMENT_COMMERCIAL_REFERENCES_FIELDS_INVALID',
    'assignmentCommercialReferences',
  ],
  [
    'createCanonicalLegalEntityRevision',
    'FINANCE_LEGAL_ENTITY_REVISION_FIELDS_INVALID',
    'legalEntityRevision',
  ],
  [
    'assignProjectLegalEntity',
    'FINANCE_PROJECT_LEGAL_ENTITY_ASSIGNMENT_FIELDS_INVALID',
    'projectLegalEntityAssignment',
  ],
  [
    'classifyExpenseCommercially',
    'FINANCE_EXPENSE_CLASSIFICATION_FIELDS_INVALID',
    'expenseClassification',
  ],
  ['setExpensePlanningDates', 'FINANCE_EXPENSE_PLANNING_DATES_INVALID', 'expensePlanningDates'],
  [
    'setCompensationSettlementExpectedPaymentOn',
    'FINANCE_SETTLEMENT_PLANNING_FIELDS_INVALID',
    'settlementPlanning',
  ],
  [
    'createProjectCommercialPolicy',
    'FINANCE_PROJECT_COMMERCIAL_POLICY_FIELDS_INVALID',
    'projectCommercialPolicy',
  ],
  ['createCompensationRule', 'FINANCE_COMPENSATION_RULE_FIELDS_INVALID', 'compensationRule'],
  [
    'supersedeCompensationRule',
    'FINANCE_COMPENSATION_RULE_REFERENCE_INVALID',
    'compensationRuleReference',
  ],
  [
    'deactivateCompensationRule',
    'FINANCE_COMPENSATION_RULE_REFERENCE_INVALID',
    'compensationRuleReference',
  ],
  ['settleCompensation', 'FINANCE_SETTLEMENT_PERIOD_FIELDS_INVALID', 'settlementPeriod'],
  [
    'recordCompensationPayment',
    'FINANCE_COMPENSATION_PAYMENT_FIELDS_INVALID',
    'compensationPayment',
  ],
  ['reverseCompensationPayment', 'FINANCE_PAYMENT_REVERSAL_FIELDS_INVALID', 'paymentReversal'],
  ['recordReimbursement', 'FINANCE_REIMBURSEMENT_FIELDS_INVALID', 'reimbursement'],
  ['createClientLaborRate', 'FINANCE_CLIENT_LABOR_RATE_FIELDS_INVALID', 'clientLaborRate'],
  ['supersedeClientLaborRate', 'FINANCE_CLIENT_RATE_REFERENCE_INVALID', 'clientRateReference'],
  ['deactivateClientLaborRate', 'FINANCE_CLIENT_RATE_REFERENCE_INVALID', 'clientRateReference'],
  ['createInternalCostRule', 'FINANCE_INTERNAL_COST_RULE_FIELDS_INVALID', 'internalCostRule'],
  ['supersedeInternalCostRule', 'FINANCE_INTERNAL_COST_REFERENCE_INVALID', 'internalCostReference'],
  [
    'deactivateInternalCostRule',
    'FINANCE_INTERNAL_COST_REFERENCE_INVALID',
    'internalCostReference',
  ],
  [
    'createAssignmentRateOverride',
    'FINANCE_ASSIGNMENT_OVERRIDE_FIELDS_INVALID',
    'assignmentOverride',
  ],
] as const;

describe('Finance input problem contract', () => {
  it.each(invalidActions)(
    '%s gives invalid input a typed, translated recovery path',
    async (actionName, code, key) => {
      const result = await submit(actionName, {
        id: 'bad',
        ruleId: 'bad',
        supersedesId: 'bad',
        reason: 'Retain this reason',
      });
      expect(result).toMatchObject({
        status: 400,
        data: {
          code,
          messageKey: `problem.finance.input.${key}`,
          actionName,
          values: { reason: 'Retain this reason' },
          remedies: [{ id: 'correct_field' }],
        },
      });
      expect((result as { data: { correlationId: string } }).data.correlationId).toBeTruthy();
    },
  );

  it('marks an invalid compensation rule reference beside its control', async () => {
    const result = await submit('supersedeCompensationRule', {
      supersedesId: 'bad',
      workerId: 'worker-1',
      effectiveFrom: '2026-09-25',
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'FINANCE_COMPENSATION_RULE_REFERENCE_INVALID',
        fieldErrors: { supersedesId: ['problem.finance.input.compensationRuleReference'] },
        values: { workerId: 'worker-1', effectiveFrom: '2026-09-25' },
      },
    });
  });

  it('keeps a valid rule reference while reporting invalid replacement terms', async () => {
    const result = await submit('supersedeCompensationRule', {
      supersedesId: '11111111-1111-4111-8111-111111111111',
      workerId: 'bad',
      effectiveFrom: '2026-09-25',
      rateMinor: '-1',
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'FINANCE_REPLACEMENT_COMPENSATION_RULE_FIELDS_INVALID',
        messageKey: 'problem.finance.input.compensationRule',
        values: { workerId: 'bad', rateMinor: '-1' },
        fieldErrors: { workerId: expect.any(Array) },
      },
    });
  });

  it('identifies an invalid expense tax rate without changing worker reimbursement', async () => {
    const result = await submit('classifyExpenseCommercially', {
      expenseId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: '1',
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: '0',
      taxBps: 'invalid',
      reason: 'Review tax rate',
      idempotencyKey: 'finance-tax-test-1',
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'FINANCE_EXPENSE_CLASSIFICATION_FIELDS_INVALID',
        values: { taxBps: 'invalid', clientTreatment: 'reimbursable' },
        fieldErrors: { taxBps: expect.any(Array) },
      },
    });
  });

  it('keeps reimbursement input and points to the invalid payment reference', async () => {
    const result = await submit('recordReimbursement', {
      expenseId: 'bad',
      amountMinor: '100',
      reference: '',
    });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'FINANCE_REIMBURSEMENT_FIELDS_INVALID',
        values: { amountMinor: '100', reference: '' },
        fieldErrors: { reference: expect.any(Array) },
      },
    });
  });

  it('does not reflect arbitrary credential-like fields from a failed form', async () => {
    const result = await submit('setProjectReimbursementDefault', {
      projectId: 'bad',
      sessionToken: 'private',
      password: 'private',
      reason: 'Review',
    });
    expect((result as { data: { values: Record<string, string> } }).data.values).not.toHaveProperty(
      'sessionToken',
    );
    expect((result as { data: { values: Record<string, string> } }).data.values).not.toHaveProperty(
      'password',
    );
  });

  it('attaches the expense ID to a stale planning remedy when the domain mapper lacks context', async () => {
    const expenseId = '11111111-1111-4111-8111-111111111111';
    repository.setExpensePlanningDates.mockImplementation(() => {
      throw new V3ConflictError('Expense changed before planning update');
    });
    const result = await submit('setExpensePlanningDates', {
      expenseId,
      expectedReimbursementOn: '',
      expectedRecoveryOn: '',
      expectedVersion: '1',
    });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'FINANCE_RECORD_CHANGED',
        values: { expenseId },
        remedies: [{ id: 'review_updated_record', recordId: expenseId }],
      },
    });
  });
});
