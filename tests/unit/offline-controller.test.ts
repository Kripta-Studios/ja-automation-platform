import { describe, expect, it, vi } from 'vitest';

import {
  browserPurgePrivateReads,
  createOfflineController,
  offlineReviewReasonMessage,
  type OfflineControllerDependencies,
  type OfflineControllerState,
} from '../../apps/portal/src/lib/portal/offline-controller';
import type { OfflineMutation } from '../../apps/portal/src/lib/offline';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';

const createState = () => {
  const state: OfflineControllerState = {
    online: false,
    queue: 0,
    syncMessage: '',
    assignmentCacheMessage: '',
    conflictItems: [],
    offlineProjects: [],
  };

  return {
    state,
    sink: {
      setOnline: (value: boolean) => (state.online = value),
      setQueue: (value: number) => (state.queue = value),
      setSyncMessage: (value: string) => (state.syncMessage = value),
      setAssignmentCacheMessage: (value: string) => (state.assignmentCacheMessage = value),
      getSyncMessage: () => state.syncMessage,
      setConflictItems: (value: OfflineControllerState['conflictItems']) =>
        (state.conflictItems = value),
      setOfflineProjects: (value: OfflineControllerState['offlineProjects']) =>
        (state.offlineProjects = value),
    },
  };
};

const dependencies = (
  overrides: Partial<OfflineControllerDependencies> = {},
): OfflineControllerDependencies => ({
  isOnline: () => true,
  addWindowListener: vi.fn(),
  removeWindowListener: vi.fn(),
  addServiceWorkerListener: vi.fn(),
  registerServiceWorker: vi.fn(async () => undefined),
  queuedCount: vi.fn(async () => 2),
  conflictMutations: vi.fn(async () => []),
  getOfflineAssignments: vi.fn(async () => []),
  syncQueuedMutations: vi.fn(async () => ({ accepted: 0, conflicts: 0, rejected: 0, failed: 0 })),
  discardMutation: vi.fn(async () => undefined),
  cacheAssignments: vi.fn(async () => undefined),
  purgePrivateReads: vi.fn(async () => undefined),
  purgeUserCache: vi.fn(async () => undefined),
  forgetIdentity: vi.fn(async () => undefined),
  ...overrides,
});

