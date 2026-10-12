import { AsyncLocalStorage } from 'node:async_hooks';
import { createDatabase } from '@ja/database';
import { verifyPassword } from 'better-auth/crypto';

type TemporaryLogin = {
  userId: string;
  credentialHash: string;
  temporaryHash: string;
  expiresAt: number;
};
const loginContext = new AsyncLocalStorage<TemporaryLogin>();

// This exception is opt-in, expires automatically, and is bound to Antonny's
// immutable user ID. It never changes the canonical account or mailbox password.
export async function withTemporaryOwnerLogin(
  request: Request,
  portalBase: string,
  handle: (request: Request) => Promise<Response>,
): Promise<Response> {
  if (
    request.method !== 'POST' ||
    new URL(request.url).pathname !== `${portalBase}/api/auth/sign-in/email`
  )
    return handle(request);
  const body = await request
    .clone()
    .json()
    .catch(() => null);
  if (typeof body?.email !== 'string' || body.email.trim().toLowerCase() !== 'hans')
    return handle(request);

  const userId = process.env.JA_TEMP_OWNER_USER_ID;
  const temporaryHash = process.env.JA_TEMP_OWNER_PASSWORD_HASH;
  const expiresAt = Date.parse(process.env.JA_TEMP_OWNER_EXPIRES_AT ?? '');
  if (!userId || !temporaryHash || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
    return handle(request);

  const { sqlite } = createDatabase();
  let account: { email: string; credentialHash: string } | undefined;
  try {
    account = sqlite
      .prepare(
        `
      SELECT u.email, a.password credentialHash FROM user u
      JOIN account a ON a.user_id=u.id AND a.account_id=u.id
        AND a.provider_id='credential' AND a.issuer='local:credential'
      WHERE u.id=? AND u.email='antonny.luty@j-aautomation.com'
        AND u.role='owner_admin' AND u.status='active' AND u.email_verified=1
        AND coalesce(u.two_factor_enabled,0)=0
    `,
      )
      .get(userId) as typeof account;
  } finally {
    sqlite.close();
  }
  if (!account?.credentialHash) return handle(request);
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  const forwarded = new Request(request, {
    headers,
    body: JSON.stringify({ ...body, email: account.email }),
  });
  return loginContext.run(
    { userId, credentialHash: account.credentialHash, temporaryHash, expiresAt },
    () => handle(forwarded),
  );
}

export async function verifyTemporaryOwnerPassword(input: {
  hash: string;
  password: string;
}): Promise<boolean | null> {
  const context = loginContext.getStore();
  if (!context) return null;
  if (context.expiresAt <= Date.now() || input.hash !== context.credentialHash) return false;
  return verifyPassword({ hash: context.temporaryHash, password: input.password }).catch(
    () => false,
  );
}

export function temporaryOwnerSessionData<
  T extends { userId: string; expiresAt: Date; userAgent?: string | null },
>(session: T): T {
  const context = loginContext.getStore();
  if (!context) return session;
  if (context.userId !== session.userId || context.expiresAt <= Date.now())
    throw new Error('Temporary owner access is unavailable');
  return {
    ...session,
    expiresAt: new Date(Math.min(session.expiresAt.getTime(), context.expiresAt)),
    // Durable, restrictive attribution: subsequent Better Auth renewals retain
    // user_agent. Always append our own final marker after any client-supplied UA.
    userAgent: `${session.userAgent ?? ''} [ja-temp-owner:${context.expiresAt}]`,
  };
}

export function revokeExpiredTemporaryOwnerSessions(now = Date.now()): void {
  const { sqlite } = createDatabase();
  try {
    const sessions = sqlite
      .prepare(
        "SELECT id, user_agent userAgent FROM session WHERE user_agent LIKE '% [ja-temp-owner:%]'",
      )
      .all() as Array<{ id: string; userAgent: string }>;
    const remove = sqlite.prepare('DELETE FROM session WHERE id=?');
    for (const session of sessions) {
      const marker = / \[ja-temp-owner:(\d+)\]$/u.exec(session.userAgent);
      if (marker && Number(marker[1]) <= now) remove.run(session.id);
    }
  } finally {
    sqlite.close();
  }
}
