import {
  cacheAssignments,
  conflictMutations,
  discardMutation,
  getOfflineAssignments,
  purgeUserCache,
  queuedCount,
  syncQueuedMutations,
  type OfflineMutation,
  type OfflineReviewReason,
} from '../offline';
import type { PortalRow } from './portal-data';

export type OfflineConflict = Pick<
  OfflineMutation,
  'mutationId' | 'entityType' | 'createdAt' | 'state' | 'reviewReason'
>;

export function offlineReviewReasonMessage(reason?: OfflineReviewReason): string {
  switch (reason) {
    case 'session':
      return 'Your session ended. Offline drafts remain on this device. Sign in again and review saved records before retrying.';
    case 'service':
      return 'The sync service is unavailable. Offline drafts remain on this device. Check saved records, then try again later.';
    case 'uncertain':
      return 'The sync result could not be confirmed. Offline drafts remain on this device. Check saved records before retrying.';
    case 'local':
      return 'An offline draft or receipt could not be prepared. Review the draft and receipt on this device before retrying.';
    default:
      return 'Check saved records before retrying this draft.';
  }
}

export type OfflineControllerState = {
  online: boolean;
  queue: number;
  syncMessage: string;
  conflictItems: OfflineConflict[];
  offlineProjects: PortalRow[];
};

export type OfflineControllerSink = {
  setOnline: (value: boolean) => void;
  setQueue: (value: number) => void;
  setSyncMessage: (value: string) => void;
  getSyncMessage?: () => string;
  setConflictItems: (value: OfflineConflict[]) => void;
  setOfflineProjects: (value: PortalRow[]) => void;
};

type SyncResult = Awaited<ReturnType<typeof syncQueuedMutations>>;
type OfflineAssignment = Awaited<ReturnType<typeof getOfflineAssignments>>[number];

export type OfflineControllerDependencies = {
  isOnline: () => boolean;
  addWindowListener: (type: 'online' | 'offline', listener: () => void) => void;
  removeWindowListener: (type: 'online' | 'offline', listener: () => void) => void;
  addServiceWorkerListener: (listener: (event: MessageEvent) => void) => void;
  registerServiceWorker: (scriptUrl: string, scope: string) => Promise<unknown>;
  queuedCount: () => Promise<number>;
  conflictMutations: () => Promise<OfflineMutation[]>;
  getOfflineAssignments: () => Promise<OfflineAssignment[]>;
  syncQueuedMutations: (reviewMutationId?: string) => Promise<SyncResult>;
  discardMutation: (mutationId: string) => Promise<void>;
  cacheAssignments: (rows: readonly Record<string, unknown>[]) => Promise<void>;
  purgeUserCache: () => Promise<void>;
  /**
   * Revoke the browser-side identity before the authenticated session is
   * signed out. This clears the readable identity cookie/local marker and
   * asks the service worker to forget its in-memory identity and cache.
   */
  forgetIdentity: (userId: string) => Promise<void>;
  removeServiceWorkerListener?: (listener: (event: MessageEvent) => void) => void;
};

const OFFLINE_IDENTITY_COOKIE = 'ja_offline_identity';
const OFFLINE_IDENTITY_STORAGE_PREFIX = 'ja-portal-offline-identity:';

function readOfflineIdentityCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const item = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OFFLINE_IDENTITY_COOKIE}=`));
  if (!item) return null;
  try {
    return decodeURIComponent(item.slice(OFFLINE_IDENTITY_COOKIE.length + 1));
  } catch {
    return item.slice(OFFLINE_IDENTITY_COOKIE.length + 1);
  }
}

function clearOfflineIdentityCookie(): void {
  if (typeof document === 'undefined') return;
  // The identity endpoint sets Path=/ and httpOnly=false. Keep the deletion
  // scoped to that exact cookie/path; do not touch another user's partitioned
  // IndexedDB or Cache Storage entries here.
  document.cookie = `${OFFLINE_IDENTITY_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
}

function clearOfflineIdentityStorage(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(
      `${OFFLINE_IDENTITY_STORAGE_PREFIX}${encodeURIComponent(userId.trim())}`,
    );
  } catch {
    // Private browsing/storage restrictions must not prevent sign-out.
  }
}

async function activeServiceWorker(): Promise<ServiceWorker | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  try {
    const registration = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_000)),
    ]);
    return registration?.active ?? registration?.waiting ?? registration?.installing ?? null;
  } catch {
    return null;
  }
}

