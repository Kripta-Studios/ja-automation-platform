import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const state = vi.hoisted(() => ({
  role: 'finance_admin',
  sessionError: '' as string,
  openCount: 0,
  closeCount: 0,
  ledgerCount: 0,
  responseCount: 0,
  failLedger: false,
  exportInput: null as Record<string, unknown> | null,
}));

vi.mock('@ja/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ja/database')>();
  return {
    ...actual,
    assertLiveSession: () => {
      if (state.sessionError) throw new actual.AccessDeniedError(state.sessionError);
    },
  };
});
vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => {
    state.openCount += 1;
    return {
      sqlite: { close: () => (state.closeCount += 1) },
      principal: { role: state.role, userId: 'user-1' },
      v3: {
        masterLedger: () => {
          state.ledgerCount += 1;
          if (state.failLedger) throw new Error('private database detail');
          return [];
        },
      },
    };
  },
}));
vi.mock('$lib/server/sensitive-export-response', () => ({
  sensitiveExportResponse: (input: Record<string, unknown>) => {
    state.responseCount += 1;
    state.exportInput = input;
    return new Response('download', {
      headers: {
        'content-type':
          input.format === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${input.filename}"`,
      },
    });
  },
}));

import { GET } from '../../apps/portal/src/routes/app/api/invoice-collection-ledger/[format]/+server';

async function request(query = '', format = 'csv', authenticated = true): Promise<Response> {
  return (await GET({
    locals: authenticated
      ? {
          user: { id: 'user-1', role: state.role },
          session: { id: 'session-1' },
          correlationId: 'request-123',
        }
      : { correlationId: 'request-123' },
    params: { format },
    url: new URL(`http://localhost/app/api/invoice-collection-ledger/${format}${query}`),
  } as never)) as Response;
}

async function problem(response: Response) {
  expect(response.headers.get('content-type')).toContain('application/problem+json');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  return response.json() as Promise<{
    code: string;
    messageKey: string;
    fieldErrors: Record<string, string[]>;
    remedies: Array<{ id: string }>;
    correlationId: string;
    message: string;
  }>;
}

describe('collection ledger export problems', () => {
  beforeEach(() => {
    state.role = 'finance_admin';
    state.sessionError = '';
    state.openCount = 0;
    state.closeCount = 0;
    state.ledgerCount = 0;
    state.responseCount = 0;
    state.failLedger = false;
    state.exportInput = null;
  });

  it('checks sign-in, live session, and Finance role before disclosing malformed filter facts', async () => {
    const signedOut = await request('?periodStart=bad', 'csv', false);
    expect(signedOut.status).toBe(401);
    expect((await problem(signedOut)).code).toBe('COLLECTION_LEDGER_EXPORT_SIGN_IN_REQUIRED');
    expect(state.openCount).toBe(0);

    state.sessionError = 'Live authenticated session required';
    const expired = await request('?periodStart=bad');
    expect(expired.status).toBe(401);
    expect((await problem(expired)).code).toBe('COLLECTION_LEDGER_EXPORT_SESSION_EXPIRED');
    expect(state.closeCount).toBe(1);
    expect(state.ledgerCount).toBe(0);

    state.sessionError = '';
    state.role = 'worker';
    const denied = await request('?periodStart=bad');
    expect(denied.status).toBe(403);
    expect((await problem(denied)).code).toBe('COLLECTION_LEDGER_EXPORT_ACCESS_DENIED');
    expect(state.ledgerCount).toBe(0);
  });

  it.each([
    ['?periodStart=2026-01-01', 'PERIOD_INCOMPLETE', 'periodEnd'],
    ['?periodStart=2026-02-30&periodEnd=2026-03-01', 'PERIOD_DATE_INVALID', 'periodStart'],
    ['?periodStart=2026-03-02&periodEnd=2026-03-01', 'PERIOD_RANGE_REVERSED', 'periodEnd'],
    ['?q=one&q=two', 'FILTER_DUPLICATE', 'q'],
    [`?q=${'x'.repeat(201)}`, 'FILTER_TOO_LONG', 'q'],
    ['?report=unknown', 'REPORT_INVALID', 'report'],
    ['?currency=GBP', 'CURRENCY_INVALID', 'currency'],
    ['?aging=ancient', 'AGING_INVALID', 'aging'],
  ])('returns typed %s before ledger query or audit', async (query, suffix, field) => {
    const response = await request(query);
    expect(response.status).toBe(400);
    const payload = await problem(response);
    expect(payload).toMatchObject({
      code: `COLLECTION_LEDGER_EXPORT_${suffix}`,
      remedies: [{ id: 'review_ledger_filters' }],
      correlationId: 'request-123',
    });
    expect(payload.fieldErrors[field]).toEqual([payload.messageKey]);
    expect(state.ledgerCount).toBe(0);
    expect(state.responseCount).toBe(0);
    expect(state.closeCount).toBe(1);
  });

  it('rejects unsupported path format and collection-report XLSX without querying', async () => {
    const format = await request('', 'pdf');
    expect((await problem(format)).code).toBe('COLLECTION_LEDGER_EXPORT_FORMAT_INVALID');
    const report = await request('?report=customers', 'xlsx');
    const payload = await problem(report);
    expect(payload.code).toBe('COLLECTION_LEDGER_EXPORT_REPORT_CSV_ONLY');
    expect(payload.fieldErrors.report).toEqual([payload.messageKey]);
    expect(state.ledgerCount).toBe(0);
  });

  it.each(['csv', 'xlsx'])('keeps the authorized %s download and filename', async (format) => {
    const response = await request('?periodStart=2026-01-01&periodEnd=2026-01-31', format);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain(
      `ja-invoice-collection-ledger-2026-01-01-2026-01-31.${format}`,
    );
    expect(state.ledgerCount).toBe(1);
    expect(state.responseCount).toBe(1);
    expect(state.exportInput?.periodStart).toBe('2026-01-01');
    expect(state.closeCount).toBe(1);
  });

  it('hides unexpected details and explains that the read-only download can be retried', async () => {
    state.failLedger = true;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request();
      expect(response.status).toBe(503);
      const payload = await problem(response);
      expect(payload.code).toBe('COLLECTION_LEDGER_EXPORT_UNAVAILABLE');
      expect(payload.remedies).toEqual([{ id: 'retry_ledger_export' }]);
      expect(payload.message).not.toContain('private database detail');
      expect(errorLog).toHaveBeenCalledWith(
        'Unexpected collection ledger export failure',
        expect.objectContaining({ correlationId: 'request-123' }),
      );
      expect(state.responseCount).toBe(0);
      expect(state.closeCount).toBe(1);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('resolves every route and UI message in English, Spanish, and Portuguese', () => {
    const source = readFileSync(
      'apps/portal/src/routes/app/api/invoice-collection-ledger/[format]/+server.ts',
      'utf8',
    );
    const table = source.split('const definitions = {')[1]?.split('} as const;')[0] ?? '';
    const names = Array.from(table.matchAll(/^\s{2}(\w+): \[/gmu), (match) => match[1]);
    expect(names.length).toBe(15);
    for (const name of [...names, 'networkUnavailable', 'reviewFilters', 'retryDownload']) {
      const key = `problem.collectionsLedgerExport.${name}`;
      for (const locale of ['en', 'es', 'pt'] as const) {
        expect(portalText(locale, key)).not.toBe(key);
      }
    }
  });
});
