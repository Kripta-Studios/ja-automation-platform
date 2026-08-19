import { backup, DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendOperationalAlert } from './alerts.mjs';

async function fileEntries(root, current = root) {
  const entries = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) entries.push(...(await fileEntries(root, path)));
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      entries.push({
        path: relative(root, path).replaceAll('\\', '/'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteLength: bytes.byteLength,
      });
    }
  }
  return entries;
}

export async function createBackup({ databasePath, documentRoot, backupRoot }) {
  const sourcePath = resolve(databasePath);
  const documentsPath = resolve(documentRoot);
  const root = resolve(backupRoot);
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const target = resolve(root, stamp);
  await mkdir(target, { recursive: true });
  const temporaryDatabase = resolve(target, 'database.db.partial');
  const databaseTarget = resolve(target, 'database.db');
  const source = new DatabaseSync(sourcePath);
  try {
    await backup(source, temporaryDatabase);
  } finally {
    source.close();
  }
  await writeFile(databaseTarget, await readFile(temporaryDatabase));
  await rm(temporaryDatabase, { force: true });
  const documentsTarget = resolve(target, 'documents');
  let documents = [];
  try {
    await cp(documentsPath, documentsTarget, { recursive: true, force: false, errorOnExist: true });
    documents = await fileEntries(documentsPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(documentsTarget, { recursive: true });
  }
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
  await writeFile(
    resolve(target, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  const retentionDays = Number.parseInt(process.env.JA_BACKUP_RETENTION_DAYS ?? '30', 10);
  if (Number.isInteger(retentionDays) && retentionDays > 0) {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === stamp) continue;
      const entryPath = resolve(root, entry.name);
      const metadata = await stat(entryPath);
      if (metadata.mtimeMs < cutoff) await rm(entryPath, { recursive: true, force: true });
    }
  }
  return { path: target, manifest };
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
