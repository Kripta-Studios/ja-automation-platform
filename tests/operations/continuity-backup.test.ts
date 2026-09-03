import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { symlinkSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBackup } from '../../deployment/scripts/backup.mjs';
import {
  checkContinuityReadiness,
  createFilesystemContinuityTransport,
  continuityReadiness,
  decodeEncryptionKey,
  replicateBackup,
  runContinuityBackup,
  runRemoteRestoreDrill,
  verifyLocalBackup,
  verifyRemoteBackup,
} from '../../deployment/scripts/continuity-backup.mjs';

const roots: string[] = [];
const KEY = Buffer.alloc(32, 0x2a);
const WRONG_KEY = Buffer.alloc(32, 0x7f);
const NOW = new Date('2026-08-27T12:00:00.000Z');

function hash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function continuityEnv() {
  return {
    JA_BACKUP_REMOTE_ENABLED: 'true',
    JA_BACKUP_REMOTE_RETENTION_DAYS: '30',
    JA_BACKUP_REMOTE_NAMESPACE: 'continuity-tests',
    JA_DEPLOYMENT_ID: 'test-deployment',
    JA_BACKUP_ENCRYPTION_KEY: KEY.toString('hex'),
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ja-continuity-test-'));
  roots.push(root);
  const source = join(root, 'source.db');
  const documents = join(root, 'documents');
  const backups = join(root, 'backups');
  const remote = join(root, 'remote');
  const restored = join(root, 'restored');
  await mkdir(join(documents, 'reports'), { recursive: true });
  const database = new DatabaseSync(source);
  database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE evidence(id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    INSERT INTO evidence VALUES ('continuity-row', 'private operational truth');
  `);
  database.close();
  await writeFile(join(documents, 'reports', 'receipt.txt'), 'private receipt bytes\n', 'utf8');
  await writeFile(join(documents, 'notes.txt'), 'technical attachment bytes\n', 'utf8');
  const local = await createBackup({
    databasePath: source,
    documentRoot: documents,
    backupRoot: backups,
  });
  return { root, source, documents, backups, remote, restored, local };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('encrypted continuity backup operations', () => {
  it('verifies a complete local backup and rejects altered or unexpected snapshot contents', async () => {
    const value = await fixture();
    const verified = await verifyLocalBackup(value.local.path);

    expect(verified.manifest.database.path).toBe('database.db');
    expect(verified.manifest.documents).toEqual([
      {
        path: 'notes.txt',
        sha256: hash(Buffer.from('technical attachment bytes\n', 'utf8')),
        byteLength: Buffer.byteLength('technical attachment bytes\n'),
      },
      {
        path: 'reports/receipt.txt',
        sha256: hash(Buffer.from('private receipt bytes\n', 'utf8')),
        byteLength: Buffer.byteLength('private receipt bytes\n'),
      },
    ]);

    await writeFile(join(value.local.path, 'database.db'), Buffer.from('not a database'));
    await expect(verifyLocalBackup(value.local.path)).rejects.toMatchObject({
      code: 'CONTINUITY_SNAPSHOT_INTEGRITY_MISMATCH',
    });

    const second = await fixture();
    await writeFile(join(second.local.path, 'unexpected.partial'), 'incomplete');
    await expect(verifyLocalBackup(second.local.path)).rejects.toMatchObject({
      code: 'CONTINUITY_SNAPSHOT_INCOMPLETE',
    });
  });

  it('encrypts database and private documents with authenticated AES-GCM payloads', async () => {
    const value = await fixture();
    const env = continuityEnv();
    const transport = createFilesystemContinuityTransport(value.remote);
    const result = await replicateBackup({
      backupPath: value.local.path,
      backupId: 'aes-gcm-1',
      transport,
      env,
      encryptionKey: KEY,
      now: NOW,
    });

    expect(result.status).toBe('READY');
    const snapshotPath = join(
      value.remote,
      'continuity-tests',
      'test-deployment',
      'aes-gcm-1',
      'snapshot.bundle.enc',
    );
    const encrypted = await readFile(snapshotPath);
    expect(encrypted.toString('utf8')).not.toContain('private operational truth');
    expect(encrypted.toString('utf8')).not.toContain('private receipt bytes');

    await expect(
      runRemoteRestoreDrill({
        transport,
        env,
        encryptionKey: WRONG_KEY,
        backupId: 'aes-gcm-1',
        databasePath: join(value.restored, 'wrong-key.sqlite'),
        documentRoot: join(value.restored, 'wrong-key-files'),
      }),
    ).resolves.toMatchObject({ status: 'FAIL', code: 'CONTINUITY_BUNDLE_INTEGRITY_MISMATCH' });
  });

  it('writes the completion marker only after both final files verify and removes partial transfers', async () => {
    const value = await fixture();
    const env = continuityEnv();
    const transport = createFilesystemContinuityTransport(value.remote, {
      fault: (content, remotePath) => {
        if (remotePath.includes('snapshot.bundle.enc.partial', 0)) {
          const corrupted = Buffer.from(content);
          corrupted[corrupted.length - 1] ^= 0xff;
          return corrupted;
        }
        return content;
      },
    });

    await expect(
      replicateBackup({
        backupPath: value.local.path,
        backupId: 'partial-1',
        transport,
        env,
        encryptionKey: KEY,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'CONTINUITY_REMOTE_PARTIAL_TRANSFER' });

    const directory = join(value.remote, 'continuity-tests', 'test-deployment', 'partial-1');
    await expect(readFile(join(directory, 'complete.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(join(directory, 'snapshot.bundle.enc'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(join(directory, 'manifest.json.enc'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      transport.operations.some(
        (operation) =>
          operation.operation === 'put' && operation.path?.includes('complete.json.partial'),
      ),
    ).toBe(false);

    const healthy = createFilesystemContinuityTransport(join(value.root, 'healthy-remote'));
    await replicateBackup({
      backupPath: value.local.path,
      backupId: 'atomic-1',
      transport: healthy,
      env,
      encryptionKey: KEY,
      now: NOW,
    });
    const markerPut = healthy.operations.findIndex(
      (operation) =>
        operation.operation === 'put' && operation.path?.includes('complete.json.partial'),
    );
    const snapshotRename = healthy.operations.findIndex(
      (operation) =>
        operation.operation === 'rename' && operation.path?.endsWith('snapshot.bundle.enc'),
    );
    const manifestRename = healthy.operations.findIndex(
      (operation) =>
        operation.operation === 'rename' && operation.path?.endsWith('manifest.json.enc'),
    );
    expect(markerPut).toBeGreaterThan(snapshotRename);
    expect(markerPut).toBeGreaterThan(manifestRename);
  });

  it('retries the same backup ID idempotently despite randomized encryption IVs', async () => {
    const value = await fixture();
    const env = continuityEnv();
    const transport = createFilesystemContinuityTransport(value.remote);

    const first = await replicateBackup({
      backupPath: value.local.path,
      backupId: 'idempotent-1',
      transport,
      env,
      encryptionKey: KEY,
      now: NOW,
    });
    const uploadsAfterFirst = transport.operations.filter(
      (operation) => operation.operation === 'put',
    ).length;
    const second = await replicateBackup({
      backupPath: value.local.path,
      backupId: 'idempotent-1',
      transport,
      env,
      encryptionKey: KEY,
      now: NOW,
    });

    expect(first.idempotent).toBe(false);
    expect(second).toMatchObject({
      status: 'READY',
      state: 'ready',
      backupId: 'idempotent-1',
      idempotent: true,
    });
    expect(transport.operations.filter((operation) => operation.operation === 'put').length).toBe(
      uploadsAfterFirst,
    );
  });

  it('verifies remote hashes and applies a 30-day retention window', async () => {
    const value = await fixture();
    const env = continuityEnv();
    const transport = createFilesystemContinuityTransport(value.remote);
    const thirtyDays = 30 * 86_400_000;

    await replicateBackup({
      backupPath: value.local.path,
      backupId: 'old-31-days',
      transport,
      env,
      encryptionKey: KEY,
      now: new Date(NOW.getTime() - 31 * 86_400_000),
    });
    await replicateBackup({
      backupPath: value.local.path,
      backupId: 'exact-30-days',
      transport,
      env,
      encryptionKey: KEY,
      now: new Date(NOW.getTime() - thirtyDays),
    });
    await replicateBackup({
      backupPath: value.local.path,
      backupId: 'current',
      transport,
      env,
      encryptionKey: KEY,
      now: NOW,
    });

    const namespace = 'continuity-tests/test-deployment';
    expect((await transport.stat(`${namespace}/old-31-days/complete.json`)).exists).toBe(false);
    expect((await transport.stat(`${namespace}/exact-30-days/complete.json`)).exists).toBe(true);
    expect((await transport.stat(`${namespace}/current/complete.json`)).exists).toBe(true);

    const verified = await verifyRemoteBackup({
      transport,
      env,
      backupId: 'current',
    });
    expect(verified.marker.format).toBe('ja-continuity-complete-v1');
    expect(verified.marker.backupId).toBe('current');

    const snapshotPath = join(
      value.remote,
      'continuity-tests',
      'test-deployment',
      'current',
      'snapshot.bundle.enc',
    );
    const currentBytes = await readFile(snapshotPath);
    currentBytes[0] ^= 0xff;
    await writeFile(snapshotPath, currentBytes);
    await expect(verifyRemoteBackup({ transport, env, backupId: 'current' })).rejects.toMatchObject(
      {
        code: 'CONTINUITY_REMOTE_PARTIAL_TRANSFER',
      },
    );
  });

  it('does not delete a retention candidate with a malformed completion marker', async () => {
    const value = await fixture();
    const env = continuityEnv();
    const transport = createFilesystemContinuityTransport(value.remote);
    await replicateBackup({
      backupPath: value.local.path,
      backupId: 'malformed-old',
      transport,
      env,
      encryptionKey: KEY,
      now: new Date(NOW.getTime() - 31 * 86_400_000),
    });

    const markerPath = join(
      value.remote,
      'continuity-tests',
      'test-deployment',
      'malformed-old',
      'complete.json',
    );
    await writeFile(markerPath, '{"format":"not-a-complete-marker"}\n', 'utf8');
    await replicateBackup({
      backupPath: value.local.path,
      backupId: 'retention-current',
      transport,
      env,
      encryptionKey: KEY,
      now: NOW,
    });

    expect(
      (await transport.stat('continuity-tests/test-deployment/malformed-old/complete.json')).exists,
    ).toBe(true);
  });

  it('rejects a completion marker that advertises less than the required retention', async () => {
    const value = await fixture();
    const env = continuityEnv();
    const transport = createFilesystemContinuityTransport(value.remote);
    await replicateBackup({
      backupPath: value.local.path,
      backupId: 'short-retention-marker',
      transport,
      env,
      encryptionKey: KEY,
      now: NOW,
    });

    const markerPath = join(
      value.remote,
      'continuity-tests',
      'test-deployment',
      'short-retention-marker',
      'complete.json',
    );
    const marker = JSON.parse(await readFile(markerPath, 'utf8')) as {
      retentionDays: number;
    };
    marker.retentionDays = 1;
    await writeFile(markerPath, `${JSON.stringify(marker)}\n`, 'utf8');

    await expect(
      verifyRemoteBackup({ transport, env, backupId: 'short-retention-marker' }),
    ).rejects.toMatchObject({ code: 'CONTINUITY_REMOTE_INCOMPLETE' });
  });

  it('rejects a symlinked completion marker instead of following it', async () => {
    const value = await fixture();
    const env = continuityEnv();
    const transport = createFilesystemContinuityTransport(value.remote);
    await replicateBackup({
      backupPath: value.local.path,
      backupId: 'symlinked-marker',
      transport,
      env,
      encryptionKey: KEY,
      now: NOW,
    });

    const markerPath = join(
      value.remote,
      'continuity-tests',
      'test-deployment',
      'symlinked-marker',
      'complete.json',
    );
    const markerTarget = join(value.remote, 'marker-target.json');
    await writeFile(markerTarget, await readFile(markerPath));
    await rm(markerPath);
    try {
      symlinkSync(markerTarget, markerPath);
    } catch {
      // Symlink creation can be unavailable on a locked-down Windows host.
      return;
    }

    await expect(
      verifyRemoteBackup({ transport, env, backupId: 'symlinked-marker' }),
    ).rejects.toMatchObject({ code: 'CONTINUITY_REMOTE_INCOMPLETE' });
  });

  it('rejects a per-run retention override shorter than the required 30-day window', async () => {
    const value = await fixture();
    await expect(
      replicateBackup({
        backupPath: value.local.path,
        backupId: 'retention-too-short',
        transport: createFilesystemContinuityTransport(value.remote),
        env: continuityEnv(),
        encryptionKey: KEY,
        retentionDays: 1,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'CONTINUITY_CONFIG_INVALID' });
  });

  it('runs an isolated filesystem restore drill and recovers DB rows plus private artifacts', async () => {
    const value = await fixture();
    const env = continuityEnv();
    const transport = createFilesystemContinuityTransport(value.remote);
    await replicateBackup({
      backupPath: value.local.path,
      backupId: 'restore-drill-1',
      transport,
      env,
      encryptionKey: KEY,
      now: NOW,
    });

    const result = await runRemoteRestoreDrill({
      transport,
      env,
      encryptionKey: KEY,
      backupId: 'restore-drill-1',
      databasePath: join(value.restored, 'database.sqlite'),
      documentRoot: join(value.restored, 'files'),
      tempRoot: value.root,
    });

    expect(result.status).toBe('PASS');
    if (result.status !== 'PASS') return;
    const restoredDatabase = new DatabaseSync(result.restored.databasePath);
    expect(
      restoredDatabase.prepare('SELECT value FROM evidence WHERE id = ?').get('continuity-row'),
    ).toEqual({
      value: 'private operational truth',
    });
    restoredDatabase.close();
    await expect(
      readFile(join(value.restored, 'files', 'reports', 'receipt.txt'), 'utf8'),
    ).resolves.toBe('private receipt bytes\n');
    expect(result.restored.integrity).toBe('ok');
    expect(result.restored.foreignKeys).toBe(1);
  });

  it('fails closed when a remote restore drill targets configured live storage', async () => {
    const value = await fixture();
    const env = {
      ...continuityEnv(),
      JA_DATABASE_PATH: value.source,
      JA_DOCUMENT_ROOT: value.documents,
    };
    const transport = createFilesystemContinuityTransport(value.remote);
    await replicateBackup({
      backupPath: value.local.path,
      backupId: 'live-target-drill',
      transport,
      env,
      encryptionKey: KEY,
      now: NOW,
    });

    const result = await runRemoteRestoreDrill({
      transport,
      env,
      encryptionKey: KEY,
      backupId: 'live-target-drill',
      databasePath: value.source,
      documentRoot: value.documents,
      tempRoot: value.root,
    });

    expect(result).toMatchObject({
      status: 'FAIL',
      code: 'CONTINUITY_RESTORE_NOT_ISOLATED',
    });
    expect(transport.operations.some((operation) => operation.operation === 'download')).toBe(
      false,
    );
  });
});

describe('continuity backup readiness', () => {
  it('rejects malformed base64 key text instead of relying on Node’s permissive decoder', () => {
    const encoded = KEY.toString('base64');
    const malformed = `${encoded.slice(0, 12)}!${encoded.slice(12)}`;
    expect(() => decodeEncryptionKey(`base64:${malformed}`)).toThrowError(
      expect.objectContaining({ code: 'CONTINUITY_ENCRYPTION_KEY_INVALID' }),
    );
    expect(() => decodeEncryptionKey(malformed)).toThrowError(
      expect.objectContaining({ code: 'CONTINUITY_ENCRYPTION_KEY_INVALID' }),
    );
  });

  it('blocks readiness when the remote host, user, SSH key and encryption key are absent', async () => {
    const env = {
      JA_BACKUP_REMOTE_ENABLED: 'true',
      JA_BACKUP_REMOTE_RETENTION_DAYS: '30',
    };
    const synchronous = continuityReadiness({ environment: env });
    expect(synchronous.ok).toBe(false);
    expect(synchronous.status).toBe('BLOCKED');
    expect(synchronous.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'CONTINUITY_REMOTE_HOST_MISSING',
        'CONTINUITY_REMOTE_USER_MISSING',
        'CONTINUITY_SSH_KEY_MISSING',
        'CONTINUITY_ENCRYPTION_KEY_MISSING',
      ]),
    );

    const asynchronous = await checkContinuityReadiness({ env });
    expect(asynchronous.status).toBe('BLOCKED');
    expect(asynchronous.blocked).toBe(true);
  });

  it('returns a blocked scheduled result while preserving the verified local backup', async () => {
    const value = await fixture();
    const result = await runContinuityBackup({
      databasePath: value.source,
      documentRoot: value.documents,
      backupRoot: join(value.root, 'scheduled-backups'),
      env: {
        JA_BACKUP_REMOTE_ENABLED: 'true',
        JA_BACKUP_REMOTE_RETENTION_DAYS: '30',
      },
      now: NOW,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.state).toBe('blocked');
    expect(result.blocked).toBe(true);
    expect(result.localBackup).toBeTruthy();
    await expect(readFile(join(result.localBackup, 'manifest.json'), 'utf8')).resolves.toContain(
      'database',
    );
  });

  it('does not attempt SSH when a deterministic fake transport is supplied', async () => {
    const env = continuityEnv();
    const transport = createFilesystemContinuityTransport(
      await mkdtemp(join(tmpdir(), 'ja-fake-')),
    );
    roots.push(transport.root);
    const result = await checkContinuityReadiness({
      env,
      transport,
      encryptionKey: KEY,
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('wires the scheduled backup to the continuity command and exposes required deployment settings', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const service = await readFile('deployment/jaautomation-backup.service', 'utf8');
    const timer = await readFile('deployment/jaautomation-backup.timer', 'utf8');
    const environment = await readFile('deployment/jaautomation.env.example', 'utf8');

    expect(packageJson.scripts?.['ops:continuity-backup']).toBe(
      'node deployment/scripts/continuity-backup.mjs',
    );
    expect(packageJson.scripts?.['test:continuity']).toBe(
      'vitest run tests/operations/continuity-backup.test.ts',
    );
    expect(packageJson.scripts?.['ops:continuity-readiness']).toBe(
      'node deployment/scripts/continuity-backup.mjs --readiness',
    );
    expect(packageJson.scripts?.['ops:continuity-restore-drill']).toBe(
      'node deployment/scripts/continuity-backup.mjs --restore-drill',
    );
    expect(service).toContain(
      'ExecStart=/opt/jaautomation/runtime/node/bin/node deployment/scripts/continuity-backup.mjs',
    );
    expect(service).not.toContain('ExecStart=/usr/bin/node');
    expect(timer).toContain('Persistent=true');
    for (const setting of [
      'JA_BACKUP_REMOTE_ENABLED=',
      'JA_BACKUP_REMOTE_HOST=',
      'JA_BACKUP_REMOTE_USER=',
      'JA_BACKUP_SSH_KEY=',
      'JA_BACKUP_ENCRYPTION_KEY=',
      'JA_BACKUP_REMOTE_RETENTION_DAYS=30',
    ])
      expect(environment).toContain(setting);
  });
});
