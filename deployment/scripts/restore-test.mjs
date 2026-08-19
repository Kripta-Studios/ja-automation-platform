import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackup } from './backup.mjs';
import { restoreBackup } from './restore.mjs';
const dir = await mkdtemp(join(tmpdir(), 'ja-restore-'));
try {
  const source = join(dir, 'source.db');
  const documents = join(dir, 'documents');
  await mkdir(documents, { recursive: true });
  await writeFile(join(documents, 'manifest.txt'), 'verified\n', 'utf8');
  const db = new DatabaseSync(source);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE manifest(sha256 TEXT NOT NULL) STRICT; INSERT INTO manifest VALUES('verified')",
  );
  db.close();
  const backup = await createBackup({
    databasePath: source,
    documentRoot: documents,
    backupRoot: join(dir, 'backups'),
  });
  const restored = await restoreBackup({
    backupPath: backup.path,
    databasePath: join(dir, 'restored.db'),
    documentRoot: join(dir, 'restored-documents'),
  });
  const restoredDb = new DatabaseSync(restored.databasePath);
  const rows = restoredDb.prepare('SELECT count(*) count FROM manifest').get().count;
  restoredDb.close();
  if (
    restored.integrity !== 'ok' ||
    restored.foreignKeys !== 1 ||
    rows !== 1 ||
    restored.documentCount !== 1
  )
    throw new Error('Restore check failed');
  console.log('verified safe SQLite restore: ok');
} finally {
  await rm(dir, { recursive: true, force: true });
}
