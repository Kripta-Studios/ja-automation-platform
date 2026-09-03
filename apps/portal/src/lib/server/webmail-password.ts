import { createDatabase } from '@ja/database';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { normalizeCorporateEmail, verifyImapCredentials } from './imap-auth';
import { createConfiguredStalwartClient } from './stalwart-client';

type LinkedCredential = Readonly<{
  email: string;
  authMode: 'webmail' | 'hybrid';
  stalwartAccountId: string;
}>;

function hasMailIdentityTable(sqlite: ReturnType<typeof createDatabase>['sqlite']): boolean {
  return Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mail_identity'").get(),
  );
}

function linkedCredentialForHash(hash: string): LinkedCredential | null {
  const { sqlite } = createDatabase();
  try {
    if (!hasMailIdentityTable(sqlite)) return null;
    const rows = sqlite
      .prepare(
        `SELECT u.email, mi.auth_mode authMode, mi.stalwart_account_id stalwartAccountId
         FROM account a
         JOIN user u ON u.id=a.user_id
         JOIN mail_identity mi ON mi.user_id=u.id
         WHERE a.password=? AND a.provider_id='credential'
           AND a.issuer='local:credential' AND a.account_id=u.id
           AND u.status='active' AND mi.status='active'
           AND mi.auth_mode IN ('webmail','hybrid')
         LIMIT 2`,
      )
      .all(hash) as LinkedCredential[];
    if (rows.length !== 1 || !normalizeCorporateEmail(rows[0]!.email)) return null;
    return rows[0]!;
  } catch {
    return null;
  } finally {
    sqlite.close();
  }
}

export async function verifyPortalPassword(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (await verifyPassword(input).catch(() => false)) return true;
  const linked = linkedCredentialForHash(input.hash);
  if (!linked) return false;
  try {
    const stalwart = await createConfiguredStalwartClient();
    const live = await stalwart.listMailboxes();
    if (
      !live.some(
        (mailbox) =>
          mailbox.id === linked.stalwartAccountId && mailbox.email === linked.email.toLowerCase(),
      )
    )
      return false;
  } catch {
    // Delegated authentication is fail-closed when the authoritative account
    // directory cannot confirm that this exact immutable identity still exists.
    return false;
  }
  return verifyImapCredentials(linked.email, input.password);
}

export const hashPortalPassword = hashPassword;

export function isWebmailOnlyUser(userId: string): boolean {
  const { sqlite } = createDatabase();
  try {
    if (!hasMailIdentityTable(sqlite)) return false;
    return Boolean(
      sqlite
        .prepare(
          `SELECT 1 FROM mail_identity mi JOIN user u ON u.id=mi.user_id
           WHERE mi.user_id=? AND mi.auth_mode='webmail'
             AND mi.status='active' AND u.status='active'`,
        )
        .get(userId),
    );
  } finally {
    sqlite.close();
  }
}

export function webmailOnlyUserIdForEmail(emailInput: string): string | null {
  const email = normalizeCorporateEmail(emailInput);
  if (!email) return null;
  const { sqlite } = createDatabase();
  try {
    if (!hasMailIdentityTable(sqlite)) return null;
    const row = sqlite
      .prepare(
        `SELECT u.id FROM mail_identity mi JOIN user u ON u.id=mi.user_id
         WHERE lower(mi.email)=? AND mi.auth_mode='webmail'
           AND mi.status='active' AND u.status='active'`,
      )
      .get(email) as { id: string } | undefined;
    return row?.id ?? null;
  } finally {
    sqlite.close();
  }
}

export function webmailOnlyUserIdForResetToken(token: string): string | null {
  if (!token || /[\0\r\n]/u.test(token)) return null;
  const { sqlite } = createDatabase();
  try {
    if (!hasMailIdentityTable(sqlite)) return null;
    const row = sqlite
      .prepare(
        `SELECT mi.user_id userId FROM verification v
         JOIN mail_identity mi ON mi.user_id=v.value JOIN user u ON u.id=mi.user_id
         WHERE v.identifier=? AND mi.auth_mode='webmail'
           AND mi.status='active' AND u.status='active'`,
      )
      .get(`reset-password:${token}`) as { userId: string } | undefined;
    return row?.userId ?? null;
  } finally {
    sqlite.close();
  }
}
