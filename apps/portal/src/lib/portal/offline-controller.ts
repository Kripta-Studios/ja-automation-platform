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
};

const browserDependencies = (): OfflineControllerDependencies => ({
  isOnline: () => navigator.onLine,
  addWindowListener: (type, listener) => addEventListener(type, listener),
  removeWindowListener: (type, listener) => removeEventListener(type, listener),
  addServiceWorkerListener: (listener) =>
    navigator.serviceWorker?.addEventListener('message', listener),
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
    sink.setQueue(await dependencies.queuedCount());
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
      void dependencies.conflictMutations().then(sink.setConflictItems);
      void dependencies
        .getOfflineAssignments()
        .then((projects) => sink.setOfflineProjects(projects.map(assignmentRow)));
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
      };
    },
    sync,
    refreshQueue,
    cacheAssignments: dependencies.cacheAssignments,
    purgeUserCache: dependencies.purgeUserCache,
    discardConflict: async (mutationId: string): Promise<void> => {
      await dependencies.discardMutation(mutationId);
      sink.setConflictItems(await dependencies.conflictMutations());
      await refreshQueue();
    },
  };
};
