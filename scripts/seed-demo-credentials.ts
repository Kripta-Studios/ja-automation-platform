import { hashPassword } from 'better-auth/crypto';
import { createDatabase } from '@ja/database';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  canonicalFixturePath,
  isSyntheticEmail,
  isSyntheticSecret,
  requiredEnvironment,
  requiredFixtureSentinel,
  verifyFixtureDatabase,
} from './isolated-test-guards.ts';

if (process.env.NODE_ENV === 'production')
  throw new Error('Demo credentials may only be provisioned outside production');

const fixtureSentinel = requiredFixtureSentinel();
const confirmation = requiredEnvironment('JA_FIXTURE_CONFIRMATION');
if (confirmation !== fixtureSentinel)
  throw new Error('JA_FIXTURE_CONFIRMATION must match the opaque fixture sentinel.');

const configuredDatabasePath = process.env.JA_DATABASE_PATH?.trim();
if (!configuredDatabasePath)
  throw new Error('JA_DATABASE_PATH must be explicit for demo credential provisioning.');

// Validate the DB in read-only mode before the writable connection is opened.
const databasePath = verifyFixtureDatabase(configuredDatabasePath, fixtureSentinel);

function readCredentialMapping(): Readonly<Record<string, string>> {
  const inline = process.env.JA_DEMO_CREDENTIALS_JSON?.trim();
  const file = process.env.JA_DEMO_CREDENTIALS_FILE?.trim();
  if (inline && file) throw new Error('Provide only one demo credential mapping source.');
  if (!inline && !file)
    throw new Error(
      'JA_DEMO_CREDENTIALS_JSON or JA_DEMO_CREDENTIALS_FILE is required; passwords are never derived.',
    );

  let raw: string;
  if (inline) raw = inline;
  else {
    const mappingPath = canonicalFixturePath(file!, {
      token: fixtureSentinel,
      requireToken: true,
      requireExisting: true,
      extensions: ['.json'],
    });
    try {
      raw = readFileSync(mappingPath, 'utf8');
    } catch {
      throw new Error('Demo credential mapping file could not be read.');
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Demo credential mapping must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Demo credential mapping must be an object keyed by user email.');
  const mapping: Record<string, string> = {};
  for (const [email, password] of Object.entries(parsed as Record<string, unknown>)) {
    if (
      !isSyntheticEmail(email) ||
      typeof password !== 'string' ||
      !isSyntheticSecret(password, email)
    )
      throw new Error('Demo credential mapping contains an invalid synthetic secret.');
    mapping[email] = password;
  }
  if (Object.keys(mapping).length === 0)
    throw new Error('Demo credential mapping must contain at least one account.');
  return mapping;
}

const credentials = readCredentialMapping();
const database = createDatabase(databasePath);
try {
  const users = database.sqlite
    .prepare("SELECT id,email FROM user WHERE status='active' ORDER BY email")
    .all() as Array<{ id: string; email: string }>;
  const knownEmails = new Set(users.map((user) => user.email));
  if (users.some((user) => !isSyntheticEmail(user.email)))
    throw new Error('Demo credential provisioning requires reserved synthetic account emails.');
  if (users.some((user) => !credentials[user.email]))
    throw new Error('Demo credential mapping is missing an active fixture account.');
  if (Object.keys(credentials).some((email) => !knownEmails.has(email)))
    throw new Error('Demo credential mapping contains an unknown fixture account.');

  const now = new Date().toISOString();
  for (const user of users) {
    const password = credentials[user.email];
    if (!password) throw new Error('Demo credential mapping is incomplete.');
    const passwordHash = await hashPassword(password);
    database.sqlite
      .prepare(
        `INSERT INTO account(id,issuer,account_id,provider_id,user_id,password,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?)
         ON CONFLICT(provider_id,account_id) DO UPDATE SET
           issuer=excluded.issuer,
           user_id=excluded.user_id,
           password=excluded.password,
           updated_at=excluded.updated_at`,
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
  database.sqlite.prepare('DELETE FROM session').run();
  database.sqlite.prepare('DELETE FROM rate_limit_bucket').run();
  // Counts are operational feedback only; no email, password or row is emitted.
  console.log(`Provisioned local fixture credentials for ${users.length} active accounts.`);
} finally {
  database.sqlite.close();
}
