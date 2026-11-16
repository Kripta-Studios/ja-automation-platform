import { privateArtifactRoot, removePrivateFileIfPresent } from '$lib/server/private-artifact-access';

/**
 * Private files of permanently deleted records are removed only after the
 * database transaction committed. A failed unlink leaves an unreachable
 * orphan (logged) instead of failing a deletion that already happened.
 */
export async function removePurgedFiles(storageKeys: readonly string[]): Promise<number> {
  const root = privateArtifactRoot();
  let removed = 0;
  for (const key of storageKeys) {
    try {
      await removePrivateFileIfPresent(root, key);
      removed += 1;
    } catch (error) {
      console.warn('permanent-deletion: could not remove private file', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return removed;
}