async function notifyServiceWorkerForget(userId: string, token: string | null): Promise<void> {
  const worker = await activeServiceWorker();
  if (!worker) return;
  if (typeof MessageChannel === 'undefined') {
    try {
      worker.postMessage({ type: 'ja-offline-forget', userId, token });
    } catch {
      // The service worker is optional; the cookie/local marker are already
      // cleared and the next navigation remains fail-closed.
    }
    return;
  }

  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      channel.port1.close();
      resolve();
    };
    const timeout = setTimeout(finish, 1_000);
    channel.port1.onmessage = () => {
      clearTimeout(timeout);
      finish();
    };
    try {
      worker.postMessage({ type: 'ja-offline-forget', userId, token }, [channel.port2]);
    } catch {
      clearTimeout(timeout);
      finish();
    }
  });
}

export async function browserForgetIdentity(userId: string): Promise<void> {
  const token = readOfflineIdentityCookie();
  // Revoke the browser-visible identity first. The captured token is sent to
  // the service worker solely so it can delete the exact private cache even
  // after this cookie has been removed.
  clearOfflineIdentityCookie();
  clearOfflineIdentityStorage(userId);
  await notifyServiceWorkerForget(userId, token);
}

const browserDependencies = (): OfflineControllerDependencies => ({
  isOnline: () => navigator.onLine,
  addWindowListener: (type, listener) => addEventListener(type, listener),
  removeWindowListener: (type, listener) => removeEventListener(type, listener),
  addServiceWorkerListener: (listener) =>
    navigator.serviceWorker?.addEventListener('message', listener),
  removeServiceWorkerListener: (listener) =>
    navigator.serviceWorker?.removeEventListener('message', listener),
  registerServiceWorker: async (scriptUrl, scope) => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.register(scriptUrl, { scope });
  },
  queuedCount,
  conflictMutations,
  getOfflineAssignments,
  syncQueuedMutations: (reviewMutationId) =>
    syncQueuedMutations(fetch, undefined, reviewMutationId),
  discardMutation,
  cacheAssignments,
  purgeUserCache,
  forgetIdentity: (userId) => browserForgetIdentity(userId),
});

const assignmentRow = (project: OfflineAssignment): PortalRow => ({
  id: project.id,
  project_number: project.projectNumber,
  name: project.name,
  status: project.status,
  currency: project.currency,
  timezone: project.timezone,
});

