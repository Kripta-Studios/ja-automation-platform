import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackup } from './backup.mjs';
import { restoreBackup } from './restore.mjs';
const dir = await mkdtemp(join(tmpdir(), 'ja-backup-'));
try {
  const source = join(dir, 'source.db');
  const documents = join(dir, 'documents');
  const backupRoot = join(dir, 'backups');
  await mkdir(documents, { recursive: true });
  await writeFile(join(documents, 'receipt.txt'), 'private receipt evidence\n', 'utf8');
  const db = new DatabaseSync(source);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE evidence(id TEXT PRIMARY KEY) STRICT; INSERT INTO evidence VALUES('ok')",
  );
  db.close();
  const created = await createBackup({ databasePath: source, documentRoot: documents, backupRoot });
  const restored = await restoreBackup({
    backupPath: created.path,
    databasePath: join(dir, 'restored', 'app.db'),
    documentRoot: join(dir, 'restored', 'documents'),
  });
  const restoredDb = new DatabaseSync(restored.databasePath);
  const row = restoredDb.prepare('SELECT id FROM evidence').get();
  restoredDb.close();
  if (
    row?.id !== 'ok' ||
    restored.integrity !== 'ok' ||
    restored.foreignKeys !== 1 ||
    restored.documentCount !== 1
  )
    throw new Error('Backup/restore evidence mismatch');
  console.log('online backup and restore test: ok');
} finally {
  await rm(dir, { recursive: true, force: true });
}
