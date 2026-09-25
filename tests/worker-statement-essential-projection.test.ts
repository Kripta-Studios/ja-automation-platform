import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WORKER_STATEMENT_TEMPLATE_VERSION,
  assertWorkerStatementSnapshot,
  runWorkerStatementArtifactJob,
  workerStatementCsv,
  workerStatementPdf,
  type WorkerStatementJobArtifact,
  type WorkerStatementSnapshot,
} from '@ja/reporting';

const snapshot: WorkerStatementSnapshot = {
  worker: { id: 'worker-own', name: 'Own Worker' },
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  currency: 'EUR',
  approvedMinutes: 420,
  pendingMinutes: 30,
  estimatedApprovedMinor: '123456789012345678',
  estimatedPendingMinor: '2500',
  approvedReimbursementMinor: '1999',
  pendingReimbursementMinor: '500',
  missingCompensationRules: 0,
  activities: [
    {
      id: 'time-own',
      projectNumber: 'P-001',
      projectName: 'Own project',
      date: '2026-08-12',
      category: 'commissioning',
      activitySummary: 'Validated the line',
      actualMinutes: 420,
      approvalState: 'approved',
    },
  ],
  settlements: [
    {
      id: 'settlement-own',
      projectNumber: 'P-001',
      projectName: 'Own project',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amountMinor: '123456789012345678',
      currency: 'EUR',
      state: 'scheduled',
      expectedPaymentOn: '2026-09-05',
      settledAt: null,
    },
  ],
  expenses: [
    {
      id: 'expense-own',
      projectNumber: 'P-001',
      spentOn: '2026-08-13',
      vendor: 'Own vendor',
      category: 'travel',
      reimbursementAmountMinor: '1999',
      currency: 'EUR',
      approvalState: 'approved',
      reimbursementState: 'scheduled',
      expectedReimbursementOn: '2026-09-06',
      reimbursedAt: null,
    },
  ],
};

