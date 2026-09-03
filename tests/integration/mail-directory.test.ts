import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  bootstrapMailboxUsers,
  createMailboxAccount,
  destroyMailboxAccount,
  listMailboxAccounts,
  provisionMailboxUsers,
  updateMailboxPassword,
} from '../../apps/portal/src/lib/server/mail-directory';
import type {
  StalwartClient,
  StalwartMailbox,
} from '../../apps/portal/src/lib/server/stalwart-client';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment';

const restoreEnvironment = installB5TestDeploymentIdentity();
const directory = mkdtempSync(join(tmpdir(), 'ja-mail-directory-'));
const database = createDatabase(join(directory, 'mail.db'));
const ownerId = '01900000-0000-7000-8000-000000000001';
const ownerPassword = 'preserved-local-password-hash';
const principal: Principal = {
  userId: ownerId,
  role: 'owner_admin',
  projectIds: new Set(),
  sessionId: 'owner-session',
};
const mailboxes: StalwartMailbox[] = [
  {
    id: 'stalwart-owner',
    username: 'antonny.luty',
    email: 'antonny.luty@j-aautomation.com',
    name: 'Antonny Luty',
    domainId: 'domain-live',
    quotaBytes: 1000,
    usedDiskQuotaBytes: 10,
  },
  {
    id: 'stalwart-worker',
    username: 'ana.silva',
    email: 'ana.silva@j-aautomation.com',
    name: 'Ana Silva',
    domainId: 'domain-live',
    quotaBytes: 2000,
    usedDiskQuotaBytes: 20,
  },
];
const stalwart = { listMailboxes: async () => mailboxes } as unknown as StalwartClient;

beforeAll(() => {
  const now = new Date().toISOString();
  database.sqlite
    .prepare(
      `INSERT INTO user(id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version)
     VALUES(?,?,?,1,'owner_admin','active',0,0,?,?,1)`,
    )
    .run(ownerId, 'Antonny Luty', 'antonny.luty@j-aautomation.com', now, now);
  database.sqlite
    .prepare(
      `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
     VALUES(?,'local:credential',?,'credential',?,?,?,?)`,
    )
    .run('owner-account', ownerId, ownerId, ownerPassword, now, now);
  database.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      'owner-session',
      'owner-token',
      ownerId,
      new Date(Date.now() + 10 * 60_000).toISOString(),
      now,
      now,
      now,
    );
});

afterAll(() => {
  database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
  restoreEnvironment();
});

