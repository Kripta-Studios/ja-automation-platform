import { lstatSync, mkdirSync } from 'node:fs';
import { parse, relative, resolve } from 'node:path';

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function isAlreadyPresent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST';
}

/**
 * Ensure a private-artifact directory exists without following a symlink or
 * junction in any existing or newly-created path component.  Recursive mkdir
 * is deliberately avoided because it cannot provide that invariant across
 * every component of the path.
 */
export function ensureNoSymlinkComponents(
  rootPath: string,
  directory: string,
  label = 'Private artifact',
): void {
  const root = resolve(rootPath);
  const targetDirectory = resolve(directory);
  const relativeDirectory = relative(root, targetDirectory);
  if (
    (!relativeDirectory && targetDirectory !== root) ||
    relativeDirectory.split(/[\\/]/u).some((segment) => segment === '..') ||
    relativeDirectory.startsWith('/') ||
    relativeDirectory.startsWith('\\')
  )
    throw new Error(`${label} path escaped private root`);

  const anchor = parse(root).root;
  let cursor = anchor;
  const chain = relative(anchor, targetDirectory).split(/[\\/]/u).filter(Boolean);
  for (const component of chain) {
    cursor = resolve(cursor, component);
    let stats;
    try {
      stats = lstatSync(cursor);
    } catch (error) {
      if (!isMissing(error)) throw error;
      try {
        mkdirSync(cursor);
      } catch (mkdirError) {
        if (!isAlreadyPresent(mkdirError)) throw mkdirError;
      }
      stats = lstatSync(cursor);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new Error(`${label} parent must be a real directory`);
  }

  const rootStats = lstatSync(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory())
    throw new Error(`${label} root must be a real directory`);

  // A final walk is intentional: this is the check immediately before a
  // publication operation and rejects a component replaced between mkdirs.
  let verified = anchor;
  for (const component of chain) {
    verified = resolve(verified, component);
    const stats = lstatSync(verified);
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new Error(`${label} parent must be a real directory`);
  }
}
