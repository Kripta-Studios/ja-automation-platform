import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';
import {
  StalwartClient,
  StalwartOperationRejectedError,
  StalwartUnavailableError,
  signInBlockedFrom,
  signInPermissionsPatch,
} from '../../apps/portal/src/lib/server/stalwart-client';
import {
  listPortalLinkedMailboxes,
  pageMailboxDirectory,
  setLinkedMailboxSignIn,
  setMailboxSignInBlocked,
  type MailboxAccount,
} from '../../apps/portal/src/lib/server/mail-directory';
import { pagePeopleDirectory } from '../../apps/portal/src/lib/server/team-directory-page';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment';

function response(methodResponses: unknown[]) {
  return new Response(JSON.stringify({ methodResponses }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Mock Stalwart 0.16 JMAP admin endpoint holding one account. */
function mockStalwart(initialPermissions: unknown, options: { reject?: boolean } = {}) {
  const state = { permissions: initialPermissions as unknown };
  const calls: unknown[][] = [];
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const call =
      (JSON.parse(String(init?.body)) as { methodCalls: unknown[][] }).methodCalls[0] ?? [];
    calls.push(call);
    const id = call[2];
    if (call[0] === 'x:Domain/query')
      return response([['x:Domain/query', { ids: ['d'] }, 'domain-query']]);
    if (call[0] === 'x:Domain/get')
      return response([
        ['x:Domain/get', { list: [{ id: 'd', name: 'j-aautomation.com' }] }, 'domain-get'],
      ]);
    if (call[0] === 'x:Account/query')
      return response([['x:Account/query', { ids: ['acct-1'], total: 1 }, id]]);
    if (call[0] === 'x:Account/get')
      return response([
        [
          'x:Account/get',
          {
            list: [
              {
                id: 'acct-1',
                name: 'ana',
                emailAddress: 'ana@j-aautomation.com',
                description: 'Ana',
                domainId: 'd',
                quotas: {},
                usedDiskQuota: 0,
                permissions: state.permissions,
              },
            ],
          },
          id,
        ],
      ]);
    const update = (call[1] as { update: Record<string, { permissions: unknown }> }).update;
    if (options.reject)
      return response([
        ['x:Account/set', { notUpdated: { 'acct-1': { type: 'invalidPatch' } } }, id],
      ]);
    state.permissions = update['acct-1']?.permissions;
    return response([['x:Account/set', { updated: { 'acct-1': null } }, id]]);
  });
  const client = new StalwartClient({
    url: 'https://mx1.j-aautomation.com/jmap',
    token: 'token',
    domain: 'j-aautomation.com',
    fetch: fetcher as typeof fetch,
  });
  return { client, calls, state };
}

describe('Stalwart 0.16 sign-in block (disabled permissions, mail kept)', () => {
  it('blocks every sign-in permission and only touches `permissions`', async () => {
    const { client, calls, state } = mockStalwart({ '@type': 'Inherit' });
    await expect(client.setSignInBlocked('acct-1', true)).resolves.toEqual({
      email: 'ana@j-aautomation.com',
      wasBlocked: false,
    });
    const set = calls.find((call) => call[0] === 'x:Account/set');
    const patch = (set?.[1] as { update: Record<string, Record<string, unknown>> }).update[
      'acct-1'
    ];
    expect(Object.keys(patch ?? {})).toEqual(['permissions']);
    expect(state.permissions).toEqual({
      '@type': 'Merge',
      enabledPermissions: {},
      disabledPermissions: {
        authenticate: true,
        authenticateWithAlias: true,
        imapAuthenticate: true,
        pop3Authenticate: true,
        sieveAuthenticate: true,
      },
    });
    expect(JSON.stringify(calls)).not.toContain('credentials');
    expect((await client.listMailboxes())[0]?.signInBlocked).toBe(true);
  });

  it('unblocks back to plain inheritance and is a no-op when already in that state', async () => {
    const { client, calls, state } = mockStalwart(signInPermissionsPatch({}, true));
    await client.setSignInBlocked('acct-1', false);
    expect(state.permissions).toEqual({ '@type': 'Inherit' });
    const before = calls.length;
    await expect(client.setSignInBlocked('acct-1', false)).resolves.toEqual({
      email: 'ana@j-aautomation.com',
      wasBlocked: false,
    });
    expect(calls.slice(before).some((call) => call[0] === 'x:Account/set')).toBe(false);
  });

  it('keeps custom permissions when blocking and unblocking', () => {
    const custom = {
      '@type': 'Merge',
      enabledPermissions: { emailSend: true },
      disabledPermissions: { emailReceive: true },
    };
    const blocked = signInPermissionsPatch(custom, true);
    expect(signInBlockedFrom(blocked)).toBe(true);
    expect(blocked.enabledPermissions).toEqual({ emailSend: true });
    expect(blocked.disabledPermissions).toMatchObject({ emailReceive: true, authenticate: true });
    expect(signInPermissionsPatch(blocked, false)).toEqual(custom);
    // Array form (older serializers) and Inherit are read correctly.
    expect(signInBlockedFrom({ '@type': 'Merge', disabledPermissions: ['authenticate'] })).toBe(
      true,
    );
    expect(signInBlockedFrom({ '@type': 'Inherit' })).toBe(false);
    expect(signInBlockedFrom(undefined)).toBe(false);
  });

  it('surfaces a sanitized rejection', async () => {
    const { client } = mockStalwart({ '@type': 'Inherit' }, { reject: true });
    const error = await client.setSignInBlocked('acct-1', true).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StalwartOperationRejectedError);
    expect(error).toMatchObject({ operation: 'sign_in', rejectionType: 'invalidPatch' });
  });
});

