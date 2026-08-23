import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, relative, resolve } from 'node:path';
import {
  assertNoSymlinkComponents,
  assertSafePath,
  assertSafeTree,
  isSafeRelativePath,
  removeSafePath,
  safeSibling,
} from './storage-safety.mjs';

function safeManifestPath(value, field) {
  if (!isSafeRelativePath(value)) throw new Error(`${field} must be a safe relative path`);
  return value;
}

function resolveInside(root, value, field) {
  const candidate = resolve(root, safeManifestPath(value, field));
  const remainder = relative(resolve(root), candidate);
  if (
    !remainder ||
    remainder.startsWith('..') ||
    remainder.startsWith('/') ||
    remainder.startsWith('\\')
  )
    throw new Error(`${field} escapes the backup root`);
  return candidate;
}

function isHash(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function validateManifest(manifest) {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !manifest.database ||
    !Array.isArray(manifest.documents)
  )
    throw new Error('Backup manifest is incomplete');
  if (
    !isHash(manifest.database.sha256) ||
    !Number.isSafeInteger(manifest.database.byteLength) ||
    manifest.database.byteLength < 0
  )
    throw new Error('Backup database integrity metadata is invalid');
  const documents = manifest.documents.map((entry, index) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !isHash(entry.sha256) ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength < 0
    )
      throw new Error(`Backup document metadata is invalid: ${index}`);
    return {
      path: safeManifestPath(entry.path, `manifest.documents[${index}].path`),
      sha256: entry.sha256,
      byteLength: entry.byteLength,
    };
  });
  return {
    database: {
      path: safeManifestPath(manifest.database.path, 'manifest.database.path'),
      sha256: manifest.database.sha256,
      byteLength: manifest.database.byteLength,
    },
    documents,
  };
}

async function files(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    const checked = await assertSafePath(path, { label: 'restore document entry' });
    if (checked.stats.isDirectory()) result.push(...(await files(root, path)));
    else if (checked.stats.isFile()) {
      const bytes = await readFile(path);
      result.push({
        path: relative(root, path).replaceAll('\\', '/'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteLength: bytes.byteLength,
      });
    } else {
      throw new Error('Restore document entry must be a regular file');
    }
  }
  return result;
}

async function inspectTarget(databasePath, documentRoot) {
  const database = await assertSafePath(databasePath, {
    allowMissing: true,
    label: 'restore database target',
  });
  if (database.exists && !database.stats.isFile())
    throw new Error('Restore database target must be a regular file');
  const documents = await assertSafePath(documentRoot, {
    allowMissing: true,
    directory: true,
    label: 'restore document target',
  });
  if (documents.exists) await assertSafeTree(documentRoot, { label: 'restore document target' });
  return { database, documents };
}

async function invokeHook(hooks, name) {
  const hook = hooks?.[name];
  if (typeof hook === 'function') await hook();
}

