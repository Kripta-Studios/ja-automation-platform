import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { V3ValidationError } from '@ja/database';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));
vi.mock('$lib/server/private-artifact-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/private-artifact-access')>()),
  removePrivateFileIfPresent: vi.fn(async () => undefined),
}));

import { openPortalRepository } from '$lib/server/portal-repository';
import { removePrivateFileIfPresent } from '$lib/server/private-artifact-access';
import { POST } from '../../apps/portal/src/routes/app/api/sync/+server';

const previousOfflineEnabled = process.env.JA_OFFLINE_ENABLED;
const close = vi.fn();
const syncMutation = vi.fn();
const removeUnreferencedReceipt = vi.fn();
const mutation = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  entityType: 'expense',
  entityId: '22222222-2222-4222-8222-222222222222',
  baseVersion: 0,
  createdAt: '2026-09-27T00:00:00.000Z',
  payload: { receiptDocumentId: '33333333-3333-4333-8333-333333333333' },
  attachments: ['44444444-4444-4444-8444-444444444444'],
};

function request() {
  return {
    locals: { user: { id: 'worker-1' }, session: { id: 'session-1' } },
    request: new Request('http://localhost/app/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mutation),
    }),
  } as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JA_OFFLINE_ENABLED = 'true';
  removeUnreferencedReceipt.mockReturnValue('receipts/confirmed.pdf');
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'worker-1', role: 'worker' },
    sqlite: { close },
    v3: { syncMutation },
    repository: { removeUnreferencedReceipt },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

afterAll(() => {
  if (previousOfflineEnabled === undefined) delete process.env.JA_OFFLINE_ENABLED;
  else process.env.JA_OFFLINE_ENABLED = previousOfflineEnabled;
});

describe('offline sync receipt cleanup', () => {
  it('retains a confirmed upload after an unexpected failure so the same mutation can be retried', async () => {
    syncMutation.mockImplementationOnce(() => {
      throw new Error('Temporary database outage');
    });

    await expect(POST(request())).rejects.toThrow('Temporary database outage');

    expect(removeUnreferencedReceipt).not.toHaveBeenCalled();
    expect(removePrivateFileIfPresent).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('releases an unreferenced upload after an explicit business rejection', async () => {
    syncMutation.mockImplementationOnce(() => {
      throw new V3ValidationError('Invalid offline expense draft');
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ outcome: 'rejected' });
    expect(removeUnreferencedReceipt).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ userId: 'worker-1' }),
      mutation.payload.receiptDocumentId,
    );
    expect(removePrivateFileIfPresent).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