const restoreEnvironment = installB5TestDeploymentIdentity();
const directory = mkdtempSync(join(tmpdir(), 'ja-mailbox-sign-in-'));
const database = createDatabase(join(directory, 'mail.db'));
const ownerId = '01900000-0000-7000-8000-000000000001';
const workerId = '01900000-0000-7000-8000-000000000002';
const managerId = '01900000-0000-7000-8000-000000000003';
const principal: Principal = {
  userId: ownerId,
  role: 'owner_admin',
  projectIds: new Set(),
  sessionId: 'owner-session',
};

beforeAll(() => {
  const now = new Date().toISOString();
  const insertUser = database.sqlite.prepare(
    `INSERT INTO user(id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version,offboarded_at)
     VALUES(?,?,?,1,?,?,0,0,?,?,1,?)`,
  );
  insertUser.run(ownerId, 'Antonny Luty', 'antonny.luty@j-aautomation.com', 'owner_admin', 'active', now, now, null);
  insertUser.run(workerId, 'Ana Silva', 'ana@j-aautomation.com', 'worker', 'offboarded', now, now, now);
  insertUser.run(managerId, 'Paula PM', 'paula@j-aautomation.com', 'project_manager', 'active', now, now, null);
  database.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run('owner-session', 'owner-token', ownerId, new Date(Date.now() + 600_000).toISOString(), now, now, now);
  database.sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run('pm-session', 'pm-token', managerId, new Date(Date.now() + 600_000).toISOString(), now, now, now);
  const insertIdentity = database.sqlite.prepare(
    `INSERT INTO mail_identity(user_id,stalwart_account_id,email,auth_mode,status,linked_at,updated_at)
     VALUES(?,?,?,'webmail','active',?,?)`,
  );
  insertIdentity.run(ownerId, 'acct-owner', 'antonny.luty@j-aautomation.com', now, now);
  insertIdentity.run(workerId, 'acct-1', 'ana@j-aautomation.com', now, now);
});

afterAll(() => {
  database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
  restoreEnvironment();
});

