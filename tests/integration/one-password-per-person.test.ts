import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import type { StalwartMailbox } from '../../apps/portal/src/lib/server/stalwart-client';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment';

const restoreEnvironment = installB5TestDeploymentIdentity();
const directory = mkdtempSync(join(tmpdir(), 'ja-one-password-'));
const databasePath = join(directory, 'app.db');
const previousDatabasePath = process.env.JA_DATABASE_PATH;
process.env.JA_DATABASE_PATH = databasePath;

const {
  changeOwnPassword,
  normalizeAccessEmail,
  resetUserPassword,
  updateMailboxPassword,
  verifyPortalPasswordFor,
} = await (async () => {
  const password = await import('../../apps/portal/src/lib/server/webmail-password');
  const mail = await import('../../apps/portal/src/lib/server/mail-directory');
  const email = await import('../../apps/portal/src/lib/portal/access-email');
  return {
    ...password,
    updateMailboxPassword: mail.updateMailboxPassword,
    normalizeAccessEmail: email.normalizeAccessEmail,
    verifyPortalPasswordFor: password.verifyPortalPassword,
  };
})();

const database = createDatabase(databasePath);
const sqlite = database.sqlite;
const ids = {
  owner: '01900000-0000-7000-8000-0000000000a1',
  worker: '01900000-0000-7000-8000-0000000000a2',
  local: '01900000-0000-7000-8000-0000000000a3',
  personnel: '01900000-0000-7000-8000-0000000000a4',
};
const emails = {
  owner: 'antonny.luty@j-aautomation.com',
  worker: 'ana.silva@j-aautomation.com',
  local: 'external.pm@example.com',
  personnel: 'person.only@personnel.invalid',
};
const mailboxes: StalwartMailbox[] = [
  {
    id: 'stalwart-owner',
    username: 'antonny.luty',
    email: emails.owner,
    name: 'Antonny Luty',
    domainId: 'domain',
    quotaBytes: null,
    usedDiskQuotaBytes: null,
  },
  {
    id: 'stalwart-worker',
    username: 'ana.silva',
    email: emails.worker,
    name: 'Ana Silva',
    domainId: 'domain',
    quotaBytes: null,
    usedDiskQuotaBytes: null,
  },
];

/** In-memory Stalwart: the mailbox password is the only truth for linked users. */
const stalwartPasswords = new Map<string, string>();
const stalwart = {
  listMailboxes: vi.fn(async () => mailboxes),
  updatePassword: vi.fn(async (accountId: string, password: string) => {
    stalwartPasswords.set(accountId, password);
  }),
};
const checkImap = vi.fn(async (email: string, password: string) => {
  const mailbox = mailboxes.find((item) => item.email === email);
  return mailbox && stalwartPasswords.get(mailbox.id) === password ? 'accepted' : 'rejected';
});
const deps = { stalwart, checkImap, mailAuthEnabled: true } as const;

function now() {
  return new Date().toISOString();
}

function addUser(id: string, email: string, role: string, password: string | null) {
  sqlite
    .prepare(
      `INSERT INTO user(id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version)
       VALUES(?,?,?,1,?,'active',0,0,?,?,1)`,
    )
    .run(id, email, email, role, now(), now());
  if (password !== null)
    sqlite
      .prepare(
        `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
         VALUES(?,'local:credential',?,'credential',?,?,?,?)`,
      )
      .run(`account-${id}`, id, id, password, now(), now());
}

function link(id: string, accountId: string, email: string, mode: 'webmail' | 'hybrid') {
  sqlite
    .prepare(
      `INSERT INTO mail_identity(user_id,stalwart_account_id,email,auth_mode,status,linked_by,linked_at,updated_at)
       VALUES(?,?,?,?,'active',NULL,?,?)`,
    )
    .run(id, accountId, email, mode, now(), now());
}

