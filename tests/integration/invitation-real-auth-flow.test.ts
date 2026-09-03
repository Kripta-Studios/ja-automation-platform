import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';

const previousEnvironment = {
  nodeEnvironment: process.env.NODE_ENV,
  databasePath: process.env.JA_DATABASE_PATH,
  tenantId: process.env.JA_TENANT_ID,
  deploymentId: process.env.JA_DEPLOYMENT_ID,
  origin: process.env.ORIGIN,
  webauthnOrigin: process.env.JA_WEBAUTHN_ORIGIN,
  authSecret: process.env.JA_AUTH_SECRET,
};
const directory = mkdtempSync(join(tmpdir(), 'ja-invitation-real-auth-'));
const databasePath = join(directory, 'app.db');
const origin = 'http://localhost:5174';

// Better Auth is initialized from the environment at module import time. Keep
// this real-flow suite isolated from any local/demo database and explicitly
// exercise only the test configuration branch.
process.env.NODE_ENV = 'test';
process.env.JA_DATABASE_PATH = databasePath;
process.env.JA_TENANT_ID = 'test-tenant';
process.env.JA_DEPLOYMENT_ID = 'test-deployment';
process.env.ORIGIN = origin;
process.env.JA_WEBAUTHN_ORIGIN = origin;
process.env.JA_AUTH_SECRET = 'invitation-real-auth-test-secret-20260830';

vi.mock('$app/server', () => ({ getRequestEvent: () => undefined }), { virtual: true });
vi.mock('$app/environment', () => ({ building: false }), { virtual: true });

const { auth } = await import('../../apps/portal/src/lib/server/auth.js');
const { POST } = await import('../../apps/portal/src/routes/app/api/invitations/accept/+server.js');

type InvitationFixture = Readonly<{
  invitationId: string;
  ownerId: string;
  email: string;
  token: string;
  password: string;
}>;

function withDatabase<T>(operation: (database: ReturnType<typeof createDatabase>) => T): T {
  const database = createDatabase(databasePath);
  try {
    return operation(database);
  } finally {
    database.sqlite.close();
  }
}

function seedInvitation(): InvitationFixture {
  const suffix = randomUUID().replaceAll('-', '');
  const invitationId = `real-invitation-${suffix}`;
  const ownerId = 'real-owner-canonical';
  const email = `real-invite-${suffix}@example.test`;
  const token = `real-invitation-token-${suffix}-${randomUUID()}`;
  const password = 'RealInvitationCredential!20260830';
  const now = new Date().toISOString();

  withDatabase(({ sqlite }) => {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO user(
           id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
         ) VALUES(?,?,?,1,'owner_admin','active',0,0,?,?,1)`,
      )
      .run(ownerId, 'Invitation Test Owner', 'antonny.luty@j-aautomation.com', now, now);
    sqlite
      .prepare(
        `INSERT INTO invitation(id,email,token_hash,role,invited_by,expires_at,used_at,created_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        invitationId,
        email,
        createHash('sha256').update(token).digest('hex'),
        'worker',
        ownerId,
        new Date(Date.now() + 60_000).toISOString(),
        null,
        now,
      );
  });

  return { invitationId, ownerId, email, token, password };
}

function eventFor(fixture: InvitationFixture, token = fixture.token) {
  return {
    request: new Request(`${origin}/j-aautomation/app/api/invitations/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({
        token,
        name: 'Real Invitation User',
        password: fixture.password,
      }),
    }),
  } as unknown as Parameters<typeof POST>[0];
}

async function signIn(fixture: InvitationFixture): Promise<Response> {
  return auth.handler(
    new Request(`${origin}/j-aautomation/app/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email: fixture.email, password: fixture.password }),
    }),
  );
}

afterAll(() => {
  if (previousEnvironment.nodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment.nodeEnvironment;
  if (previousEnvironment.databasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = previousEnvironment.databasePath;
  if (previousEnvironment.tenantId === undefined) delete process.env.JA_TENANT_ID;
  else process.env.JA_TENANT_ID = previousEnvironment.tenantId;
  if (previousEnvironment.deploymentId === undefined) delete process.env.JA_DEPLOYMENT_ID;
  else process.env.JA_DEPLOYMENT_ID = previousEnvironment.deploymentId;
  if (previousEnvironment.origin === undefined) delete process.env.ORIGIN;
  else process.env.ORIGIN = previousEnvironment.origin;
  if (previousEnvironment.webauthnOrigin === undefined) delete process.env.JA_WEBAUTHN_ORIGIN;
  else process.env.JA_WEBAUTHN_ORIGIN = previousEnvironment.webauthnOrigin;
  if (previousEnvironment.authSecret === undefined) delete process.env.JA_AUTH_SECRET;
  else process.env.JA_AUTH_SECRET = previousEnvironment.authSecret;
  // Better Auth owns a process-lifetime SQLite connection. The isolated temp
  // directory remains disposable and is reclaimed after the Vitest worker exits.
});

describe('real Better Auth invitation acceptance', () => {
  it('activates the invited identity without a session, then permits credential sign-in', async () => {
    const fixture = seedInvitation();

    const acceptance = await POST(eventFor(fixture));

    expect(acceptance.status).toBe(200);
    expect(acceptance.headers.get('set-cookie') ?? '').not.toContain('session_token=');
    expect(await acceptance.json()).toEqual({ accepted: true, email: fixture.email });

    withDatabase(({ sqlite }) => {
      expect(
        sqlite
          .prepare('SELECT id,role,status,email_verified,mfa_required FROM user WHERE email=?')
          .get(fixture.email),
      ).toMatchObject({
        role: 'worker',
        status: 'active',
        email_verified: 1,
        mfa_required: 1,
      });
      expect(
        sqlite.prepare('SELECT used_at FROM invitation WHERE id=?').get(fixture.invitationId),
      ).toMatchObject({
        used_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
      });
      expect(
        sqlite
          .prepare(
            `SELECT count(*) count FROM session
             WHERE user_id=(SELECT id FROM user WHERE email=?)`,
          )
          .get(fixture.email),
      ).toEqual({ count: 0 });
      expect(
        sqlite
          .prepare(
            `SELECT count(*) count FROM account
             WHERE user_id=(SELECT id FROM user WHERE email=?)
               AND provider_id='credential' AND password IS NOT NULL`,
          )
          .get(fixture.email),
      ).toEqual({ count: 1 });
    });

    const login = await signIn(fixture);
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie') ?? '').toContain('ja_portal.session_token=');
  });

  it('returns a generic failure for an invalid invitation without exposing auth details', async () => {
    const fixture = seedInvitation();
    const invalidToken = `invalid-invitation-token-${randomUUID()}-${randomUUID()}`;

    const response = await POST(eventFor(fixture, invalidToken));
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(body)).toEqual({ error: 'Invitation could not be activated' });
    expect(body).not.toContain(invalidToken);
    expect(body).not.toContain(fixture.email);
    expect(body).not.toContain(fixture.password);
    expect(
      withDatabase(({ sqlite }) =>
        sqlite.prepare('SELECT used_at FROM invitation WHERE id=?').get(fixture.invitationId),
      ),
    ).toEqual({ used_at: null });
  });
});