describe('mailbox sign-in from the portal (owner only, audited)', () => {
  it('blocks, audits and reports the outcome; unblock restores', async () => {
    const { client } = mockStalwart({ '@type': 'Inherit' });
    await expect(
      setMailboxSignInBlocked(
        database.sqlite,
        principal,
        { stalwartAccountId: 'acct-1', email: 'ana@j-aautomation.com', blocked: true, reason: 'Left' },
        { stalwart: client },
      ),
    ).resolves.toBe('blocked');
    const audit = database.sqlite
      .prepare(
        "SELECT action,entity_type,entity_id,metadata_json FROM audit_event WHERE entity_id='acct-1' ORDER BY occurred_at DESC LIMIT 1",
      )
      .get() as { action: string; entity_type: string; metadata_json: string };
    expect(audit.action).toBe('mailbox.sign_in_block');
    expect(audit.entity_type).toBe('mailbox');
    expect(JSON.parse(audit.metadata_json)).toMatchObject({
      operation: 'sign_in_block',
      outcome: 'sign_in_blocked',
      mailPreserved: true,
      linkedUserId: workerId,
    });
    await expect(
      setLinkedMailboxSignIn(database.sqlite, principal, workerId, false, 'Back', {
        stalwart: client,
      }),
    ).resolves.toEqual({ outcome: 'unblocked', email: 'ana@j-aautomation.com' });
  });

  it('protects the Owner mailbox and rejects a mismatched email', async () => {
    const { client } = mockStalwart({ '@type': 'Inherit' });
    await expect(
      setMailboxSignInBlocked(
        database.sqlite,
        principal,
        {
          stalwartAccountId: 'acct-owner',
          email: 'antonny.luty@j-aautomation.com',
          blocked: true,
          reason: 'x',
        },
        { stalwart: client },
      ),
    ).rejects.toThrow('CANONICAL_OWNER_MAILBOX_PROTECTED');
    await expect(
      setMailboxSignInBlocked(
        database.sqlite,
        principal,
        { stalwartAccountId: 'acct-1', email: 'other@j-aautomation.com', blocked: true, reason: 'x' },
        { stalwart: client },
      ),
    ).rejects.toThrow('MAIL_IDENTITY_COLLISION');
  });

  it('degrades: a mail server outage never throws from the portal status path', async () => {
    const down = {
      setSignInBlocked: async () => {
        throw new StalwartUnavailableError();
      },
    } as unknown as StalwartClient;
    await expect(
      setLinkedMailboxSignIn(database.sqlite, principal, workerId, true, 'Left', { stalwart: down }),
    ).resolves.toEqual({ outcome: 'unavailable', email: 'ana@j-aautomation.com' });
    await expect(
      setLinkedMailboxSignIn(database.sqlite, principal, '01900000-0000-7000-8000-00000000dead', true, 'x'),
    ).resolves.toEqual({ outcome: 'no_mailbox' });
    const other: Principal = { ...principal, userId: managerId, sessionId: 'pm-session' };
    const result = await setLinkedMailboxSignIn(database.sqlite, other, workerId, true, 'x', {
      stalwart: down,
    });
    expect(result.outcome).toBe('not_allowed');
  });

  it('lists portal-linked mailboxes when Stalwart is down', () => {
    const rows = listPortalLinkedMailboxes(database.sqlite);
    expect(rows.map((row) => row.email)).toEqual([
      'ana@j-aautomation.com',
      'antonny.luty@j-aautomation.com',
    ]);
    expect(rows[0]).toMatchObject({
      isProvisioned: true,
      portalStatus: 'offboarded',
      signInBlocked: null,
      portalUserId: workerId,
    });
  });
});

