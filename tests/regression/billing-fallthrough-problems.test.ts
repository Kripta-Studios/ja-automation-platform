import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  AccountingPackRevisionError,
  ConflictError,
  ValidationError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
} from '@ja/database';
import {
  billingActionFailure,
  billingProblemFor,
} from '../../apps/portal/src/lib/server/actions/billing-actions';

describe('billing fallthrough problems', () => {
  it('explains an Accounting Pack issuer date gap without proposing a historical rewrite', () => {
    const error = new AccountingPackRevisionError(
      'No legal-entity revision is effective at the deterministic period cut (effective-date gap)',
    );
    const result = billingActionFailure(error, 'createAccountingPack', 'owner_admin', {
      periodStart: '2026-10-01',
      periodEnd: '2026-10-05',
      reportLocale: 'en',
    });
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'ACCOUNTING_PACK_ISSUER_EFFECTIVE_DATE_GAP',
      remedies: [{ id: 'contact_support' }],
      values: { periodStart: '2026-10-01', periodEnd: '2026-10-05' },
    });
  });
  it.each([
    [
      new AccessDeniedError('Live authenticated session required'),
      'archiveTaxProfile',
      401,
      'BILLING_SESSION_EXPIRED',
      'problem.billing.sessionExpired',
      'sign_in_again',
    ],
    [
      new V3AccessDeniedError('Live authenticated session required'),
      'restoreCreditNoteState',
      401,
      'BILLING_SESSION_EXPIRED',
      'problem.billing.sessionExpired',
      'sign_in_again',
    ],
    [
      new ConflictError('Issued invoice planning is immutable'),
      'setInvoicePlanningDates',
      409,
      'BILLING_PLANNING_INVOICE_LOCKED',
      'problem.billing.planningInvoiceLocked',
      'review_invoice',
    ],
    [
      new ValidationError('Active tax profile not found'),
      'updateTaxProfile',
      409,
      'BILLING_TAX_PROFILE_UNAVAILABLE',
      'problem.billing.taxProfileUnavailable',
      'review_billing_setup',
    ],
    [
      new ValidationError('Active tax profile not found'),
      'archiveTaxProfile',
      409,
      'BILLING_TAX_PROFILE_UNAVAILABLE',
      'problem.billing.taxProfileUnavailable',
      'review_billing_setup',
    ],
    [
      new ConflictError('Issue or recalculate approved invoices before archiving this tax profile'),
      'archiveTaxProfile',
      409,
      'BILLING_TAX_PROFILE_APPROVED_INVOICE_BLOCKS_ARCHIVE',
      'problem.billing.taxProfileApprovedInvoiceBlocksArchive',
      'review_invoice',
    ],
    [
      new ValidationError('Legal entity not found'),
      'createBillingRule',
      409,
      'BILLING_SELECTED_ISSUER_UNAVAILABLE',
      'problem.billing.selectedIssuerUnavailable',
      'review_billing_setup',
    ],
    [
      new ValidationError('Archived legal entity cannot be used for invoice numbering'),
      'createInvoiceNumberPolicy',
      409,
      'BILLING_SELECTED_ISSUER_UNAVAILABLE',
      'problem.billing.selectedIssuerUnavailable',
      'review_billing_setup',
    ],
    [
      new ValidationError('Archived legal entity cannot be used for new tax profiles'),
      'createTaxProfile',
      409,
      'BILLING_SELECTED_ISSUER_UNAVAILABLE',
      'problem.billing.selectedIssuerUnavailable',
      'review_billing_setup',
    ],
    [
      new ValidationError('Active tax profile not found'),
      'createBillingRule',
      409,
      'BILLING_STREAM_TAX_PROFILE_UNAVAILABLE',
      'problem.billing.streamTaxProfileUnavailable',
      'review_billing_setup',
    ],
    [
      new ValidationError('Tax profile belongs to a different legal entity'),
      'createBillingRule',
      409,
      'BILLING_STREAM_TAX_PROFILE_ISSUER_MISMATCH',
      'problem.billing.streamTaxProfileIssuerMismatch',
      'review_billing_setup',
    ],
    [
      new ValidationError('Billing currency must match the tax profile currency'),
      'createBillingRule',
      409,
      'BILLING_STREAM_TAX_PROFILE_CURRENCY_MISMATCH',
      'problem.billing.streamTaxProfileCurrencyMismatch',
      'review_billing_setup',
    ],
    [
      new ValidationError('Active tax profile matching the billing entity is required'),
      'createBillingRule',
      409,
      'BILLING_STREAM_TAX_PROFILE_CHANGED',
      'problem.billing.streamTaxProfileChanged',
      'review_billing_setup',
    ],
    [
      new ValidationError('Issued original invoice required'),
      'createInvoiceAdjustment',
      409,
      'BILLING_ADJUSTMENT_ORIGINAL_UNAVAILABLE',
      'problem.billing.adjustmentOriginalUnavailable',
      'review_invoice',
    ],
    [
      new V3ValidationError('Issued unpaid credit note required'),
      'restoreCreditNoteState',
      409,
      'BILLING_CREDIT_RESTORE_STATE_BLOCKED',
      'problem.billing.creditRestoreStateBlocked',
      'review_invoice',
    ],
    [
      new V3ConflictError('Credit note state changed'),
      'restoreCreditNoteState',
      409,
      'BILLING_CREDIT_RESTORE_CHANGED',
      'problem.billing.creditRestoreChanged',
      'review_invoice',
    ],
  ] as const)(
    'maps %s in %s to a specific problem',
    (error, operation, status, code, messageKey, remedy) => {
      const result = billingProblemFor(error, operation);
      expect(result).toMatchObject({ status, code, key: messageKey, remedies: [{ id: remedy }] });
      expect(result?.message).not.toBe(error.message);
    },
  );

  it.each([
    ['updateTaxProfile', new ValidationError('Active tax profile not found'), 'taxProfileId'],
    ['createInvoiceNumberPolicy', new ValidationError('Legal entity not found'), 'legalEntityId'],
    [
      'createBillingRule',
      new ValidationError('Active tax profile matching the billing entity is required'),
      'taxProfileId',
    ],
    [
      'createInvoiceAdjustment',
      new ValidationError('Issued original invoice required'),
      'originalInvoiceId',
    ],
  ])('retains entered values and points %s at %s', (operation, error, field) => {
    const values = { [field]: 'selected-id', viewportScrollY: '640' };
    const result = billingActionFailure(error, operation, 'finance_admin', values);
    expect(result.data).toMatchObject({
      values,
      fieldErrors: { [field]: [expect.stringMatching(/^problem\.billing\./)] },
    });
  });

  it('keeps existing issuer mapping for editing an issuer', () => {
    expect(
      billingProblemFor(new ValidationError('Active legal entity not found'), 'updateLegalEntity'),
    ).toMatchObject({
      code: 'BILLING_ISSUER_UNAVAILABLE',
      key: 'problem.billing.issuerUnavailable',
    });
  });

  it('does not apply operation-specific mappings to unrelated actions', () => {
    expect(
      billingProblemFor(
        new ValidationError('Issued unpaid credit note required'),
        'createBillingRule',
      ),
    ).toBeUndefined();
    expect(
      billingProblemFor(
        new ValidationError('Tax profile belongs to a different legal entity'),
        'updateTaxProfile',
      ),
    ).toBeUndefined();
  });
});
