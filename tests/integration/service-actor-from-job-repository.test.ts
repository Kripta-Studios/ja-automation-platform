import { afterEach, describe, expect, it } from 'vitest';
import type { FencedJobExecution } from '../../packages/database/src/domains/jobs/execution-authorization.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

const PERIOD = {
  start: '2026-08-01',
  end: '2026-08-31',
} as const;

function fixture(): B5LifecycleSecurityFixture & { billingRuleId: string } {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const entity = value.repository.createLegalEntity(value.owner, {
    code: 'JOB-FROM-ENTITY',
    legalName: 'Job FromJob Entity',
    currency: 'EUR',
    billingAddress: 'Madrid',
    companyIdentifiers: 'JOB-FROM-TEST',
  });
  const tax = value.repository.createTaxProfile(value.finance, {
    legalEntityId: entity.id,
    name: 'Job FromJob zero tax',
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'Zero tax', basisPoints: 0 }],
  });
  const project = value.repository.createProject(value.owner, {
    clientId: value.client.id,
    name: 'Job FromJob project',
    timezone: 'Europe/Madrid',
    currency: 'EUR',
    billingModel: 'all_in',
    fixedPriceMinor: 10_000n,
    startDate: '2026-01-01',
  });
  const rule = value.repository.createBillingRule(value.finance, {
    projectId: project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    taxProfileId: tax.id,
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
  });
  return { ...value, billingRuleId: rule.id };
}

function enqueue(value: B5LifecycleSecurityFixture, billingRuleId: string): void {
  value.v3.enqueueJob('auto_draft', `from-job:${billingRuleId}`, {
    billingRuleId,
    periodStart: PERIOD.start,
    periodEnd: PERIOD.end,
  });
}

function invoiceCount(value: B5LifecycleSecurityFixture): number {
  return Number(
    (value.sqlite.prepare('SELECT count(*) count FROM invoice').get() as { count: number }).count,
  );
}

describe('real PortalRepository service-job adapters', () => {
  it('creates a draft through createInvoiceDraftFromJob without a human principal', () => {
    const value = fixture();
    enqueue(value, value.billingRuleId);

    expect(
      value.v3.runDueJobs(1, {
        auto_draft: (payload, execution) => {
          const input = payload as {
            billingRuleId: string;
            periodStart: string;
            periodEnd: string;
          };
          value.repository.createInvoiceDraftFromJob(
            input.billingRuleId,
            input.periodStart,
            input.periodEnd,
            execution,
          );
        },
      }),
    ).toEqual({ processed: 1, failed: 0, overdueMarked: 0 });
    expect(invoiceCount(value)).toBe(1);
    expect(
      value.sqlite
        .prepare('SELECT state,subtotal_minor FROM invoice WHERE billing_rule_id=?')
        .get(value.billingRuleId),
    ).toEqual({ state: 'draft', subtotal_minor: 10_000 });
  });

  it('rejects an absent execution proof before opening a draft write', () => {
    const value = fixture();
    expect(() =>
      value.repository.createInvoiceDraftFromJob(
        value.billingRuleId,
        PERIOD.start,
        PERIOD.end,
        undefined as never,
      ),
    ).toThrow('FENCED_JOB_EXECUTION_INVALID');
    expect(invoiceCount(value)).toBe(0);
  });

  it('rejects an absent execution proof before refreshing period reports', () => {
    const value = fixture();
    expect(() =>
      value.v3.refreshPeriodReportsFromJob(
        {
          projectId: value.project.id,
          periodStart: PERIOD.start,
          periodEnd: PERIOD.end,
        },
        undefined as never,
      ),
    ).toThrow('FENCED_JOB_EXECUTION_INVALID');
    expect(value.sqlite.prepare('SELECT count(*) count FROM period_report').get()).toEqual({
      count: 0,
    });
  });

  it.each([
    ['wrong target', (execution: FencedJobExecution) => execution, 'other-billing-rule'],
    [
      'wrong capability',
      (execution: FencedJobExecution) => ({
        ...execution,
        requiredCapability: 'artifact.invoice.render',
      }),
      undefined,
    ],
    [
      'wrong fence',
      (execution: FencedJobExecution) => ({
        ...execution,
        fenceVersion: execution.fenceVersion + 1,
      }),
      undefined,
    ],
  ] as const)('%s leaves the protected draft absent', (_label, mutate, wrongRuleId) => {
    const value = fixture();
    enqueue(value, value.billingRuleId);
    expect(
      value.v3.runDueJobs(1, {
        auto_draft: (payload, execution) => {
          const input = payload as {
            billingRuleId: string;
            periodStart: string;
            periodEnd: string;
          };
          value.repository.createInvoiceDraftFromJob(
            wrongRuleId ?? input.billingRuleId,
            input.periodStart,
            input.periodEnd,
            mutate(execution),
          );
        },
      }),
    ).toEqual({ processed: 0, failed: 1, overdueMarked: 0 });
    expect(invoiceCount(value)).toBe(0);
  });
});
