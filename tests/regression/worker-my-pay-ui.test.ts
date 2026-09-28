import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

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
      '/app/api/worker-statement/artifacts/${encodeURIComponent(artifact.artifactId)}/download',
    );
    expect(payBranch).not.toContain('/app/api/worker-statement/pdf?');
    expect(payBranch).not.toContain('/app/api/worker-statement/csv?');
    expect(payBranch).toContain("translate('Download worker statement PDF')");
    expect(payBranch).toContain("translate('Download worker statement CSV')");
    expect(payBranch).toContain("artifact?.status === 'ready'");
    expect(payBranch).toContain("portalText(locale, 'problem.workerStatement.queued')");
  });

  it('keeps the selected pay period in status remedies and hides exhausted retries', () => {
    expect(source).toContain('workerStatementPeriodHref');
    expect(source).toContain('encodeURIComponent(data.periodStart');
    expect(source).toContain('encodeURIComponent(data.periodEnd');
    expect(payBranch.match(/href: workerStatementPeriodHref/g)?.length).toBe(2);
    expect(payBranch).toContain('{#if canRetryWorkerStatement(artifact)}');
    expect(source).toContain('artifact.currentAttemptNumber < artifact.maxAttempts');
  });

  it('renders own activity detail and expected versus actual settlement dates', () => {
    for (const field of [
      'data.payActivities',
      'activity.activitySummary',
      'activity.actualMinutes',
      'activity.approvalState',
      'settlement.expectedPaymentOn',
      'settlement.actualPaymentOn',
    ]) {
      expect(payBranch, `missing Worker My Pay field: ${field}`).toContain(field);
    }
    expect(payBranch).toContain("translate('Own activity detail')");
    expect(payBranch).toContain("translate('Expected payment')");
    expect(payBranch).toContain("translate('Latest actual payment')");
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
    expect(payBranch).not.toMatch(/paymentMoney\(\s*Number\s*\(/);
    expect(payBranch).toContain('Number(activity.breakMinutes ?? 0) > 0');
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

  it('explains missing compensation rules in each locale and gives workers a role-safe remedy', () => {
    expect(source).toContain('WORKER_PAY_MISSING_COMPENSATION_RULE');
    expect(payBranch).toContain('missingCompensationRuleProblem(data.pay.missingCompensationRules');
    expect(payBranch).toContain(
      "contact_finance_owner: { label: translate('Contact Finance or an owner') }",
    );
    expect(payBranch).not.toContain('time record(s) have no matching compensation rule');

    for (const locale of ['en', 'es', 'pt'] as const) {
      const one = portalText(locale, 'problem.warning.workerPayMissingCompensationRuleOne', {
        count: 1,
      });
      const many = portalText(locale, 'problem.warning.workerPayMissingCompensationRuleMany', {
        count: 2,
      });
      expect(one).not.toContain('{count}');
      expect(one).not.toMatch(/record\(s\)/u);
      expect(many).toContain('2');
      expect(many).not.toContain('{count}');
      expect(portalText(locale, 'Contact Finance or an owner').length).toBeGreaterThan(10);
    }
  });
});
