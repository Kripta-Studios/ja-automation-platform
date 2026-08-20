import { describe, expect, it, vi } from 'vitest';

import {
  createOfflineController,
  type OfflineControllerDependencies,
  type OfflineControllerState,
} from './offline-controller';
import type { OfflineMutation } from '../offline';

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
  ...overrides,
});

describe('offline controller', () => {
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

  it('reports partial sync outcomes with the existing conflict wording', async () => {
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
      '2 synced · server changed since your offline edit · 1 conflict',
    );
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
});
