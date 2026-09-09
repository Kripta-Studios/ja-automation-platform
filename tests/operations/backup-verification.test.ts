import { DatabaseSync } from 'node:sqlite';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, cp: vi.fn(actual.cp), readFile: vi.fn(actual.readFile) };
});
import { createBackup } from '../../deployment/scripts/backup.mjs';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ja-backup-verify-'));
  roots.push(root);
  const documents = join(root, 'files');
  await mkdir(documents);
  await writeFile(join(documents, 'receipt'), 'receipt');
  const databasePath = join(root, 'source.db');
  const db = new DatabaseSync(databasePath);
  db.exec("CREATE TABLE evidence(id TEXT PRIMARY KEY); INSERT INTO evidence VALUES ('ok')");
  db.close();
  const backupRoot = join(root, 'backups');
  const backup = await createBackup({ databasePath, documentRoot: documents, backupRoot });
  return { root, documents, databasePath, backupRoot, backup };
}
it('verifies actual database and private bytes, reports short history honestly', async () => {
  const f = await fixture();
  const { verifyLatestBackup } = await import('../../deployment/scripts/backup-verify.mjs');
  const result = await verifyLatestBackup({ backupRoot: f.backupRoot });
  expect(result).toMatchObject({
    integrity: 'ok',
    foreignKeyViolations: 0,
    documentCount: 1,
    history: { observedDays: 1, requiredDays: 30, coverageComplete: false },
  });
  await writeFile(join(f.backup.path, 'documents', 'receipt'), 'tampered');
  await expect(verifyLatestBackup({ backupRoot: f.backupRoot })).rejects.toThrow(
    /manifest|integrity/i,
  );
});
it('fails for missing and stale backups', async () => {
  const f = await fixture();
  const { verifyLatestBackup } = await import('../../deployment/scripts/backup-verify.mjs');
  await expect(verifyLatestBackup({ backupRoot: join(f.root, 'missing') })).rejects.toThrow();
  await expect(
    verifyLatestBackup({ backupRoot: f.backupRoot, now: new Date(Date.now() + 3 * 86400000) }),
  ).rejects.toThrow(/stale/i);
});
it('retains recent backups even if directory mtime is old and preserves unrelated directories', async () => {
  const f = await fixture();
  const old = new Date('2000-01-01');
  await utimes(f.backup.path, old, old);
  const unrelated = join(f.backupRoot, 'operator-evidence');
  await mkdir(unrelated);
  await utimes(unrelated, old, old);
  await createBackup({
    databasePath: f.databasePath,
    documentRoot: f.documents,
    backupRoot: f.backupRoot,
  });
  expect(JSON.parse(await readFile(join(f.backup.path, 'manifest.json'), 'utf8')).format).toBe(1);
  expect(await import('node:fs/promises').then((fs) => fs.stat(unrelated))).toBeTruthy();
});

it('ignores pending reservations but requires committed documents and issued PDF bytes', async () => {
  const f = await fixture();
  const db = new DatabaseSync(f.databasePath);
  db.exec(`CREATE TABLE document (storage_key TEXT, sha256 TEXT, byte_length INTEGER, state TEXT);
 CREATE TABLE invoice (pdf_storage_key TEXT, pdf_sha256 TEXT, pdf_byte_length INTEGER);
 INSERT INTO document VALUES ('not-uploaded', 'pending', 50, 'temporary');`);
  db.close();
  const { verifyLatestBackup } = await import('../../deployment/scripts/backup-verify.mjs');
  await createBackup({
    databasePath: f.databasePath,
    documentRoot: f.documents,
    backupRoot: f.backupRoot,
  });
  await expect(verifyLatestBackup({ backupRoot: f.backupRoot })).resolves.toMatchObject({
    integrity: 'ok',
  });
  const source = new DatabaseSync(f.databasePath);
  source.exec("INSERT INTO invoice VALUES ('missing-invoice.pdf', 'expected', 100)");
  source.close();
  await createBackup({
    databasePath: f.databasePath,
    documentRoot: f.documents,
    backupRoot: f.backupRoot,
  });
  await expect(verifyLatestBackup({ backupRoot: f.backupRoot })).rejects.toThrow(
    /artifact.*invoice/i,
  );
});

