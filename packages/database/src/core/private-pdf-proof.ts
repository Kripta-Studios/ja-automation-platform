import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { assertSafeStorageKey } from './storage-key.ts';

export type PrivatePdfProof = Readonly<{
  storageKey: string;
  sha256: string;
  byteLength: number;
  requiredPrefix?: string;
}>;

export function verifyPrivatePdfArtifact(proof: PrivatePdfProof): void {
  assertSafeStorageKey(proof.storageKey, () => new Error('PDF storage key is invalid'));
  if (!/^[a-f0-9]{64}$/u.test(proof.sha256)) throw new Error('PDF hash is invalid');
  if (!Number.isSafeInteger(proof.byteLength) || proof.byteLength <= 0)
    throw new Error('PDF byte length is invalid');
  if (proof.requiredPrefix && !proof.storageKey.startsWith(proof.requiredPrefix))
    throw new Error('PDF storage key is bound to another report or record');

  const root = resolve(
    process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT ?? 'data/documents',
  );
  const target = resolve(root, ...proof.storageKey.split('/'));
  const relativeTarget = relative(root, target);
  if (!relativeTarget || relativeTarget.startsWith('..') || isAbsolute(relativeTarget))
    throw new Error('PDF storage path is invalid');
  const rootStats = lstatSync(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory())
    throw new Error('PDF root is not a real directory');
  const parentRelative = relative(root, resolve(target, '..'));
  let cursor = root;
  for (const component of parentRelative.split(/[\\/]/u).filter(Boolean)) {
    cursor = resolve(cursor, component);
    const parentStats = lstatSync(cursor);
    if (parentStats.isSymbolicLink() || !parentStats.isDirectory())
      throw new Error('PDF path contains a symlink');
  }

  const noFollow = (fsConstants as typeof fsConstants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const descriptor = openSync(target, fsConstants.O_RDONLY | noFollow);
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) throw new Error('PDF artifact is not a regular file');
    const bytes = readFileSync(descriptor);
    const header = bytes.subarray(0, 5).toString('ascii');
    const tail = bytes.subarray(Math.max(0, bytes.length - 1024)).toString('latin1');
    if (header !== '%PDF-' || !tail.includes('%%EOF')) throw new Error('PDF signature is invalid');
    if (
      bytes.length !== proof.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== proof.sha256
    )
      throw new Error('PDF artifact proof does not match');
  } finally {
    closeSync(descriptor);
  }
}
