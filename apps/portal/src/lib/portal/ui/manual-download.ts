/** A read-only PDF GET may be repeated after a transient network/server failure. */
export type ManualDownloadFailure = 'sign-in' | 'access' | 'temporary' | 'later' | 'cancelled';
export type ManualDownloadResult =
  | { ok: true; blob: Blob; language: 'en' | 'es' | 'pt' }
  | { ok: false; failure: ManualDownloadFailure };

export type ManualLanguage = 'en' | 'es' | 'pt';

/** Select the actual PDF language advertised by the catalog before building a download link. */
export function manualDownloadLanguage(
  requested: ManualLanguage,
  available: readonly ManualLanguage[],
): ManualLanguage {
  return available.includes(requested) ? requested : (available[0] ?? 'en');
}

const retryStatuses = new Set([429, 502, 503, 504]);
const retryBudgetMs = 2_000;
const wait = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener('abort', finish, { once: true });
  });
function retryDelay(response: Response | null, attempt: number): number | 'later' {
  const header = response?.headers.get('retry-after')?.trim();
  if (header) {
    const seconds = Number(header);
    const milliseconds = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(header) - Date.now();
    if (Number.isFinite(milliseconds)) {
      if (milliseconds > retryBudgetMs) return 'later';
      return Math.max(0, milliseconds);
    }
  }
  return Math.min(250 * 2 ** attempt, 1_000);
}

export async function fetchManualWithRetry(
  url: string,
  fetcher: typeof fetch = fetch,
  sleeper: (milliseconds: number, signal?: AbortSignal) => Promise<void> = wait,
  signal?: AbortSignal,
  attemptTimeoutMs = 12_000,
): Promise<ManualDownloadResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) return { ok: false, failure: 'cancelled' };
    let response: Response | null = null;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const operation = (async () => {
        const fetched = await fetcher(url, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        const blob = fetched.ok ? await fetched.blob() : null;
        return { fetched, blob };
      })();
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Manual PDF GET timed out'));
        }, attemptTimeoutMs);
      });
      const outcome = await Promise.race([operation, timeout]);
      response = outcome.fetched;
      if (signal?.aborted) return { ok: false, failure: 'cancelled' };
      if (response.ok) {
        if (!response.headers.get('content-type')?.toLowerCase().includes('application/pdf'))
          throw new Error('Manual response is not a PDF');
        const language = response.headers.get('x-help-manual-language');
        const blob = outcome.blob;
        if (!blob || blob.size < 5 || (await blob.slice(0, 5).text()) !== '%PDF-')
          throw new Error('Manual PDF is incomplete');
        return {
          ok: true,
          blob,
          language: language === 'es' || language === 'pt' ? language : 'en',
        };
      }
      if (response.status === 401) return { ok: false, failure: 'sign-in' };
      if (response.status === 403 || response.status === 404)
        return { ok: false, failure: 'access' };
      if (!retryStatuses.has(response.status)) return { ok: false, failure: 'temporary' };
    } catch {
      if (signal?.aborted) return { ok: false, failure: 'cancelled' };
      // Network failure on a read-only GET is safe to retry.
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
    const delay = retryDelay(response, attempt);
    if (delay === 'later') return { ok: false, failure: 'later' };
    if (attempt < 2) await sleeper(delay, signal);
  }
  return { ok: false, failure: 'temporary' };
}

export function manualDownloadFilename(
  id: string,
  locale: 'en' | 'es' | 'pt',
  revision: string,
): string {
  const safeId = /^[a-z0-9-]+$/u.test(id) ? id : 'guide';
  const safeRevision = /^\d{4}-\d{2}-\d{2}$/u.test(revision) ? revision : 'current';
  return `${safeId}-${locale === 'pt' ? 'PT-BR' : locale.toUpperCase()}-${safeRevision}.pdf`;
}
