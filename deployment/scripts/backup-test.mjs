import { DatabaseSync, backup } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'ja-backup-'));
try {
  const source = join(dir, 'source.db');
  const target = join(dir, 'backup.db');
  const db = new DatabaseSync(source);
  db.exec("CREATE TABLE evidence(id TEXT PRIMARY KEY) STRICT; INSERT INTO evidence VALUES('ok')");
  await backup(db, target);
  db.close();
  const restored = new DatabaseSync(target);
  const result = restored.prepare('PRAGMA integrity_check').get().integrity_check;
  restored.close();
  if (result !== 'ok') throw new Error(`Backup integrity: ${result}`);
  console.log('online backup test: ok');
} finally {
  await rm(dir, { recursive: true, force: true });
}
