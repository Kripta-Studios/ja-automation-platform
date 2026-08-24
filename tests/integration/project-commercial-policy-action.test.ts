import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError } from '@ja/database';
import { projectCommercialPolicyInputSchema } from '@ja/schemas';

const openPortalRepository = vi.fn();

vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return { ...original, openPortalRepository };
});

const { financeActions } =
  await import('../../apps/portal/src/lib/server/actions/finance-actions.ts');

const validForm = {
  projectId: '11111111-1111-4111-8111-111111111111',
  effectiveFrom: '2026-09-01',
  overtimeEnabled: 'true',
  overtimeThresholdMinutes: '720',
  travelClientBillable: 'false',
  customerSignoffRequired: 'true',
};

function event(form: Record<string, string>, section = 'finance') {
  return {
    locals: {
      user: {
        id: 'finance-1',
        name: 'Finance',
        email: 'finance@example.test',
        role: 'finance_admin',
        status: 'active',
      },
      session: {
        id: 'finance-session',
        userId: 'finance-1',
        expiresAt: new Date(Date.now() + 60_000),
      },
      correlationId: 'commercial-policy-action',
    },
    params: { section },
    request: new Request(`http://localhost/app/${section}?/createProjectCommercialPolicy`, {
      method: 'POST',
      body: new URLSearchParams(form),
    }),
  } as never;
}

describe('project commercial policy finance action', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses a strict allowlist and rejects forged commercial fields before opening storage', async () => {
    const result = await financeActions.createProjectCommercialPolicy(
      event({ ...validForm, clientRateMinor: '999999' }),
    );
    expect(result).toMatchObject({ status: 400 });
    expect(openPortalRepository).not.toHaveBeenCalled();
    expect(projectCommercialPolicyInputSchema.safeParse(validForm).success).toBe(true);
  });

  it('is registered only for the Finance section', async () => {
    const result = await financeActions.createProjectCommercialPolicy(event(validForm, 'projects'));
    expect(result).toMatchObject({ status: 404 });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it('delegates an exact normalized policy contract and closes the database', async () => {
    const createProjectCommercialPolicy = vi.fn(() => ({ version: 3 }));
    const close = vi.fn();
    openPortalRepository.mockReturnValue({
      repository: { createProjectCommercialPolicy },
      principal: {
        userId: 'finance-1',
        role: 'finance_admin',
        projectIds: new Set<string>(),
        sessionId: 'finance-session',
      },
      sqlite: { close },
    });

    const result = await financeActions.createProjectCommercialPolicy(event(validForm));
    expect(createProjectCommercialPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'finance_admin', sessionId: 'finance-session' }),
      {
        projectId: validForm.projectId,
        effectiveFrom: '2026-09-01',
        overtimeEnabled: true,
        overtimeThresholdMinutes: 720,
        travelClientBillable: false,
        customerSignoffRequired: true,
      },
    );
    expect(result).toMatchObject({
      success: true,
      messageKey: 'action.finance.projectCommercialPolicySaved',
      messageParams: { version: 3 },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('returns a localized-compatible forbidden result for PM or missing step-up denial', async () => {
    const close = vi.fn();
    openPortalRepository.mockReturnValue({
      repository: {
        createProjectCommercialPolicy: vi.fn(() => {
          throw new AccessDeniedError('Recent step-up authentication is required');
        }),
      },
      principal: { userId: 'pm-1', role: 'project_manager', projectIds: new Set<string>() },
      sqlite: { close },
    });

    const result = await financeActions.createProjectCommercialPolicy(event(validForm));
    expect(result).toMatchObject({
      status: 403,
      data: {
        success: false,
        messageKey: 'action.error.forbidden',
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
