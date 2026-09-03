import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign as signBytes,
} from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hashPassword, symmetricEncrypt } from 'better-auth/crypto';
import { createDatabase } from '@ja/database';

const directory = mkdtempSync(join(tmpdir(), 'ja-inactive-auth-'));
const databasePath = join(directory, 'app.db');
const originalDatabasePath = process.env.JA_DATABASE_PATH;
const originalTenantId = process.env.JA_TENANT_ID;
const originalDeploymentId = process.env.JA_DEPLOYMENT_ID;
process.env.JA_DATABASE_PATH = databasePath;
process.env.JA_TENANT_ID = 'inactive-auth-test';
process.env.JA_DEPLOYMENT_ID = 'inactive-auth-test';

vi.mock('$app/server', () => ({ getRequestEvent: () => undefined }), { virtual: true });
vi.mock('$app/environment', () => ({ building: false }), { virtual: true });

const { auth, revokeSessionsUnlessUserIsActive } =
  await import('../../apps/portal/src/lib/server/auth.js');
const { authAuditAfter } = await import('../../apps/portal/src/lib/server/auth-audit.js');

const users = {
  active: { id: randomUUID(), email: 'active-auth@example.test', status: 'active' },
  suspended: {
    id: randomUUID(),
    email: 'suspended-auth@example.test',
    status: 'suspended',
  },
  offboarded: {
    id: randomUUID(),
    email: 'offboarded-auth@example.test',
    status: 'offboarded',
  },
  managed: { id: randomUUID(), email: 'managed-auth@example.test', status: 'active' },
  mfa: { id: randomUUID(), email: 'mfa-auth@example.test', status: 'active' },
} as const;
const password = 'auth-regression-password';
const mfaSecret = 'JBSWY3DPEHPK3PXP';
const backupCode = 'ACTIVE-BACKUP-CODE';
const activeCredentialBytes = randomBytes(32);
const activeCredentialId = activeCredentialBytes.toString('base64url');
const activePasskeyKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const activePublicJwk = activePasskeyKeys.publicKey.export({ format: 'jwk' });
if (!activePublicJwk.x || !activePublicJwk.y)
  throw new Error('TEST_WEBAUTHN_PUBLIC_KEY_COORDINATES_MISSING');
const activeCredentialPublicKey = Buffer.from(
  Buffer.concat([
    // Canonical COSE_Key map: kty=EC2, alg=ES256, crv=P-256, x and y.
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    Buffer.from(activePublicJwk.x, 'base64url'),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(activePublicJwk.y, 'base64url'),
  ]),
).toString('base64');

async function signIn(email: string): Promise<Response> {
  return auth.handler(
    new Request('http://localhost:5173/j-aautomation/app/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({ email, password }),
    }),
  );
}

function cookieFrom(response: Response, name: string): string {
  const setCookie = response.headers.get('set-cookie') ?? '';
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = setCookie.match(new RegExp(`(?:^|,\\s*)(${escapedName}=[^;]+)`));
  if (!match?.[1]) throw new Error(`Missing ${name} cookie in ${setCookie}`);
  return match[1];
}

async function passkeyChallenge(): Promise<{ cookie: string; rows: unknown[] }> {
  const response = await auth.handler(
    new Request(
      'http://localhost:5173/j-aautomation/app/api/auth/passkey/generate-authenticate-options',
      { headers: { origin: 'http://localhost:5173' } },
    ),
  );
  expect(response.status).toBe(200);
  const database = createDatabase(databasePath);
  try {
    return {
      cookie: cookieFrom(response, 'ja_portal.better-auth-passkey'),
      rows: database.sqlite
        .prepare(
          `SELECT id,identifier,value,expires_at expiresAt,created_at createdAt,updated_at updatedAt
           FROM verification ORDER BY id`,
        )
        .all(),
    };
  } finally {
    database.sqlite.close();
  }
}

async function verifyPasskey(credentialId: string, cookie: string): Promise<Response> {
  return auth.handler(
    new Request('http://localhost:5173/j-aautomation/app/api/auth/passkey/verify-authentication', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
        cookie,
      },
      body: JSON.stringify({ response: { id: credentialId } }),
    }),
  );
}

