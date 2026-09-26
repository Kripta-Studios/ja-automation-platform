import { afterEach, describe, expect, it, vi } from 'vitest';
import { StalwartUnavailableError } from '../../apps/portal/src/lib/server/stalwart-client.ts';

const createInvitation = vi.fn();
const provisionMailboxUsers = vi.fn();
const createMailboxAccount = vi.fn();
const bootstrapMailboxUsers = vi.fn();
const updateMailboxPassword = vi.fn();
const destroyMailboxAccount = vi.fn();
const close = vi.fn();

vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return {
    ...original,
    openPortalRepository: () => ({
      v3: { createInvitation },
      principal: { userId: 'owner-1', role: 'owner_admin' },
      sqlite: { close },
    }),
  };
});
vi.mock('$lib/server/mail-directory', () => ({
  provisionMailboxUsers,
  createMailboxAccount,
  bootstrapMailboxUsers,
  updateMailboxPassword,
  destroyMailboxAccount,
}));

const { accessActions } =
  await import('../../apps/portal/src/lib/server/actions/access-actions.ts');

function event(form: Record<string, string | string[]> = {}, role = 'owner_admin') {
  const body = new FormData();
  for (const [name, value] of Object.entries(form))
    for (const item of Array.isArray(value) ? value : [value]) body.append(name, item);
  return {
    locals: {
      correlationId: 'directory-test',
      user: { email: 'antonny.luty@j-aautomation.com', role },
      session: { id: 'session-1' },
    },
    params: { section: 'projects' },
    request: new Request('http://localhost/app/projects', { method: 'POST', body }),
  } as never;
}

const key = '1234567890123456';
const mailbox = {
  stalwartAccountId: 'mail-1',
  email: 'worker@example.test',
  confirmation: 'worker@example.test',
  reason: 'Account review',
  idempotencyKey: key,
};

afterEach(() => {
  vi.resetAllMocks();
});

describe('directory action problems', () => {
  it('maps a duplicate invitation to a role-safe existing-person remedy', async () => {
    createInvitation.mockImplementation(() => {
      throw new Error('An active or pending account already uses this email');
    });
    const result = await accessActions.createInvitation(
      event({
        email: 'worker@example.test',
        role: 'worker',
        expiresInDays: '7',
        emailChoice: 'yes',
      }),
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'ACCESS_INVITATION_ACCOUNT_EXISTS',
        messageKey: 'problem.access.emailAlreadyUsed',
        values: { email: 'worker@example.test' },
        remedies: [{ id: 'review_existing_person' }],
      },
    });
  });

  it('keeps selected mailboxes when a mailbox disappears', async () => {
    provisionMailboxUsers.mockRejectedValue(new Error('MAILBOX_NOT_FOUND_IN_STALWART'));
    const result = await accessActions.provisionMailboxUsers(
      event({
        emails: ['first@example.test', 'second@example.test'],
        role: 'worker',
      }),
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'ACCESS_MAILBOX_NOT_FOUND',
        fieldErrors: { emails: ['problem.access.mailIdentityStale'] },
        values: { emails: 'first@example.test,second@example.test' },
      },
    });
  });

  it('reports a created mailbox with a pending portal link and never echoes its password', async () => {
    createMailboxAccount.mockRejectedValue(new Error('MAILBOX_PARTIAL_FAILURE_CREATED'));
    const result = await accessActions.createMailboxAccount(
      event({
        username: 'new.worker',
        name: 'New Worker',
        password: 'secret-password-2026',
        quotaMb: '2048',
        provisionRole: 'worker',
        idempotencyKey: key,
      }),
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'ACCESS_MAILBOX_CREATED_LINK_PENDING',
        remedies: [{ id: 'review_mailbox_identity' }],
        values: { username: 'new.worker', idempotencyKey: key },
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret-password-2026');
  });

  it('guides an uncertain service save to review the directory before retrying', async () => {
    createMailboxAccount.mockRejectedValue(new StalwartUnavailableError());
    const result = await accessActions.createMailboxAccount(
      event({
        username: 'new.worker',
        name: 'New Worker',
        password: 'secret-password-2026',
        quotaMb: '2048',
        provisionRole: 'worker',
        idempotencyKey: key,
      }),
    );
    expect(result).toMatchObject({
      status: 503,
      data: {
        code: 'ACCESS_MAILBOX_SERVICE_UNAVAILABLE',
        remedies: [{ id: 'review_mailbox_identity' }],
        values: { idempotencyKey: key },
      },
    });
  });

  it('keeps technical details out of an unexpected failure', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    createMailboxAccount.mockRejectedValue(new Error('private database connection detail'));
    const result = await accessActions.createMailboxAccount(
      event({
        username: 'new.worker',
        name: 'New Worker',
        password: 'secret-password-2026',
        quotaMb: '2048',
        provisionRole: 'worker',
        idempotencyKey: key,
      }),
    );
    expect(result).toMatchObject({
      status: 500,
      data: {
        code: 'UNEXPECTED_ERROR',
        messageKey: 'problem.error.unexpected',
        values: { username: 'new.worker' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('private database connection detail');
    expect(JSON.stringify(result)).not.toContain('secret-password-2026');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('keeps safe password-change entries and marks uncertain external success', async () => {
    updateMailboxPassword.mockRejectedValue(new Error('MAILBOX_PARTIAL_FAILURE_PASSWORD_UPDATED'));
    const result = await accessActions.updateMailboxPassword(
      event({
        ...mailbox,
        password: 'another-secret-2026',
      }),
    );
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'ACCESS_MAILBOX_PASSWORD_AUDIT_PENDING',
        values: { email: mailbox.email },
      },
    });
    expect(JSON.stringify(result)).not.toContain('another-secret-2026');
  });

  it('explains protected mailbox deletion without calling the external service again', async () => {
    destroyMailboxAccount.mockRejectedValue(new Error('CANONICAL_OWNER_MAILBOX_PROTECTED'));
    const result = await accessActions.destroyMailboxAccount(event(mailbox));
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'ACCESS_CANONICAL_OWNER_PROTECTED',
        remedies: [{ id: 'review_owner_access' }],
      },
    });
  });

  it('explains a missing owner mailbox during synchronization', async () => {
    bootstrapMailboxUsers.mockRejectedValue(new Error('CANONICAL_OWNER_MAILBOX_MISSING'));
    const result = await accessActions.bootstrapMailboxUsers(event());
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'ACCESS_OWNER_MAILBOX_MISSING',
        remedies: [{ id: 'review_mailbox_identity' }],
      },
    });
  });

  it('preserves nonsecret entries for a caller without owner access', async () => {
    const result = await accessActions.updateMailboxPassword(
      event(
        {
          ...mailbox,
          password: 'private-password-2026',
        },
        'worker',
      ),
    );
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'ACCESS_OWNER_REQUIRED',
        values: { email: mailbox.email },
        remedies: [{ id: 'contact_owner' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('private-password-2026');
    expect(updateMailboxPassword).not.toHaveBeenCalled();
  });
});
