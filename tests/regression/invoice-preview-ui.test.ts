import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInvoicePdfPollingController } from '../../apps/portal/src/lib/portal/invoice-pdf-polling';

const source = (): string =>
  readFileSync(
    resolve(process.cwd(), 'apps/portal/src/routes/app/billing/invoices/[id]/+page.svelte'),
    'utf8',
  );

const styles = (): string =>
  readFileSync(
    resolve(process.cwd(), 'apps/portal/src/styles/portal/details-invoices.css'),
    'utf8',
  );

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

afterEach(() => vi.useRealTimers());

describe('Invoice PDF preview surface', () => {
  it('keeps lifecycle badges aligned with the billing register semantics', () => {
    const value = source();

    expect(value).toContain("case 'draft':\n        return 'neutral';");
    expect(value).toContain("case 'paid':\n        return 'success';");
    expect(value).toMatch(/case 'void':[\s\S]*return 'danger';/);
    expect(value).toContain("case 'credited':\n      case 'credit_note':");
    expect(value).toContain('data-invoice-status={invoiceState}');
    expect(value).toContain('✓ ');
  });

  it('only creates the authorized PDF URL and iframe in the ready branch', () => {
    const value = source();

    expect(value).toContain('`${base}/app/api/invoices/${encodeURIComponent(invoiceId)}/pdf`');
    expect(value).toContain("{#if pdfStatus === 'ready'}");
    expect(value).toContain('src={pdfUrl}');
    expect(value).toContain('loading="lazy"');
    expect(value).toContain('target="_blank"');
    expect(value).toContain('rel="noopener noreferrer"');
    expect(value).not.toContain('fetch(pdfUrl');
    expect(value).not.toContain('pdfStorageKey');
    expect(value).not.toContain('storageKey');
    expect(value).not.toContain('data:application/pdf');
  });

  it('renders Open/Download from the frozen snapshot with the current invoice layout', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'apps/portal/src/routes/app/api/invoices/[id]/pdf/+server.ts'),
      'utf8',
    );
    expect(route).toContain('servePrivateArtifact');
    expect(route).toContain('invoicePdf');
    expect(route).toContain('invoiceSnapshot');
    expect(route).toContain('generateBytes');
  });

  it('renders queued, running, failed and unavailable states explicitly', () => {
    const value = source();

    expect(value).toContain(
      "type InvoicePdfStatus = 'queued' | 'running' | 'ready' | 'failed' | 'unavailable';",
    );
    for (const state of ['queued', 'running', 'failed', 'unavailable'])
      expect(value).toContain(`pdfStatus === '${state}'`);
    expect(value).toContain('role="alert"');
    expect(value).toContain('role="status"');
    expect(value).toContain('data-invoice-pdf-status={pdfStatus}');
  });

  it('polls active PDF jobs through SvelteKit invalidation and cleans up at terminal state', () => {
    const value = source();

    expect(value).toContain("import { invalidateAll } from '$app/navigation';");
    expect(value).toContain("from '$lib/portal/invoice-pdf-polling';");
    expect(value).toContain('createInvoicePdfPollingController');
    expect(value).toContain('pdfPolling.update(pdfStatus);');
    expect(value).toContain('pdfPolling.dispose();');
    expect(value).not.toContain('setInterval(');
    expect(value).not.toContain('clearInterval(');
    expect(value).toContain('return () => {');
    expect(value).not.toContain('history.pushState');
    expect(value).not.toContain('history.replaceState');
  });

  it('keeps PDF refreshes single-flight while one invalidation is pending', async () => {
    vi.useFakeTimers();
    const first = deferred<void>();
    let calls = 0;
    const refresh = () => {
      calls += 1;
      return calls === 1 ? first.promise : Promise.resolve();
    };
    const controller = createInvoicePdfPollingController(refresh, 1_000);

    controller.update('queued');
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(2);

    controller.dispose();
  });

  it('preserves the in-flight token when a queued PDF moves to running', async () => {
    vi.useFakeTimers();
    const first = deferred<void>();
    let calls = 0;
    const refresh = () => {
      calls += 1;
      return calls === 1 ? first.promise : Promise.resolve();
    };
    const controller = createInvoicePdfPollingController(refresh, 1_000);

    controller.update('queued');
    await vi.advanceTimersByTimeAsync(1_000);
    controller.update('running');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(2);

    controller.dispose();
  });

  it.each(['ready', 'failed', 'unavailable'] as const)(
    'stops polling after terminal PDF status %s',
    async (terminalStatus) => {
      vi.useFakeTimers();
      let calls = 0;
      const refresh = () => {
        calls += 1;
        return Promise.resolve();
      };
      const controller = createInvoicePdfPollingController(refresh, 1_000);

      controller.update('queued');
      await vi.advanceTimersByTimeAsync(1_000);
      controller.update(terminalStatus);
      await vi.advanceTimersByTimeAsync(10_000);

      expect(calls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
      controller.dispose();
    },
  );

  it('tears down the timer on dispose without starting another refresh', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const controller = createInvoicePdfPollingController(async () => {
      calls += 1;
    }, 1_000);

    controller.update('running');
    expect(vi.getTimerCount()).toBe(1);
    controller.dispose();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a stale completion when a newer polling generation is in flight', async () => {
    vi.useFakeTimers();
    const first = deferred<void>();
    const second = deferred<void>();
    let calls = 0;
    const refresh = () => {
      calls += 1;
      if (calls === 1) return first.promise;
      if (calls === 2) return second.promise;
      return Promise.resolve();
    };
    const controller = createInvoicePdfPollingController(refresh, 1_000);

    controller.update('queued');
    await vi.advanceTimersByTimeAsync(1_000);
    controller.update('ready');
    controller.update('queued');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(2);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(2);

    second.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(3);

    controller.dispose();
  });

  it('keeps the preview panel and invoice line items usable on small screens', () => {
    const value = source();
    const css = styles();

    expect(value).toContain('data-mobile-representation="cards"');
    expect(value).toContain('aria-labelledby="invoice-pdf-heading"');
    expect(css).toContain('.invoice-pdf-panel__frame-wrap iframe');
    expect(css).toContain('min-height: 2.75rem');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
  });
});
