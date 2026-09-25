import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConflictError,
  ReadinessError,
  V3ConflictError,
  V3NotFoundError,
  V3ValidationError,
} from '@ja/database';
import {
  accountingPackActionFeedback,
  billingActionFailure,
  billingReadinessRemedyId,
} from '../../apps/portal/src/lib/server/actions/billing-actions';
import { documentActionFailure } from '../../apps/portal/src/lib/server/actions/document-actions';
import { createInvoiceDraftResolvingPeriod } from '../../apps/portal/src/lib/server/invoice-draft';

describe('billing and export action problems', () => {
  it('gives stale approved invoice reviews a stable code and review remedy', () => {
    const result = billingActionFailure(
      new ConflictError('Invoice changed. Reload before recalculating.'),
      'recalculateApprovedInvoice',
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_RECORD_CHANGED',
      messageKey: 'problem.billing.recordChanged',
      remedies: [{ id: 'review_record' }],
    });
  });

  it('rejects a changed payment replay without inviting an automatic retry', () => {
    const result = billingActionFailure(
      new V3ConflictError('Payment idempotency key was already used for another payment'),
      'recordPayment',
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_IDEMPOTENCY_REUSED',
      remedies: [{ id: 'review_record' }],
    });
  });

  it('explains a payment rejected after the invoice state or currency changed', () => {
    const values = {
      invoiceId: 'invoice-123',
      amount: '2.00',
      currency: 'USD',
      receivedOn: '2026-09-25',
      reference: 'Payment reference to retain',
    };
    const result = billingActionFailure(
      new V3ValidationError('Issued invoice in matching currency required'),
      'recordPayment',
      'finance_admin',
      values,
    );
    expect(result.data).toMatchObject({
      code: 'BILLING_PAYMENT_BLOCKED',
      remedies: [{ id: 'review_ledger' }],
      billingOperation: 'recordPayment',
      values,
    });
  });

  it('keeps readiness reasons and identifies the blocked billing setup', () => {
    const result = billingActionFailure(
      new ReadinessError([{ code: 'missing_accountant_approved_number_policy' }]),
      'issueInvoice',
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_READINESS_MISSING_ACCOUNTANT_APPROVED_NUMBER_POLICY',
      reasons: [{ code: 'missing_accountant_approved_number_policy' }],
      remedies: [{ id: 'review_billing_setup' }],
    });
  });

  it('routes close-period readiness to records, setup, or the owner by cause and role', () => {
    expect(billingReadinessRemedyId('pending_expense_approval', 'finance_admin')).toBe(
      'review_pending_records',
    );
    expect(
      billingReadinessRemedyId('missing_accountant_approved_number_policy', 'finance_admin'),
    ).toBe('contact_owner');
    expect(
      billingReadinessRemedyId('missing_accountant_approved_number_policy', 'owner_admin'),
    ).toBe('review_billing_setup');
  });

  it('directs Finance to the owner for invoice numbering readiness', () => {
    const issue = billingActionFailure(
      new ReadinessError([{ code: 'missing_accountant_approved_number_policy' }]),
      'issueInvoice',
      'finance_admin',
    );
    expect(issue.data).toMatchObject({ remedies: [{ id: 'contact_owner' }] });
    const draft = createInvoiceDraftResolvingPeriod(
      {
        principal: { role: 'finance_admin' } as never,
        repository: {
          createInvoiceDraft: () => {
            throw new ReadinessError([{ code: 'missing_accountant_approved_number_policy' }]);
          },
        },
      },
      { billingRuleId: 'rule-123', periodStart: '2026-08-01', periodEnd: '2026-08-31' },
    );
    expect(draft.data).toMatchObject({ remedies: [{ id: 'contact_owner' }] });
  });

  it('preserves the exact requested draft period when readiness changes', () => {
    const result = createInvoiceDraftResolvingPeriod(
      {
        principal: {} as never,
        repository: {
          createInvoiceDraft: () => {
            throw new ReadinessError([{ code: 'pending_time_approval', sourceId: 'time-123' }]);
          },
        },
      },
      { billingRuleId: 'rule-123', periodStart: '2026-08-01', periodEnd: '2026-08-31' },
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_READINESS_PENDING_TIME_APPROVAL',
      billingRuleId: 'rule-123',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      remedies: [{ id: 'review_pending_records' }],
    });
  });

  it('distinguishes pending and failed export artifacts', () => {
    expect(
      billingActionFailure(
        new V3ConflictError('Accounting Pack PDF export is not ready'),
        'createAccountingPack',
      ).data,
    ).toMatchObject({ code: 'BILLING_EXPORT_PENDING' });
    expect(
      billingActionFailure(
        new V3ConflictError('Accounting Pack PDF export failed; retry required'),
        'createAccountingPack',
      ).data,
    ).toMatchObject({ code: 'BILLING_EXPORT_FAILED' });
    expect(
      accountingPackActionFeedback(
        { id: 'pack-123456789', exportStatuses: { pdf: 'failed', csv: 'ready' } },
        'fallback',
      ).messageKey,
    ).toBe('action.billing.accountingPack.failed');
  });

  it('gives role denial a contact remedy without restricted settings', () => {
    const result = billingActionFailure(
      new AccessDeniedError('Finance role required'),
      'issueInvoice',
    );
    expect(result.status).toBe(403);
    expect(result.data).toMatchObject({
      code: 'BILLING_FINANCE_REQUIRED',
      remedies: [{ id: 'contact_finance' }],
    });
  });

  it('protects traceable documents and handles a deleted document as a known case', () => {
    expect(
      documentActionFailure(
        new V3ConflictError('Document is referenced by traceable history and cannot be deleted'),
      ).data,
    ).toMatchObject({ code: 'DOCUMENT_TRACEABLE_IMMUTABLE' });
    expect(documentActionFailure(new V3NotFoundError('Document not found')).data).toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    });
  });
});
