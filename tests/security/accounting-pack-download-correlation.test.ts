import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V3AccountingPackSourceChangedError } from '@ja/database';

const { openPortalRepositoryMock, servePrivateArtifactMock, authorizePrivateArtifactMock } = vi.hoisted(() => ({
  openPortalRepositoryMock: vi.fn(),
  servePrivateArtifactMock: vi.fn(),
  authorizePrivateArtifactMock: vi.fn(),
}));

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: openPortalRepositoryMock,
}));
vi.mock('$lib/server/private-artifact-access', () => ({
  servePrivateArtifact: servePrivateArtifactMock,
  authorizePrivateArtifact: authorizePrivateArtifactMock,
}));

import { GET } from '../../apps/portal/src/routes/app/api/accounting-pack/[id]/[type]/+server';
import { POST } from '../../apps/portal/src/routes/app/api/accounting-pack/[id]/[type]/retry/+server';

const requestReference = 'request-accounting-pack-reference';

function request(options: { signedIn?: boolean; type?: string } = {}) {
  return {
    locals: {
      correlationId: requestReference,
      user: options.signedIn === false ? null : {},
      session: options.signedIn === false ? null : {},
    },
    params: { id: 'pack-1', type: options.type ?? 'pdf' },
  } as Parameters<typeof GET>[0];
}

function retryRequest(options: { signedIn?: boolean; type?: string; key?: string } = {}) {
  const url = new URL('https://example.test/app/api/accounting-pack/pack-1/pdf/retry');
  return {
    ...request(options),
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: options.key ?? 'safe-key' }),
    }),
    url,
  } as Parameters<typeof POST>[0];
}

async function expectReference(response: Response, expectedCode: string) {
  const body = await response.json();
  expect(body.code).toBe(expectedCode);
  expect(body.correlationId).toBe(requestReference);
  expect(response.headers.get('x-correlation-id')).toBe(requestReference);
  return body;
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizePrivateArtifactMock.mockReturnValue({ entityId: 'pack-1' });
});