describe('Client Essential Worker statement allowlist', () => {
  it('accepts legacy snapshots and validates optional clock pairs at the artifact boundary', () => {
    expect(() => assertWorkerStatementSnapshot(snapshot)).not.toThrow();
    const timed = {
      ...snapshot,
      activities: snapshot.activities.map((row) => ({
        ...row,
        startTime: '08:15',
        endTime: '16:15',
        breakMinutes: 60,
      })),
    };
    expect(() => assertWorkerStatementSnapshot(timed)).not.toThrow();
    expect(() =>
      assertWorkerStatementSnapshot({
        ...snapshot,
        activities: timed.activities.map((row) => ({
          ...row,
          breakMinutes: 480,
          actualMinutes: 0,
        })),
      }),
    ).not.toThrow();
    for (const malformed of [
      { startTime: '08:15' },
      { startTime: '25:15', endTime: '16:15' },
      { startTime: '08:15', endTime: '16:15', breakMinutes: -1 },
      { startTime: '08:15', endTime: '16:15', breakMinutes: 0.5 },
      { startTime: '16:15', endTime: '08:15', breakMinutes: 60 },
      { startTime: '08:15', endTime: '08:15', breakMinutes: 0 },
      { startTime: '08:15', endTime: '16:15', breakMinutes: 480 },
      { startTime: '08:15', endTime: '16:15', breakMinutes: 481 },
      { startTime: '08:15', endTime: '16:15', breakMinutes: 60, actualMinutes: 480 },
    ]) {
      expect(() =>
        assertWorkerStatementSnapshot({
          ...snapshot,
          activities: snapshot.activities.map((row) => ({ ...row, ...malformed })),
        }),
      ).toThrow(/SNAPSHOT_INVALID/u);
    }
    expect(() =>
      assertWorkerStatementSnapshot({
        ...snapshot,
        activities: snapshot.activities.map((row) => ({
          ...row,
          startTime: '08:15',
          endTime: '15:15',
        })),
      }),
    ).not.toThrow();
  });

  it('adds interval CSV columns only for actual clocks while preserving net minutes and legacy headers', () => {
    const legacy = Buffer.from(workerStatementCsv(snapshot)).toString('utf8');
    expect(legacy.split('\n')[0]).not.toMatch(/startTime|endTime|breakMinutes/u);
    const timed = {
      ...snapshot,
      activities: snapshot.activities.map((row) => ({
        ...row,
        startTime: '08:15',
        endTime: '16:15',
        breakMinutes: 60,
      })),
    };
    const csv = Buffer.from(workerStatementCsv(timed)).toString('utf8');
    expect(csv.split('\n')[0]).toMatch(/startTime,endTime,breakMinutes/u);
    expect(csv).toContain('08:15,16:15,60');
    expect(csv).toContain('420');
    expect(csv).not.toMatch(/clientRate|internalCost|margin/u);
  });

  it('exports own activity and expected/actual timelines using exact money strings', () => {
    const csv = Buffer.from(workerStatementCsv(snapshot)).toString('utf8');

    expect(csv).toContain('time_activity');
    expect(csv).toContain('Validated the line');
    expect(csv).toContain('420');
    expect(csv).toContain('2026-09-05');
    expect(csv).toContain('2026-09-06');
    expect(csv).toContain('123456789012345678');
  });

  it('renders mixed currencies in separate CSV and PDF totals while retaining legacy single-currency output', () => {
    const mixed: WorkerStatementSnapshot = {
      ...snapshot,
      currency: 'MULTI',
      estimatedApprovedMinor: '0',
      estimatedPendingMinor: '0',
      approvedReimbursementMinor: '0',
      pendingReimbursementMinor: '0',
      currencyBreakdown: [
        {
          currency: 'EUR',
          estimatedApprovedMinor: snapshot.estimatedApprovedMinor,
          estimatedPendingMinor: snapshot.estimatedPendingMinor,
          approvedReimbursementMinor: '0',
          pendingReimbursementMinor: '0',
        },
        {
          currency: 'USD',
          estimatedApprovedMinor: '0',
          estimatedPendingMinor: '0',
          approvedReimbursementMinor: '12345',
          pendingReimbursementMinor: '0',
        },
      ],
      expenses: snapshot.expenses.map((row) => ({
        ...row,
        currency: 'USD',
        reimbursementAmountMinor: '12345',
      })),
    };
    expect(() => assertWorkerStatementSnapshot(mixed)).not.toThrow();
    const csv = Buffer.from(workerStatementCsv(mixed)).toString('utf8');
    expect(csv).toContain('compensation_summary');
    expect(csv).toContain('EUR,123456789012345678');
    expect(csv).toContain('USD,12345');
    expect(csv).not.toContain('MULTI,123456789012345678');
    const legacy = Buffer.from(workerStatementCsv(snapshot)).toString('utf8');
    expect(legacy).toContain('EUR,123456789012345678');

    const directory = mkdtempSync(join(tmpdir(), 'ja-worker-statement-fx-'));
    try {
      const path = join(directory, 'statement.pdf');
      writeFileSync(path, workerStatementPdf(mixed));
      const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
      expect(text).toContain('€1,234,567,890,123,456.78');
      expect(text).toContain('$123.45');
      expect(text).not.toContain('MULTI');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not serialize injected commercial or other-worker properties', () => {
    const tainted = {
      ...snapshot,
      clientRateMinor: 'CLIENT-RATE-SECRET',
      internalCostMinor: 'INTERNAL-COST-SECRET',
      contributionMinor: 'MARGIN-SECRET',
      taxBps: 'TAX-SECRET',
      activities: snapshot.activities.map((row) => ({
        ...row,
        billabilityState: 'CLIENT-TREATMENT-SECRET',
        clientRateMinor: 'CLIENT-RATE-SECRET',
      })),
      expenses: snapshot.expenses.map((row) => ({
        ...row,
        expectedRecoveryOn: 'CLIENT-RECOVERY-SECRET',
        billingTreatment: 'CLIENT-TREATMENT-SECRET',
      })),
      settlements: snapshot.settlements.map((row) => ({
        ...row,
        workerId: 'OTHER-WORKER-SECRET',
      })),
    } as unknown as WorkerStatementSnapshot;

    const csv = Buffer.from(workerStatementCsv(tainted)).toString('utf8');
    expect(csv).not.toMatch(
      /CLIENT-RATE-SECRET|INTERNAL-COST-SECRET|MARGIN-SECRET|TAX-SECRET|CLIENT-RECOVERY-SECRET|CLIENT-TREATMENT-SECRET|OTHER-WORKER-SECRET/u,
    );
    expect(csv).not.toMatch(
      /clientRate|internalCost|contribution|margin|taxBps|expectedRecovery|billingTreatment|workerId.*other/iu,
    );
  });

  it('records renderer diagnostics without allowing unsafe failure text into durable state', () => {
    const artifact: WorkerStatementJobArtifact = {
      artifactId: 'worker-statement-artifact',
      workerId: snapshot.worker.id,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      format: 'csv',
      snapshotJson: JSON.stringify(snapshot),
      storageKey: 'worker-statements/worker/statement.csv',
      semanticFilename: 'ja-worker-statement-own-worker-2026-08-01-2026-08-31.csv',
      templateVersion: WORKER_STATEMENT_TEMPLATE_VERSION,
      generationVersion: `worker-statement-${WORKER_STATEMENT_TEMPLATE_VERSION}`,
      currentAttemptNumber: 1,
      status: 'queued',
    };
    let failure: Readonly<Record<string, unknown>> | undefined;
    const repository = {
      claimWorkerStatementArtifact: () => ({ artifact, attemptNumber: 1 }),
      completeWorkerStatementArtifact: () => artifact,
      failWorkerStatementArtifact: (
        _artifactId: string,
        input: Readonly<Record<string, unknown>>,
      ) => {
        failure = input;
        return artifact;
      },
    };

    expect(() =>
      runWorkerStatementArtifactJob({
        repository,
        payload: { artifactId: artifact.artifactId, requestedAttempt: 1 },
        execution: { jobId: 'job-1', jobRunId: 'run-1', leaseFence: 1 },
        documentRoot: 'unused',
        publish: () => {
          throw new Error('renderer / path\nwith .. unsafe text');
        },
      }),
    ).toThrow('HANDLER_FAILED');
    expect(failure?.errorCode).toBe('WORKER_STATEMENT_RENDER_FAILED');
    expect(failure?.failureClass).toBe('renderer   path with . unsafe text');
  });

  it('terminally rejects a queued statement from an unavailable template version', () => {
    const artifact: WorkerStatementJobArtifact = {
      artifactId: 'worker-statement-stale-version',
      workerId: snapshot.worker.id,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      format: 'csv',
      snapshotJson: JSON.stringify(snapshot),
      storageKey: 'worker-statements/worker/stale.csv',
      semanticFilename: 'ja-worker-statement-stale.csv',
      templateVersion: '2026.09.02.2',
      generationVersion: 'worker-statement-2026.09.02.2',
      currentAttemptNumber: 1,
      status: 'queued',
    };
    let failure: Readonly<Record<string, unknown>> | undefined;
    const repository = {
      claimWorkerStatementArtifact: () => ({ artifact, attemptNumber: 1 }),
      completeWorkerStatementArtifact: () => artifact,
      failWorkerStatementArtifact: (
        _artifactId: string,
        input: Readonly<Record<string, unknown>>,
      ) => {
        failure = input;
        return artifact;
      },
    };

    expect(() =>
      runWorkerStatementArtifactJob({
        repository,
        payload: { artifactId: artifact.artifactId, requestedAttempt: 1 },
        execution: { jobId: 'job-stale', jobRunId: 'run-stale', leaseFence: 1 },
        documentRoot: 'unused',
      }),
    ).toThrow('HANDLER_FAILED');
    expect(failure).toMatchObject({
      errorCode: 'WORKER_STATEMENT_RENDERER_VERSION_UNAVAILABLE',
      failureClass: 'WORKER_STATEMENT_RENDERER_VERSION_UNAVAILABLE',
      retryable: false,
    });
  });
});
