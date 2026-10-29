import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyPassword } from 'better-auth/crypto';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openPortalRepository = vi.fn();
const createMailbox = vi.fn();
const listMailboxes = vi.fn(async (): Promise<Array<{ email: string }>> => []);
vi.mock('$lib/server/portal-repository', async (original) => ({
  ...(await original<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository,
}));
vi.mock('$lib/server/stalwart-client', async (original) => ({
  ...(await original<typeof import('$lib/server/stalwart-client')>()),
  createConfiguredStalwartClient: async () => ({ createMailbox, listMailboxes }),
}));
const { accessActions } =
  await import('../../apps/portal/src/lib/server/actions/access-actions.ts');
let fixture: B5LifecycleSecurityFixture;
const password = 'Mailbox-test-password-2026!';
const fields = {
  name: 'New Person',
  email: 'new.person@j-aautomation.com',
  password,
  role: 'worker',
  createMailbox: 'on',
};
function event(values: Record<string, string>) {
  return {
    params: { section: 'projects' },
    locals: {
      correlationId: 'mailbox-test',
      user: { email: 'antonny.luty@j-aautomation.com', role: 'owner_admin' },
      session: { id: 'test' },
    },
    request: new Request('http://localhost/app/projects', {
      method: 'POST',
      body: new URLSearchParams(values),
    }),
  } as never;
}
beforeEach(() => {
  fixture = createB5LifecycleSecurityFixture();
  fixture.sqlite
    .prepare('UPDATE user SET email=? WHERE id=?')
    .run('antonny.luty@j-aautomation.com', fixture.owner.userId);
  const principal = stepUpB5Principal(fixture.sqlite, fixture.owner, 'mailbox-test');
  const sqlite = new Proxy(fixture.sqlite, {
    get(target, key) {
      if (key === 'close') return () => {};
      const member = Reflect.get(target, key);
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
  openPortalRepository.mockReturnValue({ repository: fixture.repository, principal, sqlite });
  createMailbox.mockImplementation(async (input) => ({
    id: 'mail-new-person',
    username: input.username,
    email: `${input.username}@j-aautomation.com`,
    name: input.name,
    domainId: 'mail-domain',
    quotaBytes: input.quotaBytes,
    usedDiskQuotaBytes: 0,
  }));
});
afterEach(() => {
  closeB5LifecycleSecurityFixture(fixture);
  vi.clearAllMocks();
});

describe('create portal access with an optional mailbox', () => {
  it.each(['worker', 'project_manager', 'finance_admin', 'auditor_read_only'])(
    'creates and links the mailbox for %s with the chosen password',
    async (role) => {
      const result = await accessActions.createLocalPortalUser(event({ ...fields, role }));
      expect(result).toMatchObject({
        success: true,
        messageKey: 'action.access.localAccount.withMailbox',
      });
      expect(createMailbox).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ username: 'new.person', password }),
      );
      const row = fixture.sqlite
        .prepare(
          `SELECT u.id,u.role,a.password,mi.stalwart_account_id mailbox FROM user u JOIN account a ON a.user_id=u.id JOIN mail_identity mi ON mi.user_id=u.id WHERE u.email=?`,
        )
        .get(fields.email) as { id: string; role: string; password: string; mailbox: string };
      expect(row.role).toBe(role);
      expect(row.mailbox).toBe('mail-new-person');
      expect(await verifyPassword({ hash: row.password, password })).toBe(true);
      expect(JSON.stringify(result)).not.toContain(password);
      const audit = fixture.sqlite.prepare('SELECT details_json FROM audit_event').all();
      expect(JSON.stringify(audit)).not.toContain(password);
    },
  );

  it('creates portal access only when unchecked, including external addresses', async () => {
    const result = await accessActions.createLocalPortalUser(
      event({ ...fields, email: 'person@example.test', createMailbox: '' }),
    );
    expect(result).toMatchObject({
      success: true,
      messageKey: 'action.access.localAccount.provisioned',
    });
    expect(createMailbox).not.toHaveBeenCalled();
    expect(fixture.sqlite.prepare('SELECT count(*) n FROM mail_identity').get()).toEqual({ n: 0 });
  });

  it.each(['person@example.test', 'a@j-aautomation.com', 'first..last@j-aautomation.com'])(
    'rejects %s before saving a portal account when checked',
    async (email) => {
      const result = await accessActions.createLocalPortalUser(event({ ...fields, email }));
      expect(result).toMatchObject({
        status: 400,
        data: {
          code: 'ACCESS_LOCAL_MAILBOX_INPUT_INVALID',
          values: { createMailbox: 'on' },
          fieldErrors: { email: ['problem.access.localMailboxEmail'] },
        },
      });
      expect(
        fixture.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email),
      ).toBeUndefined();
      expect(createMailbox).not.toHaveBeenCalled();
    },
  );

  it('does not create a mailbox when local account validation fails', async () => {
    const result = await accessActions.createLocalPortalUser(
      event({ ...fields, role: 'external_technician' }),
    );
    expect(result).toMatchObject({ status: 400, data: { code: 'ACCESS_SUPPLIER_REQUIRED' } });
    expect(createMailbox).not.toHaveBeenCalled();
  });

  it('preserves portal access after a mail outage and resumes through the mailbox form without duplicating the user', async () => {
    createMailbox.mockRejectedValueOnce(new Error('mail offline'));
    const result = await accessActions.createLocalPortalUser(event(fields));
    expect(result).toMatchObject({
      status: 502,
      data: {
        code: 'ACCESS_LOCAL_MAILBOX_PENDING',
        actionName: 'createMailboxAccount',
        values: { username: 'new.person', provisionRole: 'worker' },
      },
    });
    expect(JSON.stringify(result)).not.toContain(password);
    const retained = (result as { data: { values: Record<string, string> } }).data.values;
    const before = fixture.sqlite
      .prepare('SELECT id FROM user WHERE email=?')
      .get(fields.email) as { id: string };
    expect(before).toBeDefined();
    const retried = await accessActions.createMailboxAccount(event({ ...retained, password }));
    expect(retried).toMatchObject({ success: true });
    expect(
      fixture.sqlite.prepare('SELECT user_id FROM mail_identity WHERE email=?').get(fields.email),
    ).toEqual({ user_id: before.id });
    expect(
      fixture.sqlite.prepare('SELECT count(*) n FROM user WHERE email=?').get(fields.email),
    ).toEqual({ n: 1 });
  });

  it('rejects a pre-existing mailbox before creating portal access or replacing its password', async () => {
    listMailboxes.mockResolvedValueOnce([{ email: fields.email }]);
    const result = await accessActions.createLocalPortalUser(event(fields));
    expect(result).toMatchObject({
      status: 409,
      data: { messageKey: 'problem.access.localMailboxExists' },
    });
    expect(createMailbox).not.toHaveBeenCalled();
    expect(
      fixture.sqlite.prepare('SELECT id FROM user WHERE email=?').get(fields.email),
    ).toBeUndefined();
  });

  it('fails before saving access when the mail server cannot be checked', async () => {
    listMailboxes.mockRejectedValueOnce(new Error('offline'));
    const result = await accessActions.createLocalPortalUser(event(fields));
    expect(result).toMatchObject({
      status: 503,
      data: {
        messageKey: 'problem.access.localMailboxUnavailable',
        values: { createMailbox: 'on' },
      },
    });
    expect(createMailbox).not.toHaveBeenCalled();
    expect(
      fixture.sqlite.prepare('SELECT id FROM user WHERE email=?').get(fields.email),
    ).toBeUndefined();
  });

  it('requires a live owner session before any account or mailbox mutation', async () => {
    fixture.sqlite.prepare('DELETE FROM session WHERE user_id=?').run(fixture.owner.userId);
    const result = await accessActions.createLocalPortalUser(event(fields));
    expect(result).toHaveProperty('status', 401);
    expect(createMailbox).not.toHaveBeenCalled();
    expect(
      fixture.sqlite.prepare('SELECT id FROM user WHERE email=?').get(fields.email),
    ).toBeUndefined();
  });
});
