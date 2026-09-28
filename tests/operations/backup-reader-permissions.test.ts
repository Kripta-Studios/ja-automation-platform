import { mkdtemp, mkdir, writeFile, stat, rm, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  configureBackupReaderPermissions,
  validateReaderGroup,
} from '../../deployment/scripts/configure-backup-reader.mjs';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
it('refuses root and existing unrelated group collisions', () => {
  expect(() => validateReaderGroup(0)).toThrow();
  expect(() => validateReaderGroup(10003, { name: 'unrelated', gid: 10003 })).toThrow(
    /assigned differently/,
  );
  expect(() =>
    validateReaderGroup(10003, null, { name: 'jaautomation-backup-readers', gid: 10004 }),
  ).toThrow(/assigned differently/);
});
it('sets private snapshot access and inheritance without modifying unrelated siblings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ja-reader-permissions-'));
  roots.push(root);
  const gid = process.getgid!() || 10001;
  const snapshot = join(root, '2026-09-09T150819289Z-5a83a23e-b446-4035-8f43-e788912a19e3');
  await mkdir(snapshot);
  await writeFile(join(snapshot, 'database.db'), 'bytes');
  const unrelated = join(root, 'operator-notes');
  await writeFile(unrelated, 'preserve', { mode: 0o600 });
  const before = await stat(unrelated);
  await configureBackupReaderPermissions(root, gid);
  expect((await stat(root)).mode & 0o7777).toBe(0o2750);
  expect((await stat(join(snapshot, 'database.db'))).mode & 0o777).toBe(0o640);
  expect((await stat(join(snapshot, 'database.db'))).gid).toBe(gid);
  expect((await stat(unrelated)).mode).toBe(before.mode);
  expect((await stat(unrelated)).gid).toBe(before.gid);
  expect(execFileSync('getfacl', ['-cp', root], { encoding: 'utf8' })).toContain(
    'default:other::---',
  );
  await mkdir(join(root, 'new-snapshot'));
  expect((await stat(join(root, 'new-snapshot'))).gid).toBe(gid);
});
it('rejects a symlink snapshot before changing root permissions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ja-reader-unsafe-'));
  roots.push(root);
  await symlink('/tmp', join(root, '2026-09-09T150819289Z-5a83a23e-b446-4035-8f43-e788912a19e3'));
  const before = await stat(root);
  await expect(configureBackupReaderPermissions(root, process.getgid!() || 10001)).rejects.toThrow(
    /symbolic/i,
  );
  expect((await stat(root)).mode).toBe(before.mode);
});
