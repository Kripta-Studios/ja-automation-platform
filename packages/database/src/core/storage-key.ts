export function isSafeStorageKey(storageKey: string): boolean {
  return Boolean(
    storageKey &&
    !storageKey.startsWith('/') &&
    !storageKey.includes('\\') &&
    !storageKey.split('/').includes('..'),
  );
}

export function assertSafeStorageKey(storageKey: string, createError: () => Error): void {
  if (!isSafeStorageKey(storageKey)) throw createError();
}
