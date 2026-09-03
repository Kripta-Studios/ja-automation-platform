import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ConflictError } from '@ja/database';
import {
  compensationSettlementPlanningInputSchema,
  expenseCommercialClassificationInputSchema,
  expensePlanningDatesInputSchema,
  invoicePlanningDatesInputSchema,
} from '@ja/schemas';

const openPortalRepository = vi.fn();

vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('$app/environment', () => ({ building: false }));
vi.mock('$lib/server/step-up', () => ({
  confirmStepUpPassword: vi.fn(),
  stepUpClientAddress: vi.fn(() => '127.0.0.1'),
}));

vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return { ...original, openPortalRepository };
});

const { financeActions } =
  await import('../../apps/portal/src/lib/server/actions/finance-actions.ts');
const { billingActions } =
  await import('../../apps/portal/src/lib/server/actions/billing-actions.ts');
const { sectionActions } =
  await import('../../apps/portal/src/routes/app/[section]/section-actions.ts');

const expenseId = '11111111-1111-4111-8111-111111111111';
const invoiceId = '22222222-2222-4222-8222-222222222222';
const settlementId = '33333333-3333-4333-8333-333333333333';

function event(
  action: string,
  form: Record<string, string>,
  section: 'finance' | 'billing' | 'projects' = 'finance',
) {
  return {
    locals: {
      user: {
        id: 'finance-1',
        name: 'Finance',
        email: 'finance@example.test',
        role: 'finance_admin',
        status: 'active',
      },
      session: {
        id: 'finance-session',
        userId: 'finance-1',
        expiresAt: new Date(Date.now() + 60_000),
      },
      correlationId: `finance-action-${action}`,
    },
    params: { section },
    request: new Request(`http://localhost/app/${section}?/${action}`, {
      method: 'POST',
      body: new URLSearchParams(form),
    }),
  } as never;
}

function context(
  overrides: {
    repository?: Record<string, unknown>;
    v3?: Record<string, unknown>;
    principal?: Record<string, unknown>;
  } = {},
) {
  const close = vi.fn();
  return {
    repository: overrides.repository ?? {},
    v3: overrides.v3 ?? {},
    principal: overrides.principal ?? {
      userId: 'finance-1',
      role: 'finance_admin',
      projectIds: new Set<string>(),
      sessionId: 'finance-session',
    },
    sqlite: { close },
  };
}

const classificationForm = {
  expenseId,
  expectedVersion: '2',
  clientTreatment: 'reimbursable',
  billingTreatment: 'reimbursable_at_cost',
  markupBps: '0',
  taxBps: '0',
  reason: 'Classify approved operational expense for client recovery',
  idempotencyKey: 'expense-classification-action-1',
};

