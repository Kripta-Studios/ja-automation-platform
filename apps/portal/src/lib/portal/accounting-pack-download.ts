export const ACCOUNTING_PACK_DOWNLOAD_POLL_INTERVAL_MS = 2_500;
export const ACCOUNTING_PACK_DOWNLOAD_MAX_ATTEMPTS = 48;

export type AccountingPackDownloadResult =
  | { ok: true; filename: string }
  | { ok: false; error: string; status: number; code?: string; timedOut?: boolean };

export type AccountingPackRetryResult =
  | { ok: true; status: 202; job: { id: string; created: boolean; state: string } }
  | { ok: false; status: number; error: string; code?: string; correlationId?: string };

export type AccountingPackRetryFailureKind = 'not_queued' | 'uncertain' | 'other';

/** Only the pre-invocation server code proves no retry job was queued. */
export function classifyAccountingPackRetryFailure(
  result: Extract<AccountingPackRetryResult, { ok: false }>,
): AccountingPackRetryFailureKind {
  if (result.status === 503 && result.code === 'ACCOUNTING_PACK_RETRY_SERVICE_UNAVAILABLE')
    return 'not_queued';
  return result.status >= 500 ? 'uncertain' : 'other';
}

export type AccountingPackDownloadFailureKind =
  | 'changed'
  | 'processing'
  | 'failed'
  | 'temporary'
  | 'unauthenticated'
  | 'permission'
  | 'unknown';

/** Prefer stable server codes; older artifact responses still need a safe fallback. */
export function classifyAccountingPackDownloadFailure(
  status: number,
  error: string,
  code?: string,
): AccountingPackDownloadFailureKind {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'permission';
  if (status === 409 && code === 'ACCOUNTING_PACK_SOURCE_CHANGED') return 'changed';
  if (
    status === 409 &&
    (code === 'ACCOUNTING_PACK_EXPORT_PROCESSING' ||
      code === 'ACCOUNTING_PACK_EXPORT_RETRY_NOT_READY' ||
      code === 'ACCOUNTING_PACK_EXPORT_ALREADY_READY')
  )
    return 'processing';
  if (status === 409 && code === 'ACCOUNTING_PACK_EXPORT_FAILED_RETRYABLE') return 'failed';
  if (code === 'ACCOUNTING_PACK_EXPORT_SERVICE_UNAVAILABLE') return 'temporary';
  if (status === 202 || (status === 409 && /not ready|queued|processing|running/i.test(error)))
    return 'processing';
  if (status === 409 && /source changed|new revision/i.test(error)) return 'changed';
  if (status === 409 && /export failed|retry required/i.test(error)) return 'failed';
  if (status === 408 || status === 429 || status >= 500) return 'temporary';
  return 'unknown';
}

export type AccountingPackDownloadHooks = Readonly<{
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  save: (blob: Blob, filename: string) => void;
  onRetry?: () => void | Promise<void>;
}>;

export function isRetryableAccountingPackDownload(
  status: number,
  error: string,
  code?: string,
): boolean {
  return classifyAccountingPackDownloadFailure(status, error, code) === 'processing';
}

export function isModifiedDownloadClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export function filenameFromContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      return encoded[1].trim();
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim();
}

export function saveBlobAsFile(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function validCorrelationId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,96}$/u.test(value) ? value : undefined;
}

async function readDownloadError(
  response: Response,
): Promise<{ error: string; code?: string; correlationId?: string }> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
    code?: unknown;
    correlationId?: unknown;
  } | null;
  const bodyReference = validCorrelationId(body?.correlationId);
  const headerReference = validCorrelationId(response.headers.get('x-correlation-id'));
  const correlationId =
    bodyReference && headerReference && bodyReference !== headerReference
      ? undefined
      : (bodyReference ?? headerReference);
  return {
    error: typeof body?.error === 'string' ? body.error : '',
    ...(typeof body?.code === 'string' ? { code: body.code } : {}),
    ...(correlationId ? { correlationId } : {}),
  };
}

/** Explicit artifact retry. The caller retains the key until acceptance is known. */
export async function requestAccountingPackExportRetry(
  url: string,
  idempotencyKey: string,
  fetchImpl: typeof fetch,
): Promise<AccountingPackRetryResult> {
  const response = await fetchImpl(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ idempotencyKey }),
  });
  if (response.status === 202) {
    const payload = (await response.json().catch(() => null)) as {
      job?: { id?: unknown; created?: unknown; state?: unknown };
    } | null;
    if (
      typeof payload?.job?.id !== 'string' ||
      typeof payload.job.created !== 'boolean' ||
      typeof payload.job.state !== 'string'
    )
      return {
        ok: false,
        status: 502,
        error:
          'The retry response could not be confirmed. Check the pack status before trying again.',
      };
    return {
      ok: true,
      status: 202,
      job: {
        id: payload.job.id,
        created: payload.job.created,
        state: payload.job.state,
      },
    };
  }
  const failure = await readDownloadError(response);
  return {
    ok: false,
    status: response.status,
    error: failure.error || `HTTP ${response.status}`,
    ...(failure.code && { code: failure.code }),
    ...(failure.correlationId && { correlationId: failure.correlationId }),
  };
}

export async function downloadAccountingPackArtifact(
  url: string,
  hooks: AccountingPackDownloadHooks,
  options: { intervalMs?: number; maxAttempts?: number; signal?: AbortSignal } = {},
): Promise<AccountingPackDownloadResult> {
  const intervalMs = options.intervalMs ?? ACCOUNTING_PACK_DOWNLOAD_POLL_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? ACCOUNTING_PACK_DOWNLOAD_MAX_ATTEMPTS;
  let lastError = 'Accounting Pack export is not ready';
  let lastStatus = 409;
  let lastCode: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted)
      return {
        ok: false,
        error: lastError,
        status: lastStatus,
        ...(lastCode && { code: lastCode }),
      };
    let response: Response;
    try {
      response = await hooks.fetch(url, {
        credentials: 'same-origin',
        headers: { accept: 'application/pdf, application/octet-stream, application/json' },
        signal: options.signal,
      });
    } catch (cause) {
      if (options.signal?.aborted)
        return {
          ok: false,
          error: lastError,
          status: lastStatus,
          ...(lastCode && { code: lastCode }),
        };
      throw cause;
    }
    lastStatus = response.status;
    if (response.ok) {
      const blob = await response.blob();
      const filename =
        filenameFromContentDisposition(response.headers.get('content-disposition')) ??
        'accounting-pack';
      hooks.save(blob, filename);
      return { ok: true, filename };
    }
    const failure = await readDownloadError(response);
    lastError = failure.error || `HTTP ${response.status}`;
    lastCode = failure.code;
    if (!isRetryableAccountingPackDownload(response.status, lastError, lastCode))
      return {
        ok: false,
        error: lastError,
        status: response.status,
        ...(lastCode && { code: lastCode }),
      };
    await hooks.onRetry?.();
    if (attempt === maxAttempts) break;
    await hooks.sleep(intervalMs);
  }

  return {
    ok: false,
    error: lastError,
    status: lastStatus,
    ...(lastCode && { code: lastCode }),
    timedOut: true,
  };
}
