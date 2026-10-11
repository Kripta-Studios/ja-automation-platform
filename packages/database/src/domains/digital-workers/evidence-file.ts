import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { assertSafeStorageKey } from '../../core/storage-key.ts';

/** Check the same private bytes the reference names; no symlink traversal or unbounded buffer. */
export function verifyEvidenceFile(
  storageKey: string,
  expectedHash: string,
  expectedBytes: number,
): void {
  assertSafeStorageKey(storageKey, () => new Error('Invalid evidence key'));
  if (
    !/^[a-f0-9]{64}$/u.test(expectedHash) ||
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes < 1
  )
    throw new Error('Invalid evidence proof');
  const root = resolve(
    process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT ?? 'data/documents',
  );
  const target = resolve(root, ...storageKey.split('/'));
  const path = relative(root, target);
  if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Invalid evidence path');
  const rootInfo = lstatSync(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())
    throw new Error('Invalid evidence root');
  let cursor = root;
  for (const part of relative(root, resolve(target, '..')).split(/[\\/]/u).filter(Boolean)) {
    cursor = resolve(cursor, part);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Invalid evidence parent');
  }
  const fd = openSync(
    target,
    constants.O_RDONLY |
      ((constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0),
  );
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size !== expectedBytes) throw new Error('Evidence bytes changed');
    const hash = createHash('sha256'),
      buffer = Buffer.alloc(64 * 1024);
    let count = 0,
      total = 0;
    while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      total += count;
      if (total > expectedBytes) throw new Error('Evidence bytes changed');
      hash.update(buffer.subarray(0, count));
    }
    if (total !== expectedBytes || hash.digest('hex') !== expectedHash)
      throw new Error('Evidence hash changed');
  } finally {
    closeSync(fd);
  }
}
