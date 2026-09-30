import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, V3ConflictError, ValidationError } from '@ja/database';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';
import { openPortalRepository } from '../../apps/portal/src/lib/server/portal-repository';
import {
  billingActions,
  billingProblemFor,
} from '../../apps/portal/src/lib/server/actions/billing-actions';

vi.mock('../../apps/portal/src/lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/portal/src/lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

beforeEach(() => vi.mocked(openPortalRepository).mockReset());

const issuerId = '00000000-0000-4000-8000-000000000456';
const projectId = '00000000-0000-4000-8000-000000000123';

const cases = [
  {
    action: 'createLegalEntity',
    section: 'billing',
    method: 'createLegalEntity',
    role: 'owner_admin',
    error: new ConflictError('Legal entity code already exists'),
    values: {
      code: 'JA-ES',
      legalName: 'J&A España',
      currency: 'EUR',
      billingAddress: 'Madrid office',
    },
    code: 'BILLING_ISSUER_CODE_EXISTS',
    messageKey: 'problem.billing.issuerCodeExists',
    field: 'code',
    remedy: 'review_billing_setup',
  },
  {
    action: 'createBillingRule',
    section: 'billing',
    method: 'createBillingRule',
    role: 'finance_admin',
    error: new ValidationError(
      'A billing stream already starts on or after this effective date. Choose a later date or manage the existing successor.',
    ),
    values: {
      projectId,
      legalEntityId: issuerId,
      streamType: 'labor',
      cadenceType: 'monthly',
      currency: 'EUR',
      effectiveFrom: '2026-10-01',
    },
    code: 'BILLING_STREAM_EFFECTIVE_DATE_OVERLAP',
    messageKey: 'problem.billing.streamEffectiveDateOverlap',
    field: 'effectiveFrom',
    remedy: 'review_billing_setup',
  },
  {
    action: 'createTaxProfile',
    section: 'billing',
    method: 'createTaxProfile',
    role: 'finance_admin',
    error: new ValidationError('Tax profile currency must match the legal entity currency'),
    values: {
      legalEntityId: issuerId,
      name: 'IVA',
      currency: 'USD',
      effectiveFrom: '2026-10-01',
      componentName: 'IVA',
      componentBasisPoints: '2100',
    },
    code: 'BILLING_TAX_PROFILE_ISSUER_CURRENCY_MISMATCH',
    messageKey: 'problem.billing.taxProfileIssuerCurrencyMismatch',
    field: 'currency',
    remedy: 'review_billing_setup',
  },
  {
    action: 'archiveLegalEntity',
    section: 'billing',
    method: 'archiveLegalEntity',
    role: 'owner_admin',
    error: new ConflictError(
      'Issue or recalculate approved invoices before archiving this legal entity',
    ),
    values: { legalEntityId: issuerId },
    code: 'BILLING_ISSUER_APPROVED_INVOICE_BLOCKS_ARCHIVE',
    messageKey: 'problem.billing.issuerApprovedInvoiceBlocksArchive',
    field: null,
    remedy: 'review_invoice',
  },
  {
    action: 'createAccountingPack',
    section: 'accounting',
    method: 'createAccountingPack',
    role: 'owner_admin',
    error: new V3ConflictError('Deployment identity is not configured'),
    values: {
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      reportLocale: 'es',
    },
    code: 'ACCOUNTING_PACK_DEPLOYMENT_IDENTITY_MISSING',
    messageKey: 'problem.billing.packDeploymentIdentityMissing',
    field: null,
    remedy: 'contact_support',
  },
  ...[
    `Expense ${projectId} is missing its authoritative project-currency projection`,
    `Expense ${projectId} needs an exact project-currency reimbursement projection`,
  ].map((message) => ({
    action: 'createAccountingPack' as const,
    section: 'accounting',
    method: 'createAccountingPack',
    role: 'owner_admin',
    error: new V3ConflictError(message),
    values: {
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      reportLocale: 'pt',
    },
    code: 'ACCOUNTING_PACK_EXPENSE_CURRENCY_REVIEW_REQUIRED',
    messageKey: 'problem.billing.packExpenseCurrencyReviewRequired',
    field: null,
    remedy: 'review_expense_finance',
  })),
] as const;

describe('known Billing and Accounting setup failures', () => {
  it.each(cases)('returns $code through the $action form action', async (testCase) => {
    const repositoryMethod = vi.fn(() => {
      throw testCase.error;
    });
    const close = vi.fn();
    vi.mocked(openPortalRepository).mockReturnValue({
      principal: { role: testCase.role },
      repository: { [testCase.method]: repositoryMethod },
      v3: { [testCase.method]: repositoryMethod },
      sqlite: { close, prepare: vi.fn(() => ({ get: vi.fn(() => ({ projectId })) })) },
    } as never);
    const body = new FormData();
    for (const [name, value] of Object.entries(testCase.values)) body.set(name, value);
    body.set('unrelatedSecret', 'must not be echoed');
    const handler = billingActions[testCase.action] as (event: never) => Promise<unknown>;
    const result = (await handler({
      params: { section: testCase.section },
      locals: { user: { id: 'authorized-test-user', role: testCase.role } },
      request: new Request(`http://localhost/app/${testCase.section}`, { method: 'POST', body }),
    } as never)) as { status: number; data: Record<string, unknown> };

    expect(repositoryMethod).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      success: false,
      code: testCase.code,
      messageKey: testCase.messageKey,
      billingOperation: testCase.action,
      actionName: testCase.action,
      remedies: [{ id: testCase.remedy }],
      values: testCase.values,
    });
    expect(result.data.values).not.toHaveProperty('unrelatedSecret');
    if (testCase.code === 'ACCOUNTING_PACK_EXPENSE_CURRENCY_REVIEW_REQUIRED')
      expect(result.data.params).toEqual({ expenseId: projectId, projectId });
    expect(result.data.message).not.toBe(testCase.error.message);
    if (testCase.field)
      expect(result.data.fieldErrors).toHaveProperty(testCase.field, [testCase.messageKey]);
    else expect(result.data.fieldErrors).toEqual({});
    for (const locale of ['en', 'es', 'pt'] as const) {
      const wording = translate(locale, testCase.messageKey);
      expect(wording).not.toBe(testCase.messageKey);
      expect(wording.length).toBeGreaterThan(40);
      if (testCase.field)
        expect(
          translate(
            locale,
            String((result.data.fieldErrors as Record<string, string[]>)[testCase.field]?.[0]),
          ),
        ).toBe(wording);
    }
  });

  it('keeps matching scoped to its action', () => {
    expect(
      billingProblemFor(
        new V3ConflictError(
          `Expense ${projectId} is missing its authoritative project-currency projection`,
        ),
        'finalizeAccountingPack',
      ),
    ).toBeUndefined();
    expect(
      billingProblemFor(new V3ConflictError('Unknown accounting conflict'), 'createAccountingPack'),
    ).toBeUndefined();
    expect(
      billingProblemFor(
        new ConflictError('Legal entity code already exists'),
        'archiveLegalEntity',
      ),
    ).toBeUndefined();
    expect(
      billingProblemFor(
        new V3ConflictError('Deployment identity is not configured'),
        'finalizeAccountingPack',
      ),
    ).toBeUndefined();
  });

  it('translates the support remedy for Finance and Owner without a URL', () => {
    for (const locale of ['en', 'es', 'pt'] as const)
      expect(translate(locale, 'problem.remedy.contactSupport')).not.toBe(
        'problem.remedy.contactSupport',
      );
  });
});
