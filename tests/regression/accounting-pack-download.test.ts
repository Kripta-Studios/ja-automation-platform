import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  classifyAccountingPackDownloadFailure,
  classifyAccountingPackRetryFailure,
  downloadAccountingPackArtifact,
  filenameFromContentDisposition,
  isRetryableAccountingPackDownload,
  requestAccountingPackExportRetry,
} from '../../apps/portal/src/lib/portal/accounting-pack-download';

const accountingPackStatus = (): string =>
  readFileSync(
    resolve(
      process.cwd(),
      'apps/portal/src/lib/portal/ui/localized-pdf/AccountingPackArtifactStatus.svelte',
    ),
    'utf8',
  );

afterEach(() => vi.useRealTimers());

describe('Accounting Pack download recovery', () => {
  it('only polls a processing export, while changed sources require review', async () => {
    expect(
      isRetryableAccountingPackDownload(
        409,
        'Accounting Pack source changed; create a new revision before download',
      ),
    ).toBe(false);
    expect(isRetryableAccountingPackDownload(409, 'Accounting Pack pdf export is not ready')).toBe(
      true,
    );
    expect(isRetryableAccountingPackDownload(403, 'Confirm your identity to continue')).toBe(false);
    expect(classifyAccountingPackDownloadFailure(409, 'Accounting Pack source changed')).toBe(
      'changed',
    );
    expect(
      classifyAccountingPackDownloadFailure(
        409,
        'Accounting Pack pdf export failed; retry required',
      ),
    ).toBe('failed');

    const saved: Array<{ blob: Blob; filename: string }> = [];
    const responses = [
      jsonResponse(409, 'Accounting Pack xlsx export is not ready'),
      jsonResponse(409, 'Accounting Pack xlsx export is processing'),
      fileResponse('JA-accounting-pack-2113-03.xlsx'),
    ];
    const result = await downloadAccountingPackArtifact(
      '/app/api/accounting-pack/stale/xlsx',
      {
        fetch: async () => responses.shift() as Response,
        sleep: async () => undefined,
        save: (blob, filename) => saved.push({ blob, filename }),
      },
      { intervalMs: 1, maxAttempts: 5 },
    );

    expect(result).toEqual({ ok: true, filename: 'JA-accounting-pack-2113-03.xlsx' });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.filename).toBe('JA-accounting-pack-2113-03.xlsx');
    expect(responses).toHaveLength(0);
  });

  it('returns a bounded timeout after status polling without saving a file', async () => {
    let requests = 0;
    const result = await downloadAccountingPackArtifact(
      '/app/api/accounting-pack/pending/pdf',
      {
        fetch: async () => {
          requests += 1;
          return jsonResponse(409, 'Accounting Pack pdf export is not ready');
        },
        sleep: async () => undefined,
        save: () => {
          throw new Error('Pending bytes must not be saved');
        },
      },
      { maxAttempts: 2 },
    );
    expect(requests).toBe(2);
    expect(result).toMatchObject({ ok: false, status: 409, timedOut: true });
    expect(classifyAccountingPackDownloadFailure(504, '')).toBe('temporary');
  });

  it('uses the typed source-change code without polling or downloading', async () => {
    let requests = 0;
    const result = await downloadAccountingPackArtifact('/app/api/accounting-pack/stale/pdf', {
      fetch: async () => {
        requests += 1;
        return jsonResponse(
          409,
          'Review the latest source records before creating another version.',
          'ACCOUNTING_PACK_SOURCE_CHANGED',
        );
      },
      sleep: async () => {
        throw new Error('Source changes require a person to review the pack');
      },
      save: () => {
        throw new Error('Source-changed bytes must not be saved');
      },
    });
    expect(requests).toBe(1);
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'Review the latest source records before creating another version.',
      code: 'ACCOUNTING_PACK_SOURCE_CHANGED',
    });
    expect(classifyAccountingPackDownloadFailure(409, result.error, result.code)).toBe('changed');
    expect(classifyAccountingPackDownloadFailure(409, 'not ready', result.code)).toBe('changed');
    expect(isRetryableAccountingPackDownload(409, result.error, result.code)).toBe(false);
  });

  it('queues only the selected failed format with the supplied idempotency key', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await requestAccountingPackExportRetry(
      '/app/api/accounting-pack/pack-1/pdf/retry',
      'stable-retry-key',
      async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        return new Response(
          JSON.stringify({ job: { id: 'job-1', created: true, state: 'queued' } }),
          {
            status: 202,
          },
        );
      },
    );
    expect(result).toEqual({
      ok: true,
      status: 202,
      job: { id: 'job-1', created: true, state: 'queued' },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/app/api/accounting-pack/pack-1/pdf/retry');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.credentials).toBe('same-origin');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ idempotencyKey: 'stable-retry-key' });
  });

  it('reports a replayed terminal retry truthfully so the UI can retire its old key', async () => {
    const result = await requestAccountingPackExportRetry(
      '/app/api/accounting-pack/pack-1/pdf/retry',
      'previous-request-key',
      async () =>
        new Response(
          JSON.stringify({ job: { id: 'old-job', created: false, state: 'dead_letter' } }),
          {
            status: 202,
          },
        ),
    );
    expect(result).toEqual({
      ok: true,
      status: 202,
      job: { id: 'old-job', created: false, state: 'dead_letter' },
    });
    expect(
      classifyAccountingPackDownloadFailure(503, '', 'ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE'),
    ).toBe('temporary');
    const source = accountingPackStatus();
    expect(source).toContain('clearRetryIdempotencyKey(key);');
    expect(source).toContain("!['queued', 'claimed', 'running'].includes(result.job.state)");
  });

  it('keeps typed retry conflicts and never treats them as accepted', async () => {
    const result = await requestAccountingPackExportRetry(
      '/app/api/accounting-pack/pack-1/pdf/retry',
      'stable-retry-key',
      async () =>
        jsonResponse(
          409,
          'Review the source records before trying again.',
          'ACCOUNTING_PACK_SOURCE_CHANGED',
        ),
    );
    expect(result).toEqual({
      ok: false,
      status: 409,
      code: 'ACCOUNTING_PACK_SOURCE_CHANGED',
      error: 'Review the source records before trying again.',
    });
  });

  it('keeps a validated retry reference and separates known pre-invocation failure from uncertainty', async () => {
    const response = new Response(
      JSON.stringify({
        error: 'The retry was not queued.',
        code: 'ACCOUNTING_PACK_RETRY_SERVICE_UNAVAILABLE',
        correlationId: 'retry-reference-123',
      }),
      { status: 503, headers: { 'x-correlation-id': 'retry-reference-123' } },
    );
    const known = await requestAccountingPackExportRetry('/retry', 'stable-key', async () => response);
    expect(known).toEqual({
      ok: false,
      status: 503,
      error: 'The retry was not queued.',
      code: 'ACCOUNTING_PACK_RETRY_SERVICE_UNAVAILABLE',
      correlationId: 'retry-reference-123',
    });
    if (known.ok) throw new Error('Expected a typed retry failure');
    expect(classifyAccountingPackRetryFailure(known)).toBe('not_queued');

    const uncertain = await requestAccountingPackExportRetry(
      '/retry',
      'stable-key',
      async () =>
        new Response(
          JSON.stringify({
            error: 'Check whether the retry was queued.',
            code: 'UNEXPECTED_ERROR',
            correlationId: 'uncertain-reference-123',
          }),
          { status: 500, headers: { 'x-correlation-id': 'uncertain-reference-123' } },
        ),
    );
    if (uncertain.ok) throw new Error('Expected an uncertain retry failure');
    expect(uncertain.correlationId).toBe('uncertain-reference-123');
    expect(classifyAccountingPackRetryFailure(uncertain)).toBe('uncertain');
  });

  it('does not display an untrusted or mismatched retry reference', async () => {
    const invalid = await requestAccountingPackExportRetry(
      '/retry',
      'stable-key',
      async () =>
        new Response(
          JSON.stringify({
            error: 'Unavailable',
            code: 'ACCOUNTING_PACK_RETRY_SERVICE_UNAVAILABLE',
            correlationId: 'bad\nreference',
          }),
          { status: 503, headers: { 'x-correlation-id': 'different-reference-123' } },
        ),
    );
    if (invalid.ok) throw new Error('Expected a typed retry failure');
    expect(invalid.correlationId).toBe('different-reference-123');

    const mismatched = await requestAccountingPackExportRetry(
      '/retry',
      'stable-key',
      async () =>
        new Response(
          JSON.stringify({
            error: 'Unavailable',
            code: 'ACCOUNTING_PACK_RETRY_SERVICE_UNAVAILABLE',
            correlationId: 'body-reference-123',
          }),
          { status: 503, headers: { 'x-correlation-id': 'header-reference-123' } },
        ),
    );
    if (mismatched.ok) throw new Error('Expected a typed retry failure');
    expect(mismatched.correlationId).toBeUndefined();
    const source = accountingPackStatus();
    expect(source).toContain("retryFailure === 'not_queued'");
    expect(source).toContain("'problem.accountingPack.retryServiceUnavailable'");
    expect(source).toContain("downloadNotice.kind === 'retry_service_unavailable'");
  });

  it('does not retry identity or failed-export conflicts', async () => {
    const result = await downloadAccountingPackArtifact('/app/api/accounting-pack/stale/pdf', {
      fetch: async () => jsonResponse(403, 'Confirm your identity to continue'),
      sleep: async () => {
        throw new Error('should not poll');
      },
      save: () => {
        throw new Error('should not save');
      },
    });
    expect(result).toEqual({
      ok: false,
      error: 'Confirm your identity to continue',
      status: 403,
    });
  });

  it('reads a semantic filename from content-disposition', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="pack.xlsx"; filename*=UTF-8\'\'JA-accounting-pack.xlsx',
      ),
    ).toBe('JA-accounting-pack.xlsx');
  });

  it('intercepts Ready clicks for typed status guidance and keeps retry explicit', () => {
    const source = accountingPackStatus();
    expect(source).toContain('downloadAccountingPackArtifact');
    expect(source).toContain('handleDownloadClick');
    expect(source).toContain('requestAccountingPackExportRetry');
    expect(source).toContain('retryFailedExport(artifact.key)');
    expect(source).toContain(
      "!pack.sourceStale && packState !== 'final' && retryBlockedKey !== artifact.key",
    );
    expect(source).toContain('isAuditor ||');
    expect(source).toContain('retryUncertainKey = key');
    expect(source).toContain('await recheckUncertainRetry(key)');
    expect(source).toContain('sessionStorage.setItem(storageKey, value)');
    expect(source).toContain('onclick={(event) => void handleDownloadClick(event, artifact.key)}');
    expect(source).not.toContain('Accounting Pack source changed');
  });
});

function jsonResponse(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ error, ...(code && { code }) }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fileResponse(filename: string): Response {
  return new Response('xlsx-bytes', {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
