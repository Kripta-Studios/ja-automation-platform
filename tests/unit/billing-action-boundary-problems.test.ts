import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, V3AccessDeniedError, V3ValidationError } from '@ja/database';

const state = vi.hoisted(() => ({
  error: null as Error | null,
  bootstrapError: null as Error | null,
  openCount: 0,
  closeCount: 0,
  createBillingRuleCount: 0,
  principalRole: 'auditor_read_only',
}));

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => {
    state.openCount += 1;
    if (state.bootstrapError) throw state.bootstrapError;
    const reject = () => {
      if (state.error) throw state.error;
      throw new Error('Expected repository to reject');
    };
    return {
      principal: { role: state.principalRole },
      sqlite: {
        close: () => {
          state.closeCount += 1;
        },
      },
      repository: {
        issueInvoice: reject,
        createBillingRule: () => {
          state.createBillingRuleCount += 1;
          return reject();
        },
      },
      v3: {
        recordPayment: reject,
        reversePayment: reject,
        masterLedger: () => [
          {
            invoiceId,
            outstandingMinor: '7979900',
            currency: 'EUR',
            payments: [{ id: paymentId, netAmountMinor: '1000', currency: 'EUR' }],
          },
        ],
      },
    };
  },
}));

import { billingActions } from '../../apps/portal/src/lib/server/actions/billing-actions';

const invoiceId = '00000000-0000-4000-8000-000000000001';
const paymentId = '00000000-0000-4000-8000-000000000002';
const requestKey = 'payment-request-123456';

const validForms = {
  issueInvoice: { invoiceId, reportLocale: 'en' },
  recordPayment: {
    invoiceId,
    amount: '92233720368547758.08',
    currency: 'EUR',
    receivedOn: '2026-09-25',
    reference: 'Bank transfer',
    idempotencyKey: requestKey,
  },
  reversePayment: {
    paymentId,
    amount: '92233720368547758.08',
    effectiveOn: '2026-09-25',
    reasonCode: 'entry_correction',
    reason: 'Bank correction',
    idempotencyKey: requestKey,
  },
  emailInvoice: { invoiceId, recipient: 'billing@example.test', emailChoice: 'yes' },
} as const;

type Operation = keyof typeof billingActions;

async function submit(operation: Operation, values: Record<string, string>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(values)) body.set(name, value);
  return billingActions[operation]({
    params: { section: 'billing' },
    locals: { user: { id: 'actor-1' } },
    request: new Request('http://localhost/app/billing', { method: 'POST', body }),
  } as never);
}

