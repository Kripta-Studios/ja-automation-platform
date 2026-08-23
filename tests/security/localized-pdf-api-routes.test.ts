import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccessDeniedError, ConflictError } from '@ja/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openPortalRepository = vi.fn();

vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));

const { POST: requestLocalizedPdf } =
  await import('../../apps/portal/src/routes/app/api/localized-pdf/+server.ts');
const { POST: retryLocalizedPdf } =
  await import('../../apps/portal/src/routes/app/api/localized-pdf/[variantId]/retry/+server.ts');
const { GET: downloadLocalizedPdf } =
  await import('../../apps/portal/src/routes/app/api/localized-pdf/[variantId]/download/+server.ts');

const queuedVariant = (overrides: Record<string, unknown> = {}) => ({
  variantId: 'variant-pt',
  ownerType: 'daily_report',
  ownerId: 'daily-1',
  ownerRevisionId: 'daily-1',
  tenantId: 'tenant-1',
  deploymentId: 'deployment-1',
  locale: 'pt',
  localeTag: 'pt-BR',
  documentTag: 'daily_report',
  templateVersion: 'v3',
  generationVersion: 'localized-v3',
  snapshotJson: '{}',
  snapshotHash: 'a'.repeat(64),
  snapshotHashKind: 'canonical',
  status: 'queued',
  currentAttemptNumber: 1,
  attemptNumber: 1,
  semanticFilename: 'daily-report-daily-1-pt-BR.pdf',
  mediaType: null,
  byteLength: null,
  contentSha256: null,
  storageKey: 'localized-pdf/daily_report/daily-1/pt.pdf',
  rendererVersion: null,
  readyAt: null,
  errorCode: null,
  retryable: null,
  integrityBlocked: false,
  maxAttempts: 5,
  requestKey: null,
  requestedBy: 'user-1',
  requestedAt: '2026-08-23T00:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  execution: null,
  updatedAt: '2026-08-23T00:00:00.000Z',
  ...overrides,
});

function requestContext() {
  const variant = queuedVariant();
  const localizedPdf = {
    requestLocalizedPdf: vi.fn(
      (_principal: unknown, _input: unknown, onPersist?: (value: unknown) => void) => {
        onPersist?.(variant);
        return variant;
      },
    ),
    retryLocalizedPdfVariant: vi.fn(
      (_principal: unknown, _variantId: string, onPersist?: (value: unknown) => void) => {
        onPersist?.(variant);
        return variant;
      },
    ),
    resolveLocalizedPdfDownload: vi.fn(),
  };
  const context = {
    principal: { userId: 'user-1', role: 'owner_admin', projectIds: new Set<string>() },
    localizedPdf,
    v3: { enqueueJob: vi.fn(() => ({ id: 'job-1', created: true })) },
    sqlite: { close: vi.fn() },
  };
  openPortalRepository.mockReturnValue(context);
  return { context, variant };
}

const locals = {
  user: { id: 'user-1' },
  session: { id: 'session-1' },
} as never;

