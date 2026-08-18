import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'ja-restore-'));
try {
  const path = join(dir, 'restore.db');
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE manifest(sha256 TEXT NOT NULL) STRICT; INSERT INTO manifest VALUES('verified')",
  );
  const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
  const rows = db.prepare('SELECT count(*) count FROM manifest').get().count;
  db.close();
  if (integrity !== 'ok' || rows !== 1) throw new Error('Restore check failed');
  console.log('disposable restore test: ok');
} finally {
  await rm(dir, { recursive: true, force: true });
}
