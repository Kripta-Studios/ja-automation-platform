import { getRequestEvent } from '$app/server';
import { building } from '$app/environment';
import { passkey } from '@better-auth/passkey';
import { createDatabase } from '@ja/database';
import { betterAuth } from 'better-auth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { twoFactor } from 'better-auth/plugins';

const publicBase = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';
const portalBase = process.env.JA_PORTAL_BASE_PATH ?? `${publicBase}/app`;
const production = process.env.NODE_ENV === 'production';
const authSecret =
  process.env.JA_AUTH_SECRET ??
  (production && !building ? undefined : 'build-only-secret-change-before-runtime');

export const auth = betterAuth({
  appName: 'J&A Automation',
  database: createDatabase().sqlite,
  baseURL: process.env.ORIGIN ?? process.env.JA_WEBAUTHN_ORIGIN ?? 'http://localhost:5174',
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
    // New accounts are created only through the server-side invitation flow.
    // The public endpoint is denied in hooks.server.ts; invitations still use
    // Better Auth's own password hashing and account creation implementation.
    requireEmailVerification: production,
    minPasswordLength: production ? 12 : 1,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  advanced: { useSecureCookies: production, cookiePrefix: 'ja_portal' },
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
      origin: process.env.ORIGIN ?? process.env.JA_WEBAUTHN_ORIGIN ?? 'http://localhost:5174',
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
