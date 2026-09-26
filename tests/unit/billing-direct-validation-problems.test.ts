import { describe, expect, it } from 'vitest';
import { billingActions } from '../../apps/portal/src/lib/server/actions/billing-actions';

type BillingAction = keyof typeof billingActions;

async function invalidAction(
  operation: BillingAction,
  entries: Record<string, string> = {},
  section = 'billing',
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(entries)) body.set(key, value);
  const result = await billingActions[operation]({
    params: { section },
    request: new Request(`http://localhost/app/${section}`, { method: 'POST', body }),
  } as never);
  if (!('status' in result) || !('data' in result)) throw new Error('Expected action failure');
  return result;
}

describe('billing direct validation problems', () => {
  it.each([
    ['setInvoicePlanningDates', 'BILLING_PLANNING_DATES_INVALID', 'invoiceId'],
    ['createBillingRule', 'BILLING_STREAM_FIELDS_INVALID', 'projectId'],
    ['createLegalEntity', 'BILLING_LEGAL_ENTITY_FIELDS_INVALID', 'code'],
    ['createInvoiceNumberPolicy', 'BILLING_NUMBER_POLICY_FIELDS_INVALID', 'legalEntityId'],
    ['createTaxProfile', 'BILLING_TAX_PROFILE_FIELDS_INVALID', 'name'],
    ['updateBillingRule', 'BILLING_STREAM_SELECTION_REQUIRED', 'billingRuleId'],
    ['archiveBillingRule', 'BILLING_STREAM_SELECTION_REQUIRED', 'billingRuleId'],
    ['updateLegalEntity', 'BILLING_LEGAL_ENTITY_SELECTION_REQUIRED', 'legalEntityId'],
    ['archiveLegalEntity', 'BILLING_LEGAL_ENTITY_SELECTION_REQUIRED', 'legalEntityId'],
    ['updateTaxProfile', 'BILLING_TAX_PROFILE_SELECTION_REQUIRED', 'taxProfileId'],
    ['archiveTaxProfile', 'BILLING_TAX_PROFILE_SELECTION_REQUIRED', 'taxProfileId'],
    ['createDraft', 'BILLING_DRAFT_PERIOD_INVALID', 'billingRuleId'],
    ['createInvoiceAdjustment', 'BILLING_ADJUSTMENT_FIELDS_INVALID', 'originalInvoiceId'],
    ['approveInvoice', 'BILLING_INVOICE_SELECTION_INVALID', 'invoiceId'],
    ['recalculateApprovedInvoice', 'BILLING_INVOICE_SELECTION_INVALID', 'invoiceId'],
    ['deleteInvoice', 'BILLING_INVOICE_SELECTION_INVALID', 'invoiceId'],
    ['issueInvoice', 'BILLING_INVOICE_SELECTION_INVALID', 'invoiceId'],
    ['recordPayment', 'BILLING_PAYMENT_FIELDS_INVALID', 'invoiceId'],
    ['reversePayment', 'BILLING_REVERSAL_FIELDS_INVALID', 'paymentId'],
    ['closePeriod', 'BILLING_CLOSE_PERIOD_FIELDS_INVALID', 'billingRuleId'],
    ['voidInvoice', 'BILLING_VOID_FIELDS_INVALID', 'invoiceId'],
    ['restoreCreditNoteState', 'BILLING_INVOICE_SELECTION_INVALID', 'invoiceId'],
    ['sendInvoice', 'BILLING_SEND_FIELDS_INVALID', 'invoiceId'],
    ['updateInvoiceDraftDetails', 'BILLING_INVOICE_SELECTION_INVALID', 'invoiceId'],
  ] as const)('%s returns %s with an actionable field error', async (operation, code, field) => {
    const result = await invalidAction(operation, { untrustedExtra: 'do not echo' });
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code,
      billingOperation: operation,
      fieldErrors: { [field]: [expect.any(String)] },
      remedies: [{ id: expect.any(String) }],
      values: {},
    });
    expect(result.data.values).not.toHaveProperty('untrustedExtra');
  });

  it('retains safe draft values without echoing a request key', async () => {
    const result = await invalidAction('createDraft', {
      billingRuleId: 'invalid-id',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      idempotencyKey: 'private-request-key',
    });
    expect(result.data).toMatchObject({
      code: 'BILLING_DRAFT_PERIOD_INVALID',
      billingRuleId: 'invalid-id',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      values: { billingRuleId: 'invalid-id', periodStart: '2026-09-01' },
    });
    expect(result.data.values).not.toHaveProperty('idempotencyKey');
  });

  it('distinguishes exact amount and discount precheck failures', async () => {
    const fixed = await invalidAction('updateBillingRule', {
      billingRuleId: 'rule-id',
      fixedAmountMinor: 'not-money',
    });
    expect(fixed.data).toMatchObject({
      code: 'BILLING_FIXED_AMOUNT_INVALID',
      fieldErrors: { fixedAmountMinor: ['Enter a valid number.'] },
      values: { fixedAmountMinor: 'not-money' },
    });
    const discount = await invalidAction('updateInvoiceDraftDetails', {
      invoiceId: 'invoice-id',
      discount: 'not-money',
    });
    expect(discount.data).toMatchObject({
      code: 'BILLING_DISCOUNT_INVALID',
      fieldErrors: { discount: ['Enter a valid number.'] },
      values: { discount: 'not-money' },
    });
  });

  it('marks malformed accounting dates on the corresponding field and retains language', async () => {
    const result = await invalidAction(
      'createAccountingPack',
      {
        periodStart: 'not-a-date',
        periodEnd: '2026-09-30',
        reportLocale: 'pt',
        viewportScrollY: '640',
      },
      'accounting',
    );
    expect(result.data).toMatchObject({
      code: 'BILLING_ACCOUNTING_PERIOD_INVALID',
      fieldErrors: { periodStart: ['Enter a valid date.'] },
      values: {
        periodStart: 'not-a-date',
        periodEnd: '2026-09-30',
        reportLocale: 'pt',
        viewportScrollY: '640',
      },
      remedies: [{ id: 'review_accounting_pack' }],
    });
  });

  it('explains why an accounting period with one calendar date is blocked', async () => {
    const result = await invalidAction(
      'createAccountingPack',
      { periodStart: '2026-09-01', periodEnd: '2026-09-01', reportLocale: 'es' },
      'accounting',
    );
    expect(result.data).toMatchObject({
      code: 'BILLING_ACCOUNTING_PERIOD_TOO_SHORT',
      fieldErrors: { periodEnd: ['Enter a valid date.'] },
      values: { periodStart: '2026-09-01', periodEnd: '2026-09-01', reportLocale: 'es' },
    });
  });

  it('connects derived payment fields to the editable amount and date inputs', async () => {
    const result = await invalidAction('recordPayment', {
      invoiceId: 'invalid-id',
      amount: 'not-money',
      receivedOn: 'invalid-date',
      reference: 'Bank transfer',
      idempotencyKey: 'should-not-echo',
    });
    expect(result.data).toMatchObject({
      code: 'BILLING_PAYMENT_FIELDS_INVALID',
      fieldErrors: {
        amount: ['Enter a valid number.'],
        receivedOn: ['Enter a valid date.'],
      },
      values: { amount: 'not-money', receivedOn: 'invalid-date', reference: 'Bank transfer' },
    });
    expect(result.data.values).not.toHaveProperty('idempotencyKey');
  });

  it('retains raw checkbox and local date values before schema normalization', async () => {
    const stream = await invalidAction('createBillingRule', {
      autoGenerateDraft: 'on',
      includeExpenses: 'on',
    });
    expect(stream.data.values).toMatchObject({ autoGenerateDraft: 'on', includeExpenses: 'on' });

    const numbering = await invalidAction('createInvoiceNumberPolicy', {
      accountantApprovedAt: '2026-09-25T12:30',
    });
    expect(numbering.data.values).toMatchObject({ accountantApprovedAt: '2026-09-25T12:30' });

    const tax = await invalidAction('createTaxProfile', {
      componentCompound: 'on',
      componentPercent: '7.5',
      componentBasisPoints: '750',
    });
    expect(tax.data.values).toMatchObject({
      componentCompound: 'on',
      componentPercent: '7.5',
      componentBasisPoints: '750',
    });
  });
});
