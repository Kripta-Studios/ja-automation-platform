import { hashPassword } from 'better-auth/crypto';
import { createDatabase } from '@ja/database';
import { randomUUID } from 'node:crypto';

// These credentials exist only in the disposable E2E database. They exercise
// the same Better Auth credential flow used by a real invited account; they are
// never shown in the portal and are not valid production credentials.
export const e2eCredentials = {
  owner: { email: 'antonny.luty@j-aautomation.com', password: 'E2E-Owner-Access-2026!' },
  finance: { email: 'finance@demo.jaautomation.local', password: 'E2E-Finance-Access-2026!' },
  manager: { email: 'pm@demo.jaautomation.local', password: 'E2E-Manager-Access-2026!' },
  worker: { email: 'worker@demo.jaautomation.local', password: 'E2E-Worker-Access-2026!' },
} as const;

export async function seedE2ECredentialAccounts(databasePath: string): Promise<void> {
  const database = createDatabase(databasePath);
  try {
    const now = new Date().toISOString();
    for (const account of Object.values(e2eCredentials)) {
      const user = database.sqlite
        .prepare("SELECT id FROM user WHERE email=? AND status='active'")
        .get(account.email) as { id: string } | undefined;
      if (!user) throw new Error(`E2E seed user is missing: ${account.email}`);
      const password = await hashPassword(account.password);
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
        .run(randomUUID(), 'local:credential', user.id, 'credential', user.id, password, now, now);
    }
  } finally {
    database.sqlite.close();
  }
}
