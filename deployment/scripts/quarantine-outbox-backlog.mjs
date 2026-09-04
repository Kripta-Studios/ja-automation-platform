#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const SUPPORTED_TOPICS = new Set(['notification.email.requested', 'public-inquiry.received']);

const argument = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};

const parseEnvironment = (path) => {
  const result = new Map();
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    )
      value = value.slice(1, -1);
    result.set(key, value);
  }
  return result;
};

const databasePath = resolve(
  argument('database', '/var/lib/jaautomation/data/jaautomation.sqlite'),
);
const backupDir = resolve(argument('backup-dir', ''));
const environmentPath = resolve(argument('env-file', '/etc/jaautomation/jaautomation.env'));
const apply = process.argv.includes('--apply');

if (!existsSync(databasePath)) throw new Error('Production database is unavailable');
if (!existsSync(environmentPath)) throw new Error('Production environment file is unavailable');
const environment = parseEnvironment(environmentPath);
const webhookUrl = environment.get('JA_OUTBOX_WEBHOOK_URL');
if (!webhookUrl) {
  console.log('outbox_quarantine=not_configured');
  process.exit(0);
}
if (webhookUrl !== 'https://j-aautomation.com/j-aautomation/app/api/internal/outbox-delivery')
  throw new Error('Built-in outbox URL is not configured');
if (Buffer.byteLength(environment.get('JA_OUTBOX_WEBHOOK_SECRET') ?? '', 'utf8') < 32)
  throw new Error('Outbox webhook secret is missing or too short');
const cutoverAt = environment.get('JA_OUTBOX_CUTOVER_AT');
const cutoverMs = Date.parse(cutoverAt ?? '');
if (!cutoverAt || !Number.isFinite(cutoverMs) || new Date(cutoverMs).toISOString() !== cutoverAt)
  throw new Error('JA_OUTBOX_CUTOVER_AT must be an exact UTC ISO timestamp');
if (cutoverMs > Date.now()) throw new Error('JA_OUTBOX_CUTOVER_AT cannot be in the future');

if (!backupDir || !existsSync(backupDir) || !lstatSync(backupDir).isDirectory())
  throw new Error('The exact pre-cutover backup directory is required');
const safeBackupFile = (relativePath) => {
  if (
    typeof relativePath !== 'string' ||
    !relativePath ||
    isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).includes('..')
  )
    throw new Error('Backup manifest contains an unsafe path');
  const path = resolve(backupDir, relativePath);
  const fromRoot = relative(backupDir, path);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === '..')
    throw new Error('Backup manifest path escapes the backup directory');
  const components = fromRoot.split(sep);
  let cursor = backupDir;
  for (const [index, component] of components.entries()) {
    cursor = resolve(cursor, component);
    const componentStats = lstatSync(cursor);
    if (componentStats.isSymbolicLink())
      throw new Error('Backup manifest path contains a symbolic link');
    if (index < components.length - 1 && !componentStats.isDirectory())
      throw new Error('Backup manifest parent is not a directory');
  }
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink())
    throw new Error('Backup manifest entry is not a regular file');
  return { path, stats };
};
const manifestFile = safeBackupFile('manifest.json');
if (manifestFile.stats.size === 0) throw new Error('Backup manifest is empty');
const manifest = JSON.parse(readFileSync(manifestFile.path, 'utf8'));
const backupCreatedMs = Date.parse(manifest.createdAt ?? '');
if (
  manifest.format !== 1 ||
  !Number.isFinite(backupCreatedMs) ||
  new Date(backupCreatedMs).toISOString() !== manifest.createdAt ||
  backupCreatedMs > Date.now() ||
  Date.now() - backupCreatedMs > 15 * 60_000
)
  throw new Error('The exact pre-cutover backup is not fresh and valid');
const verifyManifestFile = (entry, manifestPath, diskPath = manifestPath, allowEmpty = false) => {
  if (
    !entry ||
    entry.path !== manifestPath ||
    !Number.isSafeInteger(entry.byteLength) ||
    entry.byteLength < (allowEmpty ? 0 : 1) ||
    !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
  )
    throw new Error('Backup manifest file metadata is invalid');
  const file = safeBackupFile(diskPath);
  if (file.stats.size !== entry.byteLength)
    throw new Error('Backup file size does not match manifest');
  const digest = createHash('sha256').update(readFileSync(file.path)).digest('hex');
  if (digest !== entry.sha256) throw new Error('Backup file hash does not match manifest');
  return file.path;
};
const backupDatabasePath = verifyManifestFile(manifest.database, 'database.db');
if (!Array.isArray(manifest.documents)) throw new Error('Backup document manifest is invalid');
for (const document of manifest.documents) {
  if (!document || typeof document.path !== 'string')
    throw new Error('Backup document manifest entry is invalid');
  verifyManifestFile(document, document.path, `documents/${document.path}`, true);
}
const backupDatabase = new DatabaseSync(backupDatabasePath, { readOnly: true });
try {
  const integrity = backupDatabase.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
    throw new Error('Backup database integrity check failed');
  if (backupDatabase.prepare('PRAGMA foreign_key_check').all().length !== 0)
    throw new Error('Backup database foreign key check failed');
} finally {
  backupDatabase.close();
}

const sqlite = new DatabaseSync(databasePath);
sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
try {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const grouped = sqlite
      .prepare(
        `SELECT topic,COUNT(*) AS count
           FROM outbox_event
          WHERE delivered_at IS NULL AND failed_at IS NULL AND created_at<?
          GROUP BY topic ORDER BY topic`,
      )
      .all(cutoverAt);
    const unsupported = sqlite
      .prepare(
        `SELECT topic,COUNT(*) AS count
           FROM outbox_event
          WHERE delivered_at IS NULL AND failed_at IS NULL AND created_at>=?
          GROUP BY topic ORDER BY topic`,
      )
      .all(cutoverAt)
      .filter((row) => !SUPPORTED_TOPICS.has(row.topic));
    if (unsupported.length)
      throw new Error(
        `Unsupported post-cutover outbox topics: ${unsupported.map((row) => row.topic).join(',')}`,
      );
    const total = grouped.reduce((sum, row) => sum + Number(row.count), 0);
    if (!apply) {
      sqlite.exec('ROLLBACK');
      console.log(
        JSON.stringify({ outboxQuarantine: 'dry-run', cutoverAt, total, topics: grouped }),
      );
    } else {
      const result = sqlite
        .prepare(
          `UPDATE outbox_event
              SET failed_at=?,lease_until=NULL,last_error='PRE_CUTOVER_QUARANTINED'
            WHERE delivered_at IS NULL AND failed_at IS NULL AND created_at<?`,
        )
        .run(new Date().toISOString(), cutoverAt);
      if (Number(result.changes) !== total)
        throw new Error('Outbox backlog changed during quarantine');
      const remaining = sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM outbox_event
            WHERE delivered_at IS NULL AND failed_at IS NULL AND created_at<?`,
        )
        .get(cutoverAt).count;
      if (Number(remaining) !== 0) throw new Error('Pre-cutover outbox quarantine is incomplete');
      sqlite.exec('COMMIT');
      console.log(
        JSON.stringify({ outboxQuarantine: 'applied', cutoverAt, total, topics: grouped }),
      );
    }
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
} finally {
  sqlite.close();
}
