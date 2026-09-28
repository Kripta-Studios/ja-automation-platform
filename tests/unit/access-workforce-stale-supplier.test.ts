import { afterEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@ja/database';

const setAccountProfile = vi.fn();
const close = vi.fn();

vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return {
    ...original,
    openPortalRepository: () => ({
      principal: { userId: 'owner-1', role: 'owner_admin', sessionId: 'session-1' },
      sqlite: {
        close,
        prepare: () => ({ get: () => ({ expires_at: new Date(Date.now() + 60_000).toISOString() }) }),
      },
    }),
  };
});

vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  return {
    ...original,
    SupplierWorkforceRepository: class {
      setAccountProfile = setAccountProfile;
    },
  };
});

const { accessActions } =
  await import('../../apps/portal/src/lib/server/actions/access-actions.ts');

const workerId = '00000000-0000-4000-8000-000000000001';
const supplierId = '00000000-0000-4000-8000-000000000002';

function event(enhanced = false) {
  return {
    params: { section: 'projects' },
    locals: {
      correlationId: 'stale-supplier-qa',
      user: { email: 'antonny.luty@j-aautomation.com', role: 'owner_admin' },
      session: { id: 'session-1' },
    },
    request: new Request('https://example.test/app/projects?view=team&/setWorkforceProfile', {
      method: 'POST',
      body: new URLSearchParams({ workerId, profile: 'supplier_coordinator', supplierId }),
      headers: enhanced ? { accept: 'application/json', 'x-sveltekit-action': 'true' } : {},
    }),
  } as never;
}

afterEach(() => vi.resetAllMocks());

describe('owner workforce profile supplier state change', () => {
  it.each([false, true])(
    'explains an inactive selected supplier for enhanced=%s',
    async (enhanced) => {
      setAccountProfile.mockImplementation(() => {
        throw new ValidationError('Active supplier required');
      });

      const result = await accessActions.setWorkforceProfile(event(enhanced));

      expect(result).toMatchObject({
        status: 409,
        data: {
          success: false,
          code: 'ACCESS_WORKFORCE_SUPPLIER_INACTIVE',
          messageKey: 'problem.access.workforceSupplierInactive',
          fieldErrors: { supplierId: ['problem.access.workforceSupplierInactive'] },
          remedies: [{ id: 'review_supplier_status' }],
          correlationId: 'stale-supplier-qa',
          actionName: 'setWorkforceProfile',
          values: { workerId, profile: 'supplier_coordinator', supplierId },
        },
      });
      expect((result as { data: { remedies: unknown[] } }).data.remedies).toEqual([
        { id: 'review_supplier_status' },
      ]);
      expect(setAccountProfile).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the separate missing-supplier validation unchanged', async () => {
    setAccountProfile.mockImplementation(() => {
      throw new ValidationError('Supplier is required');
    });

    const result = await accessActions.setWorkforceProfile(event());

    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'ACCESS_WORKFORCE_SUPPLIER_REQUIRED',
        messageKey: 'problem.access.workforceSupplierRequired',
        fieldErrors: { supplierId: ['problem.access.workforceSupplierRequired'] },
        actionName: 'setWorkforceProfile',
        values: { workerId, profile: 'supplier_coordinator', supplierId },
      },
    });
  });
});