export async function restoreBackup({
  backupPath,
  databasePath,
  documentRoot,
  allowOverwrite = false,
  // Test-only fault injection keeps the swap protocol independently
  // verifiable without changing production behavior.
  hooks,
}) {
  const source = resolve(backupPath);
  const targetDatabase = resolve(databasePath);
  const targetDocuments = resolve(documentRoot);

  await assertSafeTree(source, { label: 'backup root' });
  const rawManifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
  const manifest = validateManifest(rawManifest);
  const backupDatabase = resolveInside(source, manifest.database.path, 'manifest.database.path');
  const backupDocuments = resolveInside(source, 'documents', 'backup documents path');
  const backupDatabaseCheck = await assertSafePath(backupDatabase, {
    label: 'backup database',
  });
  if (!backupDatabaseCheck.stats.isFile())
    throw new Error('Backup database must be a regular file');
  await assertSafeTree(backupDocuments, { label: 'backup documents' });

  const databaseBytes = await readFile(backupDatabase);
  const databaseHash = createHash('sha256').update(databaseBytes).digest('hex');
  if (
    databaseHash !== manifest.database.sha256 ||
    databaseBytes.byteLength !== manifest.database.byteLength
  )
    throw new Error('Backup database integrity metadata mismatch');

  const targets = await inspectTarget(targetDatabase, targetDocuments);
  if (!allowOverwrite && (targets.database.exists || targets.documents.exists))
    throw new Error('Refusing to overwrite existing restore target');

  await assertNoSymlinkComponents(dirname(targetDatabase), {
    allowMissing: true,
    label: 'restore database parent',
  });
  await assertNoSymlinkComponents(dirname(targetDocuments), {
    allowMissing: true,
    label: 'restore document parent',
  });
  await mkdir(dirname(targetDatabase), { recursive: true });
  await mkdir(dirname(targetDocuments), { recursive: true });
  await assertSafePath(dirname(targetDatabase), {
    directory: true,
    label: 'restore database parent',
  });
  await assertSafePath(dirname(targetDocuments), {
    directory: true,
    label: 'restore document parent',
  });

  const token = `${process.pid}-${Date.now()}-${randomUUID()}`;
  const stagingDatabase = `${targetDatabase}.restore-partial-${token}`;
  const stagingDocuments = `${targetDocuments}.restore-partial-${token}`;
  const previousDatabase = safeSibling(targetDatabase, `.restore-previous-${token}`);
  const previousDocuments = safeSibling(targetDocuments, `.restore-previous-${token}`);
  await assertSafePath(stagingDatabase, { allowMissing: true, label: 'restore staging database' });
  await assertSafePath(stagingDocuments, {
    allowMissing: true,
    label: 'restore staging documents',
  });
  await assertSafePath(previousDatabase, {
    allowMissing: true,
    label: 'restore previous database',
  });
  await assertSafePath(previousDocuments, {
    allowMissing: true,
    label: 'restore previous documents',
  });

  let restoredFiles;
  try {
    await cp(backupDatabase, stagingDatabase, { force: false, errorOnExist: true });
    await cp(backupDocuments, stagingDocuments, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    await assertSafePath(stagingDatabase, { label: 'restore staging database' });
    await assertSafeTree(stagingDocuments, { label: 'restore staging documents' });

    let integrity;
    let foreignKeys;
    const restored = new DatabaseSync(stagingDatabase);
    try {
      restored.exec(
        'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
      );
      integrity = restored.prepare('PRAGMA integrity_check').get().integrity_check;
      foreignKeys = restored.prepare('PRAGMA foreign_keys').get().foreign_keys;
    } finally {
      restored.close();
    }
    if (integrity !== 'ok' || foreignKeys !== 1)
      throw new Error(
        `Restored SQLite check failed: integrity=${integrity} foreign_keys=${foreignKeys}`,
      );

    restoredFiles = await files(stagingDocuments);
    const expectedFiles = manifest.documents
      .slice()
      .sort((left, right) => left.path.localeCompare(right.path));
    const actualFiles = restoredFiles
      .slice()
      .sort((left, right) => left.path.localeCompare(right.path));
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles))
      throw new Error('Restored document manifest mismatch');

    let previousDatabaseMoved = false;
    let previousDocumentsMoved = false;
    let databaseInstalled = false;
    let documentsInstalled = false;
    try {
      if (targets.database.exists) {
        await rename(targetDatabase, previousDatabase);
        previousDatabaseMoved = true;
      }
      await invokeHook(hooks, 'afterDatabaseMove');
      if (targets.documents.exists) {
        await rename(targetDocuments, previousDocuments);
        previousDocumentsMoved = true;
      }
      await rename(stagingDatabase, targetDatabase);
      databaseInstalled = true;
      await invokeHook(hooks, 'afterDatabaseInstall');
      await rename(stagingDocuments, targetDocuments);
      documentsInstalled = true;
      await invokeHook(hooks, 'afterDocumentsInstall');
    } catch (error) {
      // Restore the original paths in reverse order. Every removal is
      // validated first; no broad recursive delete is used for rollback.
      try {
        if (documentsInstalled)
          await removeSafePath(targetDocuments, {
            recursive: true,
            label: 'failed restore document target',
          });
        if (databaseInstalled)
          await removeSafePath(targetDatabase, { label: 'failed restore database target' });
        if (previousDocumentsMoved) await rename(previousDocuments, targetDocuments);
        if (previousDatabaseMoved) await rename(previousDatabase, targetDatabase);
      } catch (rollbackError) {
        throw new Error('Restore swap rollback failed', { cause: rollbackError });
      }
      throw error;
    }

    await removeSafePath(previousDatabase, { label: 'previous restore database' });
    await removeSafePath(previousDocuments, {
      recursive: true,
      label: 'previous restore documents',
    });
    return {
      databasePath: targetDatabase,
      documentRoot: targetDocuments,
      integrity,
      foreignKeys,
      documentCount: restoredFiles.length,
    };
  } finally {
    await removeSafePath(stagingDatabase, { label: 'restore staging database' }).catch(
      () => undefined,
    );
    await removeSafePath(stagingDocuments, {
      recursive: true,
      label: 'restore staging documents',
    }).catch(() => undefined);
  }
}