function addSession(id: string, userId: string) {
  sqlite
    .prepare(
      'INSERT OR REPLACE INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      id,
      `token-${id}`,
      userId,
      new Date(Date.now() + 3_600_000).toISOString(),
      now(),
      now(),
      now(),
    );
}

function sessionsOf(userId: string): string[] {
  return (
    sqlite.prepare('SELECT id FROM session WHERE user_id=? ORDER BY id').all(userId) as Array<{
      id: string;
    }>
  ).map((row) => row.id);
}

function localHash(userId: string): string {
  return (
    sqlite
      .prepare("SELECT password FROM account WHERE user_id=? AND provider_id='credential'")
      .get(userId) as { password: string }
  ).password;
}

async function localAccepts(userId: string, password: string): Promise<boolean> {
  return verifyPassword({ hash: localHash(userId), password });
}

addUser(ids.owner, emails.owner, 'owner_admin', await hashPassword('owner-initial-pass'));
addUser(ids.worker, emails.worker, 'worker', await hashPassword('worker-initial-pass'));
addUser(ids.local, emails.local, 'project_manager', await hashPassword('local-initial-pass'));
addUser(ids.personnel, emails.personnel, 'worker', null);
link(ids.owner, 'stalwart-owner', emails.owner, 'hybrid');
link(ids.worker, 'stalwart-worker', emails.worker, 'webmail');
stalwartPasswords.set('stalwart-owner', 'owner-initial-pass');
stalwartPasswords.set('stalwart-worker', 'worker-initial-pass');

beforeEach(() => {
  vi.clearAllMocks();
  addSession('owner-session', ids.owner);
  addSession('worker-phone', ids.worker);
  addSession('worker-laptop', ids.worker);
  addSession('local-session', ids.local);
});

