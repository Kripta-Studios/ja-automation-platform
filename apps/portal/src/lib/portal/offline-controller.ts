import {
  cacheAssignments,
  conflictMutations,
  discardMutation,
  getOfflineAssignments,
  purgeUserCache,
  queuedCount,
  syncQueuedMutations,
  type OfflineMutation,
} from '../offline';
import type { PortalRow } from './portal-data';

export type OfflineConflict = Pick<OfflineMutation, 'mutationId' | 'entityType' | 'createdAt'>;

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
  syncQueuedMutations: () => Promise<SyncResult>;
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

async function browserForgetIdentity(userId: string): Promise<void> {
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
  syncQueuedMutations,
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
  const refreshQueue = async (): Promise<void> => {
    try {
      sink.setQueue(await dependencies.queuedCount());
    } catch {
      // Identity/configuration errors must not turn into an unhandled promise
      // from the fire-and-forget controller bootstrap. No private queue data is
      // exposed until a server-issued identity is available.
      sink.setQueue(0);
    }
  };

  const sync = async (): Promise<void> => {
    if (!dependencies.isOnline()) return;
    try {
      const result = await dependencies.syncQueuedMutations();
      await refreshQueue();
      sink.setConflictItems(await dependencies.conflictMutations());
      if (result.failed)
        sink.setSyncMessage(
          `Sync failed — retry (${result.failed} item${result.failed === 1 ? '' : 's'})`,
        );
      else if (result.accepted || result.conflicts || result.rejected)
        sink.setSyncMessage(
          result.conflicts
            ? `${result.accepted} synced · server changed since your offline edit · ${result.conflicts} conflict${result.conflicts === 1 ? '' : 's'}`
            : `${result.accepted} synced · ${result.rejected} rejected`,
        );
      else sink.setSyncMessage('Synced');
    } catch {
      sink.setSyncMessage('Sync failed — retry when the connection is stable.');
    }
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
