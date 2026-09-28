import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  V3AccountingPackExportProblemError,
  V3AccountingPackSourceChangedError,
} from '@ja/database';

const { openPortalRepositoryMock, authorizePrivateArtifactMock } = vi.hoisted(() => ({
  openPortalRepositoryMock: vi.fn(),
  authorizePrivateArtifactMock: vi.fn(),
}));

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: openPortalRepositoryMock,
}));
vi.mock('$lib/server/private-artifact-access', () => ({
  authorizePrivateArtifact: authorizePrivateArtifactMock,
}));

import { POST } from '../../apps/portal/src/routes/app/api/accounting-pack/[id]/[type]/retry/+server';

function request(body: unknown): Request {
  return new Request('https://example.test/app/api/accounting-pack/pack-1/pdf/retry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown): Promise<Response> {
  return POST({
    locals: { user: {}, session: {} },
    params: { id: 'pack-1', type: 'pdf' },
    request: request(body),
    url: new URL('https://example.test/app/api/accounting-pack/pack-1/pdf/retry'),
  } as Parameters<typeof POST>[0]) as Promise<Response>;
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizePrivateArtifactMock.mockReturnValue({ entityId: 'pack-1' });
});

describe('Accounting Pack explicit format retry route', () => {
  it('queues one authorized request with its supplied idempotency key', async () => {
    const close = vi.fn();
    const retryAccountingPackExport = vi.fn(() => ({
      jobId: 'job-1',
      created: true,
      state: 'queued',
    }));
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin' },
      v3: { retryAccountingPackExport },
    });
    const response = await post({ idempotencyKey: ' explicit-key ' });
    expect(response.status).toBe(202);
    expect(response.headers.get('location')).toBe('/app/api/accounting-pack/pack-1/pdf');
    expect(response.headers.get('retry-after')).toBe('2');
    expect(await response.json()).toEqual({
      job: { id: 'job-1', created: true, state: 'queued' },
      downloadUrl: '/app/api/accounting-pack/pack-1/pdf',
    });
    expect(retryAccountingPackExport).toHaveBeenCalledWith(
      { role: 'finance_admin' },
      'pack-1',
      'pdf',
      'explicit-key',
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses the same nonenumerating 404 for missing, private, and read-only packs', async () => {
    const close = vi.fn();
    const retryAccountingPackExport = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'auditor_read_only' },
      v3: { retryAccountingPackExport },
    });
    const auditor = await post({ idempotencyKey: 'key' });
    authorizePrivateArtifactMock.mockReturnValue(null);
    const missing = await post({ idempotencyKey: 'key' });
    expect(auditor.status).toBe(404);
    expect(await auditor.json()).toMatchObject({
      code: 'ACCOUNTING_PACK_NOT_FOUND',
      remedies: [],
    });
    expect(await missing.json()).toMatchObject({
      code: 'ACCOUNTING_PACK_NOT_FOUND',
      remedies: [],
    });
    expect(retryAccountingPackExport).not.toHaveBeenCalled();
  });

  it('requires an explicit valid key before any retry call', async () => {
    const retryAccountingPackExport = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close: vi.fn() },
      principal: { role: 'owner_admin' },
      v3: { retryAccountingPackExport },
    });
    const response = await post({ idempotencyKey: '\n' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'ACCOUNTING_PACK_RETRY_KEY_INVALID',
      fieldErrors: { idempotencyKey: ['Enter a valid request key.'] },
    });
    expect(retryAccountingPackExport).not.toHaveBeenCalled();
  });

  it.each([
    [new V3AccountingPackSourceChangedError(), 'ACCOUNTING_PACK_SOURCE_CHANGED'],
    [
      new V3AccountingPackExportProblemError('ACCOUNTING_PACK_EXPORT_RETRY_NOT_READY', 'pdf'),
      'ACCOUNTING_PACK_EXPORT_RETRY_NOT_READY',
    ],
    [
      new V3AccountingPackExportProblemError('ACCOUNTING_PACK_EXPORT_RETRY_LIMIT', 'pdf'),
      'ACCOUNTING_PACK_EXPORT_RETRY_LIMIT',
    ],
    [
      new V3AccountingPackExportProblemError('ACCOUNTING_PACK_EXPORT_ALREADY_READY', 'pdf'),
      'ACCOUNTING_PACK_EXPORT_ALREADY_READY',
    ],
    [
      new V3AccountingPackExportProblemError('ACCOUNTING_PACK_EXPORT_FINAL_IMMUTABLE', 'pdf'),
      'ACCOUNTING_PACK_EXPORT_FINAL_IMMUTABLE',
    ],
  ])('maps a known repository conflict to typed %s', async (cause, code) => {
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close: vi.fn() },
      principal: { role: 'finance_admin' },
      v3: {
        retryAccountingPackExport: () => {
          throw cause;
        },
      },
    });
    const response = await post({ idempotencyKey: 'key' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code,
      fieldErrors: {},
      correlationId: expect.any(String),
    });
  });
});
