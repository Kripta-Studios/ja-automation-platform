import { describe, expect, it } from 'vitest';
import {
  fetchManualWithRetry,
  manualDownloadFilename,
} from '../../apps/portal/src/lib/portal/ui/manual-download.ts';

const pdf = () =>
  new Response(new Blob(['%PDF-1.7\n'], { type: 'application/pdf' }), {
    status: 200,
    headers: { 'content-type': 'application/pdf', 'x-help-manual-language': 'pt' },
  });

describe('manual PDF GET recovery', () => {
  it('retries a transient 503 once and returns the PDF without an error state', async () => {
    let calls = 0;
    const waits: number[] = [];
    const result = await fetchManualWithRetry(
      '/manual.pdf',
      async (_url, options) => {
        expect(options?.method).toBe('GET');
        return ++calls === 1
          ? new Response(null, { status: 503, headers: { 'retry-after': '1' } })
          : pdf();
      },
      async (ms) => {
        waits.push(ms);
      },
    );
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(waits).toEqual([1_000]);
    if (result.ok) expect(result.language).toBe('pt');
  });

  it('caps retries and respects permanent access denial', async () => {
    let calls = 0;
    const unavailable = await fetchManualWithRetry(
      '/manual.pdf',
      async () => {
        calls++;
        return new Response(null, { status: 503 });
      },
      async () => {},
    );
    expect(unavailable).toEqual({ ok: false, failure: 'temporary' });
    expect(calls).toBe(3);

    calls = 0;
    const denied = await fetchManualWithRetry(
      '/manual.pdf',
      async () => {
        calls++;
        return new Response(null, { status: 404 });
      },
      async () => {},
    );
    expect(denied).toEqual({ ok: false, failure: 'access' });
    expect(calls).toBe(1);
  });

  it('times out each GET and never waits forever for its body', async () => {
    let calls = 0;
    const result = await fetchManualWithRetry(
      '/manual.pdf',
      async () => {
        calls++;
        return new Promise<Response>(() => {});
      },
      async () => {},
      undefined,
      5,
    );
    expect(result).toEqual({ ok: false, failure: 'temporary' });
    expect(calls).toBe(3);
  });

  it('does not retry before a long server Retry-After window', async () => {
    let calls = 0;
    const result = await fetchManualWithRetry(
      '/manual.pdf',
      async () => {
        calls++;
        return new Response(null, { status: 429, headers: { 'retry-after': '30' } });
      },
      async () => {
        throw new Error('must not sleep');
      },
    );
    expect(result).toEqual({ ok: false, failure: 'later' });
    expect(calls).toBe(1);
  });

  it('stops when the Help view is left and aborts the request', async () => {
    const controller = new AbortController();
    let calls = 0;
    const pending = fetchManualWithRetry(
      '/manual.pdf',
      async (_url, options) => {
        calls++;
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        });
      },
      async () => {},
      controller.signal,
    );
    controller.abort();
    expect(await pending).toEqual({ ok: false, failure: 'cancelled' });
    expect(calls).toBe(1);
  });

  it('makes a safe local filename', () => {
    expect(manualDownloadFilename('worker-reference', 'pt', '2026-09-19')).toBe(
      'worker-reference-PT-BR-2026-09-19.pdf',
    );
    expect(manualDownloadFilename('../secret', 'en', 'bad')).toBe('guide-EN-current.pdf');
  });
});