describe('offline controller', () => {
  it.each(['session', 'service', 'uncertain', 'local'] as const)(
    'restores translated %s review guidance from a persisted reason',
    (reason) => {
      const message = offlineReviewReasonMessage(reason);
      expect(message).not.toBe(offlineReviewReasonMessage());
      expect(translate('es', message)).not.toBe(message);
      expect(translate('pt', message)).not.toBe(message);
    },
  );

  it('loads review reasons on controller start without retrying held drafts', async () => {
    const { state, sink } = createState();
    const held = {
      mutationId: 'held-1',
      entityType: 'expense',
      entityId: 'expense-1',
      baseVersion: 0,
      createdAt: '2026-09-27T00:00:00.000Z',
      payload: {},
      attachments: [],
      state: 'needs_review',
      reviewReason: 'service',
    } satisfies OfflineMutation;
    const old = { ...held, mutationId: 'old-1', reviewReason: undefined } satisfies OfflineMutation;
    const syncQueuedMutations = vi.fn(async () => ({
      accepted: 0,
      conflicts: 0,
      rejected: 0,
      failed: 0,
    }));
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount: vi.fn(async () => 0),
        conflictMutations: vi.fn(async () => [held, old]),
        syncQueuedMutations,
      }),
    );

    const stop = controller.start();
    await vi.waitFor(() => expect(state.conflictItems).toHaveLength(2));
    expect(state.conflictItems[0]?.reviewReason).toBe('service');
    expect(
      translate('es', offlineReviewReasonMessage(state.conflictItems[0]?.reviewReason)),
    ).not.toBe(offlineReviewReasonMessage(state.conflictItems[0]?.reviewReason));
    expect(
      translate('pt', offlineReviewReasonMessage(state.conflictItems[1]?.reviewReason)),
    ).not.toBe(offlineReviewReasonMessage(state.conflictItems[1]?.reviewReason));
    expect(syncQueuedMutations).not.toHaveBeenCalled();
    stop();
  });
  it('does not start sync or announce success when there are no queued drafts', async () => {
    const { state, sink } = createState();
    const syncQueuedMutations = vi.fn(async () => ({
      accepted: 0,
      conflicts: 0,
      rejected: 0,
      failed: 0,
    }));
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({ queuedCount: vi.fn(async () => 0), syncQueuedMutations }),
    );

    const stop = controller.start();
    await controller.sync();

    expect(syncQueuedMutations).not.toHaveBeenCalled();
    expect(state.queue).toBe(0);
    expect(state.syncMessage).toBe('');
    stop();
  });

  it('does not call sync or claim a connection failure when storage cannot be inspected', async () => {
    const { state, sink } = createState();
    state.queue = 3;
    const syncQueuedMutations = vi.fn(async () => ({
      accepted: 0,
      conflicts: 0,
      rejected: 0,
      failed: 0,
    }));
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount: vi.fn(async () => {
          throw new DOMException('Storage denied', 'SecurityError');
        }),
        syncQueuedMutations,
      }),
    );

    await controller.refreshQueue();
    await controller.sync();

    expect(syncQueuedMutations).not.toHaveBeenCalled();
    expect(state.queue).toBe(3);
    expect(state.syncMessage).toBe('');
  });

  it('gives a safe review step when a nonempty queue fails during sync', async () => {
    const { state, sink } = createState();
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount: vi.fn(async () => 1),
        syncQueuedMutations: vi.fn(async () => {
          throw new Error('IndexedDB transaction failed');
        }),
      }),
    );

    await controller.sync();

    expect(state.queue).toBe(1);
    expect(state.syncMessage).toBe(
      'Offline sync could not finish. Review saved drafts before retrying.',
    );
    expect(translate('es', state.syncMessage)).toBe(
      'No se pudo completar la sincronización sin conexión. Revisa los borradores guardados antes de volver a intentarlo.',
    );
    expect(translate('pt', state.syncMessage)).toBe(
      'Não foi possível concluir a sincronização sem ligação. Reveja os rascunhos guardados antes de tentar novamente.',
    );
  });

  it('does not replace a draft-save error with a no-op sync result', async () => {
    const { state, sink } = createState();
    state.syncMessage = 'Offline draft could not be saved on this device.';
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({ queuedCount: vi.fn(async () => 0) }),
    );

    await controller.sync();

    expect(state.syncMessage).toBe('Offline draft could not be saved on this device.');
  });

  it('clears an obsolete sync warning after the last queued draft is removed', async () => {
    const { state, sink } = createState();
    const queuedCount = vi.fn().mockResolvedValueOnce(1).mockResolvedValue(0);
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount,
        syncQueuedMutations: vi.fn(async () => {
          throw new Error('Sync request failed');
        }),
      }),
    );

    await controller.sync();
    expect(state.syncMessage).toContain('Review saved drafts');
    await controller.refreshQueue();
    expect(state.queue).toBe(0);
    expect(state.syncMessage).toBe('');
  });

  it('keeps a service warning across later auto syncs while review is pending, then clears it on discard', async () => {
    const { state, sink } = createState();
    let queued = 1;
    let reviewItems: OfflineMutation[] = [
      {
        mutationId: 'review-1',
        entityType: 'expense',
        entityId: 'expense-1',
        baseVersion: 0,
        createdAt: '2026-09-27T00:00:00.000Z',
        payload: {},
        attachments: [],
        state: 'needs_review',
      },
    ];
    const syncQueuedMutations = vi.fn(async () => {
      queued = 0;
      return {
        accepted: 0,
        conflicts: 0,
        rejected: 0,
        failed: 1,
        serviceFailures: 1,
      };
    });
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount: vi.fn(async () => queued),
        conflictMutations: vi.fn(async () => reviewItems),
        syncQueuedMutations,
        discardMutation: vi.fn(async () => {
          reviewItems = [];
        }),
      }),
    );

    await controller.sync();
    const preciseMessage =
      'The sync service is unavailable. Offline drafts remain on this device. Check saved records, then try again later.';
    expect(state.syncMessage).toBe(preciseMessage);
    expect(state.conflictItems).toHaveLength(1);

    await controller.sync();
    expect(syncQueuedMutations).toHaveBeenCalledTimes(1);
    expect(state.syncMessage).toBe(preciseMessage);

    await controller.discardConflict('review-1');
    expect(state.conflictItems).toEqual([]);
    expect(state.syncMessage).toBe('');
  });

  it('preserves a newer draft-save error when the queue becomes empty', async () => {
    const { state, sink } = createState();
    const queuedCount = vi.fn().mockResolvedValueOnce(1).mockResolvedValue(0);
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount,
        syncQueuedMutations: vi.fn(async () => {
          throw new Error('Sync request failed');
        }),
      }),
    );

    await controller.sync();
    state.syncMessage = 'Offline draft could not be saved on this device.';
    await controller.refreshQueue();
    expect(state.queue).toBe(0);
    expect(state.syncMessage).toBe('Offline draft could not be saved on this device.');
  });

  it('refreshes the visible queue count after a draft is persisted', async () => {
    const { state, sink } = createState();
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount: vi.fn(async () => 1),
      }),
    );

    await controller.refreshQueue();

    expect(state.queue).toBe(1);
  });

  it('reports a conflict with a review step in the selected language', async () => {
    const { state, sink } = createState();
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount: vi.fn(async () => 1),
        conflictMutations: vi.fn(async () => [
          {
            mutationId: 'mutation-1',
            entityType: 'time',
            entityId: 'time-1',
            baseVersion: 1,
            createdAt: '2026-08-20T12:00:00.000Z',
            payload: {},
            attachments: [],
            state: 'conflict',
          } satisfies OfflineMutation,
        ]),
        syncQueuedMutations: vi.fn(async () => ({
          accepted: 2,
          conflicts: 1,
          rejected: 0,
          failed: 0,
        })),
      }),
    );

    await controller.sync();

    expect(state.queue).toBe(1);
    expect(state.conflictItems).toHaveLength(1);
    expect(state.syncMessage).toBe(
      'Server records changed while offline. Review conflicts, saved records, and remaining drafts before retrying.',
    );
    expect(translate('es', state.syncMessage)).toContain('Revisa los conflictos');
    expect(translate('pt', state.syncMessage)).toContain('Reveja os conflitos');
  });

  it.each([
    [
      { accepted: 1, conflicts: 0, rejected: 0, failed: 1 },
      'Some offline drafts synced; others could not. Review saved records and remaining drafts before retrying.',
    ],
    [
      { accepted: 0, conflicts: 0, rejected: 0, failed: 1 },
      'Offline drafts could not sync. Review saved records and remaining drafts before retrying.',
    ],
    [
      { accepted: 0, conflicts: 0, rejected: 1, failed: 0 },
      'Some offline drafts were rejected and remain on this device. Review each draft and current record before retrying.',
    ],
    [{ accepted: 1, conflicts: 0, rejected: 0, failed: 0 }, 'Offline drafts synced.'],
  ])('explains offline sync result %# with a translated next step', async (result, message) => {
    const { state, sink } = createState();
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({ syncQueuedMutations: vi.fn(async () => result) }),
    );

    await controller.sync();

    expect(state.syncMessage).toBe(message);
    expect(translate('es', message)).not.toBe(message);
    expect(translate('pt', message)).not.toBe(message);
  });

  it.each([
    [
      { accepted: 0, conflicts: 0, rejected: 0, failed: 1, sessionFailures: 1 },
      'Your session ended. Offline drafts remain on this device. Sign in again and review saved records before retrying.',
    ],
    [
      { accepted: 0, conflicts: 0, rejected: 0, failed: 1, serviceFailures: 1 },
      'The sync service is unavailable. Offline drafts remain on this device. Check saved records, then try again later.',
    ],
    [
      { accepted: 0, conflicts: 0, rejected: 0, failed: 1, uncertainFailures: 1 },
      'The sync result could not be confirmed. Offline drafts remain on this device. Check saved records before retrying.',
    ],
    [
      { accepted: 1, conflicts: 0, rejected: 0, failed: 1, uncertainFailures: 1 },
      'Some offline drafts synced; others may also have saved. Review saved records and remaining drafts before retrying.',
    ],
    [
      { accepted: 1, conflicts: 0, rejected: 0, failed: 1, sessionFailures: 1 },
      'Some offline drafts synced, but your session ended. Sign in again and review saved records and remaining drafts before retrying.',
    ],
    [
      { accepted: 1, conflicts: 0, rejected: 0, failed: 1, serviceFailures: 1 },
      'Some offline drafts synced; the sync service is unavailable for others. Review saved records and remaining drafts, then try again later.',
    ],
    [
      { accepted: 0, conflicts: 0, rejected: 0, failed: 1, localFailures: 1 },
      'An offline draft or receipt could not be prepared. Review the draft and receipt on this device before retrying.',
    ],
  ])('explains transport result %# without claiming rejection', async (result, message) => {
    const { state, sink } = createState();
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({ syncQueuedMutations: vi.fn(async () => result) }),
    );

    await controller.sync();

    expect(state.syncMessage).toBe(message);
    expect(translate('es', message)).not.toBe(message);
    expect(translate('pt', message)).not.toBe(message);
  });

  it('requires an explicit review retry even when no drafts are eligible for automatic sync', async () => {
    const { state, sink } = createState();
    const syncQueuedMutations = vi.fn(async (_reviewMutationId?: string) => ({
      accepted: 1,
      conflicts: 0,
      rejected: 0,
      failed: 0,
    }));
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount: vi.fn(async () => 0),
        syncQueuedMutations,
      }),
    );

    await controller.sync();
    expect(syncQueuedMutations).not.toHaveBeenCalled();
    await controller.retryReview('review-1');
    expect(syncQueuedMutations).toHaveBeenCalledExactlyOnceWith('review-1');
    expect(state.syncMessage).toBe('Offline drafts synced.');
  });

  it('serializes concurrent retry clicks for the same offline draft', async () => {
    const { sink } = createState();
    let finishSync!: (value: {
      accepted: number;
      conflicts: number;
      rejected: number;
      failed: number;
    }) => void;
    const syncQueuedMutations = vi.fn(
      () =>
        new Promise<{
          accepted: number;
          conflicts: number;
          rejected: number;
          failed: number;
        }>((resolve) => {
          finishSync = resolve;
        }),
    );
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({ queuedCount: vi.fn(async () => 0), syncQueuedMutations }),
    );

    const firstClick = controller.retryReview('review-1');
    const secondClick = controller.retryReview('review-1');
    await vi.waitFor(() => expect(syncQueuedMutations).toHaveBeenCalledExactlyOnceWith('review-1'));
    finishSync({ accepted: 1, conflicts: 0, rejected: 0, failed: 0 });
    await Promise.all([firstClick, secondClick]);

    expect(syncQueuedMutations).toHaveBeenCalledTimes(1);
  });

  it('serializes overlapping automatic sync requests before reading the remaining queue', async () => {
    const { sink } = createState();
    let queued = 1;
    let finishFirst!: () => void;
    const firstRequest = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const syncQueuedMutations = vi.fn(async () => {
      await firstRequest;
      queued = 0;
      return { accepted: 1, conflicts: 0, rejected: 0, failed: 0 };
    });
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({ queuedCount: vi.fn(async () => queued), syncQueuedMutations }),
    );

    const first = controller.sync();
    const second = controller.sync();
    await vi.waitFor(() => expect(syncQueuedMutations).toHaveBeenCalledTimes(1));
    finishFirst();
    await Promise.all([first, second]);

    expect(syncQueuedMutations).toHaveBeenCalledTimes(1);
  });

  it('runs an explicit manual retry after an active automatic sync', async () => {
    const { sink } = createState();
    let queued = 1;
    let finishAutomatic!: () => void;
    const automaticRequest = new Promise<void>((resolve) => {
      finishAutomatic = resolve;
    });
    const syncQueuedMutations = vi.fn(async (reviewMutationId?: string) => {
      if (!reviewMutationId) {
        await automaticRequest;
        queued = 0;
      }
      return { accepted: 1, conflicts: 0, rejected: 0, failed: 0 };
    });
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({ queuedCount: vi.fn(async () => queued), syncQueuedMutations }),
    );

    const automatic = controller.sync();
    await vi.waitFor(() => expect(syncQueuedMutations).toHaveBeenCalledExactlyOnceWith(undefined));
    const manual = controller.retryReview('review-1');
    expect(syncQueuedMutations).toHaveBeenCalledTimes(1);
    finishAutomatic();
    await Promise.all([automatic, manual]);

    expect(syncQueuedMutations.mock.calls).toEqual([[undefined], ['review-1']]);
  });

  it('loads cached assignments into the portal row contract on start', async () => {
    const { state, sink } = createState();
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        getOfflineAssignments: vi.fn(async () => [
          {
            id: 'project-1',
            projectNumber: 'C-0042-P-003',
            name: 'Commissioning',
            status: 'active',
            currency: 'USD',
            timezone: 'America/Detroit',
          },
        ]),
      }),
    );

    controller.start();
    await vi.waitFor(() => expect(state.offlineProjects).toHaveLength(1));

    expect(state.online).toBe(true);
    expect(state.offlineProjects[0]).toEqual({
      id: 'project-1',
      project_number: 'C-0042-P-003',
      name: 'Commissioning',
      status: 'active',
      currency: 'USD',
      timezone: 'America/Detroit',
    });
  });

  it('immediately replaces revoked project options with an authoritative online empty list', async () => {
    const { state, sink } = createState();
    state.offlineProjects = [{ id: 'revoked-project' }];
    state.queue = 2;
    let persist!: () => void;
    const cacheAssignments = vi.fn(() => new Promise<void>((resolve) => (persist = resolve)));
    const deps = dependencies({ cacheAssignments });
    const controller = createOfflineController('/ja', sink, deps);

    const write = controller.cacheAssignments([]);
    expect(state.offlineProjects).toEqual([]);
    await vi.waitFor(() => expect(cacheAssignments).toHaveBeenCalledExactlyOnceWith([]));
    expect(state.queue).toBe(2);
    expect(deps.purgeUserCache).not.toHaveBeenCalled();
    expect(deps.discardMutation).not.toHaveBeenCalled();
    expect(deps.syncQueuedMutations).not.toHaveBeenCalled();
    persist();
    await write;
  });

  it('preserves cached options when project data is absent or received offline', async () => {
    const { state, sink } = createState();
    state.offlineProjects = [{ id: 'cached-project' }];
    let online = true;
    const cacheAssignments = vi.fn(async () => undefined);
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({ isOnline: () => online, cacheAssignments }),
    );

    await controller.cacheAssignments(undefined);
    online = false;
    await controller.cacheAssignments([]);
    await controller.cacheAssignments([{ id: 'offline-stale-project' }]);
    expect(state.offlineProjects).toEqual([{ id: 'cached-project' }]);
    expect(cacheAssignments).not.toHaveBeenCalled();
  });

  it('does not let a late bootstrap cache read restore revoked options', async () => {
    const { state, sink } = createState();
    let read!: (
      rows: Awaited<ReturnType<OfflineControllerDependencies['getOfflineAssignments']>>,
    ) => void;
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount: vi.fn(async () => 0),
        getOfflineAssignments: vi
          .fn()
          .mockImplementationOnce(() => new Promise((resolve) => (read = resolve)))
          .mockResolvedValue([]),
      }),
    );
    const stop = controller.start();
    await controller.cacheAssignments([]);
    read([
      {
        id: 'revoked',
        projectNumber: 'QA',
        name: 'Revoked QA',
        status: 'active',
        currency: 'USD',
        timezone: 'UTC',
      },
    ]);
    await Promise.resolve();
    expect(state.offlineProjects).toEqual([]);
    stop();
  });

  it('serializes persisted snapshots while publishing the newest project options immediately', async () => {
    const { state, sink } = createState();
    let finishFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => (finishFirst = resolve));
    let stored: readonly Record<string, unknown>[] = [{ id: 'old' }];
    const cacheAssignments = vi.fn(async (rows: readonly Record<string, unknown>[]) => {
      if (rows.length) await firstWrite;
      stored = rows;
    });
    const controller = createOfflineController('/ja', sink, dependencies({ cacheAssignments }));
    const earlier = controller.cacheAssignments([{ id: 'earlier' }]);
    await vi.waitFor(() => expect(cacheAssignments).toHaveBeenCalledTimes(1));
    const latest = controller.cacheAssignments([]);
    expect(state.offlineProjects).toEqual([]);
    expect(cacheAssignments).toHaveBeenCalledTimes(1);
    finishFirst();
    await Promise.all([earlier, latest]);
    expect(stored).toEqual([]);
    expect(cacheAssignments.mock.calls).toEqual([[[{ id: 'earlier' }]], [[]]]);
  });

  it('retains known revocation in memory when assignment persistence fails and permits later replacement', async () => {
    const { state, sink } = createState();
    state.offlineProjects = [{ id: 'revoked' }];
    const cacheAssignments = vi
      .fn()
      .mockRejectedValueOnce(new Error('Storage denied'))
      .mockResolvedValue(undefined);
    const controller = createOfflineController('/ja', sink, dependencies({ cacheAssignments }));
    await expect(controller.cacheAssignments([])).resolves.toBeUndefined();
    expect(state.offlineProjects).toEqual([]);
    expect(state.assignmentCacheMessage).toContain('Stay online and reload');
    expect(translate('es', state.assignmentCacheMessage)).toContain('Sigue en línea');
    expect(translate('pt', state.assignmentCacheMessage)).toContain('Permaneça ligado à Internet');
    await controller.cacheAssignments([{ id: 'newly-authorized' }]);
    expect(state.offlineProjects).toEqual([{ id: 'newly-authorized' }]);
    expect(cacheAssignments).toHaveBeenCalledTimes(2);
    expect(state.assignmentCacheMessage).toBe('');
  });

  it('keeps the cache warning separate from existing draft/session guidance and queue-zero syncs', async () => {
    const { state, sink } = createState();
    state.syncMessage =
      'Your session ended. Offline drafts remain on this device. Sign in again and review saved records before retrying.';
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        queuedCount: vi.fn(async () => 0),
        cacheAssignments: vi.fn(async () => {
          throw new Error('Storage denied');
        }),
      }),
    );
    const sessionMessage = state.syncMessage;
    await controller.cacheAssignments([]);
    const cacheMessage = state.assignmentCacheMessage;
    await controller.sync();
    await controller.refreshQueue();
    expect(state.assignmentCacheMessage).toBe(cacheMessage);
    expect(state.syncMessage).toBe(sessionMessage);
    expect(cacheMessage).not.toBe('');
    await controller.cacheAssignments(undefined);
    expect(state.assignmentCacheMessage).toBe(cacheMessage);
  });

  it('does not clear a prior cache warning on an older successful write while the latest snapshot is unresolved', async () => {
    const { state, sink } = createState();
    const cacheAssignments = vi.fn().mockRejectedValueOnce(new Error('Initial storage failure'));
    const controller = createOfflineController('/ja', sink, dependencies({ cacheAssignments }));
    await controller.cacheAssignments([]);
    const warning = state.assignmentCacheMessage;
    let finishEarlier!: () => void;
    let finishLatest!: () => void;
    cacheAssignments.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishEarlier = resolve)),
    );
    cacheAssignments.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishLatest = resolve)),
    );
    const earlier = controller.cacheAssignments([{ id: 'earlier' }]);
    await vi.waitFor(() => expect(cacheAssignments).toHaveBeenCalledTimes(2));
    const latest = controller.cacheAssignments([]);
    finishEarlier();
    await earlier;
    await vi.waitFor(() => expect(cacheAssignments).toHaveBeenCalledTimes(3));
    expect(state.assignmentCacheMessage).toBe(warning);
    expect(state.offlineProjects).toEqual([]);
    finishLatest();
    await latest;
    expect(state.assignmentCacheMessage).toBe('');
  });

  it('captures each authoritative snapshot without later caller mutation changing its persisted options', async () => {
    const { state, sink } = createState();
    const cacheAssignments = vi.fn(async () => undefined);
    const controller = createOfflineController('/ja', sink, dependencies({ cacheAssignments }));
    const rows = [{ id: 'current' }];
    const write = controller.cacheAssignments(rows);
    rows[0]!.id = 'later-mutated';
    await write;
    expect(state.offlineProjects).toEqual([{ id: 'current' }]);
    expect(cacheAssignments).toHaveBeenCalledExactlyOnceWith([{ id: 'current' }]);
  });

  it('does not persist a superseded or disposed-shell snapshot waiting in the assignment lane', async () => {
    const { state, sink } = createState();
    const cacheAssignments = vi.fn(async () => undefined);
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({ cacheAssignments, queuedCount: vi.fn(async () => 0) }),
    );
    const earlier = controller.cacheAssignments([{ id: 'superseded' }]);
    const latest = controller.cacheAssignments([]);
    await Promise.all([earlier, latest]);
    expect(cacheAssignments).toHaveBeenCalledExactlyOnceWith([]);
    expect(state.offlineProjects).toEqual([]);

    const stop = controller.start();
    const stale = controller.cacheAssignments([{ id: 'departed-shell' }]);
    stop();
    await stale;
    expect(cacheAssignments).toHaveBeenCalledTimes(1);
  });

  it('revokes the browser identity before purging the current user partition', async () => {
    const { sink } = createState();
    const forgetIdentity = vi.fn(async () => undefined);
    const purgeUserCache = vi.fn(async () => undefined);
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({ forgetIdentity, purgeUserCache }),
    );

    await controller.forgetIdentity('user-a');

    expect(forgetIdentity).toHaveBeenCalledWith('user-a');
    expect(purgeUserCache).toHaveBeenCalledTimes(1);
    const forgetCall = forgetIdentity.mock.invocationCallOrder[0];
    const purgeCall = purgeUserCache.mock.invocationCallOrder[0];
    expect(forgetCall).toBeDefined();
    expect(purgeCall).toBeDefined();
    expect(forgetCall!).toBeLessThan(purgeCall!);
  });

  it('keeps logout fail-closed when IndexedDB cleanup is blocked', async () => {
    const { sink } = createState();
    const controller = createOfflineController(
      '/ja',
      sink,
      dependencies({
        purgeUserCache: vi.fn(async () => {
          throw new Error('database is blocked');
        }),
      }),
    );

    await expect(controller.forgetIdentity('user-a')).resolves.toBeUndefined();
  });
});