async function signedPasskeyAssertion(configuration?: {
  corruptSignature?: boolean;
}): Promise<Response> {
  const optionsResponse = await auth.handler(
    new Request(
      'http://localhost:5173/j-aautomation/app/api/auth/passkey/generate-authenticate-options',
      { headers: { origin: 'http://localhost:5173' } },
    ),
  );
  expect(optionsResponse.status).toBe(200);
  const assertionOptions = (await optionsResponse.json()) as { challenge: string };
  expect(assertionOptions.challenge).toBeTruthy();
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: assertionOptions.challenge,
      origin: 'http://localhost:5174',
      crossOrigin: false,
    }),
  );
  const authenticatorData = Buffer.alloc(37);
  createHash('sha256').update('localhost').digest().copy(authenticatorData, 0);
  authenticatorData[32] = 0x05; // user present + user verified
  authenticatorData.writeUInt32BE(42, 33);
  const clientDataHash = createHash('sha256').update(clientDataJSON).digest();
  const signature = signBytes(
    'sha256',
    Buffer.concat([authenticatorData, clientDataHash]),
    activePasskeyKeys.privateKey,
  );
  if (configuration?.corruptSignature) signature[signature.length - 1] ^= 0x01;

  return auth.handler(
    new Request('http://localhost:5173/j-aautomation/app/api/auth/passkey/verify-authentication', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
        cookie: cookieFrom(optionsResponse, 'ja_portal.better-auth-passkey'),
      },
      body: JSON.stringify({
        response: {
          id: activeCredentialId,
          rawId: activeCredentialId,
          type: 'public-key',
          response: {
            authenticatorData: authenticatorData.toString('base64url'),
            clientDataJSON: clientDataJSON.toString('base64url'),
            signature: signature.toString('base64url'),
            userHandle: Buffer.from(users.active.id).toString('base64url'),
          },
          clientExtensionResults: {},
          authenticatorAttachment: 'platform',
        },
      }),
    }),
  );
}

async function mfaChallenge(): Promise<{ cookie: string; rows: unknown[] }> {
  const response = await signIn(users.mfa.email);
  expect(response.status).toBe(200);
  await expect(response.clone().json()).resolves.toMatchObject({ twoFactorRedirect: true });
  const database = createDatabase(databasePath);
  try {
    return {
      cookie: cookieFrom(response, 'ja_portal.two_factor'),
      rows: database.sqlite
        .prepare(
          `SELECT id,identifier,value,expires_at expiresAt,created_at createdAt,updated_at updatedAt
           FROM verification WHERE value=? OR identifier LIKE '2fa-attempts-%' ORDER BY id`,
        )
        .all(users.mfa.id),
    };
  } finally {
    database.sqlite.close();
  }
}

