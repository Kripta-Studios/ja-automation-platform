import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@ja/database';
import { hashPassword } from 'better-auth/crypto';

const directory = mkdtempSync(join(tmpdir(), 'ja-webmail-auth-'));
const databasePath = join(directory, 'app.db');
const previous = {
  databasePath: process.env.JA_DATABASE_PATH,
  tenantId: process.env.JA_TENANT_ID,
  deploymentId: process.env.JA_DEPLOYMENT_ID,
  mailEnabled: process.env.JA_MAIL_AUTH_ENABLED,
};
process.env.JA_DATABASE_PATH = databasePath;
process.env.JA_TENANT_ID = 'webmail-auth-test';
process.env.JA_DEPLOYMENT_ID = 'webmail-auth-test';
process.env.JA_MAIL_AUTH_ENABLED = 'true';

const acceptedPasswords = new Map<string, string>();
const { liveMailboxes } = vi.hoisted(() => ({
  liveMailboxes: [] as Array<{ id: string; email: string }>,
}));
const imapVerify = vi.fn(
  async (email: string, password: string) => acceptedPasswords.get(email) === password,
);
vi.mock('$app/server', () => ({ getRequestEvent: () => undefined }), { virtual: true });
vi.mock('$app/environment', () => ({ building: false }), { virtual: true });
vi.mock('../../apps/portal/src/lib/server/imap-auth.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../apps/portal/src/lib/server/imap-auth.js')>();
  return { ...original, verifyImapCredentials: imapVerify };
});
vi.mock('../../apps/portal/src/lib/server/stalwart-client.js', () => ({
  createConfiguredStalwartClient: async () => ({ listMailboxes: async () => liveMailboxes }),
}));

const { auth } = await import('../../apps/portal/src/lib/server/auth.js');

const owner = { id: randomUUID(), email: 'antonny.luty@j-aautomation.com' };
const worker = { id: randomUUID(), email: 'worker.mail@j-aautomation.com' };
const unlinked = { id: randomUUID(), email: 'unlinked@j-aautomation.com' };
const ownerDemoPassword = 'antonny.luty';
liveMailboxes.push(
  { id: `stalwart-${owner.id}`, email: owner.email },
  { id: `stalwart-${worker.id}`, email: worker.email },
);

async function signIn(email: string, password: string): Promise<Response> {
  return auth.handler(
    new Request('http://localhost:5173/j-aautomation/app/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({ email, password }),
    }),
  );
}

beforeAll(async () => {
  const { sqlite } = createDatabase(databasePath);
  try {
    const now = new Date().toISOString();
    const identities = [
      {
        ...owner,
        role: 'owner_admin',
        hash: await hashPassword(ownerDemoPassword),
        mode: 'hybrid',
      },
      { ...worker, role: 'worker', hash: await hashPassword(randomUUID()), mode: 'webmail' },
      { ...unlinked, role: 'worker', hash: await hashPassword(randomUUID()), mode: null },
    ] as const;
    for (const identity of identities) {
      sqlite
        .prepare(
          `INSERT INTO user(id,name,email,email_verified,role,status,created_at,updated_at)
           VALUES(?,?,?,1,?,'active',?,?)`,
        )
        .run(identity.id, identity.email, identity.email, identity.role, now, now);
      sqlite
        .prepare(
          `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
           VALUES(?,'local:credential',?,'credential',?,?,?,?)`,
        )
        .run(randomUUID(), identity.id, identity.id, identity.hash, now, now);
      if (identity.mode) {
        sqlite
          .prepare(
            `INSERT INTO mail_identity(
               user_id,stalwart_account_id,email,auth_mode,status,linked_by,linked_at,updated_at
             ) VALUES(?,?,?,?,'active',NULL,?,?)`,
          )
          .run(identity.id, `stalwart-${identity.id}`, identity.email, identity.mode, now, now);
      }
    }
    sqlite
      .prepare('UPDATE user SET two_factor_enabled=1,mfa_enrolled=1,mfa_required=1 WHERE id=?')
      .run(owner.id);
  } finally {
    sqlite.close();
  }
});

afterAll(() => {
  for (const [key, value] of Object.entries(previous)) {
    const envKey =
      key === 'databasePath'
        ? 'JA_DATABASE_PATH'
        : key === 'tenantId'
          ? 'JA_TENANT_ID'
          : key === 'deploymentId'
            ? 'JA_DEPLOYMENT_ID'
            : 'JA_MAIL_AUTH_ENABLED';
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = value;
  }
});

describe('delegated Webmail authentication through Better Auth', () => {
  it('preserves Antonny local demo access and also accepts his current Webmail password', async () => {
    acceptedPasswords.set(owner.email, 'owner-webmail-current');
    const demoResponse = await signIn(owner.email, ownerDemoPassword);
    const webmailResponse = await signIn(owner.email, 'owner-webmail-current');
    expect(demoResponse.status).toBe(200);
    expect(webmailResponse.status).toBe(200);
    await expect(demoResponse.json()).resolves.toMatchObject({ twoFactorRedirect: true });
    await expect(webmailResponse.json()).resolves.toMatchObject({ twoFactorRedirect: true });
  });

  it('authenticates a linked worker and retains Better Auth session cookies', async () => {
    acceptedPasswords.set(worker.email, 'worker-webmail-current');
    const response = await signIn(worker.email, 'worker-webmail-current');
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('ja_portal.session_token=');
    expect(imapVerify).toHaveBeenCalledWith(worker.email, 'worker-webmail-current');
  });

  it('does not cache Webmail passwords when Stalwart changes them', async () => {
    acceptedPasswords.set(worker.email, 'old-webmail-password');
    expect((await signIn(worker.email, 'old-webmail-password')).status).toBe(200);
    acceptedPasswords.set(worker.email, 'new-webmail-password');
    expect((await signIn(worker.email, 'old-webmail-password')).status).toBe(401);
    expect((await signIn(worker.email, 'new-webmail-password')).status).toBe(200);
  });

  it('rejects a deleted and recreated alias whose immutable Stalwart id changed', async () => {
    acceptedPasswords.set(worker.email, 'new-webmail-password');
    const mailbox = liveMailboxes.find((item) => item.email === worker.email)!;
    const previousId = mailbox.id;
    mailbox.id = 'stalwart-recreated-worker';
    try {
      expect((await signIn(worker.email, 'new-webmail-password')).status).toBe(401);
    } finally {
      mailbox.id = previousId;
    }
  });

  it('rejects inactive and unlinked users without delegating them to IMAP', async () => {
    const { sqlite } = createDatabase(databasePath);
    try {
      sqlite.prepare("UPDATE user SET status='suspended' WHERE id=?").run(worker.id);
    } finally {
      sqlite.close();
    }
    imapVerify.mockClear();
    expect((await signIn(worker.email, 'new-webmail-password')).status).toBe(401);
    expect((await signIn(unlinked.email, 'anything')).status).toBe(401);
    expect(imapVerify).not.toHaveBeenCalled();
  });
});
