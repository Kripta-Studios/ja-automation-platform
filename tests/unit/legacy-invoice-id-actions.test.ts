import { describe, expect, it, vi } from 'vitest';
import { ConflictError } from '@ja/database';
import {
  invoiceAdjustmentSchema,
  invoiceIdSchema,
  invoicePlanningDatesInputSchema,
  invoiceRecordIdSchema,
  paymentInputSchema,
  sendInvoiceSchema,
  voidInvoiceSchema,
} from '@ja/schemas';

const state = vi.hoisted(() => ({
  issueInvoice: vi.fn(),
  opens: 0,
}));

vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('$app/environment', () => ({ building: false }));
vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => {
    state.opens += 1;
    return {
      principal: { role: 'finance_admin' },
      sqlite: { close: vi.fn() },
      repository: { issueInvoice: state.issueInvoice },
      v3: {},
    };
  },
}));

const { billingActions } =
  await import('../../apps/portal/src/lib/server/actions/billing-actions.ts');

const legacyInvoiceId = 'invoice-cp020-013';
const uuidInvoiceId = '00000000-0000-4000-8000-000000000001';

function issueEvent(invoiceId: string) {
  const form = new FormData();
  form.set('invoiceId', invoiceId);
  form.set('reportLocale', 'en');
  return {
    params: { section: 'billing' },
    locals: { user: { id: 'finance-1' } },
    request: new Request('http://localhost/app/billing', { method: 'POST', body: form }),
  } as never;
}

describe('legacy invoice record IDs', () => {
  it('accepts only canonical UUIDs or bounded existing invoice identifiers in every invoice action schema', () => {
    expect(invoiceIdSchema.safeParse({ invoiceId: legacyInvoiceId }).success).toBe(true);
    expect(invoiceIdSchema.safeParse({ invoiceId: uuidInvoiceId }).success).toBe(true);
    expect(invoiceRecordIdSchema.safeParse(legacyInvoiceId).success).toBe(true);
    expect(
      invoicePlanningDatesInputSchema.safeParse({
        invoiceId: legacyInvoiceId,
        plannedIssueOn: '',
        expectedCollectionOn: '',
        expectedVersion: 1,
      }).success,
    ).toBe(true);
    expect(
      paymentInputSchema.safeParse({
        invoiceId: legacyInvoiceId,
        amountMinor: '1',
        currency: 'USD',
        receivedAt: '2026-09-01T00:00:00.000Z',
        reference: 'Legacy receipt',
        idempotencyKey: 'legacy-payment-001',
      }).success,
    ).toBe(true);
    expect(
      voidInvoiceSchema.safeParse({
        invoiceId: legacyInvoiceId,
        reason: 'Void legacy invoice',
        idempotencyKey: 'legacy-void-001',
      }).success,
    ).toBe(true);
    expect(
      sendInvoiceSchema.safeParse({
        invoiceId: legacyInvoiceId,
        idempotencyKey: 'legacy-send-001',
      }).success,
    ).toBe(true);
    expect(
      invoiceAdjustmentSchema.safeParse({
        originalInvoiceId: legacyInvoiceId,
        adjustmentType: 'credit',
        amountMinor: '1',
        reason: 'Legacy adjustment',
      }).success,
    ).toBe(true);

    expect(invoiceRecordIdSchema.safeParse('invoice-cp020-013/../../user-1').success).toBe(false);
    expect(invoiceIdSchema.safeParse({ invoiceId: 'cp020-013' }).success).toBe(false);
  });

  it('passes a valid legacy ID to the issue domain and returns the historical-marker remedy', async () => {
    state.opens = 0;
    state.issueInvoice.mockReset();
    state.issueInvoice.mockImplementation(() => {
      throw new ConflictError('Invoice has historical issue markers');
    });

    const result = await billingActions.issueInvoice(issueEvent(legacyInvoiceId));

    expect(state.issueInvoice).toHaveBeenCalledWith(
      { role: 'finance_admin' },
      legacyInvoiceId,
      'en',
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'BILLING_INVOICE_HISTORICAL_ISSUE_MARKERS',
        messageKey: 'problem.billing.historicalIssueMarkers',
        remedies: [{ id: 'review_invoice' }],
      },
    });
    expect(state.opens).toBe(1);
  });

  it('keeps malformed invoice IDs at the action boundary', async () => {
    state.opens = 0;
    state.issueInvoice.mockReset();

    const result = await billingActions.issueInvoice(issueEvent('invoice-cp020-013/../../user-1'));

    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'BILLING_INVOICE_SELECTION_INVALID',
        fieldErrors: { invoiceId: [expect.any(String)] },
      },
    });
    expect(state.issueInvoice).not.toHaveBeenCalled();
    expect(state.opens).toBe(0);
  });
});
