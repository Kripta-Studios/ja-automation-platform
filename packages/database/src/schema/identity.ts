import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { lifecycle } from './shared.ts';

export const users = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('worker'),
  status: text('status').notNull().default('invited'),
  mfaEnrolled: integer('mfa_enrolled', { mode: 'boolean' }).notNull().default(false),
  mfaRequired: integer('mfa_required', { mode: 'boolean' }).notNull().default(false),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
  offboardedAt: text('offboarded_at'),
  lastStepUpAt: text('last_step_up_at'),
  version: integer('version').notNull().default(1),
  ...lifecycle,
});

export const sessions = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    stepUpAt: text('step_up_at'),
  },
  (table) => [index('session_user_idx').on(table.userId)],
);

export const invitations = sqliteTable('invitation', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  role: text('role').notNull(),
  invitedBy: text('invited_by')
    .notNull()
    .references(() => users.id),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull(),
});

// The tables below are intentionally declared alongside the operational
// tables rather than hidden in generated output. This keeps Drizzle's model
// aligned with reviewed migrations 0001–0018 and makes schema review useful.
export const accounts = sqliteTable('account', {
  id: text('id').primaryKey(),
  issuer: text('issuer').notNull().default('local:credential'),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: text('access_token_expires_at'),
  refreshTokenExpiresAt: text('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const mailIdentities = sqliteTable(
  'mail_identity',
  {
    userId: text('user_id').primaryKey(),
    stalwartAccountId: text('stalwart_account_id').notNull().unique(),
    email: text('email').notNull().unique(),
    authMode: text('auth_mode').notNull(),
    status: text('status').notNull().default('active'),
    linkedBy: text('linked_by'),
    linkedAt: text('linked_at').notNull(),
    archivedAt: text('archived_at'),
    updatedAt: text('updated_at').notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [index('mail_identity_status_idx').on(table.status, table.email)],
);

export const verifications = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const passkeys = sqliteTable('passkey', {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id').notNull(),
  credentialId: text('credential_id').notNull().unique(),
  counter: integer('counter').notNull(),
  deviceType: text('device_type').notNull(),
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
  transports: text('transports'),
  createdAt: text('created_at').notNull(),
  aaguid: text('aaguid'),
});

export const twoFactors = sqliteTable('two_factor', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  userId: text('user_id').notNull().unique(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  failedVerificationCount: integer('failed_verification_count').notNull().default(0),
  lockedUntil: text('locked_until'),
});