afterAll(() => {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
  if (previousDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = previousDatabasePath;
  restoreEnvironment();
});

describe('self-service password change from the portal profile', () => {
  it('changes a linked worker’s Webmail and portal password together', async () => {
    const result = await changeOwnPassword(
      sqlite,
      {
        userId: ids.worker,
        sessionId: 'worker-phone',
        currentPassword: 'worker-initial-pass',
        newPassword: 'worker-second-pass',
      },
      deps,
    );
    expect(result).toEqual({ ok: true, linkedMailbox: true, sessionsRevoked: 1 });
    expect(stalwart.updatePassword).toHaveBeenCalledWith('stalwart-worker', 'worker-second-pass');
    expect(stalwartPasswords.get('stalwart-worker')).toBe('worker-second-pass');
    expect(await localAccepts(ids.worker, 'worker-second-pass')).toBe(true);
    expect(await localAccepts(ids.worker, 'worker-initial-pass')).toBe(false);
    // The device that made the change stays signed in; every other one is revoked.
    expect(sessionsOf(ids.worker)).toEqual(['worker-phone']);
    const audit = sqlite
      .prepare('SELECT action FROM audit_event WHERE entity_id IN (?,?) ORDER BY occurred_at')
      .all('stalwart-worker', ids.worker) as Array<{ action: string }>;
    expect(audit.map((row) => row.action)).toEqual(
      expect.arrayContaining(['mailbox.password_update', 'mailbox.sessions_revoke']),
    );
  });

  it('checks the current password against Stalwart, not a stale local hash', async () => {
    // Webmail changed the password behind the portal's back.
    stalwartPasswords.set('stalwart-worker', 'changed-in-webmail');
    const stale = await changeOwnPassword(
      sqlite,
      {
        userId: ids.worker,
        sessionId: 'worker-phone',
        currentPassword: 'worker-second-pass',
        newPassword: 'worker-third-password',
      },
      deps,
    );
    expect(stale).toEqual({ ok: false, code: 'CURRENT_PASSWORD_INVALID' });
    expect(stalwart.updatePassword).not.toHaveBeenCalled();
    const current = await changeOwnPassword(
      sqlite,
      {
        userId: ids.worker,
        sessionId: 'worker-phone',
        currentPassword: 'changed-in-webmail',
        newPassword: 'worker-third-password',
      },
      deps,
    );
    expect(current.ok).toBe(true);
    expect(stalwartPasswords.get('stalwart-worker')).toBe('worker-third-password');
  });

  it('changes nothing anywhere when Stalwart cannot confirm the change', async () => {
    const before = localHash(ids.worker);
    stalwart.updatePassword.mockRejectedValueOnce(new Error('STALWART_UPDATE_NOT_CONFIRMED'));
    const result = await changeOwnPassword(
      sqlite,
      {
        userId: ids.worker,
        sessionId: 'worker-phone',
        currentPassword: 'worker-third-password',
        newPassword: 'worker-fourth-password',
      },
      deps,
    );
    expect(result).toEqual({ ok: false, code: 'MAIL_UNAVAILABLE' });
    expect(localHash(ids.worker)).toBe(before);
    expect(stalwartPasswords.get('stalwart-worker')).toBe('worker-third-password');
    expect(sessionsOf(ids.worker)).toEqual(['worker-laptop', 'worker-phone']);
  });

  it('fails closed when the mailbox directory is unreachable', async () => {
    stalwart.listMailboxes.mockRejectedValueOnce(new Error('offline'));
    const result = await changeOwnPassword(
      sqlite,
      {
        userId: ids.worker,
        sessionId: 'worker-phone',
        currentPassword: 'worker-third-password',
        newPassword: 'worker-fourth-password',
      },
      deps,
    );
    expect(result).toEqual({ ok: false, code: 'MAIL_UNAVAILABLE' });
  });

  it('validates the new password before contacting Stalwart', async () => {
    for (const [newPassword, code] of [
      ['short', 'PASSWORD_INVALID'],
      ['line\nbreak-password', 'PASSWORD_INVALID'],
      ['worker-third-password', 'PASSWORD_UNCHANGED'],
    ] as const) {
      const result = await changeOwnPassword(
        sqlite,
        {
          userId: ids.worker,
          sessionId: 'worker-phone',
          currentPassword: 'worker-third-password',
          newPassword,
        },
        deps,
      );
      expect(result).toEqual({ ok: false, code });
    }
    expect(stalwart.updatePassword).not.toHaveBeenCalled();
  });

  it('changes only the local password of a portal-only account', async () => {
    const wrong = await changeOwnPassword(
      sqlite,
      {
        userId: ids.local,
        sessionId: 'local-session',
        currentPassword: 'not-the-password',
        newPassword: 'local-second-pass',
      },
      deps,
    );
    expect(wrong).toEqual({ ok: false, code: 'CURRENT_PASSWORD_INVALID' });
    const result = await changeOwnPassword(
      sqlite,
      {
        userId: ids.local,
        sessionId: 'local-session',
        currentPassword: 'local-initial-pass',
        newPassword: 'local-second-pass',
      },
      deps,
    );
    expect(result).toEqual({ ok: true, linkedMailbox: false, sessionsRevoked: 0 });
    expect(stalwart.updatePassword).not.toHaveBeenCalled();
    expect(await localAccepts(ids.local, 'local-second-pass')).toBe(true);
  });
});

describe('Owner reset from the Team screen', () => {
  it('sets one new password for Webmail and portal and signs the worker out everywhere', async () => {
    const result = await resetUserPassword(
      sqlite,
      { actorId: ids.owner, targetUserId: ids.worker, newPassword: 'reset-by-owner-1' },
      deps,
    );
    expect(result).toEqual({ ok: true, linkedMailbox: true, sessionsRevoked: 2 });
    expect(stalwartPasswords.get('stalwart-worker')).toBe('reset-by-owner-1');
    expect(await localAccepts(ids.worker, 'reset-by-owner-1')).toBe(true);
    expect(sessionsOf(ids.worker)).toEqual([]);
  });

  it('resets a portal-only account locally', async () => {
    const result = await resetUserPassword(
      sqlite,
      { actorId: ids.owner, targetUserId: ids.local, newPassword: 'reset-local-pass' },
      deps,
    );
    expect(result).toEqual({ ok: true, linkedMailbox: false, sessionsRevoked: 1 });
    expect(await localAccepts(ids.local, 'reset-local-pass')).toBe(true);
  });

  it('refuses non-owners, the Owner account and people without a sign-in', async () => {
    expect(
      await resetUserPassword(
        sqlite,
        { actorId: ids.worker, targetUserId: ids.local, newPassword: 'attacker-password' },
        deps,
      ),
    ).toEqual({ ok: false, code: 'TARGET_NOT_ALLOWED' });
    expect(
      await resetUserPassword(
        sqlite,
        { actorId: ids.owner, targetUserId: ids.owner, newPassword: 'owner-new-password' },
        deps,
      ),
    ).toEqual({ ok: false, code: 'TARGET_NOT_ALLOWED' });
    expect(
      await resetUserPassword(
        sqlite,
        { actorId: ids.owner, targetUserId: ids.personnel, newPassword: 'personnel-password' },
        deps,
      ),
    ).toEqual({ ok: false, code: 'TARGET_NOT_ALLOWED' });
    expect(stalwart.updatePassword).not.toHaveBeenCalled();
  });

  it('refuses a mailbox whose immutable Stalwart id no longer matches', async () => {
    const original = mailboxes[1]!;
    mailboxes[1] = { ...original, id: 'stalwart-recreated' };
    try {
      expect(
        await resetUserPassword(
          sqlite,
          { actorId: ids.owner, targetUserId: ids.worker, newPassword: 'reset-by-owner-2' },
          deps,
        ),
      ).toEqual({ ok: false, code: 'MAILBOX_NOT_FOUND' });
    } finally {
      mailboxes[1] = original;
    }
    expect(stalwart.updatePassword).not.toHaveBeenCalled();
  });

  it('keeps the linked portal hash equal to a password set from the Mailboxes tab', async () => {
    const principal = {
      userId: ids.owner,
      role: 'owner_admin' as const,
      projectIds: new Set<string>(),
      sessionId: 'owner-session',
    };
    await updateMailboxPassword(
      sqlite,
      principal,
      {
        stalwartAccountId: 'stalwart-worker',
        password: 'mailbox-tab-password',
        reason: 'Forgot password',
        email: emails.worker,
        confirmation: emails.worker,
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      { stalwart: stalwart as never },
    );
    expect(stalwartPasswords.get('stalwart-worker')).toBe('mailbox-tab-password');
    expect(await localAccepts(ids.worker, 'mailbox-tab-password')).toBe(true);
    expect(await localAccepts(ids.worker, 'reset-by-owner-1')).toBe(false);
    expect(sessionsOf(ids.worker)).toEqual([]);
  });
});

describe('portal sign-in verifier with mail authentication disabled', () => {
  it('uses the local hash, which every portal change keeps current', async () => {
    delete process.env.JA_MAIL_AUTH_ENABLED;
    const hash = localHash(ids.worker);
    await expect(verifyPortalPasswordFor({ hash, password: 'mailbox-tab-password' })).resolves.toBe(
      true,
    );
    await expect(verifyPortalPasswordFor({ hash, password: 'worker-initial-pass' })).resolves.toBe(
      false,
    );
  });
});

describe('company email shorthand', () => {
  it.each([
    ['juan.perez', 'juan.perez@j-aautomation.com'],
    ['  Juan.Perez ', 'juan.perez@j-aautomation.com'],
    ['ana@example.com', 'ana@example.com'],
    ['Ana@J-AAutomation.com', 'ana@j-aautomation.com'],
    ['', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeAccessEmail(input)).toBe(expected);
  });
});
