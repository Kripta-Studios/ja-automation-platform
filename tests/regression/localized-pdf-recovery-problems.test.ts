import { AccessDeniedError, ConflictError } from '@ja/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));

const { POST: retryLocalizedPdf } =
  await import('../../apps/portal/src/routes/app/api/localized-pdf/[variantId]/retry/+server.ts');
const { GET: downloadLocalizedPdf } =
  await import('../../apps/portal/src/routes/app/api/localized-pdf/[variantId]/download/+server.ts');
const { GET: listLocalizedPdf, POST: requestLocalizedPdf } =
  await import('../../apps/portal/src/routes/app/api/localized-pdf/+server.ts');
const { mapLocalizedPdfError } =
  await import('../../apps/portal/src/lib/server/localized-pdf-api.ts');

const locals = { user: { id: 'user-1' }, session: { id: 'session-1' } } as never;

function context(role = 'owner_admin') {
  const localizedPdf = {
    retryLocalizedPdfVariant: vi.fn(),
    resolveLocalizedPdfDownload: vi.fn(),
    listLocalizedPdfVariants: vi.fn(),
  };
  const value = {
    principal: { userId: 'user-1', role, projectIds: new Set<string>() },
    localizedPdf,
    v3: { enqueueJob: vi.fn() },
    sqlite: { close: vi.fn() },
  };
  openPortalRepository.mockReturnValue(value);
  return value;
}

function retryEvent(variantId = 'variant-1') {
  return {
    locals,
    params: { variantId },
    url: new URL(`http://localhost/j-aautomation/app/api/localized-pdf/${variantId}/retry`),
  } as never;
}

