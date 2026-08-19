import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

function safeManifestPath(value, field) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.includes('\\'))
    throw new Error(`${field} must be a safe relative path`);
  const segments = value.split('/');
  if (segments.includes('..') || segments.includes(''))
    throw new Error(`${field} contains an unsafe path segment`);
  return value;
}

function resolveInside(root, value, field) {
  const candidate = resolve(root, safeManifestPath(value, field));
  const remainder = relative(resolve(root), candidate);
  if (!remainder || remainder.startsWith('..') || isAbsolute(remainder))
    throw new Error(`${field} escapes the backup root`);
  return candidate;
}

async function files(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) result.push(...(await files(root, path)));
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      result.push({
        path: path.slice(root.length + 1).replaceAll('\\', '/'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteLength: bytes.byteLength,
      });
    }
  }
  return result;
}

export async function restoreBackup({
  backupPath,
  databasePath,
  documentRoot,
  allowOverwrite = false,
}) {
  const source = resolve(backupPath);
  const targetDatabase = resolve(databasePath);
  const targetDocuments = resolve(documentRoot);
  const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
  if (!manifest.database || !Array.isArray(manifest.documents))
    throw new Error('Backup manifest is incomplete');
  const backupDatabase = resolveInside(source, manifest.database.path, 'manifest.database.path');
  const databaseBytes = await readFile(backupDatabase);
  const databaseHash = createHash('sha256').update(databaseBytes).digest('hex');
  if (
    databaseHash !== manifest.database.sha256 ||
    databaseBytes.byteLength !== manifest.database.byteLength
  )
    throw new Error('Backup database integrity metadata mismatch');
  if (!allowOverwrite) {
    try {
      await readFile(targetDatabase);
      throw new Error(`Refusing to overwrite existing database: ${targetDatabase}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    try {
      await readdir(targetDocuments);
      throw new Error(`Refusing to overwrite existing document root: ${targetDocuments}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const stagingDatabase = `${targetDatabase}.restore-partial`;
  const stagingDocuments = `${targetDocuments}.restore-partial`;
  await rm(stagingDatabase, { force: true });
  await rm(stagingDocuments, { recursive: true, force: true });
  await mkdir(dirname(targetDatabase), { recursive: true });
  await cp(backupDatabase, stagingDatabase, { force: false, errorOnExist: true });
  await cp(resolve(source, 'documents'), stagingDocuments, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  const restored = new DatabaseSync(stagingDatabase);
  restored.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const integrity = restored.prepare('PRAGMA integrity_check').get().integrity_check;
  const foreignKeys = restored.prepare('PRAGMA foreign_keys').get().foreign_keys;
  restored.close();
  if (integrity !== 'ok' || foreignKeys !== 1)
    throw new Error(
      `Restored SQLite check failed: integrity=${integrity} foreign_keys=${foreignKeys}`,
    );
  const restoredFiles = await files(stagingDocuments);
  const expectedFiles = [...manifest.documents].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  if (
    JSON.stringify(restoredFiles.sort((left, right) => left.path.localeCompare(right.path))) !==
    JSON.stringify(expectedFiles)
  )
    throw new Error('Restored document manifest mismatch');
  if (allowOverwrite) {
    await rm(targetDatabase, { force: true });
    await rm(targetDocuments, { recursive: true, force: true });
  }
  await rename(stagingDatabase, targetDatabase);
  await rename(stagingDocuments, targetDocuments);
  return {
    databasePath: targetDatabase,
    documentRoot: targetDocuments,
    integrity,
    foreignKeys,
    documentCount: restoredFiles.length,
  };
}