async function verifyMfa(
  kind: 'verify-totp' | 'verify-backup-code',
  code: string,
  cookie: string,
): Promise<Response> {
  return auth.handler(
    new Request(`http://localhost:5173/j-aautomation/app/api/auth/two-factor/${kind}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
        cookie,
      },
      body: JSON.stringify({ code }),
    }),
  );
}

function setMfaUserStatus(status: 'active' | 'suspended' | 'offboarded'): void {
  const database = createDatabase(databasePath);
  try {
    database.sqlite
      .prepare('UPDATE user SET status=?,updated_at=? WHERE id=?')
      .run(status, new Date().toISOString(), users.mfa.id);
  } finally {
    database.sqlite.close();
  }
}

beforeAll(async () => {
  const { sqlite } = createDatabase(databasePath);
  try {
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    for (const user of Object.values(users)) {
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,email_verified,role,status,created_at,updated_at)
           VALUES(?,?,?,1,'worker',?,?,?)`,
        )
        .run(user.id, user.email, user.email, user.status, now, now);
      sqlite
        .prepare(
          `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          'local:credential',
          user.id,
          'credential',
          user.id,
          passwordHash,
          now,
          now,
        );
    }
    sqlite
      .prepare(`UPDATE user SET two_factor_enabled=1,mfa_enrolled=1,updated_at=? WHERE id=?`)
      .run(now, users.mfa.id);
    sqlite
      .prepare(
        `INSERT INTO two_factor(
           id,secret,backup_codes,user_id,verified,failed_verification_count,locked_until
         ) VALUES(?,?,?,?,1,3,NULL)`,
      )
      .run(
        randomUUID(),
        await symmetricEncrypt({ key: 'build-only-secret-change-before-runtime', data: mfaSecret }),
        await symmetricEncrypt({
          key: 'build-only-secret-change-before-runtime',
          data: JSON.stringify([backupCode]),
        }),
        users.mfa.id,
      );
    for (const user of [users.suspended, users.offboarded, users.active, users.managed])
      sqlite
        .prepare(
          `INSERT INTO passkey(
             id,name,public_key,user_id,credential_id,counter,device_type,backed_up,transports,created_at
           ) VALUES(?,?,?,?,?,41,'singleDevice',0,'internal',?)`,
        )
        .run(
          randomUUID(),
          `Passkey ${user.status}`,
          user.id === users.active.id ? activeCredentialPublicKey : 'AA==',
          user.id,
          user.id === users.active.id
            ? activeCredentialId
            : user.id === users.managed.id
              ? 'credential-managed'
              : `credential-${user.status}`,
          now,
        );
  } finally {
    sqlite.close();
  }
});

afterAll(() => {
  if (originalDatabasePath === undefined) delete process.env.JA_DATABASE_PATH;
  else process.env.JA_DATABASE_PATH = originalDatabasePath;
  if (originalTenantId === undefined) delete process.env.JA_TENANT_ID;
  else process.env.JA_TENANT_ID = originalTenantId;
  if (originalDeploymentId === undefined) delete process.env.JA_DEPLOYMENT_ID;
  else process.env.JA_DEPLOYMENT_ID = originalDeploymentId;
  // The singleton Better Auth adapter owns its SQLite handle for the process
  // lifetime. On Windows that handle prevents eager deletion; the OS temp
  // directory remains isolated and is reclaimable after Vitest exits.
});

describe('inactive Better Auth session boundary', () => {
  it('allows an active credential login', async () => {
    const response = await signIn(users.active.email);

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('ja_portal.session_token=');
  });

  it('accepts only a cryptographically valid active passkey assertion and records its mutation', async () => {
    const response = await signedPasskeyAssertion();
    const body = await response.clone().json();

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('ja_portal.session_token=');
    expect(body).toMatchObject({ user: { id: users.active.id } });

    const database = createDatabase(databasePath);
    try {
      expect(
        database.sqlite
          .prepare('SELECT counter FROM passkey WHERE credential_id=?')
          .get(activeCredentialId),
      ).toEqual({ counter: 42 });
      expect(
        database.sqlite
          .prepare(
            `SELECT json_extract(details_json,'$.outcome') outcome FROM audit_event
             WHERE action='security.passkey.login' AND entity_id=?
             ORDER BY rowid DESC LIMIT 1`,
          )
          .get(users.active.id),
      ).toMatchObject({ outcome: 'succeeded' });
    } finally {
      database.sqlite.close();
    }
  });

  it('normalizes a complete assertion with an invalid ES256 signature without mutating auth state', async () => {
    const before = createDatabase(databasePath);
    const sessionCountBefore = (
      before.sqlite
        .prepare('SELECT count(*) count FROM session WHERE user_id=?')
        .get(users.active.id) as { count: number }
    ).count;
    before.sqlite.close();
    const response = await signedPasskeyAssertion({ corruptSignature: true });
    const body = await response.text();
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie') ?? '').not.toContain('session_token=');
    expect(JSON.parse(body)).toEqual({
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    });

    const unknownChallenge = await passkeyChallenge();
    const unknown = await verifyPasskey('credential-does-not-exist', unknownChallenge.cookie);
    expect(unknown.status).toBe(response.status);
    expect(await unknown.text()).toBe(body);

    const database = createDatabase(databasePath);
    try {
      expect(
        database.sqlite
          .prepare('SELECT counter FROM passkey WHERE credential_id=?')
          .get(activeCredentialId),
      ).toEqual({ counter: 42 });
      expect(
        database.sqlite
          .prepare('SELECT count(*) count FROM session WHERE user_id=?')
          .get(users.active.id),
      ).toEqual({ count: sessionCountBefore });
    } finally {
      database.sqlite.close();
    }
  });

  it.each([users.suspended, users.offboarded])(
    'rejects $status credential login without issuing a session cookie',
    async (user) => {
      const response = await signIn(user.email);

      expect([401, 403]).toContain(response.status);
      expect(response.headers.get('set-cookie') ?? '').not.toContain('session_token=');
      const body = await response.text();
      expect(body).not.toContain(user.status);
      expect(body).not.toContain(user.email);
      expect(JSON.parse(body)).toMatchObject({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      });

      const unknown = await signIn('unknown-auth@example.test');
      expect(response.status).toBe(unknown.status);
      expect(JSON.parse(body)).toMatchObject(JSON.parse(await unknown.text()));

      const { sqlite } = createDatabase(databasePath);
      try {
        expect(
          sqlite.prepare('SELECT 1 FROM session WHERE user_id=?').get(user.id),
        ).toBeUndefined();
      } finally {
        sqlite.close();
      }
    },
  );

  it('revokes every existing session when the canonical user is inactive', () => {
    const { sqlite } = createDatabase(databasePath);
    try {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      for (const suffix of ['a', 'b'])
        sqlite
          .prepare(
            `INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at)
             VALUES(?,?,?,?,?,?)`,
          )
          .run(randomUUID(), `inactive-token-${suffix}`, users.suspended.id, expiresAt, now, now);
    } finally {
      sqlite.close();
    }

    expect(revokeSessionsUnlessUserIsActive(users.suspended.id)).toBeNull();

    const verification = createDatabase(databasePath);
    try {
      expect(
        verification.sqlite
          .prepare('SELECT COUNT(*) count FROM session WHERE user_id=?')
          .get(users.suspended.id),
      ).toMatchObject({ count: 0 });
    } finally {
      verification.sqlite.close();
    }
  });

  it('makes an issued cookie unusable for protected Better Auth account endpoints', async () => {
    const login = await signIn(users.active.email);
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    expect(cookie).toContain('ja_portal.session_token=');

    const database = createDatabase(databasePath);
    try {
      database.sqlite
        .prepare("UPDATE user SET status='suspended',updated_at=? WHERE id=?")
        .run(new Date().toISOString(), users.active.id);
    } finally {
      database.sqlite.close();
    }

    expect(revokeSessionsUnlessUserIsActive(users.active.id)).toBeNull();
    const response = await auth.handler(
      new Request('http://localhost:5173/j-aautomation/app/api/auth/change-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
          cookie: cookie ?? '',
        },
        body: JSON.stringify({ currentPassword: password, newPassword: `${password}-new` }),
      }),
    );
    expect([401, 403]).toContain(response.status);
    expect(response.headers.get('set-cookie') ?? '').toContain(
      'ja_portal.session_token=; Max-Age=0',
    );

    const restore = createDatabase(databasePath);
    try {
      restore.sqlite
        .prepare("UPDATE user SET status='active',updated_at=? WHERE id=?")
        .run(new Date().toISOString(), users.active.id);
    } finally {
      restore.sqlite.close();
    }
  });

  it.each([users.suspended, users.offboarded])(
    'rejects a $status passkey before consuming its challenge or changing its counter',
    async (user) => {
      const challenge = await passkeyChallenge();
      const response = await verifyPasskey(`credential-${user.status}`, challenge.cookie);

      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie') ?? '').not.toContain('session_token=');
      const body = await response.text();
      expect(body).not.toContain(user.status);
      expect(body).not.toContain(user.email);
      expect(JSON.parse(body)).toMatchObject({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      });

      const database = createDatabase(databasePath);
      try {
        expect(
          database.sqlite
            .prepare(
              `SELECT id,identifier,value,expires_at expiresAt,created_at createdAt,updated_at updatedAt
               FROM verification ORDER BY id`,
            )
            .all(),
        ).toEqual(challenge.rows);
        expect(
          database.sqlite
            .prepare('SELECT counter FROM passkey WHERE credential_id=?')
            .get(`credential-${user.status}`),
        ).toEqual({ counter: 41 });
      } finally {
        database.sqlite.close();
      }

      const unknownChallenge = await passkeyChallenge();
      const unknown = await verifyPasskey('credential-does-not-exist', unknownChallenge.cookie);
      expect(unknown.status).toBe(response.status);
      expect(await unknown.text()).toBe(body);
    },
  );

  it('lets an active passkey reach the Better Auth verifier without a generic inactive denial', async () => {
    const challenge = await passkeyChallenge();
    const response = await verifyPasskey(activeCredentialId, challenge.cookie);
    const body = await response.text();

    // An invalid assertion must not disclose that the credential exists or
    // belongs to an active identity. The protocol still consumes the active
    // challenge, but the HTTP failure is the same generic response used for an
    // unknown/inactive credential.
    const unknownChallenge = await passkeyChallenge();
    const unknown = await verifyPasskey('credential-does-not-exist', unknownChallenge.cookie);
    const unknownBody = await unknown.text();
    expect(response.status).toBe(401);
    expect(response.status).toBe(unknown.status);
    expect(body).toBe(unknownBody);
    expect(JSON.parse(body)).toEqual({
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    });
    const database = createDatabase(databasePath);
    try {
      expect(
        database.sqlite
          .prepare('SELECT counter FROM passkey WHERE credential_id=?')
          .get(activeCredentialId),
      ).toEqual({ counter: 42 });
      expect(
        database.sqlite
          .prepare(
            `SELECT id,identifier,value,expires_at expiresAt,created_at createdAt,updated_at updatedAt
             FROM verification ORDER BY id`,
          )
          .all(),
      ).toHaveLength(unknownChallenge.rows.length);
    } finally {
      database.sqlite.close();
    }
  });

  it('fences suspended sessions before passkey and MFA management mutations', async () => {
    const session = await signIn(users.managed.email);
    expect(session.status).toBe(200);
    const sessionCookie = cookieFrom(session, 'ja_portal.session_token');

    const registrationOptions = await auth.handler(
      new Request(
        'http://localhost:5173/j-aautomation/app/api/auth/passkey/generate-register-options',
        { headers: { origin: 'http://localhost:5173', cookie: sessionCookie } },
      ),
    );
    expect(registrationOptions.status).toBe(200);
    const registrationCookie = cookieFrom(registrationOptions, 'ja_portal.better-auth-passkey');

    const database = createDatabase(databasePath);
    let passkeyId = '';
    let verificationBefore: unknown[] = [];
    try {
      passkeyId = (
        database.sqlite.prepare('SELECT id FROM passkey WHERE user_id=?').get(users.managed.id) as {
          id: string;
        }
      ).id;
      verificationBefore = database.sqlite
        .prepare(
          `SELECT id,identifier,value,expires_at expiresAt,created_at createdAt,updated_at updatedAt
           FROM verification ORDER BY id`,
        )
        .all();
    } finally {
      database.sqlite.close();
    }

    const suspend = createDatabase(databasePath);
    try {
      suspend.sqlite
        .prepare("UPDATE user SET status='suspended',updated_at=? WHERE id=?")
        .run(new Date().toISOString(), users.managed.id);
    } finally {
      suspend.sqlite.close();
    }

    const expectedBody = {
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    };
    const expectSuspendedFailure = async (response: Response): Promise<void> => {
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie') ?? '').not.toContain('session_token=');
      expect(JSON.parse(await response.text())).toEqual(expectedBody);
    };

    await expectSuspendedFailure(
      await auth.handler(
        new Request(
          'http://localhost:5173/j-aautomation/app/api/auth/passkey/generate-register-options',
          { headers: { origin: 'http://localhost:5173', cookie: sessionCookie } },
        ),
      ),
    );
    await expectSuspendedFailure(
      await auth.handler(
        new Request(
          'http://localhost:5173/j-aautomation/app/api/auth/two-factor/generate-backup-codes',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              origin: 'http://localhost:5173',
              cookie: sessionCookie,
            },
            body: JSON.stringify({ password }),
          },
        ),
      ),
    );

    await expectSuspendedFailure(
      await auth.handler(
        new Request(
          'http://localhost:5173/j-aautomation/app/api/auth/passkey/verify-registration',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              origin: 'http://localhost:5173',
              cookie: `${sessionCookie}; ${registrationCookie}`,
            },
            body: JSON.stringify({ response: {} }),
          },
        ),
      ),
    );
    await expectSuspendedFailure(
      await auth.handler(
        new Request('http://localhost:5173/j-aautomation/app/api/auth/passkey/delete-passkey', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:5173',
            cookie: sessionCookie,
          },
          body: JSON.stringify({ id: passkeyId }),
        }),
      ),
    );
    for (const [path, body] of [
      ['/two-factor/enable', { password }],
      ['/two-factor/disable', { password }],
    ] as const) {
      await expectSuspendedFailure(
        await auth.handler(
          new Request(`http://localhost:5173/j-aautomation/app/api/auth${path}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              origin: 'http://localhost:5173',
              cookie: sessionCookie,
            },
            body: JSON.stringify(body),
          }),
        ),
      );
    }

    const after = createDatabase(databasePath);
    try {
      expect(
        after.sqlite
          .prepare('SELECT id,name,user_id,counter FROM passkey WHERE id=?')
          .get(passkeyId),
      ).toMatchObject({ id: passkeyId, user_id: users.managed.id, counter: 41 });
      expect(
        after.sqlite
          .prepare(
            `SELECT id,identifier,value,expires_at expiresAt,created_at createdAt,updated_at updatedAt
             FROM verification ORDER BY id`,
          )
          .all(),
      ).toEqual(verificationBefore);
      expect(
        after.sqlite
          .prepare('SELECT two_factor_enabled,mfa_enrolled FROM user WHERE id=?')
          .get(users.managed.id),
      ).toMatchObject({ two_factor_enabled: 0, mfa_enrolled: 0 });
      expect(
        after.sqlite.prepare('SELECT id FROM two_factor WHERE user_id=?').get(users.managed.id),
      ).toBeUndefined();
    } finally {
      after.sqlite.close();
    }
  });

  it.each([
    { status: 'suspended' as const, kind: 'verify-totp' as const, code: '000000' },
    {
      status: 'offboarded' as const,
      kind: 'verify-backup-code' as const,
      code: backupCode,
    },
  ])(
    'rejects pending MFA for a $status user before $kind mutates challenge or factor state',
    async ({ status, kind, code }) => {
      setMfaUserStatus('active');
      const challenge = await mfaChallenge();
      setMfaUserStatus(status);
      const before = createDatabase(databasePath);
      const factorBefore = before.sqlite
        .prepare(
          'SELECT backup_codes backupCodes,failed_verification_count failedCount,locked_until lockedUntil FROM two_factor WHERE user_id=?',
        )
        .get(users.mfa.id);
      before.sqlite.close();

      const response = await verifyMfa(kind, code, challenge.cookie);

      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie') ?? '').not.toContain('session_token=');
      const body = await response.text();
      expect(body).not.toContain(status);
      expect(body).not.toContain(users.mfa.email);
      expect(JSON.parse(body)).toMatchObject({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      });
      const database = createDatabase(databasePath);
      try {
        expect(
          database.sqlite
            .prepare(
              `SELECT id,identifier,value,expires_at expiresAt,created_at createdAt,updated_at updatedAt
               FROM verification WHERE value=? OR identifier LIKE '2fa-attempts-%' ORDER BY id`,
            )
            .all(users.mfa.id),
        ).toEqual(challenge.rows);
        expect(
          database.sqlite
            .prepare(
              'SELECT backup_codes backupCodes,failed_verification_count failedCount,locked_until lockedUntil FROM two_factor WHERE user_id=?',
            )
            .get(users.mfa.id),
        ).toEqual(factorBefore);
      } finally {
        database.sqlite.close();
      }
    },
  );

  it('allows an active user to complete both TOTP and backup-code recovery', async () => {
    setMfaUserStatus('active');
    const totpChallenge = await mfaChallenge();
    const generated = await auth.api.generateTOTP({ body: { secret: mfaSecret } });
    const totp = await verifyMfa('verify-totp', generated.code, totpChallenge.cookie);
    expect(totp.status).toBe(200);
    expect(totp.headers.get('set-cookie')).toContain('ja_portal.session_token=');

    const backupChallenge = await mfaChallenge();
    const backup = await verifyMfa('verify-backup-code', backupCode, backupChallenge.cookie);
    expect(backup.status).toBe(200);
    expect(backup.headers.get('set-cookie')).toContain('ja_portal.session_token=');

    const database = createDatabase(databasePath);
    try {
      expect(
        database.sqlite
          .prepare('SELECT failed_verification_count failedCount FROM two_factor WHERE user_id=?')
          .get(users.mfa.id),
      ).toEqual({ failedCount: 0 });
      const factor = database.sqlite
        .prepare('SELECT backup_codes backupCodes FROM two_factor WHERE user_id=?')
        .get(users.mfa.id) as { backupCodes: string };
      expect(factor.backupCodes).not.toContain(backupCode);
    } finally {
      database.sqlite.close();
    }
  });
});

