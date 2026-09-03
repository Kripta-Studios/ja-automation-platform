import { beforeEach, describe, expect, it, vi } from 'vitest';

const openPortalRepository = vi.fn();
const confirmStepUpPassword = vi.fn();

vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));
vi.mock('$lib/server/step-up', () => ({
  confirmStepUpPassword,
  stepUpClientAddress: vi.fn(() => '127.0.0.1'),
}));

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

  it.each([
    ['createInvitation', accessActions.createInvitation],
    ['updateUserStatus', accessActions.updateUserStatus],
    ['updateWorkerProfile', accessActions.updateWorkerProfile],
  ] as const)('rejects non-owners before validation or step-up for %s', async (name, action) => {
    const result = await action(unauthorizedEvent('finance_admin', name));

    expect(result).toMatchObject({
      status: 403,
      data: { success: false, messageKey: 'action.error.forbidden' },
    });
    expect(confirmStepUpPassword).not.toHaveBeenCalled();
    expect(openPortalRepository).not.toHaveBeenCalled();
  });
});
