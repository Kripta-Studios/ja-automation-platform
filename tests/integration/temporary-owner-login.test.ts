import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';
import { hashPassword } from 'better-auth/crypto';

const databasePath = join(mkdtempSync(join(tmpdir(), 'ja-owner-alias-')), 'app.db');
vi.stubEnv('JA_DATABASE_PATH', databasePath);
vi.stubEnv('JA_TENANT_ID', 'owner-alias-test');
vi.stubEnv('JA_DEPLOYMENT_ID', 'owner-alias-test');
vi.mock('$app/server', () => ({ getRequestEvent: () => undefined }));
vi.mock('$app/environment', () => ({ building: false }));
const { auth } = await import('../../apps/portal/src/lib/server/auth.js');
const { withTemporaryOwnerLogin, revokeExpiredTemporaryOwnerSessions } =
  await import('../../apps/portal/src/lib/server/temporary-owner-login.js');
const owner = { id: randomUUID(), email: 'antonny.luty@j-aautomation.com' };
const worker = { id: randomUUID(), email: 'worker@example.test' };
const localPassword = 'unchanged-local-password';
let originalHash: string;
const expiry = new Date(Date.now() + 3600_000).toISOString();
const base = '/j-aautomation/app';

async function signIn(email: string, password: string, extra = {}): Promise<Response> {
  return withTemporaryOwnerLogin(
    new Request(`http://localhost:5174${base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5174' },
      body: JSON.stringify({ email, password, ...extra }),
    }),
    base,
    (request) => auth.handler(request),
  );
}
function updateOwner(sql: string, value: string) {
  const { sqlite } = createDatabase();
  try {
    sqlite.prepare(sql).run(value, owner.id);
  } finally {
    sqlite.close();
  }
}

beforeAll(async () => {
  (await auth.$context).skipOriginCheck = false;
  originalHash = await hashPassword(localPassword);
  vi.stubEnv('JA_TEMP_OWNER_USER_ID', owner.id);
  vi.stubEnv('JA_TEMP_OWNER_PASSWORD_HASH', await hashPassword('hans'));
  vi.stubEnv('JA_TEMP_OWNER_EXPIRES_AT', expiry);
  const { sqlite } = createDatabase();
  try {
    const now = new Date().toISOString();
    for (const identity of [owner, worker]) {
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,email_verified,role,status,created_at,updated_at)
        VALUES(?,?,?,1,?,'active',?,?)`,
        )
        .run(
          identity.id,
          identity.email,
          identity.email,
          identity === owner ? 'owner_admin' : 'worker',
          now,
          now,
        );
      sqlite
        .prepare(
          `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
        VALUES(?,'local:credential',?,'credential',?,?,?,?)`,
        )
        .run(
          randomUUID(),
          identity.id,
          identity.id,
          identity === owner ? originalHash : await hashPassword('worker-password'),
          now,
          now,
        );
    }
  } finally {
    sqlite.close();
  }
});
afterAll(() => vi.unstubAllEnvs());