describe('billing action boundary problems', () => {
  beforeEach(() => {
    state.error = null;
    state.bootstrapError = null;
    state.openCount = 0;
    state.closeCount = 0;
    state.createBillingRuleCount = 0;
    state.principalRole = 'auditor_read_only';
  });

  it.each(['1_15', '16_end', 'old-unsupported-rule', ''])(
    'rejects unsupported split %s after authorizing Finance and before writing',
    async (split) => {
      state.principalRole = 'finance_admin';
      const result = await submit('createBillingRule', {
        projectId: 'project-123',
        cadenceType: 'semi_monthly',
        semiMonthlyRule: split,
        viewportScrollY: '980',
      });
      expect(result.status).toBe(400);
      expect(result.data).toMatchObject({
        code: 'BILLING_SEMI_MONTHLY_RULE_INVALID',
        fieldErrors: { semiMonthlyRule: ['problem.billing.semiMonthlyRuleInvalid'] },
        remedies: [{ id: 'review_billing_setup' }],
        values: {
          projectId: 'project-123',
          cadenceType: 'semi_monthly',
          semiMonthlyRule: split,
          viewportScrollY: '980',
        },
      });
      expect(state.openCount).toBe(1);
      expect(state.closeCount).toBe(1);
      expect(state.createBillingRuleCount).toBe(0);
    },
  );

  it('prioritizes sign-in over the unsupported split for an unauthenticated POST', async () => {
    const body = new FormData();
    body.set('cadenceType', 'semi_monthly');
    body.set('semiMonthlyRule', '1_15');
    const result = await billingActions.createBillingRule({
      params: { section: 'billing' },
      locals: { correlationId: 'request-123' },
      request: new Request('http://localhost/app/billing', { method: 'POST', body }),
    } as never);
    expect(result.status).toBe(401);
    expect(result.data).toMatchObject({
      code: 'BILLING_SIGN_IN_REQUIRED',
      remedies: [{ id: 'sign_in_again' }],
      correlationId: 'request-123',
    });
    expect(state.openCount).toBe(0);
    expect(state.createBillingRuleCount).toBe(0);
  });

  it.each([
    ['auditor_read_only', 'BILLING_READ_ONLY_ROLE', 'contact_finance'],
    ['project_manager', 'BILLING_FINANCE_REQUIRED', 'contact_finance'],
  ])('prioritizes %s access over the unsupported split', async (role, code, remedy) => {
    state.principalRole = role;
    const result = await submit('createBillingRule', {
      cadenceType: 'semi_monthly',
      semiMonthlyRule: '1_15',
    });
    expect(result.status).toBe(403);
    expect(result.data).toMatchObject({ code, remedies: [{ id: remedy }] });
    expect(state.openCount).toBe(1);
    expect(state.closeCount).toBe(1);
    expect(state.createBillingRuleCount).toBe(0);
  });

  it('prioritizes disabled-account guidance over the unsupported split', async () => {
    state.bootstrapError = new AccessDeniedError('Active account required');
    const result = await submit('createBillingRule', {
      cadenceType: 'semi_monthly',
      semiMonthlyRule: '1_15',
    });
    expect(result.status).toBe(403);
    expect(result.data).toMatchObject({
      code: 'BILLING_ACCOUNT_INACTIVE',
      remedies: [{ id: 'contact_owner' }],
    });
    expect(state.openCount).toBe(1);
    expect(state.closeCount).toBe(0);
    expect(state.createBillingRuleCount).toBe(0);
  });

  it.each([
    ['issueInvoice', new AccessDeniedError('Read-only role'), validForms.issueInvoice],
    ['recordPayment', new V3AccessDeniedError('Read-only role'), validForms.recordPayment],
    ['reversePayment', new V3AccessDeniedError('Read-only role'), validForms.reversePayment],
  ] as const)(
    '%s returns a role-safe read-only problem after demotion',
    async (operation, error, values) => {
      state.error = error;
      const result = await submit(operation, values);
      expect(result.status).toBe(403);
      expect(result.data).toMatchObject({
        code: 'BILLING_READ_ONLY_ROLE',
        messageKey: 'problem.billing.readOnlyRole',
        billingOperation: operation,
        remedies: [{ id: 'contact_finance' }],
        values:
          operation === 'issueInvoice'
            ? { invoiceId }
            : { amount: validForms.recordPayment.amount },
      });
      expect(result.data.values).not.toHaveProperty('idempotencyKey');
      expect(state.openCount).toBe(1);
      expect(state.closeCount).toBe(1);
    },
  );

  it('returns the current invoice balance and retained payment after a concurrent collection', async () => {
    state.error = new V3ValidationError('Payment exceeds invoice balance');
    const result = await submit('recordPayment', {
      ...validForms.recordPayment,
      amount: '79800.00',
      viewportScrollY: '1392',
      drawerScrollTop: '153',
    });
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_PAYMENT_EXCEEDS_BALANCE',
      messageKey: 'problem.billing.paymentExceedsBalance',
      params: { remainingMinor: '7979900', currency: 'EUR' },
      fieldErrors: { amount: ['problem.billing.paymentExceedsBalance'] },
      remedies: [{ id: 'review_ledger' }],
      values: {
        amount: '79800.00',
        reference: 'Bank transfer',
        viewportScrollY: '1392',
        drawerScrollTop: '153',
      },
    });
    expect(result.data.values).not.toHaveProperty('idempotencyKey');
    expect(state.closeCount).toBe(1);
  });

  it('explains an oversized reversal with the current reversible amount and retained reason', async () => {
    state.error = new V3ValidationError('Payment reversal exceeds the remaining unreversed amount');
    const result = await submit('reversePayment', {
      ...validForms.reversePayment,
      amount: '99.00',
      viewportScrollY: '1392',
      drawerScrollTop: '548',
    });
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_REVERSAL_EXCEEDS_REMAINING',
      messageKey: 'problem.billing.reversalExceedsRemaining',
      params: { remainingMinor: '1000', currency: 'EUR' },
      fieldErrors: { amount: ['problem.billing.reversalExceedsRemaining'] },
      remedies: [{ id: 'review_ledger' }],
      values: {
        paymentId,
        amount: '99.00',
        reason: 'Bank correction',
        viewportScrollY: '1392',
        drawerScrollTop: '548',
      },
    });
    expect(result.data.values).not.toHaveProperty('idempotencyKey');
    expect(state.closeCount).toBe(1);
  });

  it.each([
    [
      'recordPayment',
      'Payment is out of range',
      'BILLING_PAYMENT_AMOUNT_OUT_OF_RANGE',
      validForms.recordPayment,
    ],
    [
      'reversePayment',
      'Payment reversal is out of range',
      'BILLING_REVERSAL_AMOUNT_OUT_OF_RANGE',
      validForms.reversePayment,
    ],
  ] as const)(
    '%s maps a valid-schema numeric overflow to the amount field',
    async (operation, message, code, values) => {
      state.error = new V3ValidationError(message);
      const result = await submit(operation, values);
      expect(result.status).toBe(400);
      expect(result.data).toMatchObject({
        code,
        messageKey: 'problem.billing.amountOutOfRange',
        billingOperation: operation,
        fieldErrors: { amount: ['problem.billing.amountOutOfRange'] },
        remedies: [{ id: 'review_ledger' }],
        values: { amount: values.amount },
      });
      expect(result.data.values).not.toHaveProperty('idempotencyKey');
      expect(state.openCount).toBe(1);
      expect(state.closeCount).toBe(1);
    },
  );

  it.each(['issueInvoice', 'recordPayment', 'reversePayment', 'emailInvoice'] as const)(
    '%s returns a typed 400 for malformed multipart before opening the repository',
    async (operation) => {
      const result = await billingActions[operation]({
        params: { section: 'billing' },
        locals: { user: { id: 'actor-1' } },
        request: new Request('http://localhost/app/billing', {
          method: 'POST',
          headers: { 'content-type': 'multipart/form-data' },
          body: 'invalid multipart payload',
        }),
      } as never);
      expect(result.status).toBe(400);
      expect(result.data).toMatchObject({
        code: 'BILLING_INVALID_FORM',
        messageKey: 'problem.billing.invalidForm',
        billingOperation: operation,
        remedies: [
          {
            id:
              operation === 'recordPayment' || operation === 'reversePayment'
                ? 'review_ledger'
                : 'review_invoice',
          },
        ],
        values: {},
      });
      expect(state.openCount).toBe(0);
      expect(state.closeCount).toBe(0);
    },
  );

  it.each(['issueInvoice', 'recordPayment', 'reversePayment', 'emailInvoice'] as const)(
    '%s requires sign-in before reading malformed multipart',
    async (operation) => {
      const result = await billingActions[operation]({
        params: { section: 'billing' },
        locals: { correlationId: 'request-123' },
        request: new Request('http://localhost/app/billing', {
          method: 'POST',
          headers: { 'content-type': 'multipart/form-data' },
          body: 'invalid multipart payload',
        }),
      } as never);
      expect(result.status).toBe(401);
      expect(result.data).toMatchObject({
        code: 'BILLING_SIGN_IN_REQUIRED',
        messageKey: 'action.error.unauthenticated',
        billingOperation: operation,
        actionName: operation,
        correlationId: 'request-123',
        remedies: [{ id: 'sign_in_again' }],
      });
      expect(result.data).not.toHaveProperty('values');
      expect(state.openCount).toBe(0);
      expect(state.closeCount).toBe(0);
    },
  );

  it.each([
    ['issueInvoice', validForms.issueInvoice],
    ['recordPayment', validForms.recordPayment],
    ['reversePayment', validForms.reversePayment],
    ['emailInvoice', validForms.emailInvoice],
  ] as const)(
    '%s maps a disabled account during repository bootstrap without losing safe form context',
    async (operation, values) => {
      state.bootstrapError = new AccessDeniedError('Active account required');
      const result = await submit(operation, values);
      expect(result.status).toBe(403);
      expect(result.data).toMatchObject({
        code: 'BILLING_ACCOUNT_INACTIVE',
        messageKey: 'problem.billing.accountInactive',
        billingOperation: operation,
        remedies: [{ id: 'contact_owner' }],
        values:
          operation === 'issueInvoice' || operation === 'emailInvoice'
            ? { invoiceId }
            : { amount: validForms.recordPayment.amount },
      });
      if (operation === 'emailInvoice')
        expect(result.data).toMatchObject({
          invoiceEmailId: invoiceId,
          invoiceEmailRecipient: 'billing@example.test',
        });
      expect(result.data.values).not.toHaveProperty('idempotencyKey');
      expect(result.data.message).not.toBe('Active account required');
      expect(state.openCount).toBe(1);
      expect(state.closeCount).toBe(0);
    },
  );
});
