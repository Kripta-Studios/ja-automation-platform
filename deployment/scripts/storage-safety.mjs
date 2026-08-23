import { lstat, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';

function missing(error) {
  return error?.code === 'ENOENT';
}

function absolutePath(value) {
  const candidate = resolve(value);
  if (candidate === parse(candidate).root)
    throw new Error('Refusing to operate on a filesystem root');
  return candidate;
}

/**
 * Check every existing path component without following symlinks. Missing
 * components are allowed only when the caller is about to create them.
 */
export async function assertNoSymlinkComponents(
  value,
  { allowMissing = false, label = 'path' } = {},
) {
  const candidate = absolutePath(value);
  const filesystemRoot = parse(candidate).root;
  const components = relative(filesystemRoot, candidate).split(/[\\/]/u).filter(Boolean);
  let cursor = filesystemRoot;
  for (const component of components) {
    cursor = join(cursor, component);
    let stats;
    try {
      stats = await lstat(cursor);
    } catch (error) {
      if (missing(error) && allowMissing) return candidate;
      throw new Error(`${label} is unavailable`);
    }
    if (stats.isSymbolicLink()) throw new Error(`${label} contains a symbolic link`);
  }
  return candidate;
}

export async function assertSafePath(
  value,
  { allowMissing = false, label = 'path', directory = false } = {},
) {
  const candidate = await assertNoSymlinkComponents(value, { allowMissing, label });
  let stats;
  try {
    stats = await lstat(candidate);
  } catch (error) {
    if (missing(error) && allowMissing) return { path: candidate, exists: false, stats: null };
    throw new Error(`${label} is unavailable`);
  }
  if (stats.isSymbolicLink()) throw new Error(`${label} contains a symbolic link`);
  if (directory && !stats.isDirectory()) throw new Error(`${label} must be a directory`);
  return { path: candidate, exists: true, stats };
}

export async function assertSafeTree(value, { allowMissing = false, label = 'tree' } = {}) {
  const root = await assertSafePath(value, { allowMissing, label, directory: true });
  if (!root.exists) return root;

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(current, entry.name);
      const childLabel = `${label} entry`;
      const checked = await assertSafePath(child, { label: childLabel });
      if (checked.stats.isDirectory()) await visit(child);
      else if (!checked.stats.isFile()) throw new Error(`${childLabel} must be a regular file`);
    }
  }
  await visit(root.path);
  return root;
}

export async function removeSafePath(value, { recursive = false, label = 'path' } = {}) {
  const checked = await assertSafePath(value, { allowMissing: true, label });
  if (!checked.exists) return false;
  if (checked.stats.isDirectory()) {
    if (!recursive) throw new Error(`${label} is a directory`);
    await assertSafeTree(checked.path, { label });
  }
  await rm(checked.path, { force: false, recursive });
  return true;
}

export function safeSibling(value, suffix) {
  const candidate = absolutePath(value);
  return join(dirname(candidate), `${candidate.split(/[\\/]/u).at(-1)}${suffix}`);
}

export function isSafeRelativePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !isAbsolute(value) &&
    !value.includes('\\') &&
    !value.split('/').some((segment) => !segment || segment === '..' || segment === '.')
  );
}
