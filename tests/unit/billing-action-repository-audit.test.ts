import { describe, expect, it, vi } from 'vitest';
import { ConflictError, ValidationError, V3ConflictError, V3ValidationError } from '@ja/database';
import {
  billingActions,
  billingActionFailure,
  billingProblemFor,
} from '../../apps/portal/src/lib/server/actions/billing-actions';

describe('billing repository error audit', () => {
  it('retains the chosen report language with accounting-period validation errors', async () => {
    const body = new FormData();
    body.set('periodStart', 'not-a-date');
    body.set('periodEnd', '2026-09-30');
    body.set('reportLocale', 'pt');
    body.set('viewportScrollY', '640');
    const result = await billingActions.createAccountingPack({
      params: { section: 'accounting' },
      request: new Request('http://localhost/app/accounting', { method: 'POST', body }),
    } as never);
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      billingOperation: 'createAccountingPack',
      values: {
        periodStart: 'not-a-date',
        periodEnd: '2026-09-30',
        reportLocale: 'pt',
        viewportScrollY: '640',
      },
      fieldErrors: { periodStart: ['Enter a valid date.'] },
    });
  });

  it('maps reversed accounting dates to the end field and keeps the form state', () => {
    const values = {
      periodStart: '2026-09-30',
      periodEnd: '2026-09-01',
      reportLocale: 'pt',
      viewportScrollY: '640',
    };
    const result = billingActionFailure(
      new V3ValidationError('Period end must follow start'),
      'createAccountingPack',
      'finance_admin',
      values,
    );
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code: 'BILLING_PERIOD_END_BEFORE_START',
      messageKey: 'problem.billing.accountingPeriodEndBeforeStart',
      fieldErrors: { periodEnd: ['Choose an end date on or after the start date.'] },
      remedies: [{ id: 'review_accounting_pack' }],
      values,
    });
  });

  it('retains reversal scroll coordinates with an invalid command', async () => {
    const body = new FormData();
    body.set('paymentId', 'payment-123');
    body.set('amount', 'not-an-amount');
    body.set('viewportScrollY', '1392');
    body.set('drawerScrollTop', '350');
    const result = await billingActions.reversePayment({
      params: { section: 'billing' },
      request: new Request('http://localhost/app/billing', { method: 'POST', body }),
    } as never);
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      billingOperation: 'reversePayment',
      values: { paymentId: 'payment-123', viewportScrollY: '1392', drawerScrollTop: '350' },
    });
  });
  it.each([
    [
      new ValidationError('Billing period end must follow start'),
      'createDraft',
      'BILLING_PERIOD_INVALID',
    ],
    [
      new ValidationError('Milestone currency does not match the billing stream'),
      'createDraft',
      'BILLING_MILESTONE_CURRENCY_MISMATCH',
    ],
    [
      new ConflictError('Source time:123 is already reserved for billing'),
      'createDraft',
      'BILLING_SOURCE_ALREADY_RESERVED',
    ],
    [
      new ConflictError('Resolved client rate disappeared'),
      'createDraft',
      'BILLING_CLIENT_RATE_CHANGED',
    ],
    [
      new ConflictError('Invoice line projection is empty'),
      'issueInvoice',
      'BILLING_ISSUE_EVIDENCE_INCOMPLETE',
    ],
    [
      new ConflictError('Invoice commercial source manifest time:123 hash mismatch'),
      'issueInvoice',
      'BILLING_ISSUE_EVIDENCE_INCOMPLETE',
    ],
    [
      new ConflictError('Replacement draft did not retain every approved source'),
      'recalculateApprovedInvoice',
      'BILLING_RECALCULATION_NOT_APPLIED',
    ],
    [
      new V3ConflictError(
        'Accounting Pack source changed; create a current revision before finalization',
      ),
      'finalizeAccountingPack',
      'BILLING_PACK_REVISION_STALE',
    ],
    [
      new V3ConflictError('Accounting Pack reconciliation is blocked'),
      'finalizeAccountingPack',
      'BILLING_PACK_RECONCILIATION_BLOCKED',
    ],
    [
      new V3ConflictError('Accounting Pack artifacts are still processing'),
      'finalizeAccountingPack',
      'BILLING_PACK_ARTIFACTS_PENDING',
    ],
    [
      new V3ConflictError('Accounting Pack is not reviewable'),
      'finalizeAccountingPack',
      'BILLING_PACK_NOT_REVIEWABLE',
    ],
    [
      new V3ValidationError('Payment exceeds invoice balance'),
      'recordPayment',
      'BILLING_PAYMENT_AMOUNT_INVALID',
    ],
    [
      new V3ValidationError('Payment received date cannot be before the invoice was issued'),
      'recordPayment',
      'BILLING_PAYMENT_DATE_INVALID',
    ],
    [
      new V3ConflictError('Issued invoice lacks canonical legal-entity provenance'),
      'recordPayment',
      'BILLING_PAYMENT_PROVENANCE_BLOCKED',
    ],
    [
      new V3ValidationError('Active issued invoice payment is required'),
      'reversePayment',
      'BILLING_PAYMENT_INVOICE_UNAVAILABLE',
    ],
    [
      new ValidationError('Valid invoice recipient required'),
      'emailInvoice',
      'BILLING_EMAIL_RECIPIENT_INVALID',
    ],
    [
      new ValidationError('Invoice PDF integrity verification failed'),
      'emailInvoice',
      'BILLING_EMAIL_PDF_UNAVAILABLE',
    ],
  ])('maps %s in %s to %s', (error, operation, code) => {
    const problem = billingProblemFor(error, operation);
    expect(problem).toMatchObject({ code });
    expect(problem?.remedies).toHaveLength(1);
    expect(problem?.message).not.toBe(error.message);
  });

  it('preserves exact missing export formats as translated params', () => {
    const result = billingActionFailure(
      new V3ConflictError('Accounting Pack required exports are not ready: pdf, xlsx'),
      'finalizeAccountingPack',
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_PACK_EXPORTS_REQUIRED',
      messageKey: 'problem.billing.packExportsRequired',
      params: { formats: 'pdf, xlsx' },
      remedies: [{ id: 'review_accounting_pack' }],
    });
  });

  it('returns a payment field error and keeps the entered command values', () => {
    const values = {
      invoiceId: 'invoice-123',
      amount: '500.00',
      receivedOn: '2026-09-25',
      reference: 'bank',
    };
    const result = billingActionFailure(
      new V3ValidationError('Payment exceeds invoice balance'),
      'recordPayment',
      'finance_admin',
      values,
    );
    expect(result.data).toMatchObject({
      code: 'BILLING_PAYMENT_AMOUNT_INVALID',
      fieldErrors: { amount: ['Enter an amount within the available balance.'] },
      values,
    });
  });

  it('points a new expense stream overlap at its effective date', () => {
    const values = {
      projectId: 'project-123',
      streamType: 'expense',
      effectiveFrom: '2026-10-01',
    };
    const result = billingActionFailure(
      new ValidationError('Combined labor and separate expense billing rules cannot overlap'),
      'createBillingRule',
      'finance_admin',
      values,
    );
    expect(result.data).toMatchObject({
      code: 'BILLING_EXPENSE_BILLING_MODE_OVERLAP',
      fieldErrors: { effectiveFrom: [expect.any(String)] },
      remedies: [{ id: 'review_billing_setup' }],
      values,
    });
  });

  it('retains the draft selection even for an unmapped unexpected exception', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = billingActionFailure(
      new Error('private detail'),
      'createDraft',
      'finance_admin',
      {
        billingRuleId: 'rule-123',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      },
    );
    expect(result.status).toBe(500);
    expect(result.data).toMatchObject({
      code: 'UNEXPECTED_ERROR',
      billingRuleId: 'rule-123',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    expect(String(result.data.message)).not.toContain('private detail');
    logged.mockRestore();
  });
});
