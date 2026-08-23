import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { lstatSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBackup } from '../../deployment/scripts/backup.mjs';
import { restoreBackup } from '../../deployment/scripts/restore.mjs';

const roots: string[] = [];

function hash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ja-health-backup-'));
  roots.push(root);
  const source = join(root, 'source.db');
  const documents = join(root, 'documents');
  const backups = join(root, 'backups');
  await mkdir(documents, { recursive: true });
  const sqlite = new DatabaseSync(source);
  sqlite.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE evidence(id TEXT PRIMARY KEY) STRICT; INSERT INTO evidence VALUES('old')",
  );
  sqlite.close();
  await writeFile(join(documents, 'receipt.txt'), 'snapshot-a\n', 'utf8');
  const created = await createBackup({
    databasePath: source,
    documentRoot: documents,
    backupRoot: backups,
  });
  return { root, source, documents, backups, created };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function symlinkType(directory: boolean) {
  return process.platform === 'win32' && directory ? 'junction' : 'file';
}

describe('Client Essential backup/restore safety', () => {
  it('hashes the copied document snapshot rather than live files', async () => {
    const value = await fixture();
    const original = Buffer.from('snapshot-a\n', 'utf8');
    expect(value.created.manifest.documents).toEqual([
      { path: 'receipt.txt', sha256: hash(original), byteLength: original.byteLength },
    ]);

    await writeFile(join(value.documents, 'receipt.txt'), 'mutated-after-snapshot\n', 'utf8');
    const copied = await readFile(join(value.created.path, 'documents', 'receipt.txt'));
    expect(copied.equals(original)).toBe(true);
    expect(value.created.manifest.documents[0]?.sha256).toBe(hash(copied));
  });

  it('rejects symlink roots, path components and entries during backup/restore', async () => {
    let symlinksAvailable = true;
    const probe = await mkdtemp(join(tmpdir(), 'ja-symlink-probe-'));
    roots.push(probe);
    try {
      symlinkSync(join(probe, 'missing'), join(probe, 'link'));
    } catch {
      symlinksAvailable = false;
    }
    if (!symlinksAvailable) return;

    const source = join(probe, 'source.db');
    const documents = join(probe, 'documents');
    await mkdir(documents, { recursive: true });
    const sqlite = new DatabaseSync(source);
    sqlite.exec(
      "CREATE TABLE evidence(id TEXT PRIMARY KEY) STRICT; INSERT INTO evidence VALUES('ok')",
    );
    sqlite.close();
    const outside = join(probe, 'outside');
    await mkdir(outside, { recursive: true });
    symlinkSync(outside, join(documents, 'linked-dir'), symlinkType(true));
    await expect(
      createBackup({
        databasePath: source,
        documentRoot: documents,
        backupRoot: join(probe, 'backups'),
      }),
    ).rejects.toThrow(/symbolic link/u);

    unlinkSync(join(documents, 'linked-dir'));
    const safe = await createBackup({
      databasePath: source,
      documentRoot: documents,
      backupRoot: join(probe, 'backups'),
    });
    symlinkSync(outside, join(safe.path, 'documents', 'linked-dir'), symlinkType(true));
    await expect(
      restoreBackup({
        backupPath: safe.path,
        databasePath: join(probe, 'restored.db'),
        documentRoot: join(probe, 'restored-documents'),
      }),
    ).rejects.toThrow(/symbolic link/u);

    const linkedBackupRoot = join(probe, 'linked-backups');
    symlinkSync(join(probe, 'backups'), linkedBackupRoot, symlinkType(true));
    await expect(
      createBackup({ databasePath: source, documentRoot: documents, backupRoot: linkedBackupRoot }),
    ).rejects.toThrow(/symbolic link/u);
  });

  it('restores allowOverwrite failure-atomically after the first swap move', async () => {
    const value = await fixture();
    const targetDatabase = join(value.root, 'target', 'app.db');
    const targetDocuments = join(value.root, 'target', 'documents');
    await mkdir(targetDocuments, { recursive: true });
    const targetSqlite = new DatabaseSync(targetDatabase);
    targetSqlite.exec(
      "CREATE TABLE evidence(id TEXT PRIMARY KEY) STRICT; INSERT INTO evidence VALUES('original')",
    );
    targetSqlite.close();
    await writeFile(join(targetDocuments, 'receipt.txt'), 'original-document\n', 'utf8');

    await expect(
      restoreBackup({
        backupPath: value.created.path,
        databasePath: targetDatabase,
        documentRoot: targetDocuments,
        allowOverwrite: true,
        hooks: {
          afterDatabaseMove: () => {
            throw new Error('injected swap failure');
          },
        },
      }),
    ).rejects.toThrow('injected swap failure');

    const restoredTarget = new DatabaseSync(targetDatabase);
    expect(restoredTarget.prepare('SELECT id FROM evidence').get().id).toBe('original');
    restoredTarget.close();
    expect(readFileSync(join(targetDocuments, 'receipt.txt'), 'utf8')).toBe('original-document\n');
    expect(lstatSync(targetDatabase).isSymbolicLink()).toBe(false);
    expect(lstatSync(targetDocuments).isSymbolicLink()).toBe(false);
  });
});
