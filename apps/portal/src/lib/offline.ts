import { openDB } from 'idb';
import { base } from '$app/paths';

export type OfflineReviewReason = 'session' | 'service' | 'uncertain' | 'local';

export type OfflineMutation = {
  mutationId: string;
  entityType: 'time' | 'daily_report' | 'technical_report' | 'expense';
  entityId: string;
  baseVersion: number;
  createdAt: string;
  payload: Record<string, unknown>;
  attachments: string[];
  state?: 'queued' | 'conflict' | 'rejected' | 'needs_review';
  reviewReason?: OfflineReviewReason;
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

export type OfflineSyncResult = {
  accepted: number;
  conflicts: number;
  rejected: number;
  failed: number;
  sessionFailures?: number;
  serviceFailures?: number;
  uncertainFailures?: number;
  localFailures?: number;
};

export type OfflineSyncResponse = 'accepted' | 'conflict' | 'rejected' | OfflineReviewReason;

function withoutReviewReason(mutation: OfflineMutation): OfflineMutation {
  const next = { ...mutation };
  delete next.reviewReason;
  return next;
}

export type OfflineSyncStorage = {
  getAll: (store: 'mutations') => Promise<OfflineMutation[]>;
  get: (store: 'attachments', id: string) => Promise<OfflineAttachment | undefined>;
  put: (store: 'mutations', value: OfflineMutation) => Promise<unknown>;
  delete: (store: 'mutations' | 'attachments', id: string) => Promise<unknown>;
};

/** Only a valid outcome with its expected HTTP status may change a queued draft. */
export async function classifySyncResponse(response: Response): Promise<OfflineSyncResponse> {
  if (response.status === 401) return 'session';
  if (response.status === 404 || response.status === 429 || response.status >= 500)
    return 'service';
  if (response.status === 408) return 'uncertain';
  const body = (await response.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'uncertain';
  const outcome = (body as Record<string, unknown>).outcome;
  if (outcome === 'accepted' && response.ok) return 'accepted';
  if (outcome === 'conflict' && response.status === 409) return 'conflict';
  if (outcome === 'rejected' && [400, 403, 409, 422].includes(response.status)) return 'rejected';
  return 'uncertain';
}

function classifyUploadStatus(status: number): OfflineSyncResponse {
  if (status === 401) return 'session';
  if (status === 404 || status === 429 || status >= 500) return 'service';
  if (status === 408) return 'uncertain';
  return 'local';
}

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
  await transaction
    .objectStore('mutations')
    .put({ ...withoutReviewReason(value), state: 'queued' });
  for (const attachment of attachments)
    await transaction.objectStore('attachments').put(attachment);
  await transaction.done;
}
export async function queuedCount() {
  const mutations = (await db()).getAll('mutations') as Promise<OfflineMutation[]>;
  return (await mutations).filter((mutation) => !mutation.state || mutation.state === 'queued')
    .length;
}

export async function conflictMutations(): Promise<OfflineMutation[]> {
  const mutations = (await db()).getAll('mutations') as Promise<OfflineMutation[]>;
  return (await mutations).filter((mutation) =>
    ['conflict', 'rejected', 'needs_review'].includes(mutation.state ?? ''),
  );
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
  store?: OfflineSyncStorage,
  reviewMutationId?: string,
): Promise<OfflineSyncResult> {
  const database = store ?? ((await db()) as unknown as OfflineSyncStorage);
  const mutations = await database.getAll('mutations');
  let accepted = 0;
  let conflicts = 0;
  let rejected = 0;
  let failed = 0;
  let sessionFailures = 0;
  let serviceFailures = 0;
  let uncertainFailures = 0;
  let localFailures = 0;
  for (const mutation of mutations) {
    if (mutation.state === 'conflict' || mutation.state === 'rejected') continue;
    if (mutation.state === 'needs_review' && mutation.mutationId !== reviewMutationId) continue;
    if (reviewMutationId && mutation.mutationId !== reviewMutationId) continue;
    let result: OfflineSyncResponse = 'uncertain';
    let receiptUploadConfirmed = false;
    const payload = { ...mutation.payload };
    try {
      const attachmentIds = mutation.attachments ?? [];
      let readyForSync = attachmentIds.length === 0 || mutation.entityType !== 'expense';
      if (attachmentIds.length > 1) {
        result = 'local';
        readyForSync = false;
      } else if (attachmentIds.length && mutation.entityType === 'expense') {
        // A prior upload may have completed before the sync result became
        // uncertain. Its confirmed document ID is retained for manual retry.
        if (
          typeof payload.receiptDocumentId === 'string' &&
          payload.receiptDocumentId.trim() &&
          payload.receiptRequired === true
        ) {
          receiptUploadConfirmed = true;
          readyForSync = true;
        }
        for (const attachmentId of receiptUploadConfirmed ? [] : attachmentIds) {
          const attachment = await database.get('attachments', attachmentId);
          if (!attachment) {
            result = 'local';
            break;
          }
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
          if (!upload.ok) {
            result = classifyUploadStatus(upload.status);
            break;
          }
          const uploaded = (await upload.json().catch(() => null)) as {
            documentId?: unknown;
          } | null;
          if (typeof uploaded?.documentId !== 'string' || !uploaded.documentId.trim()) {
            result = 'uncertain';
            break;
          }
          payload.receiptDocumentId = uploaded.documentId;
          payload.receiptRequired = true;
          receiptUploadConfirmed = true;
          readyForSync = true;
        }
      }
      if (readyForSync) {
        const response = await fetcher(`${base}/app/api/sync`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...mutation, payload }),
        });
        result = await classifySyncResponse(response);
      }
    } catch {
      // A thrown fetch may have reached the server. The idempotency key stays
      // with the queued mutation so a later review/retry cannot duplicate it.
      result = 'uncertain';
    }
    if (result === 'accepted') {
      accepted += 1;
      await database.delete('mutations', mutation.mutationId);
      for (const attachmentId of mutation.attachments ?? [])
        await database.delete('attachments', attachmentId);
    } else if (result === 'conflict') {
      conflicts += 1;
      await database.put('mutations', { ...withoutReviewReason(mutation), state: 'conflict' });
    } else if (result === 'rejected') {
      rejected += 1;
      await database.put('mutations', { ...withoutReviewReason(mutation), state: 'rejected' });
    } else {
      failed += 1;
      // A session failure needs a new sign-in; an uncertain response may
      // already represent a saved mutation or uploaded receipt. Pause every
      // failed draft for explicit review, keeping its idempotency key and
      // receipt bytes so a later manual retry can use the same record.
      await database.put('mutations', {
        ...mutation,
        payload,
        state: 'needs_review',
        reviewReason: result,
      });
      if (result === 'session') sessionFailures += 1;
      else if (result === 'service') serviceFailures += 1;
      else if (result === 'local') localFailures += 1;
      else uncertainFailures += 1;
    }
  }
  return {
    accepted,
    conflicts,
    rejected,
    failed,
    sessionFailures,
    serviceFailures,
    uncertainFailures,
    localFailures,
  };
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
