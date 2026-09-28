export function isSafeStorageKey(storageKey: string): boolean {
  return Boolean(
    storageKey &&
    !storageKey.startsWith('/') &&
    !storageKey.includes('\\') &&
    !storageKey.split('/').includes('..') &&
    !storageKey.includes(':/') &&
    !storageKey.includes('://') &&
    !storageKey.toLowerCase().includes('%2e'),
  );
}

export function assertSafeStorageKey(storageKey: string, createError: () => Error): void {
  if (!isSafeStorageKey(storageKey)) throw createError();
}
