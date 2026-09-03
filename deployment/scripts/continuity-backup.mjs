import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { cp, mkdir, mkdtemp, open, readFile, readdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createBackup } from './backup.mjs';
import {
  assertNoSymlinkComponents,
  assertSafePath,
  assertSafeTree,
  isSafeRelativePath,
  removeSafePath,
} from './storage-safety.mjs';

/**
 * Encrypted continuity backup contract.
 *
 * The local online backup remains the source of truth. This module only
 * replicates a verified, completed local backup to a separately administered
 * host. The remote side is deliberately treated as untrusted storage: both
 * encrypted payloads are checked after transfer and a completion marker is
 * written last. Readers only consider a backup complete when that marker and
 * both final files agree.
 */

const execFile = promisify(execFileCallback);
const BUNDLE_MAGIC = Buffer.from('JA-CONTINUITY-ENC-V1\0', 'utf8');
const BUNDLE_IV_BYTES = 12;
const BUNDLE_TAG_BYTES = 16;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_REMOTE_ROOT = '/var/backups/jaautomation-offsite';
const DEFAULT_NAMESPACE = 'jaautomation';
const COMPONENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function errorCode(error) {
  return typeof error?.code === 'string' ? error.code : undefined;
}

function publicError(error, fallback) {
  if (error instanceof ContinuityBackupError) return error.message;
  return fallback;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isDigest(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function bytes(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return /^(1|true|yes|on)$/iu.test(String(value).trim());
}

function firstEnvironmentValue(environment, ...names) {
  for (const name of names) {
    const value = environment?.[name];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

function parsePort(value) {
  if (value === undefined || value === '') return 22;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535 ? parsed : null;
}

function parseRetentionDays(value) {
  if (value === undefined || value === '') return DEFAULT_RETENTION_DAYS;
  if (!/^\d+$/u.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function safeComponent(value, field) {
  if (typeof value !== 'string' || !COMPONENT_PATTERN.test(value))
    throw new ContinuityBackupError(`${field} is invalid`, 'CONTINUITY_CONFIG_INVALID');
  return value;
}

function safeRelative(value, field) {
  if (!isSafeRelativePath(value))
    throw new ContinuityBackupError(
      `${field} must be a safe relative path`,
      'CONTINUITY_PATH_INVALID',
    );
  return value;
}

function remoteRoot(value) {
  if (typeof value !== 'string' || !posix.isAbsolute(value) || value.includes('\0'))
    throw new ContinuityBackupError(
      'Remote backup root must be an absolute path',
      'CONTINUITY_CONFIG_INVALID',
    );
  const normalized = posix.normalize(value);
  if (normalized === '/')
    throw new ContinuityBackupError(
      'Remote backup root cannot be the filesystem root',
      'CONTINUITY_CONFIG_INVALID',
    );
  return normalized;
}

function remotePath(root, value) {
  const base = remoteRoot(root);
  const child = safeRelative(value, 'remote path');
  const candidate = posix.resolve(base, child);
  const rest = posix.relative(base, candidate);
  if (!rest || rest.startsWith('..') || posix.isAbsolute(rest))
    throw new ContinuityBackupError(
      'Remote path escapes its backup root',
      'CONTINUITY_PATH_INVALID',
    );
  return candidate;
}

function localPathInside(root, value, field) {
  const base = resolve(root);
  const candidate = resolve(base, value);
  const rest = relative(base, candidate);
  if (!rest || rest.startsWith('..') || rest.startsWith('/') || rest.startsWith('\\'))
    throw new ContinuityBackupError(`${field} escapes its root`, 'CONTINUITY_PATH_INVALID');
  return candidate;
}

function configuredLocalPath(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || value.trim() === '')
    throw new ContinuityBackupError(`${field} is invalid`, 'CONTINUITY_CONFIG_INVALID');
  return value;
}

function configuredString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateSshEndpointPart(value, field, { allowColon = false } = {}) {
  if (
    !configuredString(value) ||
    value.length > 255 ||
    /[\0\r\n\t ]/u.test(value) ||
    value.startsWith('-') ||
    (!allowColon && value.includes(':')) ||
    value.includes('@')
  )
    throw new ContinuityBackupError(`${field} is invalid`, 'CONTINUITY_CONFIG_INVALID');
}

export class ContinuityBackupError extends Error {
  constructor(message, code = 'CONTINUITY_BACKUP_FAILED', options = {}) {
    super(message, options);
    this.name = 'ContinuityBackupError';
    this.code = code;
    this.status = options.status ?? (code === 'CONTINUITY_BACKUP_BLOCKED' ? 'BLOCKED' : 'FAILED');
  }
}

function decodeBase64Key(encoded) {
  const paddingMatch = encoded.match(/=+$/u);
  const unpadded = encoded.replace(/=+$/u, '');
  const suppliedPadding = paddingMatch?.[0].length ?? 0;
  const expectedPadding = (4 - (unpadded.length % 4)) % 4;
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded) ||
    encoded.length % 4 === 1 ||
    (suppliedPadding !== 0 && suppliedPadding !== expectedPadding)
  )
    throw new ContinuityBackupError(
      'Continuity encryption key must be valid base64 for 32 bytes',
      'CONTINUITY_ENCRYPTION_KEY_INVALID',
    );
  return Buffer.from(unpadded + '='.repeat(expectedPadding), 'base64');
}

export function decodeEncryptionKey(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const result = Buffer.from(value);
    if (result.byteLength === 32) return result;
    throw new ContinuityBackupError(
      'Continuity encryption key must contain 32 bytes',
      'CONTINUITY_ENCRYPTION_KEY_INVALID',
    );
  }
  if (typeof value !== 'string' || value.trim() === '')
    throw new ContinuityBackupError(
      'Continuity encryption key is not configured',
      'CONTINUITY_ENCRYPTION_KEY_MISSING',
    );

  const text = value.trim();
  let decoded;
  if (/^(?:hex:)?[0-9a-f]{64}$/iu.test(text)) {
    decoded = Buffer.from(text.replace(/^hex:/iu, ''), 'hex');
  } else if (/^base64:/iu.test(text)) {
    decoded = decodeBase64Key(text.slice('base64:'.length));
  } else {
    decoded = decodeBase64Key(text);
  }
  if (decoded.byteLength !== 32)
    throw new ContinuityBackupError(
      'Continuity encryption key must be 64 hex characters or base64 for 32 bytes',
      'CONTINUITY_ENCRYPTION_KEY_INVALID',
    );
  return decoded;
}

export function getContinuityConfig(environment = process.env) {
  const enabled = parseBoolean(
    firstEnvironmentValue(environment, 'JA_BACKUP_REMOTE_ENABLED', 'JA_CONTINUITY_BACKUP_ENABLED'),
    true,
  );
  const host = firstEnvironmentValue(
    environment,
    'JA_BACKUP_REMOTE_HOST',
    'JA_CONTINUITY_BACKUP_HOST',
  );
  const user = firstEnvironmentValue(
    environment,
    'JA_BACKUP_REMOTE_USER',
    'JA_CONTINUITY_BACKUP_USER',
  );
  const sshKey = firstEnvironmentValue(
    environment,
    'JA_BACKUP_SSH_KEY',
    'JA_CONTINUITY_BACKUP_SSH_KEY',
  );
  const encryptionKey = firstEnvironmentValue(
    environment,
    'JA_BACKUP_ENCRYPTION_KEY',
    'JA_CONTINUITY_BACKUP_ENCRYPTION_KEY',
  );
  const retentionText = firstEnvironmentValue(
    environment,
    'JA_BACKUP_REMOTE_RETENTION_DAYS',
    'JA_CONTINUITY_BACKUP_RETENTION_DAYS',
  );
  const namespace = firstEnvironmentValue(
    environment,
    'JA_BACKUP_REMOTE_NAMESPACE',
    'JA_CONTINUITY_BACKUP_NAMESPACE',
  );
  const deploymentId = firstEnvironmentValue(environment, 'JA_DEPLOYMENT_ID') ?? 'deployment';
  const root = firstEnvironmentValue(
    environment,
    'JA_BACKUP_REMOTE_ROOT',
    'JA_CONTINUITY_BACKUP_REMOTE_ROOT',
  );

  return {
    enabled,
    host,
    user,
    port: parsePort(
      firstEnvironmentValue(environment, 'JA_BACKUP_REMOTE_PORT', 'JA_CONTINUITY_BACKUP_PORT'),
    ),
    sshKey,
    encryptionKey,
    encryptionKeyConfigured: typeof encryptionKey === 'string' && encryptionKey.trim() !== '',
    remoteRoot: root ?? DEFAULT_REMOTE_ROOT,
    retentionDays: parseRetentionDays(retentionText),
    namespace: namespace ?? DEFAULT_NAMESPACE,
    deploymentId,
  };
}

function readinessIssue(code, message, field) {
  return { code, message, ...(field ? { field } : {}) };
}

/**
 * Synchronous configuration-only readiness check. It intentionally does not
 * read the key file or contact an SSH host. `checkContinuityReadiness` adds
 * filesystem checks for the real transport.
 */
export function continuityReadiness({
  environment = process.env,
  env,
  transport,
  encryptionKey,
} = {}) {
  const config = getContinuityConfig(env ?? environment);
  const issues = [];
  if (!config.enabled)
    issues.push(
      readinessIssue(
        'CONTINUITY_BACKUP_DISABLED',
        'Encrypted separate-host continuity backup is disabled',
        'JA_BACKUP_REMOTE_ENABLED',
      ),
    );
  if (config.port === null)
    issues.push(
      readinessIssue('CONTINUITY_SSH_PORT_INVALID', 'SSH port is invalid', 'JA_BACKUP_REMOTE_PORT'),
    );
  try {
    remoteRoot(config.remoteRoot);
  } catch (error) {
    issues.push(
      readinessIssue(
        errorCode(error) ?? 'CONTINUITY_REMOTE_ROOT_INVALID',
        'Remote backup root is invalid',
        'JA_BACKUP_REMOTE_ROOT',
      ),
    );
  }
  try {
    safeRelative(config.namespace, 'remote namespace');
  } catch (error) {
    issues.push(
      readinessIssue(
        errorCode(error) ?? 'CONTINUITY_NAMESPACE_INVALID',
        'Remote backup namespace is invalid',
        'JA_BACKUP_REMOTE_NAMESPACE',
      ),
    );
  }
  try {
    safeComponent(String(config.deploymentId), 'deployment identifier');
  } catch (error) {
    issues.push(
      readinessIssue(
        errorCode(error) ?? 'CONTINUITY_DEPLOYMENT_INVALID',
        'Deployment identifier is invalid',
        'JA_DEPLOYMENT_ID',
      ),
    );
  }
  if (configuredString(config.host)) {
    try {
      validateSshEndpointPart(config.host, 'remote backup hostname', { allowColon: true });
    } catch {
      issues.push(
        readinessIssue(
          'CONTINUITY_REMOTE_HOST_INVALID',
          'Separate-host backup hostname is invalid',
          'JA_BACKUP_REMOTE_HOST',
        ),
      );
    }
  }
  if (configuredString(config.user)) {
    try {
      validateSshEndpointPart(config.user, 'remote backup user');
    } catch {
      issues.push(
        readinessIssue(
          'CONTINUITY_REMOTE_USER_INVALID',
          'Separate-host backup user is invalid',
          'JA_BACKUP_REMOTE_USER',
        ),
      );
    }
  }
  if (config.retentionDays === null || config.retentionDays < DEFAULT_RETENTION_DAYS)
    issues.push(
      readinessIssue(
        'CONTINUITY_RETENTION_INVALID',
        `Remote retention must be at least ${DEFAULT_RETENTION_DAYS} days`,
        'JA_BACKUP_REMOTE_RETENTION_DAYS',
      ),
    );
  try {
    decodeEncryptionKey(encryptionKey ?? config.encryptionKey);
  } catch (error) {
    issues.push(
      readinessIssue(
        errorCode(error) ?? 'CONTINUITY_ENCRYPTION_KEY_INVALID',
        'Continuity encryption key is missing or invalid',
        'JA_BACKUP_ENCRYPTION_KEY',
      ),
    );
  }

  // A fake/dry transport deliberately bypasses host credential checks. This
  // is the only supported way for deterministic local tests to avoid network
  // access. The production path always creates SshTransport below.
  if (!transport) {
    if (!configuredString(config.host))
      issues.push(
        readinessIssue(
          'CONTINUITY_REMOTE_HOST_MISSING',
          'Separate-host backup hostname is not configured',
          'JA_BACKUP_REMOTE_HOST',
        ),
      );
    if (!configuredString(config.user))
      issues.push(
        readinessIssue(
          'CONTINUITY_REMOTE_USER_MISSING',
          'Separate-host backup user is not configured',
          'JA_BACKUP_REMOTE_USER',
        ),
      );
    if (!configuredString(config.sshKey))
      issues.push(
        readinessIssue(
          'CONTINUITY_SSH_KEY_MISSING',
          'Separate-host SSH key path is not configured',
          'JA_BACKUP_SSH_KEY',
        ),
      );
  }
  const ready = issues.length === 0;
  let encryptionKeyConfigured = false;
  try {
    decodeEncryptionKey(encryptionKey ?? config.encryptionKey);
    encryptionKeyConfigured = true;
  } catch {
    // The corresponding issue above is the public readiness explanation.
  }
  return {
    ok: ready,
    ready,
    blocked: !ready,
    status: ready ? 'READY' : 'BLOCKED',
    state: ready ? 'ready' : 'blocked',
    issues,
    config: {
      enabled: config.enabled,
      hostConfigured: configuredString(config.host),
      userConfigured: configuredString(config.user),
      sshKeyConfigured: configuredString(config.sshKey),
      encryptionKeyConfigured,
      remoteRoot: config.remoteRoot,
      retentionDays: config.retentionDays,
    },
  };
}

export async function checkContinuityReadiness(options = {}) {
  const environment = options.env ?? options.environment ?? process.env;
  const result = continuityReadiness({ ...options, environment });
  const config = getContinuityConfig(environment);
  if (result.ok && !options.transport) {
    try {
      const checked = await assertSafePath(config.sshKey, {
        label: 'continuity SSH key',
      });
      if (!checked.stats.isFile()) throw new Error('not a regular file');
    } catch {
      result.ok = false;
      result.ready = false;
      result.blocked = true;
      result.status = 'BLOCKED';
      result.state = 'blocked';
      result.issues.push(
        readinessIssue(
          'CONTINUITY_SSH_KEY_UNAVAILABLE',
          'Separate-host SSH key is unavailable',
          'JA_BACKUP_SSH_KEY',
        ),
      );
    }
  }
  return result;
}

function blockedFromReadiness(readiness) {
  const first = readiness.issues[0];
  return new ContinuityBackupError(
    first?.message ?? 'Encrypted separate-host continuity backup is not ready',
    'CONTINUITY_BACKUP_BLOCKED',
    { status: 'BLOCKED' },
  );
}

function validateBackupId(value) {
  return safeComponent(value, 'backup identifier');
}

function validateManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.database)
    throw new ContinuityBackupError('Backup manifest is incomplete', 'CONTINUITY_MANIFEST_INVALID');
  if (raw.format !== undefined && raw.format !== 1)
    throw new ContinuityBackupError(
      'Backup manifest format is unsupported',
      'CONTINUITY_MANIFEST_INVALID',
    );
  const database = raw.database;
  if (
    database.path !== 'database.db' ||
    !isDigest(database.sha256) ||
    !Number.isSafeInteger(database.byteLength) ||
    database.byteLength < 0
  )
    throw new ContinuityBackupError(
      'Backup database metadata is invalid',
      'CONTINUITY_MANIFEST_INVALID',
    );
  if (!Array.isArray(raw.documents))
    throw new ContinuityBackupError(
      'Backup document manifest is incomplete',
      'CONTINUITY_MANIFEST_INVALID',
    );

  const documents = raw.documents
    .map((entry, index) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !isSafeRelativePath(entry.path) ||
        !isDigest(entry.sha256) ||
        !Number.isSafeInteger(entry.byteLength) ||
        entry.byteLength < 0
      )
        throw new ContinuityBackupError(
          `Backup document metadata is invalid: ${index}`,
          'CONTINUITY_MANIFEST_INVALID',
        );
      return {
        path: entry.path,
        sha256: entry.sha256,
        byteLength: entry.byteLength,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const paths = new Set();
  for (const entry of documents) {
    if (paths.has(entry.path))
      throw new ContinuityBackupError(
        'Backup document manifest contains duplicate paths',
        'CONTINUITY_MANIFEST_INVALID',
      );
    paths.add(entry.path);
  }
  return {
    format: 1,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    database: { path: 'database.db', sha256: database.sha256, byteLength: database.byteLength },
    documents,
  };
}

async function documentEntries(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    const checked = await assertSafePath(path, { label: 'continuity document entry' });
    if (checked.stats.isDirectory()) result.push(...(await documentEntries(root, path)));
    else if (checked.stats.isFile()) {
      const content = await readFile(path);
      result.push({
        path: relative(root, path).replaceAll('\\', '/'),
        sha256: digest(content),
        byteLength: content.byteLength,
        content,
      });
    } else {
      throw new ContinuityBackupError(
        'Continuity document tree contains a non-regular entry',
        'CONTINUITY_SNAPSHOT_INVALID',
      );
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

/** Verify that a local backup is complete before encryption or upload. */
export async function verifyLocalBackup(backupPath) {
  const source = resolve(backupPath);
  await assertSafeTree(source, { label: 'continuity local backup' });
  const manifestPath = localPathInside(source, 'manifest.json', 'continuity manifest');
  const databasePath = localPathInside(source, 'database.db', 'continuity database');
  const documentsPath = localPathInside(source, 'documents', 'continuity documents');
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  const database = await assertSafePath(databasePath, { label: 'continuity database' });
  const documents = await assertSafePath(documentsPath, {
    allowMissing: true,
    directory: true,
    label: 'continuity documents',
  });
  if (!database.stats.isFile() || !documents.exists)
    throw new ContinuityBackupError(
      'Continuity backup is incomplete',
      'CONTINUITY_SNAPSHOT_INCOMPLETE',
    );

  const databaseBytes = await readFile(databasePath);
  if (
    digest(databaseBytes) !== manifest.database.sha256 ||
    databaseBytes.byteLength !== manifest.database.byteLength
  )
    throw new ContinuityBackupError(
      'Continuity database integrity metadata mismatch',
      'CONTINUITY_SNAPSHOT_INTEGRITY_MISMATCH',
    );
  const actual = await documentEntries(documentsPath);
  const expected = manifest.documents;
  const actualMetadata = actual.map(({ path, sha256, byteLength }) => ({
    path,
    sha256,
    byteLength,
  }));
  if (canonicalJson(actualMetadata) !== canonicalJson(expected))
    throw new ContinuityBackupError(
      'Continuity document manifest mismatch',
      'CONTINUITY_SNAPSHOT_INTEGRITY_MISMATCH',
    );
  const topLevel = (await readdir(source, { withFileTypes: true }))
    .map((entry) => entry.name)
    .sort();
  if (canonicalJson(topLevel) !== canonicalJson(['database.db', 'documents', 'manifest.json']))
    throw new ContinuityBackupError(
      'Continuity backup contains unexpected entries',
      'CONTINUITY_SNAPSHOT_INCOMPLETE',
    );
  return { path: source, manifest, databaseBytes, documents: actual };
}

function encrypt(bytesToEncrypt, key) {
  const iv = randomBytes(BUNDLE_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: BUNDLE_TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(bytesToEncrypt), cipher.final()]);
  return Buffer.concat([BUNDLE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

function decrypt(encrypted, key) {
  const value = bytes(encrypted);
  const headerBytes = BUNDLE_MAGIC.byteLength + BUNDLE_IV_BYTES + BUNDLE_TAG_BYTES;
  if (
    value.byteLength < headerBytes ||
    !value.subarray(0, BUNDLE_MAGIC.byteLength).equals(BUNDLE_MAGIC)
  )
    throw new ContinuityBackupError(
      'Encrypted continuity bundle header is invalid',
      'CONTINUITY_BUNDLE_INVALID',
    );
  const ivStart = BUNDLE_MAGIC.byteLength;
  const tagStart = ivStart + BUNDLE_IV_BYTES;
  const ciphertextStart = tagStart + BUNDLE_TAG_BYTES;
  const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(ivStart, tagStart), {
    authTagLength: BUNDLE_TAG_BYTES,
  });
  decipher.setAuthTag(value.subarray(tagStart, ciphertextStart));
  try {
    return Buffer.concat([decipher.update(value.subarray(ciphertextStart)), decipher.final()]);
  } catch {
    throw new ContinuityBackupError(
      'Encrypted continuity bundle authentication failed',
      'CONTINUITY_BUNDLE_INTEGRITY_MISMATCH',
    );
  }
}

function bundlePayload(snapshot) {
  return Buffer.from(
    canonicalJson({
      format: 'ja-continuity-backup-bundle-v1',
      manifest: snapshot.manifest,
      database: {
        path: 'database.db',
        base64: snapshot.databaseBytes.toString('base64'),
      },
      documents: snapshot.documents.map((entry) => ({
        path: entry.path,
        base64: entry.content.toString('base64'),
      })),
    }),
    'utf8',
  );
}

function parseBundlePayload(value) {
  let parsed;
  try {
    parsed = JSON.parse(value.toString('utf8'));
  } catch {
    throw new ContinuityBackupError(
      'Continuity bundle payload is invalid',
      'CONTINUITY_BUNDLE_INVALID',
    );
  }
  if (!parsed || parsed.format !== 'ja-continuity-backup-bundle-v1')
    throw new ContinuityBackupError(
      'Continuity bundle format is unsupported',
      'CONTINUITY_BUNDLE_INVALID',
    );
  const manifest = validateManifest(parsed.manifest);
  if (
    !parsed.database ||
    parsed.database.path !== 'database.db' ||
    typeof parsed.database.base64 !== 'string'
  )
    throw new ContinuityBackupError(
      'Continuity bundle database is invalid',
      'CONTINUITY_BUNDLE_INVALID',
    );
  const databaseBytes = Buffer.from(parsed.database.base64, 'base64');
  if (
    digest(databaseBytes) !== manifest.database.sha256 ||
    databaseBytes.byteLength !== manifest.database.byteLength
  )
    throw new ContinuityBackupError(
      'Continuity bundle database integrity metadata mismatch',
      'CONTINUITY_BUNDLE_INTEGRITY_MISMATCH',
    );
  if (!Array.isArray(parsed.documents))
    throw new ContinuityBackupError(
      'Continuity bundle documents are invalid',
      'CONTINUITY_BUNDLE_INVALID',
    );
  const documents = parsed.documents
    .map((entry) => {
      if (
        !entry ||
        typeof entry.path !== 'string' ||
        typeof entry.base64 !== 'string' ||
        !isSafeRelativePath(entry.path)
      )
        throw new ContinuityBackupError(
          'Continuity bundle document path is invalid',
          'CONTINUITY_BUNDLE_INVALID',
        );
      const content = Buffer.from(entry.base64, 'base64');
      return { path: entry.path, content, sha256: digest(content), byteLength: content.byteLength };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const expected = manifest.documents;
  const actual = documents.map(({ path, sha256, byteLength }) => ({ path, sha256, byteLength }));
  if (canonicalJson(expected) !== canonicalJson(actual))
    throw new ContinuityBackupError(
      'Continuity bundle document manifest mismatch',
      'CONTINUITY_BUNDLE_INTEGRITY_MISMATCH',
    );
  return { manifest, databaseBytes, documents };
}

function parseEncryptedManifest(value) {
  try {
    return validateManifest(JSON.parse(value.toString('utf8')));
  } catch (error) {
    if (error instanceof ContinuityBackupError) throw error;
    throw new ContinuityBackupError(
      'Encrypted continuity manifest is invalid',
      'CONTINUITY_BUNDLE_INVALID',
      { cause: error },
    );
  }
}

async function writeDurableFile(path, content) {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.write(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function assertTransport(transport) {
  const methods = [
    'ensureDirectory',
    'put',
    'read',
    'download',
    'hash',
    'stat',
    'rename',
    'remove',
    'list',
  ];
  for (const method of methods) {
    if (typeof transport?.[method] !== 'function')
      throw new ContinuityBackupError(
        `Continuity transport is missing ${method}`,
        'CONTINUITY_TRANSPORT_INVALID',
      );
  }
}

function namespaceFor(config, options = {}) {
  const namespace = safeRelative(
    options.namespace ?? config.namespace ?? DEFAULT_NAMESPACE,
    'remote namespace',
  );
  const deployment = safeComponent(
    String(options.deploymentId ?? config.deploymentId ?? 'deployment'),
    'deployment identifier',
  );
  return `${namespace}/${deployment}`;
}

function layoutFor(config, options, backupId, token = 'pending') {
  const id = validateBackupId(backupId);
  const namespace = namespaceFor(config, options);
  const base = `${namespace}/${id}`;
  return {
    namespace,
    backupId: id,
    directory: base,
    snapshot: `${base}/snapshot.bundle.enc`,
    manifest: `${base}/manifest.json.enc`,
    complete: `${base}/complete.json`,
    snapshotPartial: `${base}/snapshot.bundle.enc.partial-${token}`,
    manifestPartial: `${base}/manifest.json.enc.partial-${token}`,
    completePartial: `${base}/complete.json.partial-${token}`,
  };
}

async function statExists(transport, path) {
  try {
    const result = await transport.stat(path);
    return result?.exists !== false;
  } catch {
    return false;
  }
}

async function removeQuietly(transport, path, recursive = false) {
  try {
    await transport.remove(path, { recursive });
  } catch {
    // Cleanup must never expose command output or a secret-bearing transport error.
  }
}

async function verifyRemoteFile(transport, path, expected) {
  let info;
  try {
    info = await transport.stat(path);
  } catch {
    throw new ContinuityBackupError(
      'Remote continuity backup file is unavailable',
      'CONTINUITY_REMOTE_INCOMPLETE',
    );
  }
  if (!info?.exists || !info.isFile || info.byteLength !== expected.byteLength)
    throw new ContinuityBackupError(
      'Remote continuity backup transfer is partial',
      'CONTINUITY_REMOTE_PARTIAL_TRANSFER',
    );
  let remoteHash;
  try {
    remoteHash = await transport.hash(path);
  } catch {
    throw new ContinuityBackupError(
      'Remote continuity backup hash is unavailable',
      'CONTINUITY_REMOTE_INCOMPLETE',
    );
  }
  if (remoteHash !== expected.sha256)
    throw new ContinuityBackupError(
      'Remote continuity backup hash does not match the local verified file',
      'CONTINUITY_REMOTE_PARTIAL_TRANSFER',
    );
  return info;
}

function markerValue(layout, snapshotBytes, manifestBytes, now, retentionDays, sourceCreatedAt) {
  return {
    format: 'ja-continuity-complete-v1',
    backupId: layout.backupId,
    completedAt: now.toISOString(),
    sourceCreatedAt: typeof sourceCreatedAt === 'string' ? sourceCreatedAt : null,
    retentionDays,
    snapshot: {
      path: 'snapshot.bundle.enc',
      sha256: digest(snapshotBytes),
      byteLength: snapshotBytes.byteLength,
    },
    manifest: {
      path: 'manifest.json.enc',
      sha256: digest(manifestBytes),
      byteLength: manifestBytes.byteLength,
    },
  };
}

function validateMarker(raw, expectedBackupId) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    raw.format !== 'ja-continuity-complete-v1' ||
    raw.backupId !== expectedBackupId ||
    typeof raw.completedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.completedAt)) ||
    !Number.isSafeInteger(raw.retentionDays) ||
    raw.retentionDays < DEFAULT_RETENTION_DAYS ||
    !raw.snapshot ||
    !raw.manifest ||
    raw.snapshot.path !== 'snapshot.bundle.enc' ||
    raw.manifest.path !== 'manifest.json.enc' ||
    !isDigest(raw.snapshot.sha256) ||
    !isDigest(raw.manifest.sha256) ||
    !Number.isSafeInteger(raw.snapshot.byteLength) ||
    !Number.isSafeInteger(raw.manifest.byteLength) ||
    raw.snapshot.byteLength < 0 ||
    raw.manifest.byteLength < 0
  )
    throw new ContinuityBackupError(
      'Remote continuity completion marker is invalid',
      'CONTINUITY_REMOTE_INCOMPLETE',
    );
  return raw;
}

function snapshotsMatch(left, right) {
  if (
    canonicalJson(left.manifest) !== canonicalJson(right.manifest) ||
    digest(left.databaseBytes) !== digest(right.databaseBytes) ||
    left.databaseBytes.byteLength !== right.databaseBytes.byteLength ||
    left.documents.length !== right.documents.length
  )
    return false;

  for (let index = 0; index < left.documents.length; index += 1) {
    const leftDocument = left.documents[index];
    const rightDocument = right.documents[index];
    if (
      leftDocument.path !== rightDocument.path ||
      leftDocument.sha256 !== rightDocument.sha256 ||
      leftDocument.byteLength !== rightDocument.byteLength ||
      !bytes(leftDocument.content).equals(bytes(rightDocument.content))
    )
      return false;
  }
  return true;
}

function pathsOverlap(left, right) {
  const base = resolve(left);
  const candidate = resolve(right);
  const remainder = relative(base, candidate);
  return (
    remainder === '' ||
    (!remainder.startsWith('..') && !remainder.startsWith('/') && !remainder.startsWith('\\'))
  );
}

/**
 * A restore drill must never be allowed to write into production storage.
 * The live paths come from the deployment environment when available and
 * otherwise use the documented production defaults. Both target roots and an
 * explicitly supplied staging root are checked before any remote bytes are
 * downloaded.
 */
function assertIsolatedRestoreTargets({ environment, databasePath, documentRoot, tempRoot }) {
  if (
    typeof databasePath !== 'string' ||
    databasePath.trim() === '' ||
    typeof documentRoot !== 'string' ||
    documentRoot.trim() === '' ||
    (tempRoot !== undefined &&
      tempRoot !== null &&
      (typeof tempRoot !== 'string' || tempRoot.trim() === ''))
  )
    throw new ContinuityBackupError(
      'Isolated restore database and document targets are required',
      'CONTINUITY_INPUT_INVALID',
    );

  const liveDatabasePath =
    firstEnvironmentValue(environment, 'JA_DATABASE_PATH') ??
    '/var/lib/jaautomation/data/jaautomation.sqlite';
  const liveDocumentRoot =
    firstEnvironmentValue(environment, 'JA_DOCUMENT_ROOT') ?? '/var/lib/jaautomation/files';
  if (
    typeof liveDatabasePath !== 'string' ||
    liveDatabasePath.trim() === '' ||
    typeof liveDocumentRoot !== 'string' ||
    liveDocumentRoot.trim() === ''
  )
    throw new ContinuityBackupError(
      'Configured live database and document roots are invalid',
      'CONTINUITY_CONFIG_INVALID',
    );
  const protectedPaths = [liveDatabasePath, liveDocumentRoot];
  const requestedPaths = [databasePath, documentRoot, ...(tempRoot ? [tempRoot] : [])];

  if (
    requestedPaths.some((requested) =>
      protectedPaths.some(
        (protectedPath) =>
          pathsOverlap(requested, protectedPath) || pathsOverlap(protectedPath, requested),
      ),
    ) ||
    pathsOverlap(databasePath, documentRoot) ||
    pathsOverlap(documentRoot, databasePath)
  )
    throw new ContinuityBackupError(
      'Remote continuity restore drill targets must be isolated from live storage',
      'CONTINUITY_RESTORE_NOT_ISOLATED',
    );
}

async function assertRestoreTargetSafety({ databasePath, documentRoot, tempRoot }) {
  try {
    const database = resolve(databasePath);
    const documents = resolve(documentRoot);
    await assertSafePath(database, {
      allowMissing: true,
      label: 'continuity restore database target',
    });
    const documentTarget = await assertSafePath(documents, {
      allowMissing: true,
      directory: true,
      label: 'continuity restore document target',
    });
    if (documentTarget.exists)
      await assertSafeTree(documents, { label: 'continuity restore document target' });
    await assertNoSymlinkComponents(dirname(database), {
      allowMissing: true,
      label: 'continuity restore database parent',
    });
    await assertNoSymlinkComponents(dirname(documents), {
      allowMissing: true,
      label: 'continuity restore document parent',
    });
    if (tempRoot) {
      const staging = resolve(tempRoot);
      await assertSafePath(staging, {
        allowMissing: true,
        directory: true,
        label: 'continuity restore staging root',
      });
      await assertNoSymlinkComponents(dirname(staging), {
        allowMissing: true,
        label: 'continuity restore staging parent',
      });
    }
  } catch (error) {
    if (error instanceof ContinuityBackupError) throw error;
    throw new ContinuityBackupError(
      'Remote continuity restore drill targets are unsafe',
      'CONTINUITY_RESTORE_NOT_ISOLATED',
      { cause: error },
    );
  }
}

async function markerFromRemote(transport, layout) {
  const markerBytes = await transport.read(layout.complete);
  let marker;
  try {
    marker = JSON.parse(markerBytes.toString('utf8'));
  } catch {
    throw new ContinuityBackupError(
      'Remote continuity completion marker is invalid',
      'CONTINUITY_REMOTE_INCOMPLETE',
    );
  }
  return validateMarker(marker, layout.backupId);
}

/**
 * Replicate one completed local backup. No network operation is attempted
 * until configuration has passed readiness; tests can inject a fake transport
 * explicitly.
 */
export async function replicateBackup({
  backupPath,
  backupId,
  transport,
  env = process.env,
  encryptionKey,
  namespace,
  deploymentId,
  retentionDays,
  now = new Date(),
} = {}) {
  if (!backupPath)
    throw new ContinuityBackupError('Local backup path is required', 'CONTINUITY_INPUT_INVALID');
  const config = getContinuityConfig(env);
  const readiness = await checkContinuityReadiness({ env, transport, encryptionKey });
  if (!readiness.ok) throw blockedFromReadiness(readiness);
  const key = decodeEncryptionKey(encryptionKey ?? config.encryptionKey);
  const snapshot = await verifyLocalBackup(backupPath);
  const id = validateBackupId(backupId ?? basename(snapshot.path));
  const days = retentionDays ?? config.retentionDays;
  if (!Number.isSafeInteger(days) || days < DEFAULT_RETENTION_DAYS)
    throw new ContinuityBackupError(
      `Remote retention must be at least ${DEFAULT_RETENTION_DAYS} days`,
      'CONTINUITY_CONFIG_INVALID',
    );
  const selectedTransport = transport ?? new SshTransport(config);
  assertTransport(selectedTransport);
  const layout = layoutFor(config, { namespace, deploymentId }, id);

  // AES-GCM intentionally uses a fresh IV for every upload. A retry of the
  // same backup therefore cannot compare ciphertext hashes; verify the
  // completed remote payload against the local plaintext snapshot instead.
  // This preserves idempotency without making encryption deterministic.
  if (await statExists(selectedTransport, layout.complete)) {
    const existing = await verifyRemoteBackup({
      transport: selectedTransport,
      env,
      backupId: id,
      namespace,
      deploymentId,
    });
    const existingTemp = await mkdtemp(join(tmpdir(), 'ja-continuity-idempotency-'));
    try {
      const existingSnapshotPath = join(existingTemp, 'snapshot.bundle.enc');
      const existingManifestPath = join(existingTemp, 'manifest.json.enc');
      await downloadTransportFile(selectedTransport, layout.snapshot, existingSnapshotPath);
      await downloadTransportFile(selectedTransport, layout.manifest, existingManifestPath);
      const existingSnapshot = parseBundlePayload(
        decrypt(await readFile(existingSnapshotPath), key),
      );
      const existingManifest = parseEncryptedManifest(
        decrypt(await readFile(existingManifestPath), key),
      );
      if (
        canonicalJson(existingSnapshot.manifest) !== canonicalJson(existingManifest) ||
        !snapshotsMatch(existingSnapshot, snapshot)
      )
        throw new ContinuityBackupError(
          'Remote continuity backup identifier already contains a different snapshot',
          'CONTINUITY_REMOTE_CONFLICT',
        );
      const retained = await applyRemoteRetention({
        transport: selectedTransport,
        namespace: layout.namespace,
        currentBackupId: layout.backupId,
        retentionDays: days,
        now,
      });
      return {
        status: 'READY',
        state: 'ready',
        backupId: layout.backupId,
        remoteDirectory: layout.directory,
        idempotent: true,
        retained,
        marker: existing.marker,
      };
    } finally {
      await removeSafePath(existingTemp, {
        recursive: true,
        label: 'continuity idempotency staging',
      }).catch(() => undefined);
    }
  }

  const token = randomUUID();
  layout.snapshotPartial = `${layout.directory}/snapshot.bundle.enc.partial-${token}`;
  layout.manifestPartial = `${layout.directory}/manifest.json.enc.partial-${token}`;
  layout.completePartial = `${layout.directory}/complete.json.partial-${token}`;
  const snapshotEncrypted = encrypt(bundlePayload(snapshot), key);
  const manifestEncrypted = encrypt(Buffer.from(canonicalJson(snapshot.manifest), 'utf8'), key);
  const marker = markerValue(
    layout,
    snapshotEncrypted,
    manifestEncrypted,
    now,
    days,
    snapshot.manifest.createdAt,
  );
  const markerBytes = Buffer.from(`${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  const expectedSnapshot = {
    sha256: digest(snapshotEncrypted),
    byteLength: snapshotEncrypted.byteLength,
  };
  const expectedManifest = {
    sha256: digest(manifestEncrypted),
    byteLength: manifestEncrypted.byteLength,
  };
  const expectedMarker = { sha256: digest(markerBytes), byteLength: markerBytes.byteLength };

  for (const finalPath of [layout.snapshot, layout.manifest]) {
    if (await statExists(selectedTransport, finalPath))
      throw new ContinuityBackupError(
        'Remote continuity backup has an incomplete final state',
        'CONTINUITY_REMOTE_INCOMPLETE',
      );
  }

  const localTemp = await mkdtemp(join(tmpdir(), 'ja-continuity-upload-'));
  const localSnapshot = join(localTemp, 'snapshot.bundle.enc');
  const localManifest = join(localTemp, 'manifest.json.enc');
  const localMarker = join(localTemp, 'complete.json');
  const ownedFinalPaths = [];
  let complete = false;
  try {
    await writeDurableFile(localSnapshot, snapshotEncrypted);
    await writeDurableFile(localManifest, manifestEncrypted);
    await writeDurableFile(localMarker, markerBytes);
    await selectedTransport.ensureDirectory(layout.directory);
    await selectedTransport.put(localSnapshot, layout.snapshotPartial);
    await verifyRemoteFile(selectedTransport, layout.snapshotPartial, expectedSnapshot);
    await selectedTransport.put(localManifest, layout.manifestPartial);
    await verifyRemoteFile(selectedTransport, layout.manifestPartial, expectedManifest);
    await selectedTransport.rename(layout.snapshotPartial, layout.snapshot);
    ownedFinalPaths.push(layout.snapshot);
    await selectedTransport.rename(layout.manifestPartial, layout.manifest);
    ownedFinalPaths.push(layout.manifest);
    await verifyRemoteFile(selectedTransport, layout.snapshot, expectedSnapshot);
    await verifyRemoteFile(selectedTransport, layout.manifest, expectedManifest);
    await selectedTransport.put(localMarker, layout.completePartial);
    await verifyRemoteFile(selectedTransport, layout.completePartial, expectedMarker);
    await selectedTransport.rename(layout.completePartial, layout.complete);
    ownedFinalPaths.push(layout.complete);
    const finalizedMarker = await markerFromRemote(selectedTransport, layout);
    if (canonicalJson(finalizedMarker) !== canonicalJson(marker))
      throw new ContinuityBackupError(
        'Remote continuity completion marker changed during finalization',
        'CONTINUITY_REMOTE_INTEGRITY_MISMATCH',
      );
    complete = true;
    const retained = await applyRemoteRetention({
      transport: selectedTransport,
      namespace: layout.namespace,
      currentBackupId: layout.backupId,
      retentionDays: days,
      now,
    });
    return {
      status: 'READY',
      state: 'ready',
      backupId: layout.backupId,
      remoteDirectory: layout.directory,
      idempotent: false,
      retained,
      marker,
    };
  } catch (error) {
    // A marker is never written before both final encrypted files are checked.
    // Remove only paths created by this invocation; never overwrite a prior
    // completed backup or expose a transport's command output.
    await removeQuietly(selectedTransport, layout.snapshotPartial);
    await removeQuietly(selectedTransport, layout.manifestPartial);
    await removeQuietly(selectedTransport, layout.completePartial);
    if (!complete) {
      for (const path of ownedFinalPaths) await removeQuietly(selectedTransport, path);
    }
    if (error instanceof ContinuityBackupError) throw error;
    throw new ContinuityBackupError(
      'Encrypted continuity backup replication failed',
      'CONTINUITY_REMOTE_TRANSFER_FAILED',
      { cause: error },
    );
  } finally {
    await removeSafePath(localTemp, {
      recursive: true,
      label: 'continuity upload staging',
    }).catch(() => undefined);
  }
}

function markerAgeMs(marker, now) {
  const completedAt = Date.parse(marker.completedAt);
  return Number.isFinite(completedAt) ? Math.max(0, now.getTime() - completedAt) : 0;
}

export async function applyRemoteRetention({
  transport,
  namespace,
  currentBackupId,
  retentionDays = DEFAULT_RETENTION_DAYS,
  now = new Date(),
} = {}) {
  assertTransport(transport);
  if (!Number.isSafeInteger(retentionDays) || retentionDays < DEFAULT_RETENTION_DAYS)
    throw new ContinuityBackupError(
      `Remote retention must be at least ${DEFAULT_RETENTION_DAYS} days`,
      'CONTINUITY_CONFIG_INVALID',
    );
  const cutoff = retentionDays * 86_400_000;
  const removed = [];
  const entries = await transport.list(namespace);
  for (const entry of entries) {
    if (!entry?.isDirectory || typeof entry.path !== 'string') continue;
    const id = entry.path.split('/').at(-1);
    if (!id || id === currentBackupId || !COMPONENT_PATTERN.test(id)) continue;
    const markerPath = `${entry.path}/complete.json`;
    if (!(await statExists(transport, markerPath))) continue;
    let marker;
    try {
      marker = validateMarker(JSON.parse((await transport.read(markerPath)).toString('utf8')), id);
    } catch {
      // A malformed marker is not an eligible retention candidate. Keep it so
      // an operator can diagnose the incomplete/corrupt remote state.
      continue;
    }
    try {
      await verifyRemoteFile(transport, `${entry.path}/snapshot.bundle.enc`, marker.snapshot);
      await verifyRemoteFile(transport, `${entry.path}/manifest.json.enc`, marker.manifest);
    } catch {
      // Never remove a directory whose marker or encrypted payload is
      // incomplete. Preserve it for an operator-led recovery investigation.
      continue;
    }
    const age = markerAgeMs(marker, now);
    if (age > cutoff) {
      await transport.remove(entry.path, { recursive: true });
      removed.push(id);
    }
  }
  return removed.sort();
}

async function findLatestRemoteBackup(transport, namespace) {
  const candidates = [];
  for (const entry of await transport.list(namespace)) {
    if (!entry?.isDirectory || typeof entry.path !== 'string') continue;
    const id = entry.path.split('/').at(-1);
    if (!id || !COMPONENT_PATTERN.test(id)) continue;
    const completePath = `${entry.path}/complete.json`;
    if (!(await statExists(transport, completePath))) continue;
    try {
      const marker = validateMarker(
        JSON.parse((await transport.read(completePath)).toString('utf8')),
        id,
      );
      candidates.push({ id, completedAt: Date.parse(marker.completedAt) || 0 });
    } catch {
      // Ignore incomplete candidates; an explicit backup ID reports the exact
      // incomplete state to the operator.
    }
  }
  candidates.sort(
    (left, right) => right.completedAt - left.completedAt || right.id.localeCompare(left.id),
  );
  return candidates[0]?.id;
}

/** Verify final remote files and return the authenticated completion marker. */
export async function verifyRemoteBackup({
  transport,
  env = process.env,
  backupId,
  namespace,
  deploymentId,
} = {}) {
  assertTransport(transport);
  const config = getContinuityConfig(env);
  const selectedId = validateBackupId(backupId);
  const layout = layoutFor(config, { namespace, deploymentId }, selectedId);
  const marker = await markerFromRemote(transport, layout);
  await verifyRemoteFile(transport, layout.snapshot, marker.snapshot);
  await verifyRemoteFile(transport, layout.manifest, marker.manifest);
  return { layout, marker };
}

async function downloadTransportFile(transport, remote, local) {
  await assertNoSymlinkComponents(dirname(local), {
    allowMissing: true,
    label: 'continuity restore parent',
  });
  await mkdir(dirname(local), { recursive: true });
  await transport.download(remote, local);
  const checked = await assertSafePath(local, { label: 'continuity downloaded file' });
  if (!checked.stats.isFile())
    throw new ContinuityBackupError(
      'Downloaded continuity artifact is not a regular file',
      'CONTINUITY_REMOTE_INCOMPLETE',
    );
}

/** Restore a verified remote backup into isolated targets. */
export async function restoreRemoteBackup({
  transport,
  env = process.env,
  encryptionKey,
  backupId,
  namespace,
  deploymentId,
  databasePath,
  documentRoot,
  tempRoot,
} = {}) {
  assertIsolatedRestoreTargets({
    environment: env,
    databasePath,
    documentRoot,
    tempRoot,
  });
  await assertRestoreTargetSafety({ databasePath, documentRoot, tempRoot });
  const config = getContinuityConfig(env);
  const readiness = await checkContinuityReadiness({ env, transport, encryptionKey });
  if (!readiness.ok) throw blockedFromReadiness(readiness);
  const key = decodeEncryptionKey(encryptionKey ?? config.encryptionKey);
  const selectedTransport = transport ?? new SshTransport(config);
  assertTransport(selectedTransport);
  const namespaceValue = namespaceFor(config, { namespace, deploymentId });
  const selectedId = backupId ?? (await findLatestRemoteBackup(selectedTransport, namespaceValue));
  if (!selectedId)
    throw new ContinuityBackupError(
      'No completed remote continuity backup is available',
      'CONTINUITY_REMOTE_INCOMPLETE',
    );
  const { layout, marker } = await verifyRemoteBackup({
    transport: selectedTransport,
    env,
    backupId: selectedId,
    namespace,
    deploymentId,
  });
  const root = await mkdtemp(
    join(tempRoot ? resolve(tempRoot) : tmpdir(), 'ja-continuity-restore-'),
  );
  const downloaded = join(root, 'downloaded');
  const encryptedSnapshot = join(downloaded, 'snapshot.bundle.enc');
  const encryptedManifest = join(downloaded, 'manifest.json.enc');
  const extracted = join(root, 'backup');
  try {
    await downloadTransportFile(selectedTransport, layout.snapshot, encryptedSnapshot);
    await downloadTransportFile(selectedTransport, layout.manifest, encryptedManifest);
    const snapshotBytes = await readFile(encryptedSnapshot);
    const manifestBytes = await readFile(encryptedManifest);
    if (
      digest(snapshotBytes) !== marker.snapshot.sha256 ||
      snapshotBytes.byteLength !== marker.snapshot.byteLength ||
      digest(manifestBytes) !== marker.manifest.sha256 ||
      manifestBytes.byteLength !== marker.manifest.byteLength
    )
      throw new ContinuityBackupError(
        'Downloaded continuity backup failed completion-marker verification',
        'CONTINUITY_REMOTE_PARTIAL_TRANSFER',
      );
    const bundle = parseBundlePayload(decrypt(snapshotBytes, key));
    const sidecarManifest = parseEncryptedManifest(decrypt(manifestBytes, key));
    if (canonicalJson(bundle.manifest) !== canonicalJson(sidecarManifest))
      throw new ContinuityBackupError(
        'Encrypted continuity manifest does not match the snapshot',
        'CONTINUITY_REMOTE_INTEGRITY_MISMATCH',
      );
    const backupDocuments = join(extracted, 'documents');
    await mkdir(backupDocuments, { recursive: true });
    await writeDurableFile(join(extracted, 'database.db'), bundle.databaseBytes);
    for (const document of bundle.documents) {
      const target = localPathInside(
        backupDocuments,
        document.path,
        'continuity restored document',
      );
      await assertNoSymlinkComponents(dirname(target), {
        allowMissing: true,
        label: 'continuity restored document parent',
      });
      await mkdir(dirname(target), { recursive: true });
      await writeDurableFile(target, document.content);
    }
    await writeDurableFile(
      join(extracted, 'manifest.json'),
      Buffer.from(`${JSON.stringify(bundle.manifest, null, 2)}\n`, 'utf8'),
    );
    await verifyLocalBackup(extracted);
    const restored = await import('./restore.mjs').then(({ restoreBackup }) =>
      restoreBackup({
        backupPath: extracted,
        databasePath,
        documentRoot,
      }),
    );
    return {
      status: 'PASS',
      state: 'pass',
      backupId: layout.backupId,
      marker,
      restored,
    };
  } finally {
    await removeSafePath(root, {
      recursive: true,
      label: 'continuity restore staging',
    }).catch(() => undefined);
  }
}

/**
 * A release-gate-friendly drill result. Missing real SSH credentials are a
 * BLOCKED result (not a fake PASS), while test callers can provide a fake
 * transport and an explicit key to exercise the complete mechanics.
 */
export async function runRemoteRestoreDrill(options = {}) {
  const readiness = await checkContinuityReadiness(options);
  if (!readiness.ok)
    return {
      status: 'BLOCKED',
      state: 'blocked',
      blocked: true,
      issues: readiness.issues,
      readiness,
    };
  try {
    const result = await restoreRemoteBackup(options);
    return { ...result, drill: true, blocked: false };
  } catch (error) {
    return {
      status: 'FAIL',
      state: 'failed',
      blocked: false,
      code: errorCode(error) ?? 'CONTINUITY_RESTORE_DRILL_FAILED',
      error: publicError(error, 'Remote continuity restore drill failed'),
    };
  }
}

/**
 * Local filesystem transport used by deterministic tests and dry-run tooling.
 * It models the SSH transport's atomic file operations without contacting a
 * host. `fault` may return altered bytes to prove partial-transfer detection.
 */
export class FilesystemContinuityTransport {
  constructor(root, { fault, operations = [] } = {}) {
    this.root = resolve(root);
    this.fault = fault;
    this.operations = operations;
  }

  path(value) {
    const result = localPathInside(
      this.root,
      safeRelative(value, 'filesystem transport path'),
      'transport path',
    );
    return result;
  }

  async ensureDirectory(value) {
    this.operations.push({ operation: 'ensureDirectory', path: value });
    await assertNoSymlinkComponents(this.root, { allowMissing: true, label: 'fake remote root' });
    const path = this.path(value);
    await assertNoSymlinkComponents(path, { allowMissing: true, label: 'fake remote directory' });
    await mkdir(path, { recursive: true });
    await assertSafePath(path, { directory: true, label: 'fake remote directory' });
  }

  async put(local, remote) {
    this.operations.push({ operation: 'put', path: remote });
    const target = this.path(remote);
    await this.ensureDirectory(dirname(relative(this.root, target)).replaceAll('\\', '/'));
    const sourceCheck = await assertSafePath(local, { label: 'fake upload source' });
    if (!sourceCheck.stats.isFile())
      throw new ContinuityBackupError(
        'Fake upload source is not a file',
        'CONTINUITY_TRANSPORT_INVALID',
      );
    let content = await readFile(local);
    if (typeof this.fault === 'function')
      content = bytes((await this.fault(content, remote)) ?? content);
    await writeDurableFile(target, content);
  }

  async read(remote) {
    this.operations.push({ operation: 'read', path: remote });
    const path = await this.safeFile(remote, 'fake remote read source');
    return readFile(path);
  }

  async download(remote, local) {
    this.operations.push({ operation: 'download', path: remote });
    const source = await this.safeFile(remote, 'fake remote download source');
    await assertNoSymlinkComponents(dirname(local), {
      allowMissing: true,
      label: 'fake download parent',
    });
    await mkdir(dirname(local), { recursive: true });
    await cp(source, local, { force: false, errorOnExist: true });
  }

  async hash(remote) {
    const path = await this.safeFile(remote, 'fake remote hash source');
    return digest(await readFile(path));
  }

  async safeFile(remote, label) {
    try {
      const checked = await assertSafePath(this.path(remote), { label });
      if (!checked.stats.isFile())
        throw new ContinuityBackupError(
          'Fake remote continuity artifact is not a regular file',
          'CONTINUITY_REMOTE_INCOMPLETE',
        );
      return checked.path;
    } catch (error) {
      if (error instanceof ContinuityBackupError) throw error;
      throw new ContinuityBackupError(
        'Fake remote continuity artifact is unavailable or unsafe',
        'CONTINUITY_REMOTE_INCOMPLETE',
        { cause: error },
      );
    }
  }

  async stat(remote) {
    try {
      const checked = await assertSafePath(this.path(remote), {
        allowMissing: true,
        label: 'fake remote path',
      });
      if (!checked.exists)
        return {
          exists: false,
          isFile: false,
          isDirectory: false,
          byteLength: null,
          mtimeMs: null,
        };
      return {
        exists: true,
        isFile: checked.stats.isFile(),
        isDirectory: checked.stats.isDirectory(),
        byteLength: checked.stats.isFile() ? checked.stats.size : null,
        mtimeMs: checked.stats.mtimeMs,
      };
    } catch {
      return { exists: false, isFile: false, isDirectory: false, byteLength: null, mtimeMs: null };
    }
  }

  async rename(source, target) {
    this.operations.push({ operation: 'rename', path: `${source}->${target}` });
    const from = this.path(source);
    const to = this.path(target);
    await assertNoSymlinkComponents(dirname(to), {
      allowMissing: true,
      label: 'fake rename parent',
    });
    const existing = await assertSafePath(to, { allowMissing: true, label: 'fake rename target' });
    if (existing.exists)
      throw new ContinuityBackupError(
        'Fake remote rename target already exists',
        'CONTINUITY_REMOTE_CONFLICT',
      );
    await rename(from, to);
  }

  async remove(value, { recursive = false } = {}) {
    this.operations.push({ operation: 'remove', path: value });
    const path = this.path(value);
    await removeSafePath(path, { recursive, label: 'fake remote cleanup' });
  }

  async list(value) {
    this.operations.push({ operation: 'list', path: value });
    const root = this.path(value);
    const checked = await assertSafePath(root, {
      allowMissing: true,
      directory: true,
      label: 'fake remote list root',
    });
    if (!checked.exists) return [];
    const result = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = `${value}/${entry.name}`;
      const info = await this.stat(path);
      result.push({
        path,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        mtimeMs: info.mtimeMs,
      });
    }
    return result;
  }
}

export function createFilesystemContinuityTransport(root, options) {
  return new FilesystemContinuityTransport(root, options);
}

export function createFakeSshTransport(root, options) {
  return new FilesystemContinuityTransport(root, options);
}

export function createDryRunContinuityTransport() {
  const operations = [];
  return {
    operations,
    async ensureDirectory(path) {
      operations.push({ operation: 'ensureDirectory', path });
    },
    async put(local, path) {
      operations.push({ operation: 'put', local: basename(local), path });
    },
    async read() {
      throw new ContinuityBackupError(
        'Dry-run transport has no remote bytes',
        'CONTINUITY_TRANSPORT_DRY_RUN',
      );
    },
    async download() {
      throw new ContinuityBackupError(
        'Dry-run transport has no remote bytes',
        'CONTINUITY_TRANSPORT_DRY_RUN',
      );
    },
    async hash() {
      throw new ContinuityBackupError(
        'Dry-run transport has no remote bytes',
        'CONTINUITY_TRANSPORT_DRY_RUN',
      );
    },
    async stat() {
      return { exists: false, isFile: false, isDirectory: false, byteLength: null, mtimeMs: null };
    },
    async rename(source, target) {
      operations.push({ operation: 'rename', path: `${source}->${target}` });
    },
    async remove(path) {
      operations.push({ operation: 'remove', path });
    },
    async list(path) {
      operations.push({ operation: 'list', path });
      return [];
    },
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function remoteSymlinkGuard(root, target) {
  const base = remoteRoot(root);
  const candidate = remotePath(root, target);
  const remainder = posix.relative(base, candidate);
  const components = [base];
  if (remainder) {
    let current = base;
    for (const component of remainder.split('/')) {
      current = posix.join(current, component);
      components.push(current);
    }
  }
  return components.map((component) => `test ! -L ${shellQuote(component)}`).join(' && ');
}

/** Real SSH/SCP transport. All command failures are intentionally redacted. */
export class SshContinuityTransport {
  constructor({
    host,
    user,
    port = 22,
    sshKey,
    remoteRoot: configuredRemoteRoot = DEFAULT_REMOTE_ROOT,
    sshCommand = 'ssh',
    scpCommand = 'scp',
  } = {}) {
    if (!configuredString(host) || !configuredString(user) || !configuredString(sshKey))
      throw new ContinuityBackupError(
        'Separate-host SSH credentials are not configured',
        'CONTINUITY_BACKUP_BLOCKED',
        { status: 'BLOCKED' },
      );
    validateSshEndpointPart(host, 'remote backup hostname', { allowColon: true });
    validateSshEndpointPart(user, 'remote backup user');
    if (!Number.isInteger(port) || port < 1 || port > 65_535)
      throw new ContinuityBackupError('SSH port is invalid', 'CONTINUITY_CONFIG_INVALID');
    const normalizedRemoteRoot = remoteRoot(configuredRemoteRoot);
    this.host = host;
    this.user = user;
    this.port = port;
    this.sshKey = sshKey;
    this.remoteRoot = normalizedRemoteRoot;
    this.sshCommand = sshCommand;
    this.scpCommand = scpCommand;
    this.destination = `${user}@${host}`;
  }

  remote(value) {
    return remotePath(this.remoteRoot, value);
  }

  symlinkGuard(value) {
    return remoteSymlinkGuard(this.remoteRoot, value);
  }

  async runRemote(operation, command) {
    try {
      const result = await execFile(
        this.sshCommand,
        [
          '-i',
          this.sshKey,
          '-p',
          String(this.port),
          '-o',
          'BatchMode=yes',
          '-o',
          'StrictHostKeyChecking=yes',
          this.destination,
          command,
        ],
        { encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      );
      return result.stdout;
    } catch {
      throw new ContinuityBackupError(
        `Remote continuity ${operation} failed`,
        'CONTINUITY_REMOTE_TRANSPORT_FAILED',
      );
    }
  }

  async ensureDirectory(value) {
    const path = this.remote(value);
    const guard = this.symlinkGuard(value);
    await this.runRemote(
      'directory preparation',
      `${guard} && mkdir -p -- ${shellQuote(path)} && ${guard} && test -d ${shellQuote(path)}`,
    );
  }

  async put(local, remote) {
    const destination = this.remote(remote);
    await this.runRemote(
      'upload destination check',
      `${this.symlinkGuard(remote)} && test ! -e ${shellQuote(destination)}`,
    );
    try {
      await execFile(
        this.scpCommand,
        [
          '-i',
          this.sshKey,
          '-P',
          String(this.port),
          '-o',
          'BatchMode=yes',
          '-o',
          'StrictHostKeyChecking=yes',
          local,
          `${this.destination}:${destination}`,
        ],
        { encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      );
    } catch {
      throw new ContinuityBackupError(
        'Remote continuity upload failed',
        'CONTINUITY_REMOTE_TRANSPORT_FAILED',
      );
    }
  }

  async read(remote) {
    const path = this.remote(remote);
    return Buffer.from(
      await this.runRemote(
        'marker read',
        `${this.symlinkGuard(remote)} && test -f ${shellQuote(path)} && cat -- ${shellQuote(path)}`,
      ),
      'utf8',
    );
  }

  async download(remote, local) {
    const source = this.remote(remote);
    await this.runRemote(
      'download source check',
      `${this.symlinkGuard(remote)} && test -f ${shellQuote(source)}`,
    );
    try {
      await execFile(
        this.scpCommand,
        [
          '-i',
          this.sshKey,
          '-P',
          String(this.port),
          '-o',
          'BatchMode=yes',
          '-o',
          'StrictHostKeyChecking=yes',
          `${this.destination}:${source}`,
          local,
        ],
        { encoding: 'buffer', windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      );
    } catch {
      throw new ContinuityBackupError(
        'Remote continuity download failed',
        'CONTINUITY_REMOTE_TRANSPORT_FAILED',
      );
    }
  }

  async hash(remote) {
    const path = this.remote(remote);
    const output = await this.runRemote(
      'hash verification',
      `${this.symlinkGuard(remote)} && test -f ${shellQuote(path)} && sha256sum -- ${shellQuote(path)}`,
    );
    const value = output.trim().split(/\s+/u)[0];
    if (!isDigest(value))
      throw new ContinuityBackupError(
        'Remote continuity hash is invalid',
        'CONTINUITY_REMOTE_INCOMPLETE',
      );
    return value;
  }

  async stat(remote) {
    const path = this.remote(remote);
    const output = await this.runRemote(
      'file verification',
      `if ${this.symlinkGuard(remote)}; then if [ -f ${shellQuote(path)} ]; then stat --printf='FILE\\t%s\\t%Y' -- ${shellQuote(path)}; elif [ -d ${shellQuote(path)} ]; then stat --printf='DIRECTORY\\t0\\t%Y' -- ${shellQuote(path)}; elif [ -e ${shellQuote(path)} ]; then printf 'OTHER'; else printf 'MISSING'; fi; else printf 'SYMLINK'; fi`,
    );
    if (output.trim() === 'MISSING')
      return { exists: false, isFile: false, isDirectory: false, byteLength: null, mtimeMs: null };
    if (output.trim() === 'SYMLINK')
      throw new ContinuityBackupError(
        'Remote continuity backup path contains a symbolic link',
        'CONTINUITY_REMOTE_INCOMPLETE',
      );
    const [type, length, mtime] = output.trim().split('\t');
    return {
      exists: true,
      isFile: type === 'FILE',
      isDirectory: type === 'DIRECTORY',
      byteLength: Number(length),
      mtimeMs: Number(mtime) * 1000,
    };
  }

  async rename(source, target) {
    const sourcePath = this.remote(source);
    const targetPath = this.remote(target);
    await this.runRemote(
      'atomic finalization',
      `${this.symlinkGuard(source)} && ${this.symlinkGuard(target)} && test ! -e ${shellQuote(targetPath)} && mv -- ${shellQuote(sourcePath)} ${shellQuote(targetPath)}`,
    );
  }

  async remove(value, { recursive = false } = {}) {
    const command = recursive ? 'rm -rf --' : 'rm -f --';
    await this.runRemote(
      'cleanup',
      `${this.symlinkGuard(value)} && ${command} ${shellQuote(this.remote(value))}`,
    );
  }

  async list(value) {
    const path = this.remote(value);
    const output = await this.runRemote(
      'retention listing',
      `if ${this.symlinkGuard(value)}; then if [ -d ${shellQuote(path)} ]; then find ${shellQuote(path)} -mindepth 1 -maxdepth 1 -type d -printf '%f\\t%T@\\n'; fi; else exit 23; fi`,
    );
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, mtime] = line.split('\t');
        if (!COMPONENT_PATTERN.test(name)) return null;
        return {
          path: `${value}/${name}`,
          isDirectory: true,
          isFile: false,
          mtimeMs: Number(mtime) * 1000,
        };
      })
      .filter(Boolean);
  }
}

export class SshTransport extends SshContinuityTransport {}

export function createSshContinuityTransport(config = getContinuityConfig()) {
  return new SshContinuityTransport(config);
}

export function createSshTransport(config = getContinuityConfig()) {
  return new SshContinuityTransport(config);
}

export async function runContinuityBackup({
  env = process.env,
  databasePath,
  documentRoot,
  backupRoot,
  transport,
  encryptionKey,
  now = new Date(),
} = {}) {
  const sourceDatabasePath = configuredLocalPath(
    databasePath ?? env.JA_DATABASE_PATH,
    resolve('/var/lib/jaautomation/data/jaautomation.sqlite'),
    'source database path',
  );
  const sourceDocumentRoot = configuredLocalPath(
    documentRoot ?? env.JA_DOCUMENT_ROOT,
    resolve('/var/lib/jaautomation/files'),
    'private document root',
  );
  const localBackupRoot = configuredLocalPath(
    backupRoot ?? env.JA_BACKUP_ROOT,
    '/var/backups/jaautomation',
    'local backup root',
  );
  const local = await createBackup({
    databasePath: sourceDatabasePath,
    documentRoot: sourceDocumentRoot,
    backupRoot: localBackupRoot,
  });
  const config = getContinuityConfig(env);
  if (!config.enabled)
    return {
      status: 'DISABLED',
      state: 'disabled',
      localBackup: local.path,
      manifest: local.manifest,
    };
  const readiness = await checkContinuityReadiness({ env, transport, encryptionKey });
  if (!readiness.ok)
    return {
      status: 'BLOCKED',
      state: 'blocked',
      blocked: true,
      localBackup: local.path,
      readiness,
    };
  const remote = await replicateBackup({
    backupPath: local.path,
    transport,
    env,
    encryptionKey,
    now,
  });
  return { ...remote, localBackup: local.path };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--readiness')) {
    const readiness = await checkContinuityReadiness();
    console.log(JSON.stringify({ event: 'continuity-backup.readiness', ...readiness }));
    if (!readiness.ok) process.exitCode = 2;
    return;
  }
  if (args.has('--restore-drill')) {
    const result = await runRemoteRestoreDrill({
      env: process.env,
      backupId: process.env.JA_BACKUP_RESTORE_ID,
      databasePath:
        process.env.JA_RESTORE_DATABASE_PATH ??
        '/var/lib/jaautomation/restore-drill/database.sqlite',
      documentRoot:
        process.env.JA_RESTORE_DOCUMENT_ROOT ?? '/var/lib/jaautomation/restore-drill/files',
    });
    console.log(JSON.stringify({ event: 'continuity-backup.restore-drill', ...result }));
    if (result.status === 'BLOCKED' || result.status === 'FAIL')
      process.exitCode = result.status === 'BLOCKED' ? 2 : 1;
    return;
  }
  try {
    const result = await runContinuityBackup();
    console.log(
      JSON.stringify({
        event: 'continuity-backup.completed',
        status: result.status,
        state: result.state,
        backupId: result.backupId,
        localBackup: result.localBackup,
        remoteDirectory: result.remoteDirectory,
      }),
    );
    if (result.status === 'BLOCKED') process.exitCode = 2;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'continuity-backup.failed',
        code: errorCode(error) ?? 'CONTINUITY_BACKUP_FAILED',
        error: publicError(error, 'Encrypted continuity backup failed'),
      }),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))
  await main();
