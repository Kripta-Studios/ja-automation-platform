import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LOCALIZED_PDF_RENDERER_VERSION,
  runLocalizedPdfVariantJob,
  type LocalizedPdfJobExecution,
  type LocalizedPdfJobRepository,
  type LocalizedPdfJobVariant,
} from '@ja/reporting';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const execution: LocalizedPdfJobExecution = {
  jobId: 'job-localized-pdf',
  jobRunId: 'run-localized-pdf',
  leaseFence: 3,
};

function fakeVariant(
  ownerType: LocalizedPdfJobVariant['ownerType'],
  snapshot: Record<string, unknown>,
  locale: LocalizedPdfJobVariant['locale'] = 'es',
): LocalizedPdfJobVariant {
  return {
    variantId: `variant-${ownerType}`,
    ownerType,
    ownerId: `${ownerType}-1`,
    locale,
    snapshotJson: JSON.stringify(snapshot),
    storageKey: `localized-pdf/${ownerType}/variant-${ownerType}.pdf`,
    semanticFilename: `${ownerType}-es.pdf`,
    templateVersion: '2026.08.23.1',
    generationVersion: 'localized-2026.08.23.1',
    currentAttemptNumber: 1,
    status: 'queued',
  };
}

function fakeRepository(initial: LocalizedPdfJobVariant) {
  let variant = initial;
  let claimExecution: LocalizedPdfJobExecution | undefined;
  let failed: Record<string, unknown> | undefined;
  const repository: LocalizedPdfJobRepository = {
    claimVariant: (_variantId, currentExecution) => {
      claimExecution = currentExecution;
      variant = { ...variant, status: 'running' };
      return { variant, attemptNumber: variant.currentAttemptNumber };
    },
    completeVariant: (_variantId, input) => {
      expect(input.execution).toEqual(execution);
      expect(input.rendererVersion).toBe(LOCALIZED_PDF_RENDERER_VERSION);
      variant = { ...variant, status: 'ready' };
      return variant;
    },
    failVariant: (_variantId, input) => {
      failed = input;
      variant = { ...variant, status: 'failed' };
      return variant;
    },
  };
  return {
    repository,
    state: () => ({ variant, claimExecution, failed }),
  };
}

describe('localized PDF durable renderer', () => {
  it.each([
    [
      'invoice',
      {
        invoice_number: 'INV-100',
        currency: 'EUR',
        subtotal_minor: 1000,
        tax_minor: 210,
        total_minor: 1210,
        lines: [{ description: 'Sensor timing investigation', subtotal_minor: 1000 }],
      },
    ],
    [
      'period_report_revision',
      {
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        project_number: 'P-100',
        project_name: 'Release project',
      },
    ],
    [
      'accounting_pack_revision',
      {
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        currency: 'EUR',
        totals: { totalMinor: 1210 },
      },
    ],
    [
      'daily_report',
      {
        work_date: '2026-08-22',
        project_number: 'P-100',
        project_name: 'Release project',
        summary: 'Startup support and customer handover notes',
      },
    ],
    [
      'technical_report',
      {
        report_date: '2026-08-22',
        project_number: 'P-100',
        project_name: 'Release project',
        system_name: 'PLC line',
        change_summary: 'Sensor timing investigation',
      },
    ],
  ] as const)('renders one valid PDF for %s', (_ownerType, snapshot) => {
    const root = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-job-'));
    roots.push(root);
    const initial = fakeVariant(_ownerType, snapshot);
    const fake = fakeRepository(initial);
    const result = runLocalizedPdfVariantJob({
      repository: fake.repository,
      payload: { variantId: initial.variantId, requestedAttempt: 1 },
      execution,
      documentRoot: root,
    });
    const bytes = readFileSync(join(root, initial.storageKey));
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.status).toBe('ready');
    expect(result.byteLength).toBe(bytes.byteLength);
    expect(result.contentSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(fake.state().claimExecution).toEqual(execution);
    expect(fake.state().variant.status).toBe('ready');
  });

  it('renders every supported owner type in each supported locale', () => {
    const cases = [
      ['invoice', { invoice_number: 'INV-200', total_minor: 1000 }],
      ['period_report_revision', { period_start: '2026-08-01', period_end: '2026-08-31' }],
      ['accounting_pack_revision', { period_start: '2026-08-01', period_end: '2026-08-31' }],
      ['daily_report', { work_date: '2026-08-22', summary: 'Daily report' }],
      ['technical_report', { report_date: '2026-08-22', change_summary: 'Technical report' }],
    ] as const;
    for (const [ownerType, snapshot] of cases) {
      for (const locale of ['en', 'es', 'pt'] as const) {
        const root = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-job-locale-'));
        roots.push(root);
        const initial = fakeVariant(ownerType, snapshot, locale);
        const fake = fakeRepository(initial);
        const result = runLocalizedPdfVariantJob({
          repository: fake.repository,
          payload: { variantId: initial.variantId, requestedAttempt: 1 },
          execution,
          documentRoot: root,
        });
        const bytes = readFileSync(join(root, initial.storageKey));
        expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
        expect(result.status).toBe('ready');
        expect(fake.state().variant.status).toBe('ready');
      }
    }
  }, 30_000);

  it('does not overwrite a different artifact and records a locale-scoped failure', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-collision-'));
    roots.push(root);
    const initial = fakeVariant('daily_report', {
      work_date: '2026-08-22',
      summary: 'Collision test',
    });
    const target = join(root, initial.storageKey);
    const targetDirectory = target.slice(0, target.lastIndexOf('/'));
    // The storage key uses POSIX separators even on Windows; mkdir via the parent path keeps the
    // test portable because Node resolves the resulting relative path consistently.
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(target, Buffer.from('attacker-bytes'));
    const fake = fakeRepository(initial);
    expect(() =>
      runLocalizedPdfVariantJob({
        repository: fake.repository,
        payload: { variantId: initial.variantId, requestedAttempt: 1 },
        execution,
        documentRoot: root,
      }),
    ).toThrow('HANDLER_FAILED');
    expect(readFileSync(target).toString()).toBe('attacker-bytes');
    expect(fake.state().failed).toMatchObject({ errorCode: 'LOCALIZED_PDF_RENDER_FAILED' });
  });

  it('rejects a symlink in every private-root parent component', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-symlink-'));
    const outside = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-outside-'));
    roots.push(root, outside);
    const link = join(root, 'localized-pdf');
    try {
      symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      // Windows CI may not grant junction/symlink creation to the test account. The production
      // path guard remains covered by the direct collision test and platform-specific security
      // suites; do not make unrelated test execution fail solely on that host policy.
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    const initial = fakeVariant('daily_report', {
      work_date: '2026-08-22',
      summary: 'Symlink parent test',
    });
    const fake = fakeRepository(initial);
    expect(() =>
      runLocalizedPdfVariantJob({
        repository: fake.repository,
        payload: { variantId: initial.variantId, requestedAttempt: 1 },
        execution,
        documentRoot: root,
      }),
    ).toThrow('HANDLER_FAILED');
    expect(existsSync(join(outside, 'daily_report', 'variant-daily_report.pdf'))).toBe(false);
  });
});
