import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, MailIdentityRepository } from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  destroyMailboxAccount,
  updateMailboxPassword,
} from '../../apps/portal/src/lib/server/mail-directory';
import type {
  StalwartClient,
  StalwartMailbox,
} from '../../apps/portal/src/lib/server/stalwart-client';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment';

describe('mailbox privileged operations', () => {
  let directory: string;
  let database: ReturnType<typeof createDatabase>;
  let restore: () => void;
  const ownerId = '01900000-0000-7000-8000-000000000011';
  const workerId = '01900000-0000-7000-8000-000000000012';
  const owner: Principal = {
    userId: ownerId,
    role: 'owner_admin',
    projectIds: new Set(),
    sessionId: 'owner-session',
  };
  const workerMailbox: StalwartMailbox = {
    id: 'mail-worker',
    username: 'worker.one',
    email: 'worker.one@j-aautomation.com',
    name: 'Worker One',
    domainId: 'domain',
    quotaBytes: 100,
    usedDiskQuotaBytes: 1,
  };

  beforeEach(() => {
    restore = installB5TestDeploymentIdentity();
    directory = mkdtempSync(join(tmpdir(), 'ja-mail-security-'));
    database = createDatabase(join(directory, 'db.sqlite'));
    const now = new Date().toISOString();
    const insert = database.sqlite.prepare(
      `INSERT INTO user(id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version)
       VALUES(?,?,?,1,?,'active',0,1,?,?,1)`,
    );
    insert.run(ownerId, 'Antonny', 'antonny.luty@j-aautomation.com', 'owner_admin', now, now);
    insert.run(workerId, 'Worker', 'worker.one@j-aautomation.com', 'worker', now, now);
    database.sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'owner-session',
        'owner-token',
        ownerId,
        new Date(Date.now() + 60_000).toISOString(),
        now,
        now,
        now,
      );
    new MailIdentityRepository(database.sqlite).provision(
      owner,
      [
        {
          stalwartAccountId: workerMailbox.id,
          email: workerMailbox.email,
          name: workerMailbox.name,
        },
      ],
      'worker',
    );
    database.sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        'worker-session',
        'worker-token',
        workerId,
        new Date(Date.now() + 60_000).toISOString(),
        now,
        now,
        now,
      );
  });

  afterEach(() => {
    database.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
    restore();
  });

  it('requires the exact canonical owner before any external request', async () => {
    const updatePassword = vi.fn();
    const impostor: Principal = { userId: workerId, role: 'owner_admin', projectIds: new Set() };
    await expect(
      updateMailboxPassword(
        database.sqlite,
        impostor,
        {
          stalwartAccountId: workerMailbox.id,
          password: 'LongPassword!23',
          reason: 'rotation',
          email: workerMailbox.email,
          confirmation: workerMailbox.email,
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
        },
        { stalwart: { updatePassword } as unknown as StalwartClient },
      ),
    ).rejects.toThrow('CANONICAL_OWNER_REQUIRED');
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('revokes linked sessions after password update and redacts audit details', async () => {
    const updatePasswordMock = vi.fn(async () => undefined);
    const command = {
      stalwartAccountId: workerMailbox.id,
      password: 'LongPassword!23',
      reason: 'Owner requested rotation',
      email: workerMailbox.email,
      confirmation: workerMailbox.email,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    };
    const dependency = {
      stalwart: {
        listMailboxes: async () => [workerMailbox],
        updatePassword: updatePasswordMock,
      } as unknown as StalwartClient,
    };
    await updateMailboxPassword(database.sqlite, owner, command, dependency);
    await updateMailboxPassword(database.sqlite, owner, command, dependency);
    expect(updatePasswordMock).toHaveBeenCalledTimes(1);
    expect(
      database.sqlite.prepare('SELECT COUNT(*) count FROM session WHERE user_id=?').get(workerId),
    ).toEqual({ count: 0 });
    const audit = database.sqlite
      .prepare(
        "SELECT details_json FROM audit_event WHERE action='mailbox.password_update' ORDER BY occurred_at DESC LIMIT 1",
      )
      .get() as { details_json: string };
    expect(audit.details_json).not.toContain('LongPassword');
  });

  it('keeps the portal user active while archiving only the link after explicit mail destroy', async () => {
    const destroyMailbox = vi.fn(async () => undefined);
    await destroyMailboxAccount(
      database.sqlite,
      owner,
      {
        stalwartAccountId: workerMailbox.id,
        email: workerMailbox.email,
        confirmation: `DELETE ${workerMailbox.email}`,
        reason: 'Mailbox retired',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
      },
      {
        stalwart: {
          listMailboxes: async () => [workerMailbox],
          destroyMailbox,
        } as unknown as StalwartClient,
      },
    );
    expect(database.sqlite.prepare('SELECT status FROM user WHERE id=?').get(workerId)).toEqual({
      status: 'active',
    });
    expect(
      database.sqlite.prepare('SELECT status FROM mail_identity WHERE user_id=?').get(workerId),
    ).toEqual({ status: 'archived' });
  });

  it('cannot delete Antonny mailbox by forging a different submitted email', async () => {
    const ownerMailbox: StalwartMailbox = {
      ...workerMailbox,
      id: 'mail-owner',
      username: 'antonny.luty',
      email: 'antonny.luty@j-aautomation.com',
      name: 'Antonny Luty',
    };
    const destroyMailbox = vi.fn(async () => undefined);
    await expect(
      destroyMailboxAccount(
        database.sqlite,
        owner,
        {
          stalwartAccountId: ownerMailbox.id,
          email: workerMailbox.email,
          confirmation: `DELETE ${workerMailbox.email}`,
          reason: 'Forged request',
          idempotencyKey: '44444444-4444-4444-8444-444444444444',
        },
        {
          stalwart: {
            listMailboxes: async () => [ownerMailbox],
            destroyMailbox,
          } as unknown as StalwartClient,
        },
      ),
    ).rejects.toThrow();
    expect(destroyMailbox).not.toHaveBeenCalled();
  });

  it('changes a linked role with audit and revokes stale sessions', () => {
    new MailIdentityRepository(database.sqlite).changePortalRole(
      owner,
      workerId,
      workerMailbox.email,
      'project_manager',
      'Promoted by Antonny for project delivery',
    );
    expect(database.sqlite.prepare('SELECT role FROM user WHERE id=?').get(workerId)).toEqual({
      role: 'project_manager',
    });
    expect(
      database.sqlite.prepare('SELECT COUNT(*) count FROM session WHERE user_id=?').get(workerId),
    ).toEqual({ count: 0 });
    expect(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE action='mailbox.role_change' AND entity_id=?",
        )
        .get(workerId),
    ).toEqual({ count: 1 });
  });

  it('offboards portal access without deleting the mailbox identity or user history', () => {
    new MailIdentityRepository(database.sqlite).offboardPortalUser(
      owner,
      workerId,
      workerMailbox.email,
      'Employment ended; retain historical records',
    );
    expect(database.sqlite.prepare('SELECT status FROM user WHERE id=?').get(workerId)).toEqual({
      status: 'offboarded',
    });
    expect(
      database.sqlite.prepare('SELECT status FROM mail_identity WHERE user_id=?').get(workerId),
    ).toEqual({ status: 'active' });
    expect(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM audit_event WHERE action='mailbox.portal_offboard' AND entity_id=?",
        )
        .get(workerId),
    ).toEqual({ count: 1 });
  });
});