describe('Accounting Pack download recovery reference', () => {
  it('converts a revoked session into the existing typed 401 sign-in response', async () => {
    const close = vi.fn();
    const accountingPackExport = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin', correlationId: 'repository-reference' },
      v3: { accountingPackExport },
    });
    servePrivateArtifactMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'x-correlation-id': 'request-accounting-pack-reference' },
      }),
    );

    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      code: 'ACCOUNTING_PACK_SIGN_IN_REQUIRED',
      messageKey: 'problem.accountingPack.signInRequired',
      remedies: [{ id: 'sign_in' }],
      correlationId: requestReference,
    });
    expect(response.headers.get('x-correlation-id')).toBe(body.correlationId);
    expect(accountingPackExport).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses one reference for a private-service failure in the body, header and route log', async () => {
    const close = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin' },
      v3: { accountingPackExport: vi.fn() },
    });
    servePrivateArtifactMock.mockImplementation(
      async ({ principal }) =>
        new Response(JSON.stringify({ error: 'Internal storage path leaked' }), {
          status: 500,
          headers: { 'x-correlation-id': principal.correlationId },
        }),
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await GET(request());
      const body = await response.json();
      const principalReference = servePrivateArtifactMock.mock.calls[0]?.[0].principal.correlationId;
      expect(principalReference).toBe(requestReference);
      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        code: 'ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE',
        messageKey: 'problem.accountingPack.exportServiceUnavailable',
        params: { correlationId: principalReference },
        correlationId: principalReference,
      });
      expect(response.headers.get('x-correlation-id')).toBe(principalReference);
      expect(JSON.stringify(body)).not.toContain('Internal storage path leaked');
      expect(log).toHaveBeenCalledWith(
        'Accounting Pack artifact service unavailable',
        expect.objectContaining({ correlationId: principalReference }),
      );
      expect(close).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    ['anonymous', { signedIn: false }, 'ACCOUNTING_PACK_SIGN_IN_REQUIRED', 401],
    ['invalid format', { type: 'unknown' }, 'ACCOUNTING_PACK_NOT_FOUND', 404],
  ] as const)('uses the request reference for %s', async (_label, options, code, status) => {
    const response = await GET(request(options));
    expect(response.status).toBe(status);
    await expectReference(response, code);
    expect(openPortalRepositoryMock).not.toHaveBeenCalled();
  });

  it('keeps a concealed 404 and a known 409 on the request reference', async () => {
    const close = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin', correlationId: 'repository-reference' },
      v3: { accountingPackExport: vi.fn() },
    });
    servePrivateArtifactMock.mockResolvedValueOnce(new Response('private', { status: 404 }));
    const concealed = await GET(request());
    expect(concealed.status).toBe(404);
    const hidden = await expectReference(concealed, 'ACCOUNTING_PACK_NOT_FOUND');
    expect(hidden.remedies).toEqual([]);

    servePrivateArtifactMock.mockImplementationOnce(async ({ loadMetadata }) => {
      try {
        loadMetadata();
      } catch {
        return new Response('blocked', { status: 409 });
      }
      throw new Error('Expected a known conflict');
    });
    openPortalRepositoryMock.mock.results[0].value.v3.accountingPackExport.mockImplementation(() => {
      throw new V3AccountingPackSourceChangedError();
    });
    const conflict = await GET(request());
    expect(conflict.status).toBe(409);
    const problem = await expectReference(conflict, 'ACCOUNTING_PACK_SOURCE_CHANGED');
    expect(problem.remedies).toEqual([{ id: 'review_accounting_pack', packId: 'pack-1' }]);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('returns a safe 503 if repository setup fails before a context exists', async () => {
    openPortalRepositoryMock.mockImplementation(() => {
      throw new Error('secret database file /private/portal.db');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await GET(request());
      expect(response.status).toBe(503);
      const body = await expectReference(response, 'ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE');
      expect(body.params.correlationId).toBe(requestReference);
      expect(body.remedies).toEqual([{ id: 'contact_support' }]);
      expect(JSON.stringify(body)).not.toContain('/private/portal.db');
      expect(log).toHaveBeenCalledWith(
        'Unexpected Accounting Pack download failure',
        expect.objectContaining({ correlationId: requestReference }),
      );
    } finally {
      log.mockRestore();
    }
  });

  it('does not offer a pack-specific remedy before artifact authorization completes', async () => {
    const close = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin' },
      v3: { accountingPackExport: vi.fn() },
    });
    servePrivateArtifactMock.mockRejectedValue(new Error('private authorization storage failed'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await GET(request());
      expect(response.status).toBe(503);
      const body = await expectReference(response, 'ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE');
      expect(body.remedies).toEqual([{ id: 'contact_support' }]);
      expect(JSON.stringify(body)).not.toContain('private authorization storage failed');
      expect(close).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it('uses the request reference for a generic artifact conflict', async () => {
    const close = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin' },
      v3: { accountingPackExport: vi.fn() },
    });
    servePrivateArtifactMock.mockResolvedValue(new Response('unsafe artifact detail', { status: 409 }));
    const response = await GET(request());
    expect(response.status).toBe(409);
    const body = await expectReference(response, 'ACCOUNTING_PACK_EXPORT_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('unsafe artifact detail');
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('Accounting Pack retry recovery reference', () => {
  it.each([
    ['anonymous', { signedIn: false }, 'ACCOUNTING_PACK_SIGN_IN_REQUIRED', 401],
    ['invalid format', { type: 'unknown' }, 'ACCOUNTING_PACK_NOT_FOUND', 404],
  ] as const)('uses the request reference for %s', async (_label, options, code, status) => {
    const response = await POST(retryRequest(options));
    expect(response.status).toBe(status);
    await expectReference(response, code);
    expect(openPortalRepositoryMock).not.toHaveBeenCalled();
  });

  it('covers concealed, invalid-key, known-conflict and uncertain retry responses', async () => {
    const close = vi.fn();
    const retryAccountingPackExport = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin' },
      v3: { retryAccountingPackExport },
    });
    authorizePrivateArtifactMock.mockReturnValueOnce(null);
    const concealed = await POST(retryRequest());
    expect(concealed.status).toBe(404);
    expect((await expectReference(concealed, 'ACCOUNTING_PACK_NOT_FOUND')).remedies).toEqual([]);

    const invalid = await POST(retryRequest({ key: '\n' }));
    expect(invalid.status).toBe(400);
    expect((await expectReference(invalid, 'ACCOUNTING_PACK_RETRY_KEY_INVALID')).fieldErrors).toEqual({
      idempotencyKey: ['Enter a valid request key.'],
    });

    retryAccountingPackExport.mockImplementationOnce(() => {
      throw new V3AccountingPackSourceChangedError();
    });
    const conflict = await POST(retryRequest());
    expect(conflict.status).toBe(409);
    await expectReference(conflict, 'ACCOUNTING_PACK_SOURCE_CHANGED');

    retryAccountingPackExport.mockImplementationOnce(() => {
      throw new Error('secret job queue password');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const uncertain = await POST(retryRequest());
      expect(uncertain.status).toBe(500);
      const body = await expectReference(uncertain, 'UNEXPECTED_ERROR');
      expect(body.params.correlationId).toBe(requestReference);
      expect(JSON.stringify(body)).not.toContain('secret job queue password');
    } finally {
      log.mockRestore();
    }
    expect(close).toHaveBeenCalledTimes(4);
  });

  it('returns a safe 503 if retry repository setup fails', async () => {
    openPortalRepositoryMock.mockImplementation(() => {
      throw new Error('secret database file /private/portal.db');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await POST(retryRequest());
      expect(response.status).toBe(503);
      const body = await expectReference(response, 'ACCOUNTING_PACK_RETRY_SERVICE_UNAVAILABLE');
      expect(body.messageKey).toBe('problem.accountingPack.retryServiceUnavailable');
      expect(body.params.correlationId).toBe(requestReference);
      expect(body.remedies).toEqual([{ id: 'contact_support' }]);
      expect(JSON.stringify(body)).not.toContain('/private/portal.db');
      expect(log).toHaveBeenCalledWith(
        'Unexpected Accounting Pack retry setup failure',
        expect.objectContaining({ correlationId: requestReference }),
      );
    } finally {
      log.mockRestore();
    }
  });

  it('does not reveal an authorization lookup failure to the retry caller', async () => {
    const close = vi.fn();
    openPortalRepositoryMock.mockReturnValue({
      sqlite: { close },
      principal: { role: 'finance_admin' },
      v3: { retryAccountingPackExport: vi.fn() },
    });
    authorizePrivateArtifactMock.mockImplementation(() => {
      throw new Error('secret authorization table');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await POST(retryRequest());
      expect(response.status).toBe(503);
      const body = await expectReference(response, 'ACCOUNTING_PACK_RETRY_SERVICE_UNAVAILABLE');
      expect(JSON.stringify(body)).not.toContain('secret authorization table');
      expect(body.remedies).toEqual([{ id: 'contact_support' }]);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });
});
