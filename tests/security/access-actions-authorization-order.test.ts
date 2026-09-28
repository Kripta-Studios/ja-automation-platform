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
    ['createInvitation', accessActions.createInvitation, 'problem.access.ownerRequired'],
    ['updateUserStatus', accessActions.updateUserStatus, 'problem.management.ownerRequired'],
    ['updateWorkerProfile', accessActions.updateWorkerProfile, 'action.error.forbidden'],
  ] as const)(
    'rejects non-owners before validation or repository access for %s',
    async (name, action, messageKey) => {
      const result = await action(unauthorizedEvent('finance_admin', name));

      expect(result).toMatchObject({
        status: 403,
        data: { success: false, messageKey },
      });
      expect(openPortalRepository).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['updateUserStatus', accessActions.updateUserStatus],
    ['createLocalPortalUser', accessActions.createLocalPortalUser],
  ] as const)('returns a typed owner remedy before validating %s', async (name, action) => {
    const result = await action(unauthorizedEvent('finance_admin', name));

    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'ACCESS_TEAM_OWNER_REQUIRED',
        messageKey: 'problem.management.ownerRequired',
        actionName: name,
        remedies: [{ id: 'contact_owner' }],
      },
    });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it('returns a typed sign-in remedy before status validation', async () => {
    const event = unauthorizedEvent('owner_admin', 'updateUserStatus') as unknown as {
      locals: { user: unknown; session: unknown };
    };
    event.locals.user = null;
    event.locals.session = null;

    const result = await accessActions.updateUserStatus(event as never);

    expect(result).toMatchObject({
      status: 401,
      data: {
        code: 'ACCESS_TEAM_SESSION_REQUIRED',
        actionName: 'updateUserStatus',
        remedies: [{ id: 'sign_in_again' }],
      },
    });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it('checks owner access before hashing valid local-account credentials', async () => {
    const event = unauthorizedEvent('finance_admin', 'createLocalPortalUser') as unknown as {
      request: Request;
    };
    event.request = new Request('http://localhost/app/projects?/createLocalPortalUser', {
      method: 'POST',
      body: new URLSearchParams({
        name: 'Test Worker',
        email: 'test-worker@example.test',
        password: 'temporary-passphrase-123',
        role: 'worker',
      }),
    });

    const result = await accessActions.createLocalPortalUser(event as never);

    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'ACCESS_TEAM_OWNER_REQUIRED',
        actionName: 'createLocalPortalUser',
        remedies: [{ id: 'contact_owner' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('temporary-passphrase-123');
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

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
      data: { success: false, messageKey: 'problem.access.directoryInputInvalid' },
    });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });
});
