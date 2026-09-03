import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  downloadAccountingPackArtifact,
  filenameFromContentDisposition,
  isRetryableAccountingPackDownload,
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
  it('retries source-changed and not-ready conflicts until the current revision is ready', async () => {
    expect(
      isRetryableAccountingPackDownload(
        409,
        'Accounting Pack source changed; create a new revision before download',
      ),
    ).toBe(true);
    expect(isRetryableAccountingPackDownload(409, 'Accounting Pack pdf export is not ready')).toBe(
      true,
    );
    expect(isRetryableAccountingPackDownload(403, 'Confirm your identity to continue')).toBe(false);

    const saved: Array<{ blob: Blob; filename: string }> = [];
    const responses = [
      jsonResponse(409, 'Accounting Pack source changed; create a new revision before download'),
      jsonResponse(409, 'Accounting Pack xlsx export is not ready'),
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

  it('intercepts Ready clicks so the portal can recover without showing the stale-source error', () => {
    const source = accountingPackStatus();
    expect(source).toContain('downloadAccountingPackArtifact');
    expect(source).toContain('handleDownloadClick');
    expect(source).toContain('onclick={(event) => void handleDownloadClick(event, artifact.key)}');
    expect(source).not.toContain('Accounting Pack source changed');
  });
});

function jsonResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
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
