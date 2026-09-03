import { hashPassword } from 'better-auth/crypto';
import { createDatabase, recordAuditEvent } from '@ja/database';
import { randomUUID } from 'node:crypto';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readSecret(prompt: string): Promise<string> {
  const configured = process.env.JA_BOOTSTRAP_PASSWORD;
  if (configured) return configured;
  if (!process.stdin.isTTY || !process.stdin.setRawMode)
    throw new Error('Set JA_BOOTSTRAP_PASSWORD when running without an interactive terminal.');

  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdin.off('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') return finish(new Error('Bootstrap cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f') value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

const email = process.env.JA_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const name = process.env.JA_BOOTSTRAP_NAME?.trim();
if (!email || !emailPattern.test(email) || email.length > 254)
  throw new Error('JA_BOOTSTRAP_EMAIL must be a valid company email address.');
if (email !== 'antonny.luty@j-aautomation.com')
  throw new Error('JA_BOOTSTRAP_EMAIL must be antonny.luty@j-aautomation.com.');
if (!name || name.length < 2 || name.length > 120)
  throw new Error('JA_BOOTSTRAP_NAME must contain 2–120 characters.');

const password = await readSecret('Create owner password (12+ characters): ');
if (password.length < 12 || password.length > 128)
  throw new Error('The owner password must contain 12–128 characters.');
const confirmation = process.env.JA_BOOTSTRAP_PASSWORD
  ? password
  : await readSecret('Confirm owner password: ');
if (password !== confirmation) throw new Error('The owner passwords do not match.');

const passwordHash = await hashPassword(password);
const database = createDatabase();
const now = new Date().toISOString();
const userId = randomUUID();
try {
  database.sqlite.exec('BEGIN IMMEDIATE');
  const existing = database.sqlite
    .prepare('SELECT id,status FROM user WHERE lower(email)=?')
    .get(email) as { id: string; status: string } | undefined;
  if (existing) throw new Error(`An account already exists for ${email} (${existing.status}).`);
  const anotherOwner = database.sqlite
    .prepare("SELECT id,email FROM user WHERE role='owner_admin' LIMIT 1")
    .get();
  if (anotherOwner)
    throw new Error('A non-canonical Owner already exists; resolve it before bootstrap.');

  database.sqlite
    .prepare(
      `INSERT INTO user(
         id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
       ) VALUES(?,?,?,1,'owner_admin','active',0,0,?,?,1)`,
    )
    .run(userId, name, email, now, now);
  database.sqlite
    .prepare(
      `INSERT INTO account(
         id,issuer,account_id,provider_id,user_id,password,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?)`,
    )
    .run(randomUUID(), 'local:credential', userId, 'credential', userId, passwordHash, now, now);
  recordAuditEvent(database.sqlite, null, 'user.bootstrap', 'user', userId, {
    role: 'owner_admin',
    mfaRequired: false,
    reason: 'Initial owner account provisioned by an operator.',
    source: 'bootstrap-cli',
  });
  database.sqlite.exec('COMMIT');
} catch (error) {
  try {
    database.sqlite.exec('ROLLBACK');
  } catch {
    // The original error is more useful than a secondary rollback error.
  }
  throw error;
} finally {
  database.sqlite.close();
}

console.log(
  `Owner account created for ${email}. Sign in at ${process.env.JA_PORTAL_BASE_PATH ?? '/j-aautomation/app'}/login. MFA can be enabled optionally from the profile.`,
);
