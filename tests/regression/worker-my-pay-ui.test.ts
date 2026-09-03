import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'apps/portal/src/lib/PortalShell.svelte'),
  'utf8',
);

const payStart = source.indexOf("{:else if data.section === 'pay' && data.pay}");
const payEnd = source.indexOf("data.section === 'projects'", payStart);
const payBranch = source.slice(payStart, payEnd);

describe('Worker My Pay UI', () => {
  it('requests durable period-scoped worker statement artifacts and downloads only ready files', () => {
    expect(source).toContain('fetch(`${base}/app/api/worker-statement`, {');
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('periodStart: data.periodStart');
    expect(source).toContain('periodEnd: data.periodEnd');
    expect(source).toContain('void pollWorkerStatementArtifacts()');
    expect(payBranch).toContain(
      '/app/api/worker-statement/artifacts/${artifact.artifactId}/download',
    );
    expect(payBranch).not.toContain('/app/api/worker-statement/pdf?');
    expect(payBranch).not.toContain('/app/api/worker-statement/csv?');
    expect(payBranch).toContain("translate('Download worker statement PDF')");
    expect(payBranch).toContain("translate('Download worker statement CSV')");
    expect(payBranch).toContain("artifact?.status === 'ready'");
    expect(payBranch).toContain(
      "translate('Queued artifacts are processed automatically in the background.')",
    );
  });

  it('renders own activity detail and expected versus actual settlement dates', () => {
    for (const field of [
      'data.payActivities',
      'activity.activitySummary',
      'activity.actualMinutes',
      'activity.approvalState',
      'settlement.expectedPaymentOn',
      'settlement.settledAt',
    ]) {
      expect(payBranch, `missing Worker My Pay field: ${field}`).toContain(field);
    }
    expect(payBranch).toContain("translate('Own activity detail')");
    expect(payBranch).toContain("translate('Expected payment')");
    expect(payBranch).toContain("translate('Actual payment')");
  });

  it('renders own reimbursement state, expected date, actual date, and amount', () => {
    for (const field of [
      'data.payExpenses',
      'expense.reimbursementState',
      'expense.expectedReimbursementOn',
      'expense.reimbursedAt',
      'expense.reimbursementAmountMinor',
    ]) {
      expect(payBranch, `missing Worker My Pay field: ${field}`).toContain(field);
    }
    expect(payBranch).toContain("translate('Expected reimbursement')");
    expect(payBranch).toContain("translate('Actual reimbursement')");
  });

  it('uses exact money formatting and does not expose Finance-only fields', () => {
    expect(payBranch).toContain('paymentMoney(');
    expect(payBranch).not.toMatch(/\bNumber\s*\(/);
    for (const forbiddenField of [
      'clientTreatment',
      'billingTreatment',
      'taxAmountMinor',
      'fxRateBps',
      'internalCostMinor',
      'clientRateMinor',
      'contributionMarginMinor',
      'otherWorker',
    ]) {
      expect(
        payBranch,
        `Finance-only field leaked to Worker My Pay UI: ${forbiddenField}`,
      ).not.toContain(forbiddenField);
    }
  });

  it('keeps activity, settlement, and reimbursement tables inside the responsive table wrapper', () => {
    expect(payBranch.match(/<TableRegion/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(
      payBranch.match(/class="table-wrap worker-pay-table"/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    expect(payBranch).toContain('aria-labelledby="pay-activity-title"');
    expect(payBranch).toContain('aria-labelledby="pay-reimbursements-title"');
    expect(payBranch).toContain('<caption class="sr-only">');
  });
});
