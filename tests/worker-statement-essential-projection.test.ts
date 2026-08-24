import { describe, expect, it } from 'vitest';
import { workerStatementCsv, type WorkerStatementSnapshot } from '@ja/reporting';

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
});
