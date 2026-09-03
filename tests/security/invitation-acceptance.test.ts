import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const authMocks = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
  getSession: vi.fn(),
}));
const cryptoMocks = vi.hoisted(() => ({ verifyPassword: vi.fn(), hashPassword: vi.fn() }));
vi.mock('better-auth/crypto', () => ({
  verifyPassword: cryptoMocks.verifyPassword,
  hashPassword: cryptoMocks.hashPassword,
}));
vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      signUpEmail: authMocks.signUpEmail,
      signInEmail: authMocks.signInEmail,
      getSession: authMocks.getSession,
    },
  },
}));
vi.mock('$app/environment', () => ({ building: false }));
vi.mock('better-auth/svelte-kit', () => ({
  svelteKitHandler: vi.fn(
    async ({ event, resolve }: { event: unknown; resolve: (event: unknown) => Response }) =>
      resolve(event),
  ),
}));

const { POST } = await import('../../apps/portal/src/routes/app/api/invitations/accept/+server.js');
const { handle } = await import('../../apps/portal/src/hooks.server.js');

const token = 'client-essential-invitation-token-0000000000000001';
const password = 'NeverAuditThisPassword!2026';
const email = 'invited@example.test';
const invitationId = 'invitation-1';
let directory: string;
let restoreDeploymentIdentity: (() => void) | undefined;
const previousDatabasePath = process.env.JA_DATABASE_PATH;

function withDatabase<T>(operation: (database: ReturnType<typeof createDatabase>) => T): T {
  const database = createDatabase();
  try {
    return operation(database);
  } finally {
    database.sqlite.close();
  }
}

function seedInvitation(options?: {
  expiresAt?: string;
  usedAt?: string | null;
  role?: 'owner_admin' | 'finance_admin' | 'project_manager' | 'worker' | 'auditor_read_only';
}): void {
  withDatabase(({ sqlite }) => {
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO user(
           id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
         ) VALUES('owner','Owner','antonny.luty@j-aautomation.com',1,'owner_admin','active',1,1,?,?,1)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO invitation(id,email,token_hash,role,invited_by,expires_at,used_at,created_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        invitationId,
        email,
        createHash('sha256').update(token).digest('hex'),
        options?.role ?? 'worker',
        'owner',
        options?.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
        options?.usedAt ?? null,
        now,
      );
  });
}

function createInvitedCredentialUser(userId = 'invited-user', invitedEmail = email): void {
  withDatabase(({ sqlite }) => {
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO user(
           id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
         ) VALUES(?,?,?,0,'worker','invited',0,0,?,?,1)`,
      )
      .run(userId, 'Invited User', invitedEmail, now, now);
    sqlite
      .prepare(
        `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        'local:credential',
        userId,
        'credential',
        userId,
        'hashed-password',
        now,
        now,
      );
  });
}

function eventFor(candidateToken = token) {
  return {
    request: new Request('http://localhost/j-aautomation/app/api/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: candidateToken, name: 'Invited User', password }),
    }),
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
  directory = mkdtempSync(join(tmpdir(), 'ja-invitation-acceptance-'));
  process.env.JA_DATABASE_PATH = join(directory, 'app.db');
  authMocks.signUpEmail.mockReset();
  authMocks.signInEmail.mockReset();
  authMocks.getSession.mockReset();
  authMocks.getSession.mockResolvedValue(null);
  cryptoMocks.verifyPassword.mockReset();
  cryptoMocks.verifyPassword.mockResolvedValue(true);
});