function downloadEvent(variantId = 'variant-1') {
  return { locals, params: { variantId } } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('localized PDF recovery responses', () => {
  it('returns the same typed contract for malformed collection and request input', async () => {
    const url = new URL('http://localhost/j-aautomation/app/api/localized-pdf?ownerType=invoice');
    const listed = await listLocalizedPdf({ locals, url } as never);
    const requested = await requestLocalizedPdf({
      locals,
      url,
      request: new Request(url, { method: 'POST', body: '{broken' }),
    } as never);
    for (const response of [listed, requested]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'PDF_REQUEST_INVALID',
        messageKey: 'problem.localizedPdf.requestInvalid',
        remedies: [{ id: 'review_current_record' }],
        correlationId: expect.any(String),
      });
    }
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it('keeps repository startup details private with a reference ID', async () => {
    openPortalRepository.mockImplementation(() => {
      throw new Error('private database location');
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await listLocalizedPdf({
        locals,
        url: new URL('http://localhost/j-aautomation/app/api/localized-pdf'),
      } as never);
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toMatchObject({
        code: 'PDF_UNEXPECTED_ERROR',
        messageKey: 'problem.localizedPdf.unexpected',
        correlationId: expect.any(String),
      });
      expect(JSON.stringify(body)).not.toContain('private database location');
      expect(errorLog).toHaveBeenCalledOnce();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('identifies a missing issued invoice snapshot without leaking repository wording', () => {
    const mapped = mapLocalizedPdfError(
      new ConflictError('Issued invoice snapshot required for a localized PDF'),
    );
    expect(mapped).toMatchObject({
      status: 409,
      body: {
        code: 'PDF_INVOICE_SNAPSHOT_REQUIRED',
        messageKey: 'problem.localizedPdf.invoiceSnapshotRequired',
        remedies: [{ id: 'review_current_record' }],
      },
    });
  });

  it.each([
    [
      'Only failed variants can be retried',
      'PDF_RETRY_NOT_FAILED',
      'problem.localizedPdf.retryNotFailed',
      ['refresh_pdf_status'],
    ],
    [
      'Localized PDF failure is not retryable',
      'PDF_RETRY_NOT_ALLOWED',
      'problem.localizedPdf.retryNotAllowed',
      ['refresh_pdf_status', 'review_current_record'],
    ],
    [
      'Localized PDF retry limit reached',
      'PDF_RETRY_LIMIT_REACHED',
      'problem.localizedPdf.retryLimitReached',
      ['refresh_pdf_status', 'review_current_record'],
    ],
    [
      'Localized PDF retry was lost',
      'PDF_RETRY_STALE',
      'problem.localizedPdf.retryStale',
      ['refresh_pdf_status'],
    ],
  ])(
    'maps retry conflict %s without raw repository text',
    async (message, code, messageKey, remedies) => {
      const value = context();
      value.localizedPdf.retryLocalizedPdfVariant.mockImplementation(() => {
        throw new ConflictError(message);
      });
      const response = await retryLocalizedPdf(retryEvent());
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body).toMatchObject({
        code,
        messageKey,
        params: {},
        fieldErrors: {},
        remedies: remedies.map((id) => ({ id })),
        correlationId: expect.any(String),
      });
      expect(body.error).not.toBe(message);
      expect(value.v3.enqueueJob).not.toHaveBeenCalled();
      expect(value.sqlite.close).toHaveBeenCalledOnce();
    },
  );

  it('keeps missing and private variant IDs indistinguishable', async () => {
    const value = context();
    value.localizedPdf.retryLocalizedPdfVariant.mockImplementation(() => {
      throw new AccessDeniedError('Private variant exists');
    });
    const privateRetry = await retryLocalizedPdf(retryEvent());
    const missingRetry = await retryLocalizedPdf(retryEvent(''));
    const privateBody = await privateRetry.json();
    const missingBody = await missingRetry.json();
    expect(privateRetry.status).toBe(404);
    expect(missingRetry.status).toBe(404);
    expect({ ...privateBody, correlationId: '' }).toEqual({ ...missingBody, correlationId: '' });
    expect(JSON.stringify(privateBody)).not.toContain('Private variant exists');

    value.localizedPdf.resolveLocalizedPdfDownload.mockImplementation(() => {
      throw new AccessDeniedError('Private variant exists');
    });
    const privateDownload = await downloadLocalizedPdf(downloadEvent());
    const missingDownload = await downloadLocalizedPdf(downloadEvent(''));
    expect(privateDownload.status).toBe(404);
    expect(missingDownload.status).toBe(404);
    expect(value.localizedPdf.listLocalizedPdfVariants).not.toHaveBeenCalled();
    expect({ ...(await privateDownload.json()), correlationId: '' }).toEqual({
      ...(await missingDownload.json()),
      correlationId: '',
    });
  });

  it.each([
    ['queued', false, 'PDF_DOWNLOAD_PENDING', 'problem.localizedPdf.downloadPending'],
    ['running', false, 'PDF_DOWNLOAD_PENDING', 'problem.localizedPdf.downloadPending'],
    ['failed', false, 'PDF_DOWNLOAD_FAILED', 'problem.localizedPdf.downloadFailed'],
    ['failed', true, 'PDF_DOWNLOAD_INTEGRITY', 'problem.localizedPdf.downloadIntegrity'],
  ])(
    'explains authorized %s download conflicts',
    async (status, integrityBlocked, code, messageKey) => {
      const value = context('worker');
      value.localizedPdf.resolveLocalizedPdfDownload.mockImplementation(() => {
        throw new ConflictError('ARTIFACT_INTEGRITY_FAILED');
      });
      value.localizedPdf.listLocalizedPdfVariants.mockReturnValue([
        { variantId: 'variant-1', status, integrityBlocked },
      ]);
      const response = await downloadLocalizedPdf(downloadEvent());
      expect(response.status).toBe(409);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toMatchObject({
        code,
        messageKey,
        remedies: integrityBlocked
          ? [{ id: 'refresh_pdf_status' }, { id: 'contact_owner' }]
          : [{ id: 'refresh_pdf_status' }],
      });
      expect(value.localizedPdf.resolveLocalizedPdfDownload).toHaveBeenCalledBefore(
        value.localizedPdf.listLocalizedPdfVariants,
      );
    },
  );

  it('logs unexpected retry failures with a safe reference and no raw error in the response', async () => {
    const value = context();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    value.localizedPdf.retryLocalizedPdfVariant.mockImplementation(() => {
      throw new Error('secret renderer path');
    });
    try {
      const response = await retryLocalizedPdf(retryEvent());
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toMatchObject({
        code: 'PDF_UNEXPECTED_ERROR',
        messageKey: 'problem.localizedPdf.unexpected',
        correlationId: expect.any(String),
        params: { correlationId: expect.any(String) },
      });
      expect(JSON.stringify(body)).not.toContain('secret renderer path');
      expect(logged).toHaveBeenCalledWith(
        'Unexpected localized PDF retry failure',
        expect.objectContaining({ correlationId: body.correlationId }),
      );
    } finally {
      logged.mockRestore();
    }
  });
});