describe('Finance-only expense classification and planning action contracts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers each action on the canonical section action map', () => {
    expect(sectionActions.classifyExpenseCommercially).toBe(
      financeActions.classifyExpenseCommercially,
    );
    expect(sectionActions.setExpensePlanningDates).toBe(financeActions.setExpensePlanningDates);
    expect(sectionActions.setCompensationSettlementExpectedPaymentOn).toBe(
      financeActions.setCompensationSettlementExpectedPaymentOn,
    );
    expect(sectionActions.setInvoicePlanningDates).toBe(billingActions.setInvoicePlanningDates);
  });

  it('strictly rejects classification overposting and accepts an explicit zero tax rate', async () => {
    expect(expenseCommercialClassificationInputSchema.safeParse(classificationForm)).toMatchObject({
      success: true,
      data: { markupBps: 0, taxBps: 0 },
    });
    const result = await financeActions.classifyExpenseCommercially(
      event('classifyExpenseCommercially', { ...classificationForm, internalCostMinor: '9999' }),
    );
    expect(result).toMatchObject({ status: 400 });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it('delegates only the normalized classification allowlist to the stepped-up domain method', async () => {
    const classifyExpenseCommercially = vi.fn(() => ({
      id: 'classification-1',
      version: 3,
      classificationState: 'classified',
    }));
    const value = context({ repository: { classifyExpenseCommercially } });
    openPortalRepository.mockReturnValue(value);

    const result = await financeActions.classifyExpenseCommercially(
      event('classifyExpenseCommercially', classificationForm),
    );
    expect(classifyExpenseCommercially).toHaveBeenCalledWith(value.principal, {
      expenseId,
      expectedVersion: 2,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: classificationForm.reason,
      idempotencyKey: classificationForm.idempotencyKey,
    });
    expect(result).toMatchObject({
      success: true,
      messageKey: 'action.finance.expenseClassified',
      messageParams: { version: 3 },
    });
    expect(value.sqlite.close).toHaveBeenCalledOnce();
  });

  it('removes the visible tax selector while retaining its canonical tax basis points', async () => {
    const classifyExpenseCommercially = vi.fn(() => ({
      id: 'classification-tax-selector',
      version: 3,
      classificationState: 'classified',
    }));
    const value = context({ repository: { classifyExpenseCommercially } });
    openPortalRepository.mockReturnValue(value);

    const result = await financeActions.classifyExpenseCommercially(
      event('classifyExpenseCommercially', { ...classificationForm, taxPercent: '0' }),
    );

    expect(result).toMatchObject({ success: true });
    expect(classifyExpenseCommercially).toHaveBeenCalledWith(value.principal, {
      expenseId,
      expectedVersion: 2,
      clientTreatment: 'reimbursable',
      billingTreatment: 'reimbursable_at_cost',
      markupBps: 0,
      taxBps: 0,
      reason: classificationForm.reason,
      idempotencyKey: classificationForm.idempotencyKey,
    });
  });

  it.each([400, 1000, 2100])(
    'preserves %i canonical tax basis points across Finance edit/resubmit',
    async (taxBps) => {
      const classifyExpenseCommercially = vi.fn(() => ({
        id: `classification-tax-${taxBps}`,
        version: 3,
        classificationState: 'classified',
      }));
      const value = context({ repository: { classifyExpenseCommercially } });
      openPortalRepository.mockReturnValue(value);

      const result = await financeActions.classifyExpenseCommercially(
        event('classifyExpenseCommercially', {
          ...classificationForm,
          taxPercent: String(taxBps),
          taxBps: String(taxBps),
          idempotencyKey: `expense-classification-tax-${taxBps}`,
        }),
      );

      expect(result).toMatchObject({ success: true });
      expect(classifyExpenseCommercially).toHaveBeenCalledWith(
        value.principal,
        expect.objectContaining({ taxBps }),
      );
    },
  );

  it.each(['project_manager', 'worker'] as const)(
    'returns a forbidden result when the domain rejects a forged %s classification',
    async (role) => {
      const value = context({
        repository: {
          classifyExpenseCommercially: vi.fn(() => {
            throw new AccessDeniedError(
              role === 'project_manager'
                ? 'Finance role required'
                : 'Recent step-up authentication is required',
            );
          }),
        },
        principal: { userId: `${role}-1`, role, projectIds: new Set<string>() },
      });
      openPortalRepository.mockReturnValue(value);

      const result = await financeActions.classifyExpenseCommercially(
        event('classifyExpenseCommercially', classificationForm),
      );
      expect(result).toMatchObject({
        status: 403,
        data: { success: false, messageKey: 'action.error.forbidden' },
      });
      expect(value.sqlite.close).toHaveBeenCalledOnce();
    },
  );

  it('normalizes empty planning dates to null and preserves required optimistic versions', async () => {
    const setExpensePlanningDates = vi.fn(() => ({
      expenseId,
      expectedReimbursementOn: null,
      expectedRecoveryOn: null,
      version: 5,
    }));
    const setCompensationSettlementExpectedPaymentOn = vi.fn(() => ({
      settlementId,
      expectedPaymentOn: null,
    }));
    const value = context({
      repository: { setExpensePlanningDates },
      v3: { setCompensationSettlementExpectedPaymentOn },
    });
    openPortalRepository.mockReturnValue(value);

    const expenseResult = await financeActions.setExpensePlanningDates(
      event('setExpensePlanningDates', {
        expenseId,
        expectedReimbursementOn: '',
        expectedRecoveryOn: '',
        expectedVersion: '4',
      }),
    );
    expect(setExpensePlanningDates).toHaveBeenCalledWith(value.principal, {
      expenseId,
      expectedReimbursementOn: null,
      expectedRecoveryOn: null,
      expectedVersion: 4,
    });
    expect(expenseResult).toMatchObject({ success: true, messageParams: { version: 5 } });

    openPortalRepository.mockReturnValue(value);
    await financeActions.setCompensationSettlementExpectedPaymentOn(
      event('setCompensationSettlementExpectedPaymentOn', {
        settlementId,
        expectedPaymentOn: '',
      }),
    );
    expect(setCompensationSettlementExpectedPaymentOn).toHaveBeenCalledWith(value.principal, {
      settlementId,
      expectedPaymentOn: null,
    });
  });

  it('keeps invoice planning bound to Billing and passes no fields beyond the strict contract', async () => {
    expect(
      invoicePlanningDatesInputSchema.safeParse({
        invoiceId,
        plannedIssueOn: '2026-09-10',
        expectedCollectionOn: '2026-10-10',
        expectedVersion: '1',
        collectedAt: '2026-09-11T00:00:00.000Z',
      }).success,
    ).toBe(false);
    const wrongSection = await billingActions.setInvoicePlanningDates(
      event(
        'setInvoicePlanningDates',
        {
          invoiceId,
          plannedIssueOn: '2026-09-10',
          expectedCollectionOn: '2026-10-10',
          expectedVersion: '1',
        },
        'finance',
      ),
    );
    expect(wrongSection).toMatchObject({ status: 404 });

    const setInvoicePlanningDates = vi.fn(() => ({
      invoiceId,
      plannedIssueOn: '2026-09-10',
      expectedCollectionOn: '2026-10-10',
      version: 2,
    }));
    const value = context({ repository: { setInvoicePlanningDates } });
    openPortalRepository.mockReturnValue(value);
    const result = await billingActions.setInvoicePlanningDates(
      event(
        'setInvoicePlanningDates',
        {
          invoiceId,
          plannedIssueOn: '2026-09-10',
          expectedCollectionOn: '2026-10-10',
          expectedVersion: '1',
        },
        'billing',
      ),
    );
    expect(setInvoicePlanningDates).toHaveBeenCalledWith(value.principal, {
      invoiceId,
      plannedIssueOn: '2026-09-10',
      expectedCollectionOn: '2026-10-10',
      expectedVersion: 1,
    });
    expect(result).toMatchObject({ success: true, messageParams: { version: 2 } });
  });

  it('maps stale or immutable planning conflicts to a localized conflict result', async () => {
    const value = context({
      repository: {
        setExpensePlanningDates: vi.fn(() => {
          throw new ConflictError('Expense changed before planning update');
        }),
      },
    });
    openPortalRepository.mockReturnValue(value);
    const result = await financeActions.setExpensePlanningDates(
      event('setExpensePlanningDates', {
        expenseId,
        expectedReimbursementOn: '2026-09-05',
        expectedRecoveryOn: '2026-09-20',
        expectedVersion: '1',
      }),
    );
    expect(result).toMatchObject({
      status: 409,
      data: { success: false, messageKey: 'action.error.conflict' },
    });
  });

  it('keeps every planning schema strict and versioned where the domain requires it', () => {
    expect(
      expensePlanningDatesInputSchema.safeParse({
        expenseId,
        expectedReimbursementOn: '',
        expectedRecoveryOn: '',
      }).success,
    ).toBe(false);
    expect(
      compensationSettlementPlanningInputSchema.safeParse({
        settlementId,
        expectedPaymentOn: '',
        actualPaymentOn: '2026-09-01',
      }).success,
    ).toBe(false);
  });
});
