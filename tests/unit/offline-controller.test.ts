import { describe, expect, it, vi } from 'vitest';

import {
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
    conflictItems: [],
    offlineProjects: [],
  };

  return {
    state,
    sink: {
      setOnline: (value: boolean) => (state.online = value),
      setQueue: (value: number) => (state.queue = value),
      setSyncMessage: (value: string) => (state.syncMessage = value),
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