describe('WebAuthn failure response boundary', () => {
  const auditState = {
    path: '/passkey/verify-authentication',
    action: { action: 'security.passkey.login', entityType: 'user' },
  };

  it('normalizes protocol-level failures while preserving the generic body', async () => {
    const result = await authAuditAfter({
      path: auditState.path,
      request: new Request(
        'http://localhost:5173/j-aautomation/app/api/auth/passkey/verify-authentication',
      ),
      context: { responseStatus: 400, returned: { statusCode: 400 } },
      jaAuthAudit: auditState,
    } as unknown as Parameters<typeof authAuditAfter>[0]);
    const normalized = (result as { response?: unknown }).response;
    expect(normalized).toBeInstanceOf(Response);
    expect((normalized as Response).status).toBe(401);
    await expect((normalized as Response).json()).resolves.toEqual({
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    });
  });

  it('does not turn internal WebAuthn failures into credential denials', async () => {
    const result = await authAuditAfter({
      path: auditState.path,
      request: new Request(
        'http://localhost:5173/j-aautomation/app/api/auth/passkey/verify-authentication',
      ),
      context: { responseStatus: 500, returned: { statusCode: 500 } },
      jaAuthAudit: auditState,
    } as unknown as Parameters<typeof authAuditAfter>[0]);
    expect(result).toEqual({});
  });

  it('removes a generated registration challenge when the audit write fails', async () => {
    const deleteVerificationByIdentifier = vi.fn().mockResolvedValue(undefined);
    const headers = new Headers({
      'set-cookie': 'ja_portal.better-auth-passkey=challenge-id.signature; Path=/; HttpOnly',
    });
    await expect(
      authAuditAfter({
        path: '/passkey/generate-register-options',
        context: {
          session: { user: { id: users.active.id } },
          returned: { challenge: 'secret-challenge' },
          responseHeaders: headers,
          createAuthCookie: () => ({ name: 'ja_portal.better-auth-passkey' }),
          internalAdapter: { deleteVerificationByIdentifier },
        },
        jaAuthAudit: {
          path: '/passkey/generate-register-options',
          action: { action: 'security.unregistered.challenge', entityType: 'passkey' },
        },
      } as unknown as Parameters<typeof authAuditAfter>[0]),
    ).rejects.toThrow(/AUTH_AUDIT_FAILED/u);
    expect(deleteVerificationByIdentifier).toHaveBeenCalledOnce();
    expect(deleteVerificationByIdentifier).toHaveBeenCalledWith('challenge-id');
  });

  it('restores backup codes when their rotation succeeds but the audit write fails', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    await expect(
      authAuditAfter({
        path: '/two-factor/generate-backup-codes',
        context: {
          session: { user: { id: users.active.id } },
          returned: { backupCodes: ['new-code'] },
          adapter: { update },
        },
        jaAuthAudit: {
          path: '/two-factor/generate-backup-codes',
          action: { action: 'security.unregistered.backup', entityType: 'user' },
          twoFactorBefore: { id: 'factor-before', backupCodes: 'encrypted-before' },
        },
      } as unknown as Parameters<typeof authAuditAfter>[0]),
    ).rejects.toThrow(/AUTH_AUDIT_FAILED/u);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      model: 'twoFactor',
      where: [{ field: 'id', value: 'factor-before' }],
      update: { backupCodes: 'encrypted-before' },
    });
  });
});