describe('Mailboxes list scale rules', () => {
  const accounts: MailboxAccount[] = Array.from({ length: 120 }, (_, index) => ({
    id: `a${index}`,
    username: `user${String(index).padStart(3, '0')}`,
    email: `user${String(index).padStart(3, '0')}@j-aautomation.com`,
    name: index === 7 ? 'José Raúl' : `User ${index}`,
    quotaBytes: null,
    usedDiskQuotaBytes: null,
    isProvisioned: index % 10 !== 0,
    signInBlocked: index % 15 === 0,
    ...(index % 10 !== 0
      ? { portalUserId: `u${index}`, portalRole: 'worker', portalStatus: index % 7 === 0 ? 'offboarded' : 'active' }
      : {}),
  }));

  it('paginates 25 per page with counts per status', () => {
    const page = pageMailboxDirectory(accounts, { q: '', status: 'all', page: 2 }, 'live');
    expect(page.rows).toHaveLength(25);
    expect(page.meta).toMatchObject({ total: 120, filtered: 120, page: 2, pageCount: 5 });
    expect(page.meta.counts.unlinked).toBe(12);
    expect(page.meta.counts.blocked).toBe(8);
    expect(page.meta.counts.active + page.meta.counts.offboarded + page.meta.counts.unlinked).toBe(120);
  });

  it('lists people who left but can still sign in first', () => {
    const page = pageMailboxDirectory(accounts, { q: '', status: 'offboarded', page: 1 }, 'live');
    const first = page.rows[0]!;
    expect(first.portalStatus).toBe('offboarded');
    expect(first.signInBlocked).toBe(false);
    expect(page.meta.stillSigningIn).toBeGreaterThan(0);
  });

  it('searches accent-insensitively and clamps the page', () => {
    const page = pageMailboxDirectory(accounts, { q: 'jose raul', status: 'all', page: 9 }, 'live');
    expect(page.rows.map((row) => row.id)).toEqual(['a7']);
    expect(page.meta.page).toBe(1);
    const blocked = pageMailboxDirectory(accounts, { q: '', status: 'blocked', page: 1 }, 'live');
    expect(blocked.rows.every((row) => row.signInBlocked === true)).toBe(true);
  });
});

describe('People directory scale rules', () => {
  const workers = Array.from({ length: 160 }, (_, index) => ({
    id: `w${index}`,
    name: index === 3 ? 'João Ávila' : `Person ${String(index).padStart(3, '0')}`,
    email: `p${index}@j-aautomation.com`,
    role: index % 20 === 0 ? 'project_manager' : 'worker',
    status: index % 9 === 0 ? 'offboarded' : 'active',
  }));
  const assignments = [
    { id: 'm1', worker_id: 'w5', project_id: 'p1', project_number: 'P-1', project_name: 'Refinery', status: 'active' },
    { id: 'm2', worker_id: 'w6', project_id: 'p1', project_number: 'P-1', project_name: 'Refinery', status: 'active', ends_on: '2020-01-01' },
  ];

  it('ships one page of 25 people and only their assignments', () => {
    const result = pagePeopleDirectory(workers, assignments, {
      q: '',
      role: '',
      status: 'active',
      project: '',
      page: 1,
    });
    expect(result.rows).toHaveLength(25);
    expect(result.meta.filtered).toBe(workers.filter((w) => w.status === 'active').length);
    expect(result.meta.pageCount).toBe(Math.ceil(result.meta.filtered / 25));
    expect(result.assignments.every((a) => result.rows.some((w) => w.id === a.worker_id))).toBe(true);
  });

  it('filters by accent-insensitive search, project (current assignments) and role', () => {
    const q = pagePeopleDirectory(workers, assignments, { q: 'joao avila', role: '', status: 'all', project: '', page: 1 });
    expect(q.rows.map((w) => w.id)).toEqual(['w3']);
    const project = pagePeopleDirectory(workers, assignments, { q: '', role: '', status: 'all', project: 'p1', page: 1 });
    expect(project.rows.map((w) => w.id)).toEqual(['w5']);
    const pms = pagePeopleDirectory(workers, assignments, { q: 'refinery', role: '', status: 'all', project: '', page: 1 });
    expect(pms.rows.map((w) => w.id).sort()).toEqual(['w5', 'w6']);
    const role = pagePeopleDirectory(workers, assignments, { q: '', role: 'project_manager', status: 'all', project: '', page: 1 });
    expect(role.rows.every((w) => w.role === 'project_manager')).toBe(true);
  });
});