describe('localized PDF HTTP lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues a request with a download Location and Retry-After, then returns 200 idempotently', async () => {
    const { context, variant } = requestContext();
    const request = new Request('http://localhost/j-aautomation/app/api/localized-pdf', {
      method: 'POST',
      body: JSON.stringify({ ownerType: 'daily_report', ownerId: 'daily-1', locale: 'pt-BR' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await requestLocalizedPdf({
      locals,
      request,
      url: new URL(request.url),
    } as never);
    expect(response.status).toBe(202);
    expect(response.headers.get('location')).toContain(
      '/app/api/localized-pdf/variant-pt/download',
    );
    expect(response.headers.get('retry-after')).toBe('2');
    expect(context.v3.enqueueJob).toHaveBeenCalledWith(
      'localized_pdf_variant_render',
      'localized-pdf:variant-pt:attempt:1',
      { variantId: 'variant-pt', requestedAttempt: 1 },
    );

    context.localizedPdf.requestLocalizedPdf.mockImplementationOnce(
      () => ({ ...variant, status: 'ready' }) as never,
    );
    const idempotentRequest = new Request(request.url, {
      method: 'POST',
      body: JSON.stringify({ ownerType: 'daily_report', ownerId: 'daily-1', locale: 'pt-BR' }),
      headers: { 'content-type': 'application/json' },
    });
    const second = await requestLocalizedPdf({
      locals,
      request: idempotentRequest,
      url: new URL(idempotentRequest.url),
    } as never);
    expect(second.status).toBe(200);
    expect((await second.json()).job).toBeNull();
  });

  it('returns a 202 retry response and never accepts client snapshot or storage fields', async () => {
    const { context } = requestContext();
    const request = new Request(
      'http://localhost/j-aautomation/app/api/localized-pdf/variant-pt/retry',
      {
        method: 'POST',
        body: JSON.stringify({
          snapshot: 'forged',
          storageKey: '../escape',
          contentSha256: 'forged',
        }),
      },
    );
    const response = await retryLocalizedPdf({
      locals,
      params: { variantId: 'variant-pt' },
      url: new URL(request.url),
    } as never);
    expect(response.status).toBe(202);
    expect(response.headers.get('location')).toContain('/download');
    expect(context.localizedPdf.retryLocalizedPdfVariant).toHaveBeenCalledWith(
      expect.anything(),
      'variant-pt',
      expect.any(Function),
    );
    expect(context.v3.enqueueJob).toHaveBeenCalledTimes(1);
  });

  it('conceals unauthorized downloads as 404 and maps integrity conflicts to 409', async () => {
    const { context } = requestContext();
    context.localizedPdf.resolveLocalizedPdfDownload.mockImplementationOnce(() => {
      throw new AccessDeniedError('not found');
    });
    const missing = await downloadLocalizedPdf({
      locals,
      params: { variantId: 'variant-pt' },
    } as never);
    expect(missing.status).toBe(404);

    context.localizedPdf.resolveLocalizedPdfDownload.mockImplementation(() => {
      throw new ConflictError('ARTIFACT_INTEGRITY_FAILED');
    });
    const conflict = await downloadLocalizedPdf({
      locals,
      params: { variantId: 'variant-pt' },
    } as never);
    expect(conflict.status).toBe(409);
  });

  it('streams only verified bytes with private, same-origin and RFC5987 headers', async () => {
    const { context, variant } = requestContext();
    const root = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-route-'));
    const previousRoot = process.env.JA_DOCUMENT_ROOT;
    process.env.JA_DOCUMENT_ROOT = root;
    const bytes = Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n', 'ascii');
    const storageKey = 'localized-pdf/daily_report/daily-1/report.pdf';
    const targetDirectory = join(root, 'localized-pdf', 'daily_report', 'daily-1');
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(join(targetDirectory, 'report.pdf'), bytes);
    context.localizedPdf.resolveLocalizedPdfDownload.mockReturnValue({
      ...variant,
      status: 'ready',
      semanticFilename: 'daily résumé pt.pdf',
      storageKey,
      mediaType: 'application/pdf',
      byteLength: bytes.byteLength,
      contentSha256: createHash('sha256').update(bytes).digest('hex'),
    });
    try {
      const response = await downloadLocalizedPdf({
        locals,
        params: { variantId: 'variant-pt' },
      } as never);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('pragma')).toBe('no-cache');
      expect(response.headers.get('expires')).toBe('0');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
      expect(response.headers.get('content-security-policy')).toBe('sandbox');
      expect(response.headers.get('content-disposition')).toContain(
        "filename*=UTF-8''daily%20r%C3%A9sum%C3%A9%20pt.pdf",
      );
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    } finally {
      if (previousRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
      else process.env.JA_DOCUMENT_ROOT = previousRoot;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires an authenticated session before touching the repository', async () => {
    openPortalRepository.mockClear();
    const request = new Request('http://localhost/j-aautomation/app/api/localized-pdf', {
      method: 'POST',
      body: '{}',
    });
    const response = await requestLocalizedPdf({
      locals: { user: null, session: null },
      request,
      url: new URL(request.url),
    } as never);
    expect(response.status).toBe(401);
    expect(openPortalRepository).not.toHaveBeenCalled();
  });
});
