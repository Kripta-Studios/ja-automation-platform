import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@ja/database';
import { openPortalRepository } from '../../apps/portal/src/lib/server/portal-repository';
import {
  billingActionFailure,
  billingActions,
  billingProblemFor,
} from '../../apps/portal/src/lib/server/actions/billing-actions';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';

vi.mock('../../apps/portal/src/lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/portal/src/lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

const issuerId = '00000000-0000-4000-8000-000000000456';

beforeEach(() => vi.mocked(openPortalRepository).mockReset());

describe('owner invoice issuer edit problems', () => {
  it.each([
    [
      'Tax or registration identifier is too long',
      400,
      'BILLING_ISSUER_IDENTIFIER_TOO_LONG',
      'problem.billing.issuerIdentifierTooLong',
      'companyIdentifiers',
      'correct_field',
    ],
    [
      'Legal entity name is required',
      400,
      'BILLING_ISSUER_NAME_INVALID',
      'problem.billing.issuerNameInvalid',
      'legalName',
      'correct_field',
    ],
    [
      'Billing address is required',
      400,
      'BILLING_ISSUER_ADDRESS_INVALID',
      'problem.billing.issuerAddressInvalid',
      'billingAddress',
      'correct_field',
    ],
    [
      'Active legal entity not found',
      409,
      'BILLING_ISSUER_UNAVAILABLE',
      'problem.billing.issuerUnavailable',
      null,
      'review_billing_setup',
    ],
  ] as const)(
    'maps %s to a precise issuer result',
    (message, status, code, messageKey, field, remedy) => {
      const values = {
        legalEntityId: issuerId,
        legalName: 'Current issuer',
        billingAddress: 'Current address',
        companyIdentifiers: 'Current identifier',
      };
      const result = billingActionFailure(
        new ValidationError(message),
        'updateLegalEntity',
        'owner_admin',
        values,
      );
      expect(result.status).toBe(status);
      expect(result.data).toMatchObject({
        code,
        messageKey,
        billingOperation: 'updateLegalEntity',
        remedies: [{ id: remedy }],
        values,
      });
      if (field) expect(result.data.fieldErrors).toHaveProperty(field);
      else expect(result.data.fieldErrors).toEqual({});
      expect(result.data.message).not.toBe(message);
      for (const locale of ['en', 'es', 'pt'] as const) {
        const translated = translate(locale, messageKey);
        expect(translated).not.toBe(messageKey);
        expect(translated.length).toBeGreaterThan(20);
      }
    },
  );

  it('also maps a stale issuer in the archive action', () => {
    const result = billingActionFailure(
      new ValidationError('Active legal entity not found'),
      'archiveLegalEntity',
      'owner_admin',
      { legalEntityId: issuerId },
    );
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({
      code: 'BILLING_ISSUER_UNAVAILABLE',
      messageKey: 'problem.billing.issuerUnavailable',
      billingOperation: 'archiveLegalEntity',
      remedies: [{ id: 'review_billing_setup' }],
      values: { legalEntityId: issuerId },
    });
  });

  it('scopes issuer wording to the owner issuer actions', () => {
    expect(
      billingProblemFor(new ValidationError('Active legal entity not found'), 'createLegalEntity')
        ?.code,
    ).not.toBe('BILLING_ISSUER_UNAVAILABLE');
    expect(
      billingProblemFor(new ValidationError('Billing address is required'), 'archiveLegalEntity')
        ?.code,
    ).not.toBe('BILLING_ISSUER_ADDRESS_INVALID');
  });

  it('keeps an overlong issuer address and field guidance in the form response', async () => {
    const close = vi.fn();
    const updateLegalEntity = vi.fn(() => {
      throw new ValidationError('Billing address is required');
    });
    vi.mocked(openPortalRepository).mockReturnValue({
      principal: { role: 'owner_admin' },
      repository: { updateLegalEntity },
      sqlite: { close },
    } as never);
    const body = new FormData();
    body.set('legalEntityId', issuerId);
    body.set('legalName', 'Current issuer');
    body.set('billingAddress', 'A'.repeat(2001));
    body.set('companyIdentifiers', 'Registration 123');
    const result = await billingActions.updateLegalEntity({
      params: { section: 'billing' },
      request: new Request('http://localhost/app/billing', { method: 'POST', body }),
    } as never);
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code: 'BILLING_ISSUER_ADDRESS_INVALID',
      messageKey: 'problem.billing.issuerAddressInvalid',
      fieldErrors: { billingAddress: ['problem.billing.issuerAddressInvalid'] },
      values: { legalEntityId: issuerId, billingAddress: 'A'.repeat(2001) },
    });
    expect(updateLegalEntity).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
