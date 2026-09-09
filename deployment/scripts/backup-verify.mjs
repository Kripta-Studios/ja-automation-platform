import { DatabaseSync } from 'node:sqlite';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupFileMetadata, verifyLocalBackupMetadata } from './continuity-backup.mjs';
import { assertSafePath, assertSafeTree } from './storage-safety.mjs';

// Only our timestamped, completed snapshots are retention/verification candidates.
export const BACKUP_DIRECTORY = /^\d{4}-\d{2}-\d{2}T\d{9}Z-[0-9a-f-]{36}$/u;
export async function backupInventory(backupRoot) {
  await assertSafePath(backupRoot, { directory: true, label: 'backup root' });
  const snapshots = [];
  for (const entry of await readdir(backupRoot, { withFileTypes: true })) {
    if (!BACKUP_DIRECTORY.test(entry.name)) continue;
    const path = resolve(backupRoot, entry.name);
    await assertSafeTree(path, { label: 'backup snapshot' });
    let manifest;
    try {
      manifest = JSON.parse(await readFile(resolve(path, 'manifest.json'), 'utf8'));
    } catch (error) {
      // A concurrent backup publishes its manifest only after copying all bytes.
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const createdAt = Date.parse(manifest.createdAt);
    if (manifest.format !== 1 || !Number.isFinite(createdAt))
      throw new Error('Backup timestamp/format invalid');
    snapshots.push({ path, createdAt, manifest });
  }
  return snapshots.sort((a, b) => b.createdAt - a.createdAt);
}

async function isolatedSnapshot(source) {
  // Stream the corpus in place. Only SQLite needs an isolated writable location;
  // copying private artifacts into the jobs /tmp tmpfs would duplicate them in RAM.
  const verified = await verifyLocalBackupMetadata(source, { allowEmptySqliteSidecars: true });
  const directory = await mkdtemp(resolve(tmpdir(), 'ja-backup-verification-'));
  try {
    const databasePath = resolve(directory, 'database.db');
    await cp(resolve(source, 'database.db'), databasePath, { errorOnExist: true, force: false });
    const copied = await backupFileMetadata(databasePath);
    if (
      copied.sha256 !== verified.manifest.database.sha256 ||
      copied.byteLength !== verified.manifest.database.byteLength
    )
      throw new Error('Isolated backup database integrity mismatch');
    return { directory, verified };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyLatestBackup({
  backupRoot = process.env.JA_BACKUP_ROOT ?? '/var/backups/jaautomation',
  now = new Date(),
  maxAgeHours = 30,
} = {}) {
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0)
    throw new Error('Backup maximum age invalid');
  const snapshots = await backupInventory(resolve(backupRoot));
  const latest = snapshots[0];
  if (!latest) throw new Error('No completed backup exists');
  const ageMs = now.getTime() - latest.createdAt;
  if (ageMs < -300000 || ageMs > maxAgeHours * 3600000)
    throw new Error('Latest backup is stale or future dated');
  const { directory, verified } = await isolatedSnapshot(latest.path);
  let database;
  let integrity;
  let foreignKeyViolations;
  try {
    database = new DatabaseSync(resolve(directory, 'database.db'), { readOnly: true });
    integrity = database.prepare('PRAGMA integrity_check').all();
    foreignKeyViolations = database.prepare('PRAGMA foreign_key_check').all().length;
    if (
      integrity.length !== 1 ||
      integrity[0].integrity_check !== 'ok' ||
      foreignKeyViolations !== 0
    )
      throw new Error('Backup SQLite integrity or foreign key check failed');
    const files = new Map(verified.manifest.documents.map((entry) => [entry.path, entry]));
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    // All registered stored artifacts, including historic versions, must be in the snapshot.
    // Empty/pending storage keys have no completed bytes to verify yet.
    for (const { name } of tables) {
      const quoted = '"' + name.replaceAll('"', '""') + '"';
      const columns = new Set(
        database
          .prepare(`PRAGMA table_info(${quoted})`)
          .all()
          .map((row) => row.name),
      );
      const registrations = [];
      if (columns.has('storage_key') && columns.has('byte_length')) {
        const hash = columns.has('sha256')
          ? 'sha256'
          : columns.has('content_sha256')
            ? 'content_sha256'
            : null;
        if (hash) {
          // Reservations describe expected bytes, not finalized artifacts.
          const lifecycle =
            name === 'document'
              ? "state='committed'"
              : columns.has('status')
                ? "status='ready'"
                : '1=1';
          registrations.push({ key: 'storage_key', hash, size: 'byte_length', lifecycle });
        }
      }
      // Legacy issued invoice and period-report PDFs use prefixed columns.
      if (
        columns.has('pdf_storage_key') &&
        columns.has('pdf_sha256') &&
        columns.has('pdf_byte_length')
      )
        registrations.push({
          key: 'pdf_storage_key',
          hash: 'pdf_sha256',
          size: 'pdf_byte_length',
          lifecycle: 'pdf_storage_key IS NOT NULL',
        });
      for (const { key, hash, size, lifecycle } of registrations) {
        const rows = database
          .prepare(
            `SELECT ${key} storage_key, ${hash} hash, ${size} byte_length FROM ${quoted} WHERE ${lifecycle}`,
          )
          .all();
        for (const row of rows) {
          const file = files.get(row.storage_key);
          if (!file || file.sha256 !== row.hash || file.byteLength !== row.byte_length)
            throw new Error(`Backup registered artifact missing or mismatched (${name})`);
        }
      }
    }
  } finally {
    database?.close();
    await rm(directory, { recursive: true, force: true });
  }
  const days = new Set(
    snapshots
      .filter((s) => s.createdAt <= now.getTime())
      .map((s) => new Date(s.createdAt).toISOString().slice(0, 10)),
  );
  const missingDays = [];
  for (let offset = 0; offset < 30; offset++) {
    const day = new Date(now.getTime() - offset * 86400000).toISOString().slice(0, 10);
    if (!days.has(day)) missingDays.push(day);
  }
  return {
    backupPath: latest.path,
    verifiedAt: now.toISOString(),
    createdAt: verified.manifest.createdAt,
    databaseSha256: verified.manifest.database.sha256,
    integrity: 'ok',
    foreignKeyViolations,
    documentCount: verified.manifest.documents.length,
    history: {
      snapshotCount: snapshots.length,
      observedDays: days.size,
      requiredDays: 30,
      coverageComplete: missingDays.length === 0,
      missingDays,
      scope: 'Manifest dates only; integrity verified for latest snapshot',
    },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    console.log(JSON.stringify(await verifyLatestBackup()));
  } catch (error) {
    console.error(JSON.stringify({ event: 'backup.verify.failed', error: error.message }));
    process.exitCode = 1;
  }
}
