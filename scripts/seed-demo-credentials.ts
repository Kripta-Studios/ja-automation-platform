import { hashPassword } from 'better-auth/crypto';
import { createDatabase } from '@ja/database';
import { randomUUID } from 'node:crypto';

if (process.env.NODE_ENV === 'production')
  throw new Error('Demo credentials may only be provisioned outside production');

const database = createDatabase();
try {
  const users = database.sqlite
    .prepare("SELECT id,email,role FROM user WHERE status='active' ORDER BY email")
    .all() as Array<{ id: string; email: string; role: string }>;
  const now = new Date().toISOString();
  for (const user of users) {
    const separator = user.email.indexOf('@');
    if (separator <= 0) throw new Error(`Cannot derive a demo password for ${user.email}`);
    const password = user.email.slice(0, separator);
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
  console.log(`Provisioned local demo credentials for ${users.length} active users.`);
} finally {
  database.sqlite.close();
}
