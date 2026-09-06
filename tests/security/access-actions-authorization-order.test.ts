import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYNTHETIC_OWNER_DEPLOYMENT_ID,
  SYNTHETIC_OWNER_EMAIL,
  SYNTHETIC_OWNER_TENANT_ID,
} from '@ja/database';

const openPortalRepository = vi.fn();

vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));

const { accessActions } =
  await import('../../apps/portal/src/lib/server/actions/access-actions.ts');

function unauthorizedEvent(role: string, action: string) {
  return {
    locals: {
      user: {
        id: `${role}-1`,
        name: role,
        email: `${role}@example.test`,
        role,
        status: 'active',
      },
      session: {
        id: `${role}-session`,
        userId: `${role}-1`,
        expiresAt: new Date(Date.now() + 60_000),
      },
      correlationId: 'access-authorization-order',
    },
    params: { section: 'projects' },
    request: new Request(`http://localhost/app/projects?/${action}`, {
      method: 'POST',
      body: new URLSearchParams({ password: 'must-not-be-verified' }),
    }),
    getClientAddress: () => '127.0.0.1',
  } as never;
}

describe('owner action authorization order', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete process.env.JA_TENANT_ID;
    delete process.env.JA_DEPLOYMENT_ID;
  });

  it.each([
    ['createInvitation', accessActions.createInvitation],
    ['updateUserStatus', accessActions.updateUserStatus],
    ['updateWorkerProfile', accessActions.updateWorkerProfile],
  ] as const)(
    'rejects non-owners before validation or repository access for %s',
    async (name, action) => {
      const result = await action(unauthorizedEvent('finance_admin', name));

      expect(result).toMatchObject({
        status: 403,
        data: { success: false, messageKey: 'action.error.forbidden' },
      });
      expect(openPortalRepository).not.toHaveBeenCalled();
    },
  );

  it('accepts the reserved synthetic Owner only for the fixed non-production deployment', async () => {
    process.env.JA_TENANT_ID = SYNTHETIC_OWNER_TENANT_ID;
    process.env.JA_DEPLOYMENT_ID = SYNTHETIC_OWNER_DEPLOYMENT_ID;
    const event = unauthorizedEvent('owner_admin', 'createInvitation') as unknown as {
      locals: { user: { email: string } };
    };
    event.locals.user.email = SYNTHETIC_OWNER_EMAIL;

    const result = await accessActions.createInvitation(event as never);

    expect(result).toMatchObject({
      status: 400,
      data: { success: false, messageKey: 'action.validation.invitation' },
    });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });
});
