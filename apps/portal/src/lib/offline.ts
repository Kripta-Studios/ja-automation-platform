import { openDB } from 'idb';

const name = 'ja-portal-user-cache';
const db = () =>
  openDB(name, 1, {
    upgrade(database) {
      database.createObjectStore('mutations', { keyPath: 'mutationId' });
      database.createObjectStore('assignments', { keyPath: 'id' });
    },
  });
export async function queueMutation(value: unknown) {
  return (await db()).put('mutations', value);
}
export async function queuedCount() {
  return (await db()).count('mutations');
}
export async function purgeUserCache() {
  (await db()).close();
  indexedDB.deleteDatabase(name);
  for (const key of await caches.keys()) if (key.startsWith('ja-portal-')) await caches.delete(key);
}
