import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError } from '@ja/database';

const setAccountProfile = vi.fn();
const updateUserStatus = vi.fn();
const provisionLocalPortalAccount = vi.fn();
const close = vi.fn();
let liveSession = true;
let inactiveAccount = false;
let principalRole = 'owner_admin';

vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return {
    ...original,
    openPortalRepository: () => {
      if (inactiveAccount) throw new AccessDeniedError('Active account required');
      return {
        principal: { userId: 'owner-1', role: principalRole, sessionId: 'session-1' },
        repository: { updateUserStatus },
        sqlite: {
          close,
          prepare: () => ({
            get: () =>
              liveSession ? { expires_at: new Date(Date.now() + 60_000).toISOString() } : undefined,
          }),
        },
      };
    },
  };
});
vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  return {
    ...original,
    SupplierWorkforceRepository: class {
      setAccountProfile = setAccountProfile;
      provisionLocalPortalAccount = provisionLocalPortalAccount;
    },
  };
});
vi.mock('$lib/server/webmail-password', () => ({
  hashPortalPassword: vi.fn(async () => 'test-hash'),
}));

const { accessActions } =
  await import('../../apps/portal/src/lib/server/actions/access-actions.ts');
const { hashPortalPassword } = await import('$lib/server/webmail-password');
const workerId = '00000000-0000-4000-8000-000000000001';
const absentUserId = '00000000-0000-4000-8000-000000000099';

function ownerEvent(action: string, fields: Record<string, string>, enhanced = false) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return {
    params: { section: 'projects' },
    locals: {
      correlationId: 'team-qa',
      user: { email: 'antonny.luty@j-aautomation.com', role: 'owner_admin' },
      session: { id: 'session-1' },
    },
    request: new Request(`https://example.test/app/projects?/${action}`, {
      method: 'POST',
      body,
      headers: enhanced ? { accept: 'application/json', 'x-sveltekit-action': 'true' } : {},
    }),
  } as never;
}

afterEach(() => {
  vi.resetAllMocks();
  liveSession = true;
  inactiveAccount = false;
  principalRole = 'owner_admin';
});

