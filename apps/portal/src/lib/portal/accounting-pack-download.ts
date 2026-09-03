export const ACCOUNTING_PACK_DOWNLOAD_POLL_INTERVAL_MS = 2_500;
export const ACCOUNTING_PACK_DOWNLOAD_MAX_ATTEMPTS = 48;

export type AccountingPackDownloadResult =
  | { ok: true; filename: string }
  | { ok: false; error: string; status: number };

export type AccountingPackDownloadHooks = Readonly<{
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  save: (blob: Blob, filename: string) => void;
  onRetry?: () => void | Promise<void>;
}>;

export function isRetryableAccountingPackDownload(status: number, error: string): boolean {
  if (status === 202) return true;
  if (status !== 409) return false;
  return /source changed|new revision|not ready|queued|processing/i.test(error);
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

async function readDownloadError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === 'string' ? body.error : '';
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

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) return { ok: false, error: lastError, status: lastStatus };
    let response: Response;
    try {
      response = await hooks.fetch(url, {
        credentials: 'same-origin',
        headers: { accept: 'application/pdf, application/octet-stream, application/json' },
        signal: options.signal,
      });
    } catch (cause) {
      if (options.signal?.aborted) return { ok: false, error: lastError, status: lastStatus };
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
    lastError = (await readDownloadError(response)) || `HTTP ${response.status}`;
    if (!isRetryableAccountingPackDownload(response.status, lastError))
      return { ok: false, error: lastError, status: response.status };
    await hooks.onRetry?.();
    if (attempt === maxAttempts) break;
    await hooks.sleep(intervalMs);
  }

  return { ok: false, error: lastError, status: lastStatus };
}
