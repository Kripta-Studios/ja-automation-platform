import { backup, DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendOperationalAlert } from './alerts.mjs';
import {
  assertNoSymlinkComponents,
  assertSafePath,
  assertSafeTree,
  removeSafePath,
} from './storage-safety.mjs';

async function fileEntries(root, current = root) {
  const entries = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    const checked = await assertSafePath(path, { label: 'backup document entry' });
    if (checked.stats.isDirectory()) entries.push(...(await fileEntries(root, path)));
    else if (checked.stats.isFile()) {
      const bytes = await readFile(path);
      entries.push({
        path: relative(root, path).replaceAll('\\', '/'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteLength: bytes.byteLength,
      });
    } else {
      throw new Error('Backup document entry must be a regular file');
    }
  }
  return entries;
}

async function copyDocumentSnapshot(source, target) {
  const sourceCheck = await assertSafePath(source, {
    allowMissing: true,
    directory: true,
    label: 'private document root',
  });
  if (!sourceCheck.exists) {
    await mkdir(target, { recursive: false });
    return;
  }
  await assertSafeTree(source, { label: 'private document root' });
  await cp(source, target, { recursive: true, force: false, errorOnExist: true });
  // Hash the copied snapshot, never the live source tree. A source mutation
  // after cp therefore cannot make the manifest describe different bytes.
  await assertSafeTree(target, { label: 'backup document snapshot' });
}

async function retention(root, currentStamp) {
  const retentionDays = Number.parseInt(process.env.JA_BACKUP_RETENTION_DAYS ?? '30', 10);
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) return;
  const cutoff = Date.now() - retentionDays * 86_400_000;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === currentStamp) continue;
    const entryPath = resolve(root, entry.name);
    const checked = await assertSafePath(entryPath, { label: 'backup retention entry' });
    if (!checked.stats.isDirectory()) continue;
    if (checked.stats.mtimeMs < cutoff)
      await removeSafePath(entryPath, { recursive: true, label: 'backup retention entry' });
  }
}

export async function createBackup({ databasePath, documentRoot, backupRoot }) {
  const sourcePath = resolve(databasePath);
  const documentsPath = resolve(documentRoot);
  const root = resolve(backupRoot);

  const databaseCheck = await assertSafePath(sourcePath, { label: 'source database' });
  if (!databaseCheck.stats.isFile()) throw new Error('Source database must be a regular file');
  await assertSafePath(documentsPath, {
    allowMissing: true,
    directory: true,
    label: 'private document root',
  });
  await assertNoSymlinkComponents(root, { allowMissing: true, label: 'backup root' });
  await mkdir(root, { recursive: true });
  await assertSafePath(root, { directory: true, label: 'backup root' });

  const stamp = `${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}-${randomUUID()}`;
  const target = resolve(root, stamp);
  await assertSafePath(target, { allowMissing: true, label: 'backup target' });
  await mkdir(target, { recursive: false });
  await assertSafeTree(target, { label: 'backup target' });

  const temporaryDatabase = resolve(target, 'database.db.partial');
  const databaseTarget = resolve(target, 'database.db');
  const documentsTarget = resolve(target, 'documents');
  try {
    const source = new DatabaseSync(sourcePath);
    try {
      await backup(source, temporaryDatabase);
    } finally {
      source.close();
    }
    await writeFile(databaseTarget, await readFile(temporaryDatabase), { flag: 'wx' });
    await removeSafePath(temporaryDatabase, { label: 'temporary backup database' });

    await copyDocumentSnapshot(documentsPath, documentsTarget);
    const documents = await fileEntries(documentsTarget);
    const databaseBytes = await readFile(databaseTarget);
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      database: {
        path: 'database.db',
        sha256: createHash('sha256').update(databaseBytes).digest('hex'),
        byteLength: databaseBytes.byteLength,
      },
      documents: documents.sort((left, right) => left.path.localeCompare(right.path)),
    };
    await writeFile(resolve(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await assertSafeTree(target, { label: 'completed backup' });
    await retention(root, stamp);
    return { path: target, manifest };
  } catch (error) {
    // Never recursively delete an unvalidated path. If an attacker races this
    // cleanup by replacing the target with a symlink, removeSafePath refuses.
    await removeSafePath(target, { recursive: true, label: 'failed backup target' }).catch(
      () => undefined,
    );
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const result = await createBackup({
      databasePath:
        process.env.JA_DATABASE_PATH ?? resolve('/var/lib/jaautomation/data/jaautomation.sqlite'),
      documentRoot: process.env.JA_DOCUMENT_ROOT ?? resolve('/var/lib/jaautomation/files'),
      backupRoot: process.env.JA_BACKUP_ROOT ?? '/var/backups/jaautomation',
    });
    console.log(
      `backup=${result.path} documents=${result.manifest.documents.length} sha256=${result.manifest.database.sha256}`,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'backup.failed',
        error: error instanceof Error ? error.message : 'unknown error',
      }),
    );
    await sendOperationalAlert('backup.failed', {
      error: error instanceof Error ? error.message : 'unknown error',
    }).catch((alertError) =>
      console.error(
        JSON.stringify({
          event: 'alerts.delivery.failed',
          error: alertError instanceof Error ? alertError.message : 'unknown error',
        }),
      ),
    );
    process.exitCode = 1;
  }
}