describe('temporary Owner login using the real Better Auth handler', () => {
  it('creates a normal attributed session for the canonical owner without changing credentials', async () => {
    const response = await signIn('hans', 'hans');
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('ja_portal.session_token=');
    const body = await response.json();
    expect(body.user).toMatchObject({ id: owner.id, email: owner.email, role: 'owner_admin' });
    const { sqlite } = createDatabase();
    try {
      expect(sqlite.prepare('SELECT password FROM account WHERE user_id=?').get(owner.id)).toEqual({
        password: originalHash,
      });
      const session = sqlite
        .prepare('SELECT expires_at FROM session WHERE token=?')
        .get(body.token) as { expires_at: string | number };
      expect(new Date(session.expires_at).getTime()).toBeLessThanOrEqual(Date.parse(expiry));
      const attribution = sqlite
        .prepare('SELECT user_agent FROM session WHERE token=?')
        .get(body.token) as { user_agent: string };
      expect(attribution.user_agent).toMatch(/ \[ja-temp-owner:\d+\]$/u);
    } finally {
      sqlite.close();
    }
  });
  it('rejects incorrect passwords and does not accept the normal password through the alias', async () => {
    expect((await signIn('hans', 'wrong')).status).toBe(401);
    expect((await signIn('hans', localPassword)).status).toBe(401);
  });
  it('isolates concurrent normal logins and rejects the temporary password on every email', async () => {
    const responses = await Promise.all([
      signIn('hans', 'hans'),
      signIn(owner.email, localPassword),
      signIn(owner.email, 'hans'),
      signIn(worker.email, 'hans'),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 401, 401]);
  });
  it('rejects expired or missing configuration', async () => {
    vi.stubEnv('JA_TEMP_OWNER_EXPIRES_AT', '2000-01-01T00:00:00Z');
    expect((await signIn('hans', 'hans')).status).toBeGreaterThanOrEqual(400);
    vi.stubEnv('JA_TEMP_OWNER_EXPIRES_AT', 'invalid');
    expect((await signIn('hans', 'hans')).status).toBeGreaterThanOrEqual(400);
    vi.stubEnv('JA_TEMP_OWNER_EXPIRES_AT', expiry);
    const hash = process.env.JA_TEMP_OWNER_PASSWORD_HASH!;
    vi.stubEnv('JA_TEMP_OWNER_PASSWORD_HASH', '');
    expect((await signIn('hans', 'hans')).status).toBeGreaterThanOrEqual(400);
    vi.stubEnv('JA_TEMP_OWNER_PASSWORD_HASH', hash);
  });
  it('requires the exact configured identity and live Owner role/status', async () => {
    vi.stubEnv('JA_TEMP_OWNER_USER_ID', worker.id);
    expect((await signIn('hans', 'hans')).status).toBeGreaterThanOrEqual(400);
    vi.stubEnv('JA_TEMP_OWNER_USER_ID', owner.id);
    // Production protects the designated Owner against role/status/email changes.
    expect(() => updateOwner('UPDATE user SET status=? WHERE id=?', 'suspended')).toThrow(
      'designated Owner is immutable',
    );
    updateOwner('UPDATE user SET email_verified=? WHERE id=?', '0');
    try {
      expect((await signIn('hans', 'hans')).status).toBeGreaterThanOrEqual(400);
    } finally {
      updateOwner('UPDATE user SET email_verified=? WHERE id=?', '1');
    }
  });
  it('preserves origin checks and rejects client attempts to choose another user', async () => {
    const response = await signIn('hans', 'hans', { userId: worker.id });
    expect((await response.json()).user.id).toBe(owner.id);
    const rejected = await withTemporaryOwnerLogin(
      new Request(`http://localhost:5174${base}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://untrusted.example',
          cookie: 'probe=1',
        },
        body: JSON.stringify({ email: 'hans', password: 'hans' }),
      }),
      base,
      (request) => auth.handler(request),
    );
    expect(rejected.status).toBe(403);
  });
  it('fails closed for the alias when MFA is enabled, preserving normal MFA login', async () => {
    updateOwner('UPDATE user SET two_factor_enabled=? WHERE id=?', '1');
    try {
      expect((await signIn('hans', 'hans')).status).toBeGreaterThanOrEqual(400);
      expect(await (await signIn(owner.email, localPassword)).json()).toMatchObject({
        twoFactorRedirect: true,
      });
    } finally {
      updateOwner('UPDATE user SET two_factor_enabled=? WHERE id=?', '0');
    }
  });
  it('revokes renewed alias sessions at the deadline even after configuration is removed', async () => {
    const alias = await (await signIn('hans', 'hans')).json();
    const normal = await (await signIn(owner.email, localPassword)).json();
    const { sqlite } = createDatabase();
    try {
      // Exercise Better Auth's real renewal using the login cookie.
      const aliasSession = await signIn('hans', 'hans');
      const renewedBody = await aliasSession.clone().json();
      const cookie = aliasSession.headers.get('set-cookie')!.split(';', 1)[0]!;
      const renewed = await auth.handler(
        new Request(`http://localhost:5174${base}/api/auth/get-session`, { headers: { cookie } }),
      );
      expect(renewed.status).toBe(200);
      const value = await renewed.json();
      expect(Date.parse(value.session.expiresAt)).toBeGreaterThan(Date.parse(expiry));
      vi.stubEnv('JA_TEMP_OWNER_EXPIRES_AT', '');
      revokeExpiredTemporaryOwnerSessions(Date.parse(expiry) + 1);
      for (const token of [alias.token, renewedBody.token]) {
        expect(sqlite.prepare('SELECT id FROM session WHERE token=?').get(token)).toBeUndefined();
      }
      expect(
        sqlite.prepare('SELECT id FROM session WHERE token=?').get(normal.token),
      ).toBeDefined();
      const revoked = await auth.handler(
        new Request(`http://localhost:5174${base}/api/auth/get-session`, { headers: { cookie } }),
      );
      expect(await revoked.json()).toBeNull();
    } finally {
      sqlite.close();
      vi.stubEnv('JA_TEMP_OWNER_EXPIRES_AT', expiry);
    }
  });
  it('uses the server deadline after a spoofed client user-agent marker', async () => {
    const response = await withTemporaryOwnerLogin(
      new Request(`http://localhost:5174${base}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5174',
          'user-agent': 'probe [ja-temp-owner:9999999999999]',
        },
        body: JSON.stringify({ email: 'hans', password: 'hans' }),
      }),
      base,
      (request) => auth.handler(request),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const { sqlite } = createDatabase();
    try {
      const row = sqlite
        .prepare('SELECT user_agent userAgent FROM session WHERE token=?')
        .get(body.token) as { userAgent: string };
      expect(row.userAgent).toBe(
        `probe [ja-temp-owner:9999999999999] [ja-temp-owner:${Date.parse(expiry)}]`,
      );
      revokeExpiredTemporaryOwnerSessions(Date.parse(expiry) + 1);
      expect(
        sqlite.prepare('SELECT id FROM session WHERE token=?').get(body.token),
      ).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });
  it('does not rewrite reset-password requests', async () => {
    const request = new Request(`http://localhost:5174${base}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'hans' }),
    });
    await withTemporaryOwnerLogin(request, base, async (forwarded) => {
      expect(forwarded).toBe(request);
      expect(await forwarded.json()).toEqual({ email: 'hans' });
      return new Response();
    });
  });
});
