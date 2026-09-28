import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository: vi.fn() }));

const { workerStatementFailure, canRetryWorkerStatementArtifact } =
  await import('../../apps/portal/src/routes/app/api/worker-statement/worker-statement-api.ts');
const { GET, POST } =
  await import('../../apps/portal/src/routes/app/api/worker-statement/+server.ts');
const { GET: detailGet } =
  await import('../../apps/portal/src/routes/app/api/worker-statement/artifacts/[artifactId]/+server.ts');
const { POST: retryPost } =
  await import('../../apps/portal/src/routes/app/api/worker-statement/artifacts/[artifactId]/retry/+server.ts');
const { GET: downloadGet } =
  await import('../../apps/portal/src/routes/app/api/worker-statement/artifacts/[artifactId]/download/+server.ts');
const { openPortalRepository } = await import('$lib/server/portal-repository');

async function expectProblem(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const body = await response.json();
  expect(body).toMatchObject({
    code,
    messageKey: expect.stringMatching(/^problem\.workerStatement\./u),
    params: expect.any(Object),
    fieldErrors: expect.any(Object),
    remedies: expect.any(Array),
    correlationId: expect.any(String),
  });
  expect(body.error).toBe(body.message);
  expect(body.message).not.toMatch(/Error:|stack|SQLITE_/u);
  return body;
}

describe('worker statement problem contract', () => {
  it('does not offer another retry at the final attempt', () => {
    const failed = {
      status: 'failed' as const,
      retryable: true,
      currentAttemptNumber: 4,
      maxAttempts: 5,
    };
    expect(canRetryWorkerStatementArtifact(failed)).toBe(true);
    expect(canRetryWorkerStatementArtifact({ ...failed, currentAttemptNumber: 5 })).toBe(false);
    expect(canRetryWorkerStatementArtifact({ ...failed, retryable: false })).toBe(false);
  });
  it('returns the same non-enumerating 404 shape for missing and foreign artifacts', async () => {
    const missing = await expectProblem(
      workerStatementFailure(new AccessDeniedError('artifact missing')),
      404,
      'WORKER_STATEMENT_NOT_FOUND',
    );
    const foreign = await expectProblem(
      workerStatementFailure(new AccessDeniedError('foreign worker ID')),
      404,
      'WORKER_STATEMENT_NOT_FOUND',
    );
    const { correlationId: _missingId, ...missingWithoutReference } = missing;
    const { correlationId: _foreignId, ...foreignWithoutReference } = foreign;
    expect(missingWithoutReference).toEqual(foreignWithoutReference);
  });

  it.each([
    ['IDEMPOTENCY_CONFLICT', 'WORKER_STATEMENT_IDEMPOTENCY_CONFLICT'],
    ['Only failed worker statements can be retried', 'WORKER_STATEMENT_RETRY_NOT_FAILED'],
    ['Worker statement failure is not retryable', 'WORKER_STATEMENT_RETRY_NOT_ALLOWED'],
    ['Worker statement retry limit reached', 'WORKER_STATEMENT_RETRY_LIMIT'],
  ])('maps known conflict %s to a specific cause and permitted step', async (message, code) => {
    const body = await expectProblem(workerStatementFailure(new ConflictError(message)), 409, code);
    expect(body.remedies).toHaveLength(1);
  });

  it('maps invalid periods to both date fields without reflecting repository details', async () => {
    const body = await expectProblem(
      workerStatementFailure(new ValidationError('periodEnd is invalid')),
      400,
      'WORKER_STATEMENT_PERIOD_INVALID',
    );
    expect(body.fieldErrors).toHaveProperty('periodStart');
    expect(body.fieldErrors).toHaveProperty('periodEnd');
  });

  it('keeps internal snapshot defects in logs under the response reference', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const body = await expectProblem(
        workerStatementFailure(new ValidationError('Worker statement snapshot is invalid')),
        503,
        'WORKER_STATEMENT_SOURCE_INVALID',
      );
      expect(body.message).not.toContain('snapshot');
      expect(spy).toHaveBeenCalledWith(
        'Worker statement service failure',
        expect.objectContaining({ correlationId: body.correlationId }),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('returns typed authentication, role, and malformed period responses at the collection edge', async () => {
    const url = new URL('http://localhost/j-aautomation/app/api/worker-statement');
    await expectProblem(
      await GET({ locals: {}, url } as never),
      401,
      'WORKER_STATEMENT_SIGN_IN_REQUIRED',
    );
    const owner = { user: { role: 'owner_admin' }, session: { id: 'session' } };
    const denied = await expectProblem(
      await GET({ locals: owner, url } as never),
      403,
      'WORKER_STATEMENT_ROLE_REQUIRED',
    );
    expect(denied.remedies).toEqual([{ id: 'review_workspace' }]);
    const worker = { user: { role: 'worker' }, session: { id: 'session' } };
    const request = new Request(url, {
      method: 'POST',
      body: JSON.stringify({ periodStart: '2026-08-31', periodEnd: '2026-08-01' }),
    });
    await expectProblem(
      await POST({ locals: worker, request, url } as never),
      400,
      'WORKER_STATEMENT_PERIOD_INVALID',
    );
  });

  it('returns the same private 404 for malformed artifact IDs at every artifact route', async () => {
    vi.clearAllMocks();
    const locals = { user: { role: 'worker' }, session: { id: 'session' } };
    const params = { artifactId: '..' };
    const url = new URL('http://localhost/j-aautomation/app/api/worker-statement/artifacts/..');
    const responses = await Promise.all([
      detailGet({ locals, params, url } as never),
      retryPost({ locals, params, url } as never),
      downloadGet({ locals, params, url } as never),
      GET({
        locals,
        url: new URL('http://localhost/j-aautomation/app/api/worker-statement?artifactId=..'),
      } as never),
    ]);
    for (const response of responses)
      await expectProblem(response, 404, 'WORKER_STATEMENT_NOT_FOUND');
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it('maps repository startup failures to a safe private reference response', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(openPortalRepository).mockImplementation(() => {
      throw new Error('SQLITE_CANTOPEN internal database path');
    });
    try {
      const locals = { user: { role: 'worker' }, session: { id: 'session' } };
      const url = new URL('http://localhost/j-aautomation/app/api/worker-statement');
      const cases = [
        GET({ locals, url } as never),
        detailGet({ locals, params: { artifactId: 'opaque-id' }, url } as never),
        retryPost({ locals, params: { artifactId: 'opaque-id' }, url } as never),
        downloadGet({ locals, params: { artifactId: 'opaque-id' }, url } as never),
      ];
      for (const response of cases)
        await expectProblem(await response, 500, 'WORKER_STATEMENT_UNEXPECTED');
      expect(spy).toHaveBeenCalledTimes(cases.length);
    } finally {
      vi.mocked(openPortalRepository).mockReset();
      spy.mockRestore();
    }
  });
});
