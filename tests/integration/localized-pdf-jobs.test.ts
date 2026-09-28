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
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, LocalizedPdfRepository, V3Repository } from '@ja/database';
import {
  localizedPdfRendererVersion,
  localizedPdfTemplateVersion,
  runLocalizedPdfVariantJob,
  type LocalizedPdfJobExecution,
  type LocalizedPdfJobRepository,
  type LocalizedPdfJobVariant,
} from '@ja/reporting';
import {
  installB5TestDeploymentIdentity,
  seedB5ServiceActorBinding,
} from '../fixtures/b5-test-environment.js';

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
    templateVersion: localizedPdfTemplateVersion(ownerType),
    generationVersion: `localized-${ownerType}-${localizedPdfTemplateVersion(ownerType)}`,
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
      expect(input.rendererVersion).toBe(
        localizedPdfRendererVersion(initial.ownerType, initial.templateVersion),
      );
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

  it('terminally rejects a queued artifact whose family template is unavailable', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-stale-version-'));
    roots.push(root);
    const current = fakeVariant('daily_report', {
      work_date: '2026-08-22',
      summary: 'Stale renderer contract',
    });
    const initial = { ...current, templateVersion: '2026.09.02.2' };
    const fake = fakeRepository(initial);

    expect(() =>
      runLocalizedPdfVariantJob({
        repository: fake.repository,
        payload: { variantId: initial.variantId, requestedAttempt: 1 },
        execution,
        documentRoot: root,
      }),
    ).toThrow('HANDLER_FAILED');
    expect(fake.state().failed).toMatchObject({
      errorCode: 'LOCALIZED_PDF_RENDERER_VERSION_UNAVAILABLE',
      failureClass: 'LOCALIZED_PDF_RENDERER_VERSION_UNAVAILABLE',
      retryable: false,
    });
    expect(existsSync(join(root, initial.storageKey))).toBe(false);
  });

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

  it.each([
    ['%PDF-1.7\nPreserved historical PDF\n%%EOF', 'LOCALIZED_PDF_DESTINATION_COLLISION'],
    ['Unverifiable historical bytes', 'LOCALIZED_PDF_MAGIC_INVALID'],
  ])(
    'persists a fenced failure without overwriting existing bytes: %s',
    (original, expectedClass) => {
      const restoreIdentity = installB5TestDeploymentIdentity();
      const root = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-real-collision-'));
      roots.push(root);
      const { sqlite } = createDatabase(join(root, 'app.db'));
      try {
        const now = new Date().toISOString();
        sqlite
          .prepare(
            `INSERT INTO user(id,name,email,role,status,created_at,updated_at)
           VALUES('owner','Owner','antonny.luty@j-aautomation.com','owner_admin','active',?,?)`,
          )
          .run(now, now);
        seedB5ServiceActorBinding(sqlite, 'owner');
        sqlite
          .prepare(
            `INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at)
           VALUES('client','C-0001','Client','Client','active','EUR','UTC',?,?)`,
          )
          .run(now, now);
        sqlite
          .prepare(
            `INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at)
           VALUES('project','C-0001-P-001','client','Project','UTC','EUR','active','tm',?,?)`,
          )
          .run(now, now);
        sqlite
          .prepare(
            `INSERT INTO daily_report(id,project_id,worker_id,work_date,summary,approval_state,created_at,updated_at)
           VALUES('daily','project','owner','2026-08-22','Recovery regression','draft',?,?)`,
          )
          .run(now, now);
        const repository = new LocalizedPdfRepository(sqlite);
        const variant = repository.requestVariant(
          { userId: 'owner', role: 'owner_admin', projectIds: new Set() },
          {
            ownerType: 'daily_report',
            ownerId: 'daily',
            locale: 'en',
            templateVersion: localizedPdfTemplateVersion('daily_report'),
            generationVersion: `localized-daily_report-${localizedPdfTemplateVersion('daily_report')}`,
          },
        );
        const target = join(root, variant.storageKey);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, original);
        const v3 = new V3Repository(sqlite);
        const job = v3.enqueueJob(
          'localized_pdf_variant_render',
          `collision:${variant.variantId}`,
          {
            variantId: variant.variantId,
            requestedAttempt: 1,
          },
        );
        const result = v3.runDueJobs(1, {
          localized_pdf_variant_render: (payload, context) => {
            runLocalizedPdfVariantJob({
              repository,
              payload,
              execution: {
                jobId: context.jobId,
                jobRunId: context.runId,
                leaseFence: context.fenceVersion,
              },
              documentRoot: root,
            });
          },
        });
        expect(result).toMatchObject({ processed: 0, failed: 1 });
        expect(
          sqlite
            .prepare(
              'SELECT status,error_code,current_attempt_number FROM localized_pdf_variant WHERE variant_id=?',
            )
            .get(variant.variantId),
        ).toEqual({
          status: 'failed',
          error_code: 'LOCALIZED_PDF_RENDER_FAILED',
          current_attempt_number: 1,
        });
        expect(
          sqlite
            .prepare(
              'SELECT job_id,attempt_number,outcome,failure_class FROM localized_pdf_variant_attempt WHERE variant_id=?',
            )
            .all(variant.variantId),
        ).toEqual([
          { job_id: job.id, attempt_number: 1, outcome: 'failed', failure_class: expectedClass },
        ]);
        expect(() =>
          sqlite
            .prepare('DELETE FROM localized_pdf_variant_attempt WHERE variant_id=?')
            .run(variant.variantId),
        ).toThrow();
        expect(() =>
          sqlite
            .prepare(
              "UPDATE localized_pdf_variant_attempt SET failure_class='changed' WHERE variant_id=?",
            )
            .run(variant.variantId),
        ).toThrow();
        expect(readFileSync(target, 'utf8')).toBe(original);
      } finally {
        sqlite.close();
        restoreIdentity();
      }
    },
  );

  it('does not persist arbitrary renderer messages or convert a lost lease into a failure', () => {
    const root = mkdtempSync(join(tmpdir(), 'ja-localized-pdf-safe-failure-'));
    roots.push(root);
    for (const message of [
      'Renderer failed for /private/customer@example.test.pdf',
      'LEASE_LOST',
    ]) {
      const initial = fakeVariant('daily_report', { summary: 'Controlled failure' });
      const fake = fakeRepository(initial);
      expect(() =>
        runLocalizedPdfVariantJob({
          repository: {
            ...fake.repository,
            completeVariant: () => {
              throw new Error(message);
            },
          },
          payload: { variantId: initial.variantId, requestedAttempt: 1 },
          execution,
          documentRoot: root,
        }),
      ).toThrow(message === 'LEASE_LOST' ? 'LEASE_LOST' : 'HANDLER_FAILED');
      if (message === 'LEASE_LOST') expect(fake.state().failed).toBeUndefined();
      else
        expect(fake.state().failed).toMatchObject({ failureClass: 'LOCALIZED_PDF_RENDER_FAILED' });
    }
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
