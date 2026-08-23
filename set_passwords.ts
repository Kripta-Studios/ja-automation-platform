import { hashPassword } from 'better-auth/crypto';
import { createDatabase } from '@ja/database';
import { randomUUID } from 'node:crypto';

async function updatePasswords(dbPath: string) {
  const database = createDatabase(dbPath);
  try {
    const users = database.sqlite.prepare("SELECT id, email FROM user").all() as {id: string, email: string}[];
    
    for (const user of users) {
      const password = user.email.split('@')[0];
      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();
      
      console.log(`Setting password for ${user.email} to: ${password}`);
      
      database.sqlite.prepare(`
        INSERT INTO account(id, issuer, account_id, provider_id, user_id, password, created_at, updated_at)
        VALUES(?, 'local:credential', ?, 'credential', ?, ?, ?, ?)
        ON CONFLICT(provider_id, account_id) DO UPDATE SET
          password=excluded.password,
          updated_at=excluded.updated_at
      `).run(randomUUID(), user.id, user.id, passwordHash, now, now);
    }
    
    try {
      database.sqlite.prepare("DELETE FROM rate_limit").run();
      console.log("Cleared rate_limit table");
    } catch (e) {
      // Ignore
    }
    
    try {
      database.sqlite.prepare("DELETE FROM session").run();
      console.log("Cleared sessions");
    } catch (e) {
      // Ignore
    }
    
    console.log(`Updated passwords in ${dbPath}`);
  } finally {
    database.sqlite.close();
  }
}

async function run() {
  await updatePasswords('packages/database/data/demo.db');
}
run().catch(console.error);
