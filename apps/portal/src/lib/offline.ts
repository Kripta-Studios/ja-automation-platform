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

export type OfflineIdentity = Readonly<{
  tenantId: string;
  deploymentId: string;
  userId: string;
  token: string;
  expiresAt: number;
}>;

type OfflineIdentityPayload = Readonly<{
  sub: string;
  tenantId: string;
  deploymentId: string;
  sid: string;
  exp: number;
}>;

let offlineIdentity: OfflineIdentity | null = null;
let configuredUserId: string | null = null;
let identityReady: Promise<void> = Promise.resolve();

const identityEndpoint = `${base}/app/api/offline/identity`;
const identityStoragePrefix = 'ja-portal-offline-identity:';

function validPartitionPart(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(value);
}

function decodeIdentityToken(token: string): OfflineIdentityPayload | null {
  const [encodedPayload, signature, ...extra] = token.split('.');
  if (!encodedPayload || !signature || extra.length || !/^[A-Za-z0-9_-]+$/.test(signature))
    return null;
  try {
    const decoded = JSON.parse(
      atob(
        encodedPayload.replace(/-/g, '+').replace(/_/g, '/') +
          '='.repeat((4 - (encodedPayload.length % 4)) % 4),
      ),
    ) as Partial<OfflineIdentityPayload>;
    if (
      !validPartitionPart(decoded.sub) ||
      !validPartitionPart(decoded.tenantId) ||
      !validPartitionPart(decoded.deploymentId) ||
      !validPartitionPart(decoded.sid) ||
      typeof decoded.exp !== 'number' ||
      !Number.isSafeInteger(decoded.exp) ||
      decoded.exp <= Date.now()
    )
      return null;
    return decoded as OfflineIdentityPayload;
  } catch {
    return null;
  }
}

function identityFromResponse(body: unknown, expectedUserId: string): OfflineIdentity | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  if (typeof value.token !== 'string' || value.userId !== expectedUserId) return null;
  const decoded = decodeIdentityToken(value.token);
  if (
    !decoded ||
    decoded.sub !== expectedUserId ||
    value.tenantId !== decoded.tenantId ||
    value.deploymentId !== decoded.deploymentId
  )
    return null;
  return {
    tenantId: decoded.tenantId,
    deploymentId: decoded.deploymentId,
    userId: decoded.sub,
    token: value.token,
    expiresAt: decoded.exp,
  };
}

function storageKey(userId: string): string {
  return `${identityStoragePrefix}${encodeURIComponent(userId)}`;
}

function readStoredIdentity(userId: string): OfflineIdentity | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const token = localStorage.getItem(storageKey(userId));
    if (!token) return null;
    const decoded = decodeIdentityToken(token);
    if (!decoded || decoded.sub !== userId) return null;
    return {
      tenantId: decoded.tenantId,
      deploymentId: decoded.deploymentId,
      userId,
      token,
      expiresAt: decoded.exp,
    };
  } catch {
    return null;
  }
}

function publishIdentity(identity: OfflineIdentity): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(storageKey(identity.userId), identity.token);
    } catch {
      // Storage can be unavailable in privacy mode. The in-memory identity remains usable.
    }
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const message = {
    type: 'ja-offline-identity',
    token: identity.token,
    userId: identity.userId,
  };
  try {
    navigator.serviceWorker.controller?.postMessage(message);
    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage(message);
    });
  } catch {
    // Service worker registration is optional for the online application.
  }
}

async function requestIdentity(
  userId: string,
  expectedTenantId?: string,
): Promise<OfflineIdentity> {
  const response = await fetch(identityEndpoint, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error(`Offline identity unavailable (${response.status})`);
  const identity = identityFromResponse(body, userId);
  if (!identity || (expectedTenantId && identity.tenantId !== expectedTenantId))
    throw new Error('Offline identity response is invalid');
  return identity;
}

/**
 * Starts loading a server-issued identity for the authenticated user.
 *
 * The old implementation silently selected a shared tenant/deployment when no
 * identity had been issued. That made a missing configuration look like a
 * valid offline session. A cached, still-valid token is only used while the
 * server is unreachable; a user without one remains fail-closed.
 */
export function configureOfflineIdentity(userId: string, tenantId?: string): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new Error('Authenticated offline identity is required');
  configuredUserId = normalizedUserId;
  offlineIdentity = readStoredIdentity(normalizedUserId);
  if (offlineIdentity && tenantId && offlineIdentity.tenantId !== tenantId.trim())
    offlineIdentity = null;
  if (offlineIdentity) publishIdentity(offlineIdentity);
  identityReady = requestIdentity(normalizedUserId, tenantId?.trim() || undefined)
    .then((identity) => {
      if (configuredUserId !== normalizedUserId) return;
      offlineIdentity = identity;
      publishIdentity(identity);
    })
    .catch((error) => {
      if (!offlineIdentity || configuredUserId !== normalizedUserId) throw error;
    });
  // The controller starts immediately after this function in the shell. Keep
  // the rejection observable to callers of storage functions, not as an
  // unhandled promise from the fire-and-forget setup call.
  void identityReady.catch(() => undefined);
  return identityReady;
}

async function requireOfflineIdentity(): Promise<OfflineIdentity> {
  await identityReady;
  if (!offlineIdentity || !configuredUserId || offlineIdentity.userId !== configuredUserId)
    throw new Error('Authenticated offline identity is unavailable');
  if (offlineIdentity.expiresAt <= Date.now()) {
    offlineIdentity = null;
    throw new Error('Offline identity has expired');
  }
  return offlineIdentity;
}

function partitionName(identity: OfflineIdentity): string {
  return [identity.tenantId, identity.deploymentId, identity.userId]
    .map(encodeURIComponent)
    .join('-');
}

const databaseName = (identity: OfflineIdentity) => `ja-portal-${partitionName(identity)}`;
const privateCacheName = (identity: OfflineIdentity) =>
  `ja-portal-private-${partitionName(identity)}`;
const db = async () =>
  openDB(databaseName(await requireOfflineIdentity()), 2, {
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

export async function conflictMutations(): Promise<OfflineMutation[]> {
  const mutations = (await db()).getAll('mutations') as Promise<OfflineMutation[]>;
  return (await mutations).filter((mutation) => mutation.state === 'conflict');
}

export async function discardMutation(mutationId: string): Promise<void> {
  const database = await db();
  const mutation = (await database.get('mutations', mutationId)) as OfflineMutation | undefined;
  if (!mutation) return;
  const transaction = database.transaction(['mutations', 'attachments'], 'readwrite');
  await transaction.objectStore('mutations').delete(mutationId);
  for (const attachmentId of mutation.attachments ?? [])
    await transaction.objectStore('attachments').delete(attachmentId);
  await transaction.done;
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
  let identity: OfflineIdentity;
  try {
    identity = await requireOfflineIdentity();
  } catch {
    // There is no user-partitioned storage to delete when identity issuance
    // failed. Logout must still be able to complete in this fail-closed state.
    return;
  }
  const database = await db();
  database.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName(identity));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Offline database deletion failed'));
    request.onblocked = () => resolve();
  });
  if (typeof caches !== 'undefined') await caches.delete(privateCacheName(identity));
}