it('checks committed artifacts while ignoring queued render reservations', async () => {
  const f = await fixture();
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update('receipt').digest('hex');
  const source = new DatabaseSync(f.databasePath);
  source.exec(`CREATE TABLE document (storage_key TEXT, sha256 TEXT, byte_length INTEGER, state TEXT);
    CREATE TABLE localized_pdf_variant (storage_key TEXT, content_sha256 TEXT, byte_length INTEGER, status TEXT);
    CREATE TABLE invoice (pdf_storage_key TEXT, pdf_sha256 TEXT, pdf_byte_length INTEGER);`);
  source.prepare('INSERT INTO document VALUES (?,?,?,?)').run('receipt', hash, 7, 'committed');
  source.prepare('INSERT INTO invoice VALUES (?,?,?)').run('receipt', hash, 7);
  source.exec("INSERT INTO localized_pdf_variant VALUES ('future', NULL, NULL, 'queued')");
  source.close();
  const { verifyLatestBackup } = await import('../../deployment/scripts/backup-verify.mjs');
  await createBackup({
    databasePath: f.databasePath,
    documentRoot: f.documents,
    backupRoot: f.backupRoot,
  });
  await expect(verifyLatestBackup({ backupRoot: f.backupRoot })).resolves.toMatchObject({
    integrity: 'ok',
  });
  const db = new DatabaseSync(f.databasePath);
  db.prepare('UPDATE document SET storage_key=?').run('missing-committed');
  db.close();
  await createBackup({
    databasePath: f.databasePath,
    documentRoot: f.documents,
    backupRoot: f.backupRoot,
  });
  await expect(verifyLatestBackup({ backupRoot: f.backupRoot })).rejects.toThrow(
    /artifact.*document/i,
  );
});

it('accepts empty SQLite read sidecars without altering originals and rejects pending WAL bytes', async () => {
  const f = await fixture();
  const { verifyLatestBackup } = await import('../../deployment/scripts/backup-verify.mjs');
  await writeFile(join(f.backup.path, 'database.db-wal'), '');
  await writeFile(join(f.backup.path, 'database.db-shm'), 'read-cache');
  await expect(verifyLatestBackup({ backupRoot: f.backupRoot })).resolves.toMatchObject({
    integrity: 'ok',
  });
  expect(await readFile(join(f.backup.path, 'database.db-shm'), 'utf8')).toBe('read-cache');
  await writeFile(join(f.backup.path, 'database.db-wal'), 'pending transactions');
  await expect(verifyLatestBackup({ backupRoot: f.backupRoot })).rejects.toThrow(/uncheckpointed/i);
});

it('rejects unknown snapshot sidecars without silently excluding them', async () => {
  const f = await fixture();
  const { verifyLatestBackup } = await import('../../deployment/scripts/backup-verify.mjs');
  await writeFile(join(f.backup.path, 'operator-unknown.json'), '{}');
  await expect(verifyLatestBackup({ backupRoot: f.backupRoot })).rejects.toThrow(
    /unexpected entries/i,
  );
});

it('validates retention before creating any snapshot directory', async () => {
  const f = await fixture();
  const { readdir } = await import('node:fs/promises');
  const before = await readdir(f.backupRoot);
  const original = process.env.JA_BACKUP_RETENTION_DAYS;
  try {
    process.env.JA_BACKUP_RETENTION_DAYS = '2';
    await expect(
      createBackup({
        databasePath: f.databasePath,
        documentRoot: f.documents,
        backupRoot: f.backupRoot,
      }),
    ).rejects.toThrow(/at least 30/i);
    expect(await readdir(f.backupRoot)).toEqual(before);
  } finally {
    if (original === undefined) delete process.env.JA_BACKUP_RETENTION_DAYS;
    else process.env.JA_BACKUP_RETENTION_DAYS = original;
  }
});

it('streams private artifacts and copies only SQLite into temporary storage', async () => {
  const f = await fixture();
  const { verifyLatestBackup } = await import('../../deployment/scripts/backup-verify.mjs');
  vi.mocked(cp).mockClear();
  vi.mocked(readFile).mockClear();
  await expect(verifyLatestBackup({ backupRoot: f.backupRoot })).resolves.toMatchObject({
    documentCount: 1,
    integrity: 'ok',
  });
  expect(cp).toHaveBeenCalledTimes(1);
  expect(vi.mocked(cp).mock.calls[0]?.[0]).toBe(join(f.backup.path, 'database.db'));
  expect(
    vi.mocked(readFile).mock.calls.some(([path]) => String(path).includes('/documents/')),
  ).toBe(false);
});
