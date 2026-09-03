import { describe, expect, it } from 'vitest';
import {
  runWorkerStatementArtifactJob,
  workerStatementCsv,
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
  it('exports own activity and expected/actual timelines using exact money strings', () => {
    const csv = Buffer.from(workerStatementCsv(snapshot)).toString('utf8');

    expect(csv).toContain('time_activity');
    expect(csv).toContain('Validated the line');
    expect(csv).toContain('420');
    expect(csv).toContain('2026-09-05');
    expect(csv).toContain('2026-09-06');
    expect(csv).toContain('123456789012345678');
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
      templateVersion: 'client-essential-v1',
      generationVersion: 'worker-statement-client-essential-v1',
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
});
