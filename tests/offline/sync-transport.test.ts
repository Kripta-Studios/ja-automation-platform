import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  syncQueuedMutations,
  type OfflineSyncStorage,
  type OfflineMutation,
} from '../../apps/portal/src/lib/offline';

const storage = {
  mutations: new Map<string, unknown>(),
  attachments: new Map<string, unknown>(),
};

const database: OfflineSyncStorage = {
  getAll: async () => [...storage.mutations.values()] as OfflineMutation[],
  get: async (_store, id) => storage.attachments.get(id) as never,
  put: async (_store, value) => {
    storage.mutations.set(value.mutationId, value);
  },
  delete: async (store, id) => {
    (store === 'mutations' ? storage.mutations : storage.attachments).delete(id);
  },
};

const mutation = (mutationId: string): OfflineMutation => ({
  mutationId,
  entityType: 'time',
  entityId: `time-${mutationId}`,
  baseVersion: 0,
  createdAt: '2026-09-27T00:00:00.000Z',
  payload: { projectId: 'project-1' },
  attachments: [],
  state: 'queued',
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  storage.mutations.clear();
  storage.attachments.clear();
});

describe('offline sync transport and outcome boundary', () => {
  it.each([
    [401, { error: 'Unauthorized' }, 'sessionFailures', 'session'],
    [401, { outcome: 'rejected' }, 'sessionFailures', 'session'],
    [503, { outcome: 'rejected' }, 'serviceFailures', 'service'],
    [200, { unexpected: true }, 'uncertainFailures', 'uncertain'],
  ] as const)(
    'keeps a queued draft for HTTP %i without an appropriate outcome',
    async (status, body, category, reason) => {
      storage.mutations.set('one', mutation('one'));
      const fetcher = vi.fn(async () => json(status, body));

      const result = await syncQueuedMutations(fetcher as typeof fetch, database);

      expect(result.failed).toBe(1);
      expect(result[category]).toBe(1);
      expect(result.rejected).toBe(0);
      expect(storage.mutations.get('one')).toMatchObject({
        state: 'needs_review',
        reviewReason: reason,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the draft queued when a successful HTTP response has unreadable content', async () => {
    storage.mutations.set('one', mutation('one'));
    const result = await syncQueuedMutations(
      vi.fn(async () => new Response('<html>gateway page</html>', { status: 200 })) as typeof fetch,
      database,
    );

    expect(result.uncertainFailures).toBe(1);
    expect((storage.mutations.get('one') as OfflineMutation).state).toBe('needs_review');
  });

  it('keeps a queued draft when the service returns an HTML error page', async () => {
    storage.mutations.set('one', mutation('one'));
    const result = await syncQueuedMutations(
      vi.fn(async () => new Response('<html>unavailable</html>', { status: 503 })) as typeof fetch,
      database,
    );

    expect(result).toMatchObject({ serviceFailures: 1, rejected: 0 });
    expect(storage.mutations.get('one')).toMatchObject({
      state: 'needs_review',
      reviewReason: 'service',
    });
  });

  it('retains a draft when the request has no confirmed response', async () => {
    storage.mutations.set('one', mutation('one'));
    const result = await syncQueuedMutations(
      vi.fn(async () => {
        throw new TypeError('Network request failed');
      }) as typeof fetch,
      database,
    );

    expect(result).toMatchObject({ uncertainFailures: 1, rejected: 0 });
    expect(storage.mutations.get('one')).toMatchObject({
      state: 'needs_review',
      reviewReason: 'uncertain',
    });
  });

  it('marks only a genuine explicit business rejection as rejected', async () => {
    storage.mutations.set('one', mutation('one'));
    const result = await syncQueuedMutations(
      vi.fn(async () =>
        json(400, { outcome: 'rejected', reason: 'Invalid mutation' }),
      ) as typeof fetch,
      database,
    );

    expect(result).toMatchObject({ rejected: 1, failed: 0 });
    expect((storage.mutations.get('one') as OfflineMutation).state).toBe('rejected');
  });

  it('applies explicit outcomes while retaining a service-failed draft in a mixed batch', async () => {
    for (const id of ['accepted', 'service', 'conflict', 'rejected'])
      storage.mutations.set(id, mutation(id));
    const replies = [
      json(200, { outcome: 'accepted' }),
      json(503, { outcome: 'rejected' }),
      json(409, { outcome: 'conflict', authoritativeVersion: 2 }),
      json(400, { outcome: 'rejected' }),
    ];
    const fetcher = vi.fn(async () => replies.shift()!);

    const result = await syncQueuedMutations(fetcher as typeof fetch, database);

    expect(result).toMatchObject({
      accepted: 1,
      conflicts: 1,
      rejected: 1,
      failed: 1,
      serviceFailures: 1,
    });
    expect(storage.mutations.has('accepted')).toBe(false);
    expect((storage.mutations.get('service') as OfflineMutation).state).toBe('needs_review');
    expect((storage.mutations.get('conflict') as OfflineMutation).state).toBe('conflict');
    expect((storage.mutations.get('rejected') as OfflineMutation).state).toBe('rejected');
  });

  it('retains a receipt and pauses an expense when its upload session expires', async () => {
    storage.mutations.set('expense', {
      ...mutation('expense'),
      entityType: 'expense',
      attachments: ['receipt-1'],
    } satisfies OfflineMutation);
    storage.attachments.set('receipt-1', {
      id: 'receipt-1',
      fileName: 'receipt.pdf',
      mediaType: 'application/pdf',
      bytes: new Uint8Array([37, 80, 68, 70]).buffer,
    });
    const fetcher = vi.fn(async () => json(401, { error: 'Unauthorized' }));

    const result = await syncQueuedMutations(fetcher as typeof fetch, database);

    expect(result.sessionFailures).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((storage.mutations.get('expense') as OfflineMutation).state).toBe('needs_review');
    expect(storage.attachments.has('receipt-1')).toBe(true);

    const unattendedFetcher = vi.fn(async () => json(401, { error: 'Unauthorized' }));
    await syncQueuedMutations(unattendedFetcher as typeof fetch, database);
    expect(unattendedFetcher).not.toHaveBeenCalled();

    const signedInFetcher = vi
      .fn()
      .mockResolvedValueOnce(json(200, { documentId: 'receipt-after-sign-in' }))
      .mockResolvedValueOnce(json(200, { outcome: 'accepted' }));
    const manual = await syncQueuedMutations(signedInFetcher as typeof fetch, database, 'expense');
    expect(manual.accepted).toBe(1);
    expect(signedInFetcher).toHaveBeenCalledTimes(2);
    expect(storage.mutations.has('expense')).toBe(false);
    expect(storage.attachments.has('receipt-1')).toBe(false);
  });

  it('pauses a mutation after sync returns 401 until an explicit post-sign-in retry', async () => {
    storage.mutations.set('one', mutation('one'));
    const session = await syncQueuedMutations(
      vi.fn(async () => json(401, { error: 'Unauthorized' })) as typeof fetch,
      database,
    );
    expect(session.sessionFailures).toBe(1);
    expect((storage.mutations.get('one') as OfflineMutation).state).toBe('needs_review');

    const unattendedFetcher = vi.fn(async () => json(200, { outcome: 'accepted' }));
    await syncQueuedMutations(unattendedFetcher as typeof fetch, database);
    expect(unattendedFetcher).not.toHaveBeenCalled();

    const manual = await syncQueuedMutations(unattendedFetcher as typeof fetch, database, 'one');
    expect(manual.accepted).toBe(1);
    expect(unattendedFetcher).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('/app/api/sync'),
      expect.any(Object),
    );
    expect(storage.mutations.has('one')).toBe(false);
  });

  it('holds an uncertain receipt upload for review and only retries after a manual choice', async () => {
    storage.mutations.set('expense', {
      ...mutation('expense'),
      entityType: 'expense',
      attachments: ['receipt-1'],
    } satisfies OfflineMutation);
    storage.attachments.set('receipt-1', {
      id: 'receipt-1',
      fileName: 'receipt.pdf',
      mediaType: 'application/pdf',
      bytes: new Uint8Array([37, 80, 68, 70]).buffer,
    });
    await syncQueuedMutations(
      vi.fn(async () => new Response('<html>unavailable</html>', { status: 503 })) as typeof fetch,
      database,
    );
    expect((storage.mutations.get('expense') as OfflineMutation).state).toBe('needs_review');
    expect(storage.attachments.has('receipt-1')).toBe(true);

    const unattendedFetcher = vi.fn(async () => json(200, { outcome: 'accepted' }));
    expect(await syncQueuedMutations(unattendedFetcher as typeof fetch, database)).toMatchObject({
      accepted: 0,
      failed: 0,
    });
    expect(unattendedFetcher).not.toHaveBeenCalled();

    const manualFetcher = vi
      .fn()
      .mockResolvedValueOnce(json(200, { documentId: 'uploaded-receipt' }))
      .mockResolvedValueOnce(json(200, { outcome: 'accepted' }));
    const result = await syncQueuedMutations(manualFetcher as typeof fetch, database, 'expense');
    expect(result.accepted).toBe(1);
    expect(manualFetcher).toHaveBeenCalledTimes(2);
    expect(storage.mutations.has('expense')).toBe(false);
    expect(storage.attachments.has('receipt-1')).toBe(false);
  });

  it('reuses a confirmed receipt document ID after an unconfirmed sync response', async () => {
    storage.mutations.set('expense', {
      ...mutation('expense'),
      entityType: 'expense',
      attachments: ['receipt-1'],
    } satisfies OfflineMutation);
    storage.attachments.set('receipt-1', {
      id: 'receipt-1',
      fileName: 'receipt.pdf',
      mediaType: 'application/pdf',
      bytes: new Uint8Array([37, 80, 68, 70]).buffer,
    });
    const firstFetcher = vi
      .fn()
      .mockResolvedValueOnce(json(200, { documentId: 'confirmed-document' }))
      .mockResolvedValueOnce(new Response('<html>unavailable</html>', { status: 503 }));

    const first = await syncQueuedMutations(firstFetcher as typeof fetch, database);

    expect(first.serviceFailures).toBe(1);
    expect(firstFetcher).toHaveBeenCalledTimes(2);
    const retained = storage.mutations.get('expense') as OfflineMutation;
    expect(retained).toMatchObject({
      mutationId: 'expense',
      state: 'needs_review',
      reviewReason: 'service',
      payload: { receiptDocumentId: 'confirmed-document', receiptRequired: true },
    });
    expect(storage.attachments.has('receipt-1')).toBe(true);

    const manualFetcher = vi.fn(async () => json(200, { outcome: 'accepted' }));
    const manual = await syncQueuedMutations(manualFetcher as typeof fetch, database, 'expense');

    expect(manual.accepted).toBe(1);
    expect(manualFetcher).toHaveBeenCalledTimes(1);
    expect(manualFetcher.mock.calls[0]?.[0]).toContain('/app/api/sync');
    const sent = JSON.parse(String(manualFetcher.mock.calls[0]?.[1]?.body)) as OfflineMutation;
    expect(sent.mutationId).toBe('expense');
    expect(sent.payload).toMatchObject({
      receiptDocumentId: 'confirmed-document',
      receiptRequired: true,
    });
    expect(storage.mutations.has('expense')).toBe(false);
    expect(storage.attachments.has('receipt-1')).toBe(false);
  });

  it.each([
    [409, { outcome: 'conflict', authoritativeVersion: 2 }, 'conflict'],
    [400, { outcome: 'rejected', reason: 'Invalid mutation' }, 'rejected'],
  ] as const)(
    'clears a stale review reason after an explicit %s outcome',
    async (status, body, state) => {
      storage.mutations.set('one', {
        ...mutation('one'),
        state: 'needs_review',
        reviewReason: 'service',
      });

      await syncQueuedMutations(
        vi.fn(async () => json(status, body)) as typeof fetch,
        database,
        'one',
      );

      const saved = storage.mutations.get('one') as OfflineMutation;
      expect(saved.state).toBe(state);
      expect(saved).not.toHaveProperty('reviewReason');
    },
  );
});
