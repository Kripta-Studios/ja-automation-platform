import { backup, DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { chown, chmod, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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

async function grantBackupReader(path, gid) {
  const { stats } = await assertSafePath(path, { label: 'backup reader permissions' });
  await chown(path, stats.uid, gid);
  await chmod(path, stats.isDirectory() ? 0o2750 : 0o640);
  if (stats.isDirectory())
    for (const entry of await readdir(path)) await grantBackupReader(join(path, entry), gid);
}

function retentionDaysConfigured() {
  const retentionDays = Number(process.env.JA_BACKUP_RETENTION_DAYS ?? '3');
  if (retentionDays !== 3) throw new Error('Backup retention must be exactly 3 days');
  return retentionDays;
}

const backupDayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function backupDay(timestamp) {
  const parts = Object.fromEntries(
    backupDayFormatter.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function completedSnapshots(root) {
  const snapshots = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{9}Z-[0-9a-f-]{36}$/u.test(entry.name)) continue;
    const entryPath = resolve(root, entry.name);
    const checked = await assertSafePath(entryPath, { label: 'backup retention entry' });
    if (!checked.stats.isDirectory()) continue;
    // mtime changes during copies/cleanup and is not the snapshot's age.
    let manifest;
    try {
      manifest = JSON.parse(await readFile(resolve(entryPath, 'manifest.json'), 'utf8'));
    } catch {
      continue;
    }
    const createdAt = Date.parse(manifest.createdAt);
    if (manifest.format !== 1 || !Number.isFinite(createdAt)) continue;
    snapshots.push({ name: entry.name, path: entryPath, createdAt, day: backupDay(createdAt) });
  }
  return snapshots;
}

async function retention(root, currentStamp, retentionDays, now = Date.now()) {
  const cutoff = now - retentionDays * 86_400_000;
  const snapshots = await completedSnapshots(root);
  const recent = snapshots.filter(({ createdAt }) => createdAt > cutoff);
  const retainedDays = new Set(
    [...new Set(recent.map(({ day }) => day))].sort().slice(-retentionDays),
  );
  recent.sort(
    (left, right) =>
      Number(right.name === currentStamp) - Number(left.name === currentStamp) ||
      right.createdAt - left.createdAt ||
      right.name.localeCompare(left.name),
  );
  const retained = new Set();
  const retainedByDay = new Set();
  for (const snapshot of recent) {
    if (!retainedDays.has(snapshot.day) || retainedByDay.has(snapshot.day)) continue;
    retained.add(snapshot.path);
    retainedByDay.add(snapshot.day);
  }
  let removed = 0;
  for (const snapshot of snapshots) {
    if (snapshot.name === currentStamp || retained.has(snapshot.path)) continue;
    await removeSafePath(snapshot.path, { recursive: true, label: 'backup retention entry' });
    removed += 1;
  }
  const remainingDays = new Set();
  for (const snapshot of await completedSnapshots(root)) {
    if (snapshot.createdAt <= cutoff || remainingDays.has(snapshot.day))
      throw new Error('Backup retention check failed: expired or duplicate snapshot remains');
    remainingDays.add(snapshot.day);
  }
  if (remainingDays.size > retentionDays)
    throw new Error('Backup retention check failed: too many days remain');
  return removed;
}

export async function pruneExpiredBackups({
  backupRoot = process.env.JA_BACKUP_ROOT ?? '/var/backups/jaautomation',
  now = new Date(),
} = {}) {
  const retentionDays = retentionDaysConfigured();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error('Backup retention time is invalid');
  const root = resolve(backupRoot);
  await assertNoSymlinkComponents(root, { allowMissing: true, label: 'backup root' });
  const checked = await assertSafePath(root, {
    allowMissing: true,
    directory: true,
    label: 'backup root',
  });
  if (!checked.exists) return { removed: 0 };
  return { removed: await retention(root, null, retentionDays, now.getTime()) };
}

export async function createBackup({ databasePath, documentRoot, backupRoot }) {
  const retentionDays = retentionDaysConfigured();
  const readerGroup = process.env.JA_BACKUP_READER_GID;
  if (
    readerGroup !== undefined &&
    (!/^[0-9]+$/.test(readerGroup) || !Number.isSafeInteger(Number(readerGroup)))
  )
    throw new Error('Backup reader group must be a numeric gid');
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
  let manifest;
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
    manifest = {
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
    if (readerGroup !== undefined) {
      await chown(
        root,
        (await assertSafePath(root, { directory: true })).stats.uid,
        Number(readerGroup),
      );
      await chmod(root, 0o2750);
      await grantBackupReader(target, Number(readerGroup));
    }
  } catch (error) {
    // Never recursively delete an unvalidated path. If an attacker races this
    // cleanup by replacing the target with a symlink, removeSafePath refuses.
    await removeSafePath(target, { recursive: true, label: 'failed backup target' }).catch(
      () => undefined,
    );
    throw error;
  }
  // Keep the completed snapshot if cleanup fails; it may be needed for recovery.
  await retention(root, stamp, retentionDays);
  return { path: target, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    if (process.argv[2] === '--prune') {
      const result = await pruneExpiredBackups();
      console.log(`backup_retention_checked=1 backups_removed=${result.removed}`);
    } else {
      const result = await createBackup({
        databasePath:
          process.env.JA_DATABASE_PATH ?? resolve('/var/lib/jaautomation/data/jaautomation.sqlite'),
        documentRoot: process.env.JA_DOCUMENT_ROOT ?? resolve('/var/lib/jaautomation/files'),
        backupRoot: process.env.JA_BACKUP_ROOT ?? '/var/backups/jaautomation',
      });
      console.log(
        `backup=${result.path} documents=${result.manifest.documents.length} sha256=${result.manifest.database.sha256}`,
      );
    }
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