describe('live Stalwart mail directory provisioning', () => {
  it('lists only the safe mailbox projection and portal status', async () => {
    const list = await listMailboxAccounts(database.sqlite, { stalwart });
    expect(list).toHaveLength(2);
    expect(list[0]).not.toHaveProperty('credentials');
    expect(list.find((item) => item.email === 'antonny.luty@j-aautomation.com')).toMatchObject({
      isProvisioned: false,
    });
  });

  it('bootstraps every mailbox idempotently, preserving Antonny local password', async () => {
    const first = await bootstrapMailboxUsers(database.sqlite, principal, { stalwart });
    expect(first.created).toBe(1);
    const users = database.sqlite
      .prepare('SELECT email,role,status,mfa_required FROM user ORDER BY email')
      .all();
    expect(users).toEqual([
      { email: 'ana.silva@j-aautomation.com', role: 'worker', status: 'active', mfa_required: 0 },
      {
        email: 'antonny.luty@j-aautomation.com',
        role: 'owner_admin',
        status: 'active',
        mfa_required: 0,
      },
    ]);
    expect(
      database.sqlite
        .prepare("SELECT password FROM account WHERE user_id=? AND provider_id='credential'")
        .get(ownerId),
    ).toEqual({ password: ownerPassword });
    expect(
      database.sqlite
        .prepare(
          "SELECT issuer,account_id,provider_id,password FROM account WHERE user_id=(SELECT id FROM user WHERE email='ana.silva@j-aautomation.com')",
        )
        .get(),
    ).toMatchObject({ issuer: 'local:credential', provider_id: 'credential' });
    const second = await bootstrapMailboxUsers(database.sqlite, principal, { stalwart });
    expect(second.created).toBe(0);
    expect(database.sqlite.prepare('SELECT COUNT(*) count FROM mail_identity').get()).toEqual({
      count: 2,
    });
  });

  it('revalidates requested users against the live directory', async () => {
    await expect(
      provisionMailboxUsers(
        database.sqlite,
        principal,
        {
          emails: ['missing@j-aautomation.com'],
          role: 'worker',
        },
        { stalwart },
      ),
    ).rejects.toThrow('MAILBOX_NOT_FOUND_IN_STALWART');
  });

  it('preserves an explicit non-worker role while keeping MFA optional', async () => {
    database.sqlite
      .prepare(
        "UPDATE user SET role='project_manager',mfa_required=0 WHERE email='ana.silva@j-aautomation.com'",
      )
      .run();
    await bootstrapMailboxUsers(database.sqlite, principal, { stalwart });
    expect(
      database.sqlite
        .prepare("SELECT role,mfa_required FROM user WHERE email='ana.silva@j-aautomation.com'")
        .get(),
    ).toEqual({ role: 'project_manager', mfa_required: 0 });
  });

  it('assigns a unique non-Webmail surrogate to every delegated worker', async () => {
    const secondWorker: StalwartMailbox = {
      id: 'stalwart-worker-2',
      username: 'bruno.santos',
      email: 'bruno.santos@j-aautomation.com',
      name: 'Bruno Santos',
      domainId: 'domain-live',
      quotaBytes: 2000,
      usedDiskQuotaBytes: 0,
    };
    mailboxes.push(secondWorker);
    try {
      await provisionMailboxUsers(
        database.sqlite,
        principal,
        { emails: [secondWorker.email], role: 'worker' },
        { stalwart },
      );
      const hashes = database.sqlite
        .prepare(
          `SELECT a.password FROM account a JOIN mail_identity mi ON mi.user_id=a.user_id
           WHERE mi.auth_mode='webmail' ORDER BY mi.email`,
        )
        .all() as Array<{ password: string }>;
      expect(hashes).toHaveLength(2);
      expect(new Set(hashes.map((row) => row.password)).size).toBe(2);
    } finally {
      mailboxes.pop();
    }
  });

  it('preserves portal access and the stable link when a mailbox is absent from reconciliation', async () => {
    const original = mailboxes[1]!;
    const worker = database.sqlite
      .prepare('SELECT id,role,status FROM user WHERE email=?')
      .get(original.email) as { id: string; role: string; status: string };
    const now = new Date().toISOString();
    database.sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      )
      .run(
        'worker-session-preserved',
        'worker-token-preserved',
        worker.id,
        new Date(Date.now() + 60_000).toISOString(),
        now,
        now,
      );
    mailboxes.splice(1, 1);
    await bootstrapMailboxUsers(database.sqlite, principal, { stalwart });
    expect(
      database.sqlite.prepare('SELECT role,status FROM user WHERE email=?').get(original.email),
    ).toEqual({ role: worker.role, status: worker.status });
    expect(
      database.sqlite
        .prepare(
          'SELECT stalwart_account_id stalwartAccountId,status FROM mail_identity WHERE email=?',
        )
        .get(original.email),
    ).toEqual({ stalwartAccountId: original.id, status: 'active' });
    expect(
      database.sqlite.prepare('SELECT COUNT(*) count FROM session WHERE user_id=?').get(worker.id),
    ).toEqual({ count: 1 });
    expect(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE action='mailbox.portal_offboard' AND entity_id=?",
        )
        .get(worker.id),
    ).toEqual({ count: 0 });

    mailboxes.push({ ...original, id: 'stalwart-worker-recreated' });
    try {
      await expect(bootstrapMailboxUsers(database.sqlite, principal, { stalwart })).rejects.toThrow(
        'MAIL_IDENTITY_RELINK_REQUIRES_EXPLICIT_ACTION',
      );
      expect(
        database.sqlite
          .prepare(
            'SELECT stalwart_account_id stalwartAccountId,status FROM mail_identity WHERE email=?',
          )
          .get(original.email),
      ).toEqual({ stalwartAccountId: original.id, status: 'active' });
    } finally {
      mailboxes.splice(1, 1, original);
      database.sqlite.prepare("DELETE FROM session WHERE id='worker-session-preserved'").run();
    }
  });

  it('does not reactivate a portal link archived by an explicit Owner action', async () => {
    const original = mailboxes[1]!;
    const recreated = { ...original, id: 'stalwart-explicitly-recreated' };
    const archivedAt = new Date().toISOString();
    database.sqlite
      .prepare("UPDATE mail_identity SET status='archived',archived_at=? WHERE email=?")
      .run(archivedAt, original.email);
    try {
      await bootstrapMailboxUsers(database.sqlite, principal, { stalwart });
      expect(
        database.sqlite
          .prepare('SELECT status,archived_at archivedAt FROM mail_identity WHERE email=?')
          .get(original.email),
      ).toEqual({ status: 'archived', archivedAt });
      expect(
        database.sqlite.prepare('SELECT role,status FROM user WHERE email=?').get(original.email),
      ).toEqual({ role: 'project_manager', status: 'active' });

      mailboxes.splice(1, 1, recreated);
      await provisionMailboxUsers(
        database.sqlite,
        principal,
        { emails: [recreated.email], role: 'worker' },
        { stalwart },
      );
      expect(
        database.sqlite
          .prepare(
            'SELECT stalwart_account_id stalwartAccountId,status FROM mail_identity WHERE email=?',
          )
          .get(recreated.email),
      ).toEqual({ stalwartAccountId: recreated.id, status: 'active' });
    } finally {
      mailboxes.splice(1, 1, original);
      database.sqlite
        .prepare(
          "UPDATE mail_identity SET stalwart_account_id=?,status='active',archived_at=NULL WHERE email=?",
        )
        .run(original.id, original.email);
    }
  });

  it('enforces the canonical Owner invariant at the SQLite boundary', () => {
    const now = new Date().toISOString();
    expect(() =>
      database.sqlite
        .prepare(
          `INSERT INTO user(id,name,email,email_verified,role,status,created_at,updated_at)
           VALUES('noncanonical-owner','Other Owner','other.owner@j-aautomation.com',1,'owner_admin','active',?,?)`,
        )
        .run(now, now),
    ).toThrow('only canonical Antonny may be owner_admin');
    expect(() =>
      database.sqlite.prepare("UPDATE user SET role='worker' WHERE id=?").run(ownerId),
    ).toThrow('canonical Owner is immutable');
  });

  it('replays a completed create command without creating a second mailbox', async () => {
    const created: StalwartMailbox = {
      id: 'stalwart-idempotent',
      username: 'idempotent.user',
      email: 'idempotent.user@j-aautomation.com',
      name: 'Idempotent User',
      domainId: 'domain-live',
      quotaBytes: 1024,
      usedDiskQuotaBytes: 0,
    };
    const createMailbox = vi.fn(async () => created);
    const dependency = { stalwart: { createMailbox } as unknown as StalwartClient };
    const command = {
      username: created.username,
      name: created.name,
      password: 'Opaque Password! 23',
      quotaMb: 1,
      provisionRole: 'worker' as const,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    };
    const first = await createMailboxAccount(database.sqlite, principal, command, dependency);
    const replay = await createMailboxAccount(database.sqlite, principal, command, dependency);
    expect(first).toEqual(replay);
    expect(createMailbox).toHaveBeenCalledTimes(1);
  });

  it('reconciles a pending create with live Stalwart before attempting another write', async () => {
    const recovered: StalwartMailbox = {
      id: 'stalwart-recovered',
      username: 'uncertain.user',
      email: 'uncertain.user@j-aautomation.com',
      name: 'Uncertain User',
      domainId: 'domain-live',
      quotaBytes: 1024,
      usedDiskQuotaBytes: 0,
    };
    const createMailbox = vi.fn(async () => {
      throw new Error('connection lost');
    });
    const base = {
      username: 'uncertain.user',
      name: 'Uncertain User',
      password: 'Opaque Password! 24',
      quotaMb: 1,
      provisionRole: 'worker' as const,
    };
    await expect(
      createMailboxAccount(
        database.sqlite,
        principal,
        {
          ...base,
          idempotencyKey: '66666666-6666-4666-8666-666666666666',
        },
        {
          stalwart: {
            createMailbox,
            listMailboxes: async () => [recovered],
          } as unknown as StalwartClient,
        },
      ),
    ).rejects.toThrow('connection lost');
    await expect(
      createMailboxAccount(
        database.sqlite,
        principal,
        {
          ...base,
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        },
        {
          stalwart: {
            createMailbox,
            listMailboxes: async () => [recovered],
          } as unknown as StalwartClient,
        },
      ),
    ).resolves.toMatchObject({ id: recovered.id, email: recovered.email });
    expect(createMailbox).toHaveBeenCalledTimes(1);
  });

  it('safely retries a pending password update against the same live identity', async () => {
    const updatePassword = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(undefined);
    const dependency = {
      stalwart: {
        listMailboxes: async () => mailboxes,
        updatePassword,
      } as unknown as StalwartClient,
    };
    const base = {
      stalwartAccountId: 'stalwart-owner',
      password: 'Opaque Password! 25',
      reason: 'Owner-requested rotation',
      email: 'antonny.luty@j-aautomation.com',
      confirmation: 'antonny.luty@j-aautomation.com',
    };

    await expect(
      updateMailboxPassword(
        database.sqlite,
        principal,
        {
          ...base,
          idempotencyKey: '88888888-8888-4888-8888-888888888888',
        },
        dependency,
      ),
    ).rejects.toThrow('connection lost');
    await expect(
      updateMailboxPassword(
        database.sqlite,
        principal,
        {
          ...base,
          idempotencyKey: '99999999-9999-4999-8999-999999999999',
        },
        dependency,
      ),
    ).resolves.toBeUndefined();
    expect(updatePassword).toHaveBeenCalledTimes(2);
  });

  it('reconciles a pending destroy when Stalwart already removed the mailbox', async () => {
    const now = new Date().toISOString();
    database.sqlite
      .prepare(
        'INSERT OR REPLACE INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        principal.sessionId,
        'owner-token-after-password-rotation',
        ownerId,
        new Date(Date.now() + 60_000).toISOString(),
        now,
        now,
        now,
      );
    const disposable: StalwartMailbox = {
      id: 'stalwart-disposable',
      username: 'disposable.user',
      email: 'disposable.user@j-aautomation.com',
      name: 'Disposable User',
      domainId: 'domain-live',
      quotaBytes: 1024,
      usedDiskQuotaBytes: 0,
    };
    mailboxes.push(disposable);
    await provisionMailboxUsers(
      database.sqlite,
      principal,
      { emails: [disposable.email], role: 'worker' },
      { stalwart },
    );
    let removed = false;
    const destroyMailbox = vi.fn(async () => {
      removed = true;
      throw new Error('connection lost after delete');
    });
    const dependency = {
      stalwart: {
        listMailboxes: async () =>
          removed ? mailboxes.filter((mailbox) => mailbox.id !== disposable.id) : mailboxes,
        destroyMailbox,
      } as unknown as StalwartClient,
    };
    const base = {
      stalwartAccountId: disposable.id,
      email: disposable.email,
      confirmation: `DELETE ${disposable.email}`,
      reason: 'Mailbox no longer required',
    };

    try {
      await expect(
        destroyMailboxAccount(
          database.sqlite,
          principal,
          {
            ...base,
            idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
          dependency,
        ),
      ).rejects.toThrow('connection lost after delete');
      await expect(
        destroyMailboxAccount(
          database.sqlite,
          principal,
          {
            ...base,
            idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
          dependency,
        ),
      ).resolves.toBeUndefined();
      expect(destroyMailbox).toHaveBeenCalledTimes(1);
      expect(
        database.sqlite
          .prepare('SELECT status FROM mail_identity WHERE email=?')
          .get(disposable.email),
      ).toEqual({ status: 'archived' });
    } finally {
      mailboxes.splice(
        mailboxes.findIndex((mailbox) => mailbox.id === disposable.id),
        1,
      );
    }
  });
});
