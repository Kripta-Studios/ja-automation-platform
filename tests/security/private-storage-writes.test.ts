import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writePrivateFileExclusive } from '../../apps/portal/src/lib/server/private-artifact-access.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function symlinkKind(): 'junction' | 'dir' {
  return process.platform === 'win32' ? 'junction' : 'dir';
}

describe('private upload storage writes', () => {
  it('routes document and receipt uploads through the exclusive no-follow writer', () => {
    const documentAction = readFileSync(
      resolve('apps/portal/src/lib/server/actions/document-actions.ts'),
      'utf8',
    );
    const expenseAction = readFileSync(
      resolve('apps/portal/src/lib/server/actions/expense-actions.ts'),
      'utf8',
    );
    expect(documentAction).toContain('writePrivateFileExclusive');
    expect(expenseAction).toContain('writePrivateFileExclusive');
  });

  it('writes normally, rejects overwrite, and cleans no path outside the private root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-private-write-'));
    roots.push(root);
    const target = await writePrivateFileExclusive(
      root,
      'documents/document.bin',
      Uint8Array.from([1, 2, 3]),
    );
    expect(readFileSync(target)).toEqual(Buffer.from([1, 2, 3]));
    await expect(
      writePrivateFileExclusive(root, 'documents/document.bin', Uint8Array.from([9])),
    ).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('rejects a symlinked document root and nested receipt parent without escaping', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-private-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'ja-private-outside-'));
    roots.push(root, outside);
    const linkedRoot = join(root, 'linked-root');
    try {
      symlinkSync(outside, linkedRoot, symlinkKind());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    await expect(
      writePrivateFileExclusive(linkedRoot, 'documents/document.bin', Uint8Array.from([1])),
    ).rejects.toThrow(/real directory|symlink/u);
    expect(existsSync(join(outside, 'documents', 'document.bin'))).toBe(false);

    const safeRoot = mkdtempSync(join(tmpdir(), 'ja-private-nested-'));
    const nestedOutside = mkdtempSync(join(tmpdir(), 'ja-private-nested-outside-'));
    roots.push(safeRoot, nestedOutside);
    const linkedParent = join(safeRoot, 'receipts');
    try {
      symlinkSync(nestedOutside, linkedParent, symlinkKind());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    await expect(
      writePrivateFileExclusive(safeRoot, 'receipts/receipt.bin', Uint8Array.from([2])),
    ).rejects.toThrow(/real directory|symlink/u);
    expect(existsSync(join(nestedOutside, 'receipt.bin'))).toBe(false);
  });
});
