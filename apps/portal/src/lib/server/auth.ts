import { getRequestEvent } from '$app/server';
import { building } from '$app/environment';
import { passkey } from '@better-auth/passkey';
import { createDatabase } from '@ja/database';
import { APIError, betterAuth } from 'better-auth';
import type { AuthMiddleware } from 'better-auth/api';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { twoFactor } from 'better-auth/plugins';
import { authAuditAfter, authAuditBefore } from './auth-audit';
import { resolveAuthOriginConfig } from './auth-origins';
import {
  hashPortalPassword,
  isWebmailOnlyUser,
  verifyPortalPassword,
  webmailOnlyUserIdForResetToken,
} from './webmail-password';

const publicBase = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';
const portalBase = process.env.JA_PORTAL_BASE_PATH ?? `${publicBase}/app`;
const production = process.env.NODE_ENV === 'production';
const authSecret =
  process.env.JA_AUTH_SECRET ??
  (production && !building ? undefined : 'build-only-secret-change-before-runtime');
const authOriginConfig = resolveAuthOriginConfig(
  process.env,
  building ? 'build' : process.env.NODE_ENV,
);

type ActiveAuthUser = NonNullable<App.Locals['user']>;

const invalidCredentialsError = () =>
  APIError.from('UNAUTHORIZED', {
    code: 'INVALID_EMAIL_OR_PASSWORD',
    message: 'Invalid email or password',
  });

const webmailPasswordManagedError = () =>
  APIError.from('FORBIDDEN', {
    code: 'WEBMAIL_PASSWORD_MANAGED_EXTERNALLY',
    message: 'Password changes for this account are managed by Webmail.',
  });

const authBefore: AuthMiddleware = async (context) => {
  const policyContext = context as unknown as {
    path?: string;
    body?: unknown;
    request?: Request;
    context: { session?: { user?: { id?: string } } | null };
  };
  const path = policyContext.path?.includes('/api/auth')
    ? policyContext.path.slice(policyContext.path.indexOf('/api/auth') + '/api/auth'.length)
    : policyContext.path;
  if (path === '/change-password' || path === '/set-password') {
    const userId = policyContext.context.session?.user?.id;
    if (userId && isWebmailOnlyUser(userId)) throw webmailPasswordManagedError();
  } else if (path === '/reset-password') {
    const body = policyContext.body as { token?: unknown } | undefined;
    let token = typeof body?.token === 'string' ? body.token : null;
    if (!token && policyContext.request?.url) {
      try {
        token = new URL(policyContext.request.url).searchParams.get('token');
      } catch {
        token = null;
      }
    }
    if (token && webmailOnlyUserIdForResetToken(token)) throw webmailPasswordManagedError();
  }
  return authAuditBefore(context);
};

/**
 * Resolve the canonical product user behind a Better Auth session. Any
 * non-active state is an authentication boundary, not merely a UI state. All
 * sessions are revoked before the request reaches a Better Auth account,
 * passkey or MFA endpoint, preventing an old cookie from retaining authority.
 */
export function revokeSessionsUnlessUserIsActive(userId: string): ActiveAuthUser | null {
  const { sqlite } = createDatabase();
  try {
    const user = sqlite
      .prepare(
        'SELECT id,name,email,role,status,mfa_enrolled mfaEnrolled,mfa_required mfaRequired FROM user WHERE id=?',
      )
      .get(userId) as ActiveAuthUser | undefined;
    if (user?.status === 'active') return user;
    sqlite.prepare('DELETE FROM session WHERE user_id=?').run(userId);
    return null;
  } finally {
    sqlite.close();
  }
}

export const auth = betterAuth({
  appName: 'J&A Automation',
  database: createDatabase().sqlite,
  baseURL: authOriginConfig.baseURL,
  trustedOrigins: authOriginConfig.trustedOrigins,
  basePath: `${portalBase}/api/auth`,
  secret: authSecret,
  user: {
    modelName: 'user',
    fields: { emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' },
    additionalFields: {
      role: { type: 'string', required: true, defaultValue: 'worker', input: false },
      status: { type: 'string', required: true, defaultValue: 'invited', input: false },
      mfaEnrolled: {
        type: 'boolean',
        required: true,
        defaultValue: false,
        input: false,
        fieldName: 'mfa_enrolled',
      },
      mfaRequired: {
        type: 'boolean',
        required: true,
        defaultValue: false,
        input: false,
        fieldName: 'mfa_required',
      },
    },
  },
  session: {
    modelName: 'session',
    fields: {
      userId: 'user_id',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  account: {
    modelName: 'account',
    fields: {
      issuer: 'issuer',
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      scope: 'scope',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  verification: {
    modelName: 'verification',
    fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
  },
  emailAndPassword: {
    enabled: true,
    // Invitation acceptance provisions the credential before the canonical
    // account transaction activates it. Do not let Better Auth create a
    // session for the still-invited identity; the normal sign-in path remains
    // available once activation has committed.
    autoSignIn: false,
    // New accounts are created only through the server-side invitation flow.
    // The public endpoint is denied in hooks.server.ts; invitations still use
    // Better Auth's own password hashing and account creation implementation.
    requireEmailVerification: production,
    minPasswordLength: production ? 12 : 1,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    password: { hash: hashPortalPassword, verify: verifyPortalPassword },
  },
  databaseHooks: {
    session: {
      create: {
        async before(session, context) {
          // Every password, passkey and MFA sign-in converges on session
          // creation. Enforcing status here closes all credential mechanisms
          // without reimplementing any Better Auth protocol.
          if (!context) throw invalidCredentialsError();
          const user = await context.context.internalAdapter.findUserById(session.userId);
          if (!user || (user as Record<string, unknown>).status !== 'active')
            throw invalidCredentialsError();
        },
      },
    },
  },
  advanced: { useSecureCookies: production, cookiePrefix: 'ja_portal' },
  // Plugin-owned passkey and recovery endpoints must share the application's
  // reviewed audit boundary. The hooks fail closed before a mutation and
  // compensate a Better Auth mutation if the canonical audit write fails.
  hooks: {
    before: authBefore,
    after: authAuditAfter,
  },
  plugins: [
    twoFactor({
      issuer: 'J&A Automation',
      twoFactorTable: 'two_factor',
      // Keep Better Auth's camelCase model keys aligned with the reviewed
      // snake_case SQLite schema. Without these mappings the adapter attempts
      // to write columns such as `twoFactorEnabled` on a production database.
      schema: {
        user: { fields: { twoFactorEnabled: 'two_factor_enabled' } },
        twoFactor: {
          fields: {
            backupCodes: 'backup_codes',
            userId: 'user_id',
            failedVerificationCount: 'failed_verification_count',
            lockedUntil: 'locked_until',
          },
        },
      },
    }),
    passkey({
      rpID: process.env.JA_WEBAUTHN_RP_ID ?? 'localhost',
      rpName: 'J&A Automation',
      origin: authOriginConfig.webauthnOrigin,
      // Keep Better Auth's passkey model keys aligned with the reviewed
      // snake_case SQLite schema. This also prevents the management endpoint
      // from issuing 500 responses before a user can complete sign-in.
      schema: {
        passkey: {
          fields: {
            publicKey: 'public_key',
            userId: 'user_id',
            credentialID: 'credential_id',
            deviceType: 'device_type',
            backedUp: 'backed_up',
            transports: 'transports',
            createdAt: 'created_at',
            aaguid: 'aaguid',
          },
        },
      },
    }),
    sveltekitCookies(getRequestEvent),
  ],
});