export const createOfflineController = (
  basePath: string,
  sink: OfflineControllerSink,
  dependencies: OfflineControllerDependencies = browserDependencies(),
) => {
  let lastControllerMessage = '';
  const reviewRetriesInFlight = new Set<string>();
  let syncTail: Promise<void> = Promise.resolve();
  const setControllerMessage = (message: string): void => {
    lastControllerMessage = message;
    sink.setSyncMessage(message);
  };
  const clearObsoleteMessage = async (count: number): Promise<void> => {
    if (count > 0 || !lastControllerMessage) return;
    const previousMessage = lastControllerMessage;
    // A review-required draft is deliberately excluded from queuedCount so
    // it cannot auto-sync, but its guidance must remain visible until the
    // user resolves that local draft.
    if ((await dependencies.conflictMutations()).length > 0) return;
    if (lastControllerMessage === previousMessage && sink.getSyncMessage?.() === previousMessage)
      setControllerMessage('');
  };
  const refreshQueue = async (): Promise<void> => {
    try {
      const count = await dependencies.queuedCount();
      sink.setQueue(count);
      await clearObsoleteMessage(count);
    } catch {
      // Identity/configuration errors must not turn into an unhandled promise
      // from the fire-and-forget controller bootstrap. Preserve the last known
      // count rather than claiming that an unreadable queue is empty.
    }
  };

  const runSync = async (reviewMutationId?: string): Promise<void> => {
    if (!dependencies.isOnline()) return;
    let count: number;
    try {
      count = await dependencies.queuedCount();
    } catch {
      // An identity or storage failure before queue inspection is not a
      // failed network sync. A draft-save attempt reports its own error.
      return;
    }
    sink.setQueue(count);
    if (count <= 0 && !reviewMutationId) {
      try {
        await clearObsoleteMessage(count);
      } catch {
        // Keep the guidance when review storage cannot be inspected.
      }
      return;
    }
    try {
      const result = await dependencies.syncQueuedMutations(reviewMutationId);
      await refreshQueue();
      sink.setConflictItems(await dependencies.conflictMutations());
      if (result.uncertainFailures)
        setControllerMessage(
          result.accepted
            ? 'Some offline drafts synced; others may also have saved. Review saved records and remaining drafts before retrying.'
            : 'The sync result could not be confirmed. Offline drafts remain on this device. Check saved records before retrying.',
        );
      else if (result.sessionFailures)
        setControllerMessage(
          result.accepted
            ? 'Some offline drafts synced, but your session ended. Sign in again and review saved records and remaining drafts before retrying.'
            : 'Your session ended. Offline drafts remain on this device. Sign in again and review saved records before retrying.',
        );
      else if (result.serviceFailures)
        setControllerMessage(
          result.accepted
            ? 'Some offline drafts synced; the sync service is unavailable for others. Review saved records and remaining drafts, then try again later.'
            : 'The sync service is unavailable. Offline drafts remain on this device. Check saved records, then try again later.',
        );
      else if (result.localFailures)
        setControllerMessage(
          result.accepted
            ? 'Some offline drafts synced; another draft or receipt needs review. Check saved records and the remaining draft before retrying.'
            : 'An offline draft or receipt could not be prepared. Review the draft and receipt on this device before retrying.',
        );
      else if (result.failed)
        setControllerMessage(
          result.accepted
            ? 'Some offline drafts synced; others could not. Review saved records and remaining drafts before retrying.'
            : 'Offline drafts could not sync. Review saved records and remaining drafts before retrying.',
        );
      else if (result.conflicts)
        setControllerMessage(
          'Server records changed while offline. Review conflicts, saved records, and remaining drafts before retrying.',
        );
      else if (result.rejected)
        setControllerMessage(
          'Some offline drafts were rejected and remain on this device. Review each draft and current record before retrying.',
        );
      else if (result.accepted) setControllerMessage('Offline drafts synced.');
      // The queue may have been cleared elsewhere between inspection and
      // sync. Do not claim a save happened when no mutation was processed.
    } catch {
      setControllerMessage('Offline sync could not finish. Review saved drafts before retrying.');
    }
  };

  // Online events, service-worker requests, and manual retries share one
  // serial lane. The next run reads the queue after the prior run has stored
  // its outcome, preventing a second upload of the same queued receipt.
  const sync = (reviewMutationId?: string): Promise<void> => {
    const next = syncTail.then(() => runSync(reviewMutationId));
    syncTail = next.catch(() => undefined);
    return next;
  };

  const update = (): void => {
    const online = dependencies.isOnline();
    sink.setOnline(online);
    if (online) void sync();
  };

  const onServiceWorkerMessage = (event: MessageEvent): void => {
    if (event.data?.type === 'sync-request') void sync();
  };

  return {
    start: (): (() => void) => {
      sink.setOnline(dependencies.isOnline());
      void refreshQueue();
      void dependencies
        .conflictMutations()
        .then(sink.setConflictItems)
        .catch(() => sink.setConflictItems([]));
      void dependencies
        .getOfflineAssignments()
        .then((projects) => sink.setOfflineProjects(projects.map(assignmentRow)))
        .catch(() => sink.setOfflineProjects([]));
      void sync();
      dependencies.addWindowListener('online', update);
      dependencies.addWindowListener('offline', update);
      dependencies.addServiceWorkerListener(onServiceWorkerMessage);
      void dependencies.registerServiceWorker(
        `${basePath}/app/service-worker.js`,
        `${basePath}/app/`,
      );
      return () => {
        dependencies.removeWindowListener('online', update);
        dependencies.removeWindowListener('offline', update);
        dependencies.removeServiceWorkerListener?.(onServiceWorkerMessage);
      };
    },
    sync,
    retryReview: async (mutationId: string): Promise<void> => {
      if (reviewRetriesInFlight.has(mutationId)) return;
      reviewRetriesInFlight.add(mutationId);
      try {
        await sync(mutationId);
      } finally {
        reviewRetriesInFlight.delete(mutationId);
      }
    },
    refreshQueue,
    cacheAssignments: async (rows: readonly Record<string, unknown>[]): Promise<void> => {
      try {
        await dependencies.cacheAssignments(rows);
      } catch {
        // Storage remains unavailable until the authenticated identity is ready.
      }
    },
    purgeUserCache: dependencies.purgeUserCache,
    forgetIdentity: async (userId: string): Promise<void> => {
      await dependencies.forgetIdentity(userId);
      // purgeUserCache uses the authenticated identity held in the offline
      // module, so run it after revocation while the current page still has
      // that in-memory identity. Failure is intentionally non-fatal: the
      // service worker was already told to forget the identity and the page
      // will navigate away after sign-out.
      try {
        await Promise.race([
          dependencies.purgeUserCache(),
          new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
        ]);
      } catch {
        // Sign-out must complete even when IndexedDB is blocked or offline.
      }
    },
    discardConflict: async (mutationId: string): Promise<void> => {
      await dependencies.discardMutation(mutationId);
      sink.setConflictItems(await dependencies.conflictMutations());
      await refreshQueue();
    },
  };
};