describe('authoritative Worker assignment revocation clears only private read cache', () => {
  const cached = (id: string) => ({
    id,
    projectNumber: id,
    name: id,
    status: 'active',
    currency: 'USD',
    timezone: 'UTC',
  });
  const workerAccess = { authoritativeWorkerAccess: true };

  it('awaits acknowledged private-read purge before replacing persisted revoked assignments', async () => {
    const { state, sink } = createState();
    state.queue = 2;
    const events: string[] = [];
    let release!: () => void;
    const deps = dependencies({
      getOfflineAssignments: async () => [cached('revoked'), cached('retained')],
      purgePrivateReads: vi.fn(async () => {
        events.push('purge requested');
        await new Promise<void>((resolve) => (release = resolve));
        events.push('purge acknowledged');
      }),
      cacheAssignments: vi.fn(async () => {
        events.push('assignments replaced');
      }),
    });
    const controller = createOfflineController('/ja', sink, deps);
    const pending = controller.cacheAssignments([{ id: 'retained' }], workerAccess);
    expect(state.offlineProjects).toEqual([{ id: 'retained' }]);
    await vi.waitFor(() => expect(events).toEqual(['purge requested']));
    expect(deps.cacheAssignments).not.toHaveBeenCalled();
    release();
    await pending;
    expect(events).toEqual(['purge requested', 'purge acknowledged', 'assignments replaced']);
    expect(state.assignmentCacheMessage).toBe('');
    expect(state.queue).toBe(2);
    expect(deps.purgeUserCache).not.toHaveBeenCalled();
    expect(deps.discardMutation).not.toHaveBeenCalled();
    expect(deps.syncQueuedMutations).not.toHaveBeenCalled();
  });

  it('does not treat narrower nonWorker or missing/offline data as revocation', async () => {
    const { sink } = createState();
    let online = true;
    const deps = dependencies({
      isOnline: () => online,
      getOfflineAssignments: async () => [cached('old')],
    });
    const controller = createOfflineController('/ja', sink, deps);
    await controller.cacheAssignments([]);
    await controller.cacheAssignments(undefined, workerAccess);
    online = false;
    await controller.cacheAssignments([], workerAccess);
    expect(deps.purgePrivateReads).not.toHaveBeenCalled();
    expect(deps.cacheAssignments).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('does not purge unchanged or newly added authorized project sets', async () => {
    const { sink } = createState();
    const deps = dependencies({ getOfflineAssignments: async () => [cached('retained')] });
    const controller = createOfflineController('/ja', sink, deps);
    await controller.cacheAssignments([{ id: 'retained' }, { id: 'new' }], workerAccess);
    expect(deps.purgePrivateReads).not.toHaveBeenCalled();
    expect(deps.cacheAssignments).toHaveBeenCalledOnce();
  });

  it.each(['unavailable', 'failed'])(
    'retains the cache warning and latest safe options when required purge is %s',
    async (failure) => {
      const { state, sink } = createState();
      state.syncMessage = 'Existing conflict guidance';
      const deps = dependencies({
        queuedCount: async () => 0,
        getOfflineAssignments: async () => [cached('revoked')],
        purgePrivateReads:
          failure === 'unavailable'
            ? undefined
            : vi.fn(async () => {
                throw new Error('No completed acknowledgment');
              }),
      });
      const controller = createOfflineController('/ja', sink, deps);
      await controller.cacheAssignments([], workerAccess);
      expect(state.offlineProjects).toEqual([]);
      expect(state.assignmentCacheMessage).toContain('Stay online and reload');
      expect(deps.cacheAssignments).not.toHaveBeenCalled();
      await controller.refreshQueue();
      await controller.sync();
      expect(state.assignmentCacheMessage).toContain('Stay online and reload');
      expect(state.syncMessage).toBe('Existing conflict guidance');
      deps.purgePrivateReads = vi.fn(async () => undefined);
      await controller.cacheAssignments([], workerAccess);
      expect(state.assignmentCacheMessage).toBe('');
      expect(deps.cacheAssignments).toHaveBeenCalledExactlyOnceWith([]);
      expect(deps.purgeUserCache).not.toHaveBeenCalled();
    },
  );

  it('requires both purge and assignment persistence before clearing a previous warning', async () => {
    const { state, sink } = createState();
    const deps = dependencies({
      getOfflineAssignments: async () => [cached('revoked')],
      cacheAssignments: vi
        .fn()
        .mockRejectedValueOnce(new Error('Storage unavailable'))
        .mockResolvedValue(undefined),
    });
    const controller = createOfflineController('/ja', sink, deps);
    await controller.cacheAssignments([], workerAccess);
    expect(state.assignmentCacheMessage).toContain('Stay online and reload');
    await controller.cacheAssignments([], workerAccess);
    expect(state.assignmentCacheMessage).toBe('');
    expect(deps.purgePrivateReads).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent shells and skips a superseded snapshot after its delayed read', async () => {
    const firstState = createState();
    const latestState = createState();
    let release!: (rows: ReturnType<typeof cached>[]) => void;
    const deps = dependencies({
      getOfflineAssignments: vi
        .fn()
        .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
        .mockResolvedValue([cached('revoked')]),
    });
    const first = createOfflineController('/ja', firstState.sink, deps);
    const latest = createOfflineController('/ja', latestState.sink, deps);
    const pending = first.cacheAssignments([{ id: 'revoked' }], workerAccess);
    await vi.waitFor(() => expect(deps.getOfflineAssignments).toHaveBeenCalledOnce());
    const newest = latest.cacheAssignments([], workerAccess);
    release([cached('revoked')]);
    await Promise.all([pending, newest]);
    expect(deps.cacheAssignments).toHaveBeenCalledExactlyOnceWith([]);
    expect(deps.purgePrivateReads).toHaveBeenCalledOnce();
    expect(latestState.state.offlineProjects).toEqual([]);
  });
});

describe('browser private-read purge acknowledgment', () => {
  const setup = () => {
    const close = vi.fn();
    let onmessage: ((event: { data: unknown }) => void) | undefined;
    class Channel {
      port1 = {
        set onmessage(value: typeof onmessage) {
          onmessage = value;
        },
        close,
      };
      port2 = {};
    }
    const postMessage = vi.fn();
    vi.stubGlobal('document', { cookie: 'ja_offline_identity=test-token' });
    vi.stubGlobal('navigator', { serviceWorker: { controller: { postMessage } } });
    vi.stubGlobal('MessageChannel', Channel);
    return { close, postMessage, ack: (data: unknown) => onmessage?.({ data }) };
  };

  it('resolves only on an explicit completed success acknowledgment', async () => {
    const browser = setup();
    try {
      let resolved = false;
      const work = browserPurgePrivateReads().then(() => (resolved = true));
      await vi.waitFor(() => expect(browser.postMessage).toHaveBeenCalledOnce());
      expect(resolved).toBe(false);
      browser.ack({ type: 'unrelated', success: true });
      await Promise.resolve();
      expect(resolved).toBe(false);
      browser.ack({ type: 'ja-offline-private-reads-purged', success: true });
      await work;
      expect(resolved).toBe(true);
      expect(browser.close).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a failed acknowledgment instead of reporting completed refresh', async () => {
    const browser = setup();
    try {
      const work = browserPurgePrivateReads();
      const rejected = expect(work).rejects.toThrow('refresh failed');
      await vi.waitFor(() => expect(browser.postMessage).toHaveBeenCalledOnce());
      browser.ack({ type: 'ja-offline-private-reads-purged', success: false });
      await rejected;
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a missing acknowledgment after the bounded timeout', async () => {
    const browser = setup();
    vi.useFakeTimers();
    try {
      const work = browserPurgePrivateReads();
      const rejected = expect(work).rejects.toThrow('not acknowledged');
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2_000);
      await rejected;
      expect(browser.close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('rejects required purging when no service worker is available', async () => {
    vi.stubGlobal('document', { cookie: 'ja_offline_identity=test-token' });
    vi.stubGlobal('navigator', {});
    try {
      await expect(browserPurgePrivateReads()).rejects.toThrow('could not be refreshed');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