describe('owner team access action problems', () => {
  it.each([false, true])(
    'rejects a missing supplier before writing for enhanced=%s',
    async (enhanced) => {
      const result = await accessActions.setWorkforceProfile(
        ownerEvent(
          'setWorkforceProfile',
          {
            workerId,
            profile: 'external_technician',
            supplierId: '',
          },
          enhanced,
        ),
      );
      expect(result).toMatchObject({
        status: 400,
        data: {
          code: 'ACCESS_WORKFORCE_SUPPLIER_REQUIRED',
          messageKey: 'problem.access.workforceSupplierRequired',
          fieldErrors: { supplierId: ['problem.access.workforceSupplierRequired'] },
          actionName: 'setWorkforceProfile',
          values: { workerId, profile: 'external_technician', supplierId: '' },
          remedies: [{ id: 'review_supplier_profile', recordId: workerId }],
        },
      });
      expect(setAccountProfile).not.toHaveBeenCalled();
      expect(updateUserStatus).not.toHaveBeenCalled();
    },
  );

  it('maps a repository supplier validation if the supplier changed after form submission', async () => {
    setAccountProfile.mockImplementation(() => {
      throw new Error('Supplier is required');
    });
    const result = await accessActions.setWorkforceProfile(
      ownerEvent('setWorkforceProfile', {
        workerId,
        profile: 'supplier_coordinator',
        supplierId: '00000000-0000-4000-8000-000000000002',
      }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'ACCESS_WORKFORCE_SUPPLIER_REQUIRED',
        actionName: 'setWorkforceProfile',
        values: { workerId, profile: 'supplier_coordinator' },
      },
    });
    expect(updateUserStatus).not.toHaveBeenCalled();
  });

  it('requires a live owner session before revealing the missing supplier guidance', async () => {
    liveSession = false;
    const result = await accessActions.setWorkforceProfile(
      ownerEvent('setWorkforceProfile', {
        workerId,
        profile: 'external_technician',
        supplierId: '',
      }),
    );
    expect(result).toMatchObject({
      status: 401,
      data: {
        code: 'ACCESS_TEAM_SESSION_REQUIRED',
        messageKey: 'problem.access.teamSessionExpired',
        actionName: 'setWorkforceProfile',
        remedies: [{ id: 'sign_in_again' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('workforceSupplierRequired');
    expect(setAccountProfile).not.toHaveBeenCalled();
  });

  it('explains a disabled owner account before revealing supplier field guidance', async () => {
    inactiveAccount = true;
    const result = await accessActions.setWorkforceProfile(
      ownerEvent('setWorkforceProfile', {
        workerId,
        profile: 'external_technician',
        supplierId: '',
      }),
    );
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'ACCESS_ACCOUNT_INACTIVE',
        messageKey: 'problem.access.accountInactive',
        actionName: 'setWorkforceProfile',
        values: { workerId, profile: 'external_technician', supplierId: '' },
        remedies: [{ id: 'contact_owner' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('workforceSupplierRequired');
    expect(setAccountProfile).not.toHaveBeenCalled();
  });

  it('keeps the standard profile available without a supplier', async () => {
    const result = await accessActions.setWorkforceProfile(
      ownerEvent('setWorkforceProfile', { workerId, profile: 'standard', supplierId: '' }),
    );
    expect(result).toMatchObject({ success: true });
    expect(setAccountProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: workerId, profile: 'standard', supplierId: '' }),
    );
  });

  it('uses a typed owner remedy if the profile editor loses its owner role', async () => {
    principalRole = 'project_manager';
    const result = await accessActions.setWorkforceProfile(
      ownerEvent('setWorkforceProfile', {
        workerId,
        profile: 'external_technician',
        supplierId: '',
      }),
    );
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'ACCESS_TEAM_OWNER_REQUIRED',
        actionName: 'setWorkforceProfile',
        remedies: [{ id: 'contact_owner' }],
        values: { workerId, profile: 'external_technician', supplierId: '' },
      },
    });
    expect(setAccountProfile).not.toHaveBeenCalled();
  });

  it('keeps a signed-out profile form in the typed sign-in path', async () => {
    const event = ownerEvent('setWorkforceProfile', {
      workerId,
      profile: 'external_technician',
      supplierId: '',
    }) as unknown as { locals: { user: unknown; session: unknown } };
    event.locals.user = null;
    event.locals.session = null;
    const result = await accessActions.setWorkforceProfile(event as never);
    expect(result).toMatchObject({
      status: 401,
      data: {
        code: 'ACCESS_TEAM_SESSION_REQUIRED',
        actionName: 'setWorkforceProfile',
        remedies: [{ id: 'sign_in_again' }],
      },
    });
    expect(setAccountProfile).not.toHaveBeenCalled();
  });

  it('gives a signed-in manager a contact-owner response for a direct profile post', async () => {
    const event = ownerEvent('setWorkforceProfile', {
      workerId,
      profile: 'external_technician',
      supplierId: '',
    }) as unknown as { locals: { user: { role: string } } };
    event.locals.user.role = 'project_manager';
    const result = await accessActions.setWorkforceProfile(event as never);
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'ACCESS_TEAM_OWNER_REQUIRED',
        actionName: 'setWorkforceProfile',
        remedies: [{ id: 'contact_owner' }],
      },
    });
    expect(setAccountProfile).not.toHaveBeenCalled();
  });

  it.each([false, true])('identifies a removed account for enhanced=%s', async (enhanced) => {
    updateUserStatus.mockImplementation(() => {
      throw new Error('User not found');
    });
    const result = await accessActions.updateUserStatus(
      ownerEvent('updateUserStatus', { userId: absentUserId, status: 'offboarded' }, enhanced),
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'ACCESS_STATUS_PERSON_UNAVAILABLE',
        messageKey: 'problem.access.statusPersonUnavailable',
        actionName: 'updateUserStatus',
        values: { userId: absentUserId, status: 'offboarded' },
        remedies: [{ id: 'review_user_access' }],
      },
    });
    expect(setAccountProfile).not.toHaveBeenCalled();
    expect(updateUserStatus).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['stale owner role', 'project_manager', false, false, 'ACCESS_TEAM_OWNER_REQUIRED', 403],
    ['inactive account', 'owner_admin', true, false, 'ACCESS_ACCOUNT_INACTIVE', 403],
    ['expired session', 'owner_admin', false, true, 'ACCESS_TEAM_SESSION_REQUIRED', 401],
  ] as const)(
    'checks %s before rejecting status fields',
    async (_case, role, inactive, expired, code, status) => {
      principalRole = role;
      inactiveAccount = inactive;
      liveSession = !expired;
      const result = await accessActions.updateUserStatus(
        ownerEvent('updateUserStatus', { userId: 'bad-id', status: 'bad-status' }),
      );
      expect(result).toMatchObject({
        status,
        data: {
          code,
          actionName: 'updateUserStatus',
          values: { userId: 'bad-id', status: 'bad-status' },
        },
      });
      expect(updateUserStatus).not.toHaveBeenCalled();
    },
  );

  it.each(['Owner administration required', 'Account role changed'])(
    'maps repository %s during status update to contact-owner guidance',
    async (reason) => {
      updateUserStatus.mockImplementation(() => {
        throw new AccessDeniedError(reason);
      });
      const result = await accessActions.updateUserStatus(
        ownerEvent('updateUserStatus', { userId: workerId, status: 'offboarded' }),
      );
      expect(result).toMatchObject({
        status: 403,
        data: {
          code: 'ACCESS_TEAM_OWNER_REQUIRED',
          actionName: 'updateUserStatus',
          remedies: [{ id: 'contact_owner' }],
          values: { userId: workerId, status: 'offboarded' },
        },
      });
      expect(JSON.stringify(result)).not.toContain('ACTION_ERROR_INVALID');
    },
  );

  it('maps a repository role change during local account creation before any account is created', async () => {
    provisionLocalPortalAccount.mockImplementation(() => {
      throw new AccessDeniedError('Account role changed');
    });
    const result = await accessActions.createLocalPortalUser(
      ownerEvent('createLocalPortalUser', {
        name: 'Test Worker',
        email: 'test-worker@example.test',
        password: 'temporary-passphrase-123',
        role: 'worker',
      }),
    );
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'ACCESS_TEAM_OWNER_REQUIRED',
        actionName: 'createLocalPortalUser',
        remedies: [{ id: 'contact_owner' }],
        values: { name: 'Test Worker', role: 'worker' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('temporary-passphrase-123');
    expect(provisionLocalPortalAccount).toHaveBeenCalledTimes(1);
  });

  it('explains a deactivated Owner account before hashing valid local-account credentials', async () => {
    inactiveAccount = true;
    const result = await accessActions.createLocalPortalUser(
      ownerEvent('createLocalPortalUser', {
        name: 'Test Worker',
        email: 'test-worker@example.test',
        password: 'temporary-passphrase-123',
        role: 'worker',
      }),
    );
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'ACCESS_ACCOUNT_INACTIVE',
        messageKey: 'problem.access.accountInactive',
        actionName: 'createLocalPortalUser',
        values: { name: 'Test Worker', role: 'worker' },
        remedies: [{ id: 'contact_owner' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('temporary-passphrase-123');
    expect(hashPortalPassword).not.toHaveBeenCalled();
    expect(provisionLocalPortalAccount).not.toHaveBeenCalled();
  });
});
