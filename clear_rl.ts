import { createDatabase } from '@ja/database';
const db = createDatabase('packages/database/data/demo.db');
try {
  db.sqlite.prepare('DELETE FROM rate_limit_bucket').run();
  console.log('Cleared rate_limit_bucket');
} catch (e) {
  console.log('No rate_limit_bucket table or error:', e.message);
}
db.sqlite.close();
