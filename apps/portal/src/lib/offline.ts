import { openDB } from 'idb';
import { base } from '$app/paths';

export type OfflineMutation = {
  mutationId: string;
  entityType: 'time' | 'daily_report' | 'technical_report' | 'expense';
  entityId: string;
  baseVersion: number;
  createdAt: string;
  payload: Record<string, unknown>;
  attachments: string[];
  state?: 'queued' | 'conflict' | 'rejected';
};

export type OfflineAttachment = {
  id: string;
  fileName: string;
  mediaType: string;
  bytes: ArrayBuffer;
};

export type OfflineAssignment = {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  currency: string;
  timezone: string;
};

const name = 'ja-portal-user-cache';
const db = () =>
  openDB(name, 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('mutations'))
        database.createObjectStore('mutations', { keyPath: 'mutationId' });
      if (!database.objectStoreNames.contains('assignments'))
        database.createObjectStore('assignments', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('attachments'))
        database.createObjectStore('attachments', { keyPath: 'id' });
    },
  });
export async function queueMutation(
  value: OfflineMutation,
  attachments: readonly OfflineAttachment[] = [],
) {
  if (!['time', 'daily_report', 'technical_report', 'expense'].includes(value.entityType))
    throw new Error('Offline record type is not permitted');
  const database = await db();
  const transaction = database.transaction(['mutations', 'attachments'], 'readwrite');
  await transaction.objectStore('mutations').put({ ...value, state: 'queued' });
  for (const attachment of attachments)
    await transaction.objectStore('attachments').put(attachment);
  await transaction.done;
}
export async function queuedCount() {
  return (await db()).count('mutations');
}

export async function cacheAssignments(rows: readonly Record<string, unknown>[]) {
  const database = await db();
  const transaction = database.transaction('assignments', 'readwrite');
  const store = transaction.objectStore('assignments');
  await store.clear();
  for (const row of rows) {
    if (
      typeof row.id === 'string' &&
      typeof row.project_number === 'string' &&
      typeof row.name === 'string' &&
      typeof row.status === 'string' &&
      typeof row.currency === 'string' &&
      typeof row.timezone === 'string'
    )
      await store.put({
        id: row.id,
        projectNumber: row.project_number,
        name: row.name,
        status: row.status,
        currency: row.currency,
        timezone: row.timezone,
      } satisfies OfflineAssignment);
  }
  await transaction.done;
}

export async function getOfflineAssignments(): Promise<OfflineAssignment[]> {
  return (await db()).getAll('assignments') as Promise<OfflineAssignment[]>;
}

export async function syncQueuedMutations(
  fetcher: typeof fetch = fetch,
): Promise<{ accepted: number; conflicts: number; rejected: number; failed: number }> {
  const database = await db();
  const mutations = (await database.getAll('mutations')) as OfflineMutation[];
  let accepted = 0;
  let conflicts = 0;
  let rejected = 0;
  let failed = 0;
  for (const mutation of mutations) {
    let result: { outcome?: string };
    try {
      const payload = { ...mutation.payload };
      const attachmentIds = mutation.attachments ?? [];
      if (attachmentIds.length > 1)
        throw new Error('Only one receipt can be attached to an expense');
      if (attachmentIds.length && mutation.entityType === 'expense') {
        for (const attachmentId of attachmentIds) {
          const attachment = (await database.get('attachments', attachmentId)) as
            | OfflineAttachment
            | undefined;
          if (!attachment) throw new Error('Offline receipt is no longer available');
          const form = new FormData();
          form.append('attachmentId', attachment.id);
          form.append('projectId', String(payload.projectId ?? ''));
          form.append(
            'file',
            new Blob([attachment.bytes], { type: attachment.mediaType }),
            attachment.fileName,
          );
          const upload = await fetcher(`${base}/app/api/sync/attachment`, {
            method: 'POST',
            credentials: 'same-origin',
            body: form,
          });
          const uploaded = (await upload.json().catch(() => null)) as {
            documentId?: string;
          } | null;
          if (!upload.ok || !uploaded?.documentId) throw new Error('Receipt upload failed');
          payload.receiptDocumentId = uploaded.documentId;
          payload.receiptRequired = true;
        }
      }
      const response = await fetcher(`${base}/app/api/sync`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...mutation, payload }),
      });
      result = (await response.json().catch(() => ({ outcome: 'rejected' }))) as {
        outcome?: string;
      };
    } catch {
      failed += 1;
      continue;
    }
    if (result.outcome === 'accepted') {
      accepted += 1;
      await database.delete('mutations', mutation.mutationId);
      for (const attachmentId of mutation.attachments ?? [])
        await database.delete('attachments', attachmentId);
    } else if (result.outcome === 'conflict') {
      conflicts += 1;
      await database.put('mutations', { ...mutation, state: 'conflict' });
    } else {
      rejected += 1;
      await database.put('mutations', { ...mutation, state: 'rejected' });
    }
  }
  return { accepted, conflicts, rejected, failed };
}
export async function purgeUserCache() {
  (await db()).close();
  indexedDB.deleteDatabase(name);
  for (const key of await caches.keys()) if (key.startsWith('ja-portal-')) await caches.delete(key);
}
