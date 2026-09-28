import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  V3AccountingPackExportProblemError,
  V3AccountingPackSourceChangedError,
  type V3AccountingPackExportProblemCode,
} from '@ja/database';

const { openPortalRepositoryMock, servePrivateArtifactMock } = vi.hoisted(() => ({
  openPortalRepositoryMock: vi.fn(),
  servePrivateArtifactMock: vi.fn(),
}));

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: openPortalRepositoryMock,
}));
vi.mock('$lib/server/private-artifact-access', () => ({
  servePrivateArtifact: servePrivateArtifactMock,
}));

import { GET } from '../../apps/portal/src/routes/app/api/accounting-pack/[id]/[type]/+server';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Accounting Pack download route', () => {
  it('returns a typed review conflict after the private artifact boundary blocks stale metadata', async () => {
    const close = vi.fn();
    const accountingPackExport = vi.fn(() => {
      throw new V3AccountingPackSourceChangedError();
    });
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin' },
      v3: { accountingPackExport },
    });
    servePrivateArtifactMock.mockImplementation(
      async (options: { loadMetadata: () => unknown }) => {
        try {
          options.loadMetadata();
        } catch {
          return new Response(JSON.stringify({ error: 'blocked' }), { status: 409 });
        }
        throw new Error('Expected stale metadata');
      },
    );

    const response = await GET({
      locals: { user: {}, session: {} },
      params: { id: 'pack-1', type: 'xlsx' },
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      code: 'ACCOUNTING_PACK_SOURCE_CHANGED',
      messageKey: 'problem.accountingPack.sourceChanged',
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'review_accounting_pack', packId: 'pack-1' }],
      correlationId: expect.any(String),
    });
    expect(accountingPackExport).toHaveBeenCalledOnce();
    expect(servePrivateArtifactMock).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not disclose stale state when the private artifact boundary denies access', async () => {
    const close = vi.fn();
    const accountingPackExport = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'worker' },
      v3: { accountingPackExport },
    });
    servePrivateArtifactMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'File unavailable' }), { status: 404 }),
    );

    const response = await GET({
      locals: { user: {}, session: {} },
      params: { id: 'pack-1', type: 'xlsx' },
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: 'ACCOUNTING_PACK_NOT_FOUND',
      messageKey: 'problem.accountingPack.notFound',
      remedies: [],
    });
    expect(accountingPackExport).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ['ACCOUNTING_PACK_EXPORT_PROCESSING', 'problem.accountingPack.exportProcessing'],
    ['ACCOUNTING_PACK_EXPORT_FAILED_RETRYABLE', 'problem.accountingPack.exportFailedRetryable'],
    ['ACCOUNTING_PACK_EXPORT_UNAVAILABLE', 'problem.accountingPack.exportUnavailable'],
    ['ACCOUNTING_PACK_EXPORT_RETRY_LIMIT', 'problem.accountingPack.retryLimit'],
  ] as const)('returns a typed %s conflict after authorization', async (code, messageKey) => {
    const close = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin' },
      v3: {
        accountingPackExport: () => {
          throw new V3AccountingPackExportProblemError(
            code as V3AccountingPackExportProblemCode,
            'pdf',
          );
        },
      },
    });
    servePrivateArtifactMock.mockImplementation(
      async (options: { loadMetadata: () => unknown }) => {
        try {
          options.loadMetadata();
        } catch {
          return new Response(JSON.stringify({ error: 'blocked' }), { status: 409 });
        }
        throw new Error('Expected blocked metadata');
      },
    );
    const response = await GET({
      locals: { user: {}, session: {} },
      params: { id: 'pack-1', type: 'pdf' },
    } as Parameters<typeof GET>[0]);
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code,
      messageKey,
      params: { format: 'PDF' },
      fieldErrors: {},
      correlationId: expect.any(String),
    });
    expect(body.remedies).toEqual(
      code === 'ACCOUNTING_PACK_EXPORT_FAILED_RETRYABLE'
        ? [{ id: 'retry_accounting_pack_export', packId: 'pack-1', format: 'pdf' }]
        : code === 'ACCOUNTING_PACK_EXPORT_RETRY_LIMIT'
          ? [{ id: 'review_accounting_pack', packId: 'pack-1' }]
          : [{ id: 'review_accounting_pack', packId: 'pack-1' }],
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('turns a private-artifact storage failure into a safe typed temporary problem', async () => {
    const close = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin' },
      v3: { accountingPackExport: vi.fn() },
    });
    servePrivateArtifactMock.mockImplementation(
      async (options: { loadMetadata: () => unknown }) => {
        options.loadMetadata();
        return new Response(JSON.stringify({ error: 'Internal storage path leaked' }), {
          status: 500,
        });
      },
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await GET({
        locals: { user: {}, session: {} },
        params: { id: 'pack-1', type: 'pdf' },
      } as Parameters<typeof GET>[0]);
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        code: 'ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE',
        messageKey: 'problem.accountingPack.exportServiceUnavailable',
        params: { format: 'PDF', correlationId: expect.any(String) },
        remedies: [{ id: 'review_accounting_pack', packId: 'pack-1' }],
        correlationId: expect.any(String),
      });
      expect(body.error).not.toContain('Internal storage path');
      expect(body.params.correlationId).toBe(body.correlationId);
      expect(log).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });
});
