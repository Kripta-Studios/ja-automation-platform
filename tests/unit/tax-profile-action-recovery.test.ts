import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '../../apps/portal/src/lib/server/portal-repository';
import { billingActions } from '../../apps/portal/src/lib/server/actions/billing-actions';

vi.mock('../../apps/portal/src/lib/server/portal-repository', async (original) => ({
  ...(await original<typeof import('../../apps/portal/src/lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));
beforeEach(() => vi.mocked(openPortalRepository).mockReset());

describe('existing tax commands retain scoped failure values', () => {
  const profileId = '00000000-0000-4000-8000-000000000123';
  it.each([
    [
      'updateTaxProfile',
      new ValidationError('Active tax profile not found'),
      409,
      'BILLING_TAX_PROFILE_UNAVAILABLE',
    ],
    [
      'archiveTaxProfile',
      new ConflictError('Issue or recalculate approved invoices before archiving this tax profile'),
      409,
      'BILLING_TAX_PROFILE_APPROVED_INVOICE_BLOCKS_ARCHIVE',
    ],
    [
      'updateTaxProfile',
      new AccessDeniedError('Finance role required'),
      403,
      'BILLING_FINANCE_REQUIRED',
    ],
  ] as const)('%s retains values after %s', async (operation, error, status, code) => {
    const command = vi.fn(() => {
      throw error;
    });
    const close = vi.fn();
    const principal = { role: 'finance_admin' };
    vi.mocked(openPortalRepository).mockReturnValue({
      principal,
      repository: { [operation]: command },
      sqlite: { close },
    } as never);
    const body = new FormData();
    body.set('taxProfileId', profileId);
    body.set('name', 'Entered tax profile rename');
    body.set('componentBasisPoints', '999');
    body.set('unrelatedSecret', 'must not be echoed');
    const result = await billingActions[operation]({
      params: { section: 'billing' },
      locals: { user: { id: 'authorized-test-actor' } },
      request: new Request('http://localhost/app/billing', { method: 'POST', body }),
    } as never);
    expect(result).toMatchObject({
      status,
      data: {
        code,
        billingOperation: operation,
        values: { taxProfileId: profileId, name: 'Entered tax profile rename' },
      },
    });
    expect((result as { data: { values: unknown } }).data.values).not.toHaveProperty(
      'unrelatedSecret',
    );
    if (operation === 'updateTaxProfile')
      expect(command).toHaveBeenCalledWith(principal, profileId, {
        name: 'Entered tax profile rename',
      });
    else expect(command).toHaveBeenCalledWith(principal, profileId);
    expect(close).toHaveBeenCalledOnce();
  });
});