afterEach(() => {
  authMocks.signUpEmail.mockReset();
  authMocks.signInEmail.mockReset();
  authMocks.getSession.mockReset();
  if (previousDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = previousDatabasePath;
  restoreDeploymentIdentity?.();
  restoreDeploymentIdentity = undefined;
  rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('Client Essential invitation acceptance', () => {
  it.each([
    ['expired', { expiresAt: new Date(Date.now() - 60_000).toISOString() }],
    ['used', { usedAt: new Date().toISOString() }],
    ['concurrently claimed', { usedAt: `pending:${Date.now()}:${randomUUID()}` }],
  ])('denies an %s invitation without calling signup', async (_label, options) => {
    seedInvitation(options);

    const response = await POST(eventFor());

    expect(response.status).toBe(400);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await response.json()).toEqual({ error: 'Invitation could not be activated' });
    expect(authMocks.signUpEmail).not.toHaveBeenCalled();
  });

  it('activates only the returned invited identity, finalizes once, requires MFA, and audits as system', async () => {
    seedInvitation({ role: 'finance_admin' });
    authMocks.signUpEmail.mockImplementationOnce(async ({ body }) => {
      expect(body).toEqual({ name: 'Invited User', email, password });
      createInvitedCredentialUser();
      return { user: { id: 'invited-user', email } };
    });

    const response = await POST(eventFor());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, email });
    withDatabase(({ sqlite }) => {
      expect(
        sqlite
          .prepare('SELECT role,status,email_verified,mfa_required,version FROM user WHERE id=?')
          .get('invited-user'),
      ).toEqual({
        role: 'finance_admin',
        status: 'active',
        email_verified: 1,
        mfa_required: 1,
        version: 2,
      });
      const invitation = sqlite
        .prepare('SELECT used_at FROM invitation WHERE id=?')
        .get(invitationId) as { used_at: string };
      expect(invitation.used_at).not.toMatch(/^pending:/u);
      const audit = sqlite
        .prepare(
          `SELECT actor_id,actor_kind,action,entity_type,entity_id,details_json,metadata_json
           FROM audit_event WHERE action='invitation.accept' AND entity_id=?`,
        )
        .get(invitationId) as Record<string, string | null>;
      expect(audit).toMatchObject({
        actor_id: null,
        actor_kind: 'system',
        action: 'invitation.accept',
        entity_type: 'invitation',
        entity_id: invitationId,
      });
      expect(`${audit.details_json}\n${audit.metadata_json}`).not.toContain(token);
      expect(`${audit.details_json}\n${audit.metadata_json}`).not.toContain(password);
    });

    const replay = await POST(eventFor());
    expect(replay.status).toBe(400);
    expect(authMocks.signUpEmail).toHaveBeenCalledTimes(1);
  });

  it('releases a failed claim only when signup left no user or account evidence', async () => {
    seedInvitation();
    authMocks.signUpEmail.mockRejectedValueOnce(new Error(`provider failed: ${password}`));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const failed = await POST(eventFor());

    expect(failed.status).toBe(400);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain(password);
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    expect(
      withDatabase(({ sqlite }) =>
        sqlite.prepare('SELECT used_at FROM invitation WHERE id=?').get(invitationId),
      ),
    ).toEqual({ used_at: null });

    authMocks.signUpEmail.mockImplementationOnce(async () => {
      createInvitedCredentialUser();
      return { user: { id: 'invited-user', email } };
    });
    expect((await POST(eventFor())).status).toBe(200);
  });

  it('reclaims a stale crash claim with no identity and records the recovery mode', async () => {
    seedInvitation({ usedAt: `pending:${Date.now() - 16 * 60_000}:${randomUUID()}` });
    authMocks.signUpEmail.mockImplementationOnce(async () => {
      createInvitedCredentialUser();
      return { user: { id: 'invited-user', email } };
    });

    expect((await POST(eventFor())).status).toBe(200);
    expect(authMocks.signInEmail).not.toHaveBeenCalled();
    withDatabase(({ sqlite }) => {
      const audit = sqlite
        .prepare("SELECT details_json FROM audit_event WHERE action='invitation.accept'")
        .get() as { details_json: string };
      expect(JSON.parse(audit.details_json)).toMatchObject({
        claimRecovery: 'stale_no_identity',
      });
    });
  });

  it('requires the same credential identity before completing a stale partial signup', async () => {
    seedInvitation({ usedAt: `pending:${Date.now() - 16 * 60_000}:${randomUUID()}` });
    createInvitedCredentialUser();

    expect((await POST(eventFor())).status).toBe(200);
    expect(authMocks.signUpEmail).not.toHaveBeenCalled();
    expect(authMocks.signInEmail).not.toHaveBeenCalled();
    expect(cryptoMocks.verifyPassword).toHaveBeenCalledWith({
      hash: 'hashed-password',
      password,
    });
    withDatabase(({ sqlite }) => {
      expect(sqlite.prepare('SELECT status FROM user WHERE id=?').get('invited-user')).toEqual({
        status: 'active',
      });
      const audit = sqlite
        .prepare("SELECT details_json FROM audit_event WHERE action='invitation.accept'")
        .get() as { details_json: string };
      expect(JSON.parse(audit.details_json)).toMatchObject({
        claimRecovery: 'stale_credential_identity',
      });
    });
  });

  it('does not activate or release a stale credential identity when verification fails', async () => {
    const staleClaim = `pending:${Date.now() - 16 * 60_000}:${randomUUID()}`;
    seedInvitation({ usedAt: staleClaim });
    createInvitedCredentialUser();
    cryptoMocks.verifyPassword.mockResolvedValueOnce(false);

    expect((await POST(eventFor())).status).toBe(400);
    withDatabase(({ sqlite }) => {
      expect(sqlite.prepare('SELECT status FROM user WHERE id=?').get('invited-user')).toEqual({
        status: 'invited',
      });
      expect(sqlite.prepare('SELECT used_at FROM invitation WHERE id=?').get(invitationId)).toEqual(
        { used_at: staleClaim },
      );
    });
  });

  it('does not make an invitation reusable after a partial signup creates identity evidence', async () => {
    seedInvitation();
    authMocks.signUpEmail.mockImplementationOnce(async () => {
      createInvitedCredentialUser();
      throw new Error('provider failed after identity commit');
    });

    expect((await POST(eventFor())).status).toBe(400);
    const claimed = withDatabase(({ sqlite }) =>
      sqlite.prepare('SELECT used_at FROM invitation WHERE id=?').get(invitationId),
    ) as { used_at: string };
    expect(claimed.used_at).toMatch(/^pending:/u);

    expect((await POST(eventFor())).status).toBe(400);
    expect(authMocks.signUpEmail).toHaveBeenCalledTimes(1);
  });

  it('rolls back activation and finalization when audit append fails, retaining the claim', async () => {
    seedInvitation({ role: 'project_manager' });
    withDatabase(({ sqlite }) => {
      sqlite.exec(`
        CREATE TRIGGER invitation_accept_test_failure
        BEFORE INSERT ON audit_event WHEN NEW.action='invitation.accept'
        BEGIN SELECT RAISE(ABORT,'test audit failure'); END;
      `);
    });
    authMocks.signUpEmail.mockImplementationOnce(async () => {
      createInvitedCredentialUser();
      return { user: { id: 'invited-user', email } };
    });

    expect((await POST(eventFor())).status).toBe(400);
    withDatabase(({ sqlite }) => {
      expect(
        sqlite
          .prepare('SELECT role,status,email_verified,mfa_required,version FROM user WHERE id=?')
          .get('invited-user'),
      ).toEqual({
        role: 'worker',
        status: 'invited',
        email_verified: 0,
        mfa_required: 0,
        version: 1,
      });
      expect(
        sqlite.prepare('SELECT used_at FROM invitation WHERE id=?').get(invitationId),
      ).toMatchObject({ used_at: expect.stringMatching(/^pending:/u) });
      expect(
        sqlite
          .prepare("SELECT 1 FROM audit_event WHERE action='invitation.accept' AND entity_id=?")
          .get(invitationId),
      ).toBeUndefined();

      sqlite.exec('DROP TRIGGER invitation_accept_test_failure');
      sqlite
        .prepare('UPDATE invitation SET used_at=? WHERE id=?')
        .run(`pending:${Date.now() - 16 * 60_000}:${randomUUID()}`, invitationId);
    });

    expect((await POST(eventFor())).status).toBe(200);
    expect(authMocks.signUpEmail).toHaveBeenCalledTimes(1);
    expect(authMocks.signInEmail).not.toHaveBeenCalled();
    expect(cryptoMocks.verifyPassword).toHaveBeenCalledWith({
      hash: 'hashed-password',
      password,
    });
  });

  it('rejects a signup result that does not match the claimed invitation email', async () => {
    seedInvitation();
    authMocks.signUpEmail.mockResolvedValueOnce({
      user: { id: 'unexpected-user', email: 'different@example.test' },
    });

    expect((await POST(eventFor())).status).toBe(400);
    expect(
      withDatabase(({ sqlite }) =>
        sqlite.prepare('SELECT used_at FROM invitation WHERE id=?').get(invitationId),
      ),
    ).toEqual({ used_at: null });
  });

  it('rejects an uncontrolled persisted role before signup or credential recovery', async () => {
    seedInvitation();
    withDatabase(({ sqlite }) => {
      sqlite.prepare('UPDATE invitation SET role=? WHERE id=?').run('superuser', invitationId);
    });

    expect((await POST(eventFor())).status).toBe(400);
    expect(authMocks.signUpEmail).not.toHaveBeenCalled();
    expect(authMocks.signInEmail).not.toHaveBeenCalled();
  });

  it('rejects cross-origin invitation attempts before consuming the acceptance throttle', async () => {
    seedInvitation();
    authMocks.signUpEmail.mockImplementationOnce(async () => {
      createInvitedCredentialUser();
      return { user: { id: 'invited-user', email } };
    });
    const resolve = vi.fn(async (event: Parameters<typeof POST>[0]) => POST(event));
    const invoke = (origin: string) => {
      const url = new URL('http://localhost/j-aautomation/app/api/invitations/accept');
      const event = {
        url,
        request: new Request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin },
          body: JSON.stringify({ token, name: 'Invited User', password }),
        }),
        locals: {},
        cookies: { get: () => undefined },
        getClientAddress: () => '198.51.100.89',
      } as unknown as Parameters<typeof handle>[0]['event'];
      return handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);
    };

    for (let attempt = 0; attempt < 12; attempt += 1)
      expect((await invoke('https://attacker.example')).status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
    expect(authMocks.signUpEmail).not.toHaveBeenCalled();

    const accepted = await invoke('http://localhost');
    expect(accepted.status).toBe(200);
    expect(resolve).toHaveBeenCalledOnce();
    expect(authMocks.signUpEmail).toHaveBeenCalledOnce();
  });

  it('applies the actual hook throttle to invitation acceptance before signup', async () => {
    seedInvitation();
    authMocks.signUpEmail.mockImplementationOnce(async () => {
      createInvitedCredentialUser();
      return { user: { id: 'invited-user', email } };
    });
    const resolve = vi.fn(async (event: Parameters<typeof POST>[0]) => POST(event));
    const invoke = () => {
      const url = new URL('http://localhost/j-aautomation/app/api/invitations/accept');
      const event = {
        url,
        request: new Request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: url.origin },
          body: JSON.stringify({ token, name: 'Invited User', password }),
        }),
        locals: {},
        cookies: { get: () => undefined },
        getClientAddress: () => '198.51.100.88',
      } as unknown as Parameters<typeof handle>[0]['event'];
      return handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);
    };

    for (let attempt = 0; attempt < 10; attempt += 1) await invoke();
    const throttled = await invoke();

    expect(throttled.status).toBe(429);
    expect(Number(throttled.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(resolve).toHaveBeenCalledTimes(10);
    expect(authMocks.signUpEmail).toHaveBeenCalledTimes(1);
  });
});
