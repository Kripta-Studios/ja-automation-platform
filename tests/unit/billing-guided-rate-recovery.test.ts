import { expect, it } from 'vitest';
import { ReadinessError } from '@ja/database';
import { billingActionFailure } from '../../apps/portal/src/lib/server/actions/billing-actions';
import {
  billingReadinessReviewPath,
  billingReadinessRecoveryRequest,
} from '../../apps/portal/src/lib/portal/billing-readiness';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

it('points the missing sale rate to its configuration form and retains the dates and source', () => {
  const values = { billingRuleId: 'rule-15', periodStart: '2026-10-15', periodEnd: '2026-10-31' };
  const result = billingActionFailure(
    new ReadinessError([{ code: 'missing_client_rate', sourceId: 'time-15' }]),
    'createDraft',
    'finance_admin',
    values,
  );
  expect(result.data).toMatchObject({
    fieldErrors: { hourlyRateMinor: ['action.billing.readiness.missingClientRate'] },
    values,
    billingRuleId: 'rule-15',
    periodStart: '2026-10-15',
  });
  const route = new URL(
    billingReadinessReviewPath(
      ['missing_client_rate'],
      'project-15',
      { start: values.periodStart, end: values.periodEnd },
      'time-15',
    ),
    'https://example.test',
  );
  expect(route.pathname).toBe('/finance');
  expect(Object.fromEntries(route.searchParams)).toEqual({
    view: 'commercial',
    project: 'project-15',
    from: '2026-10-15',
    to: '2026-10-31',
    task: 'Client labor rate',
    sourceRecord: 'time-15',
  });
  expect(route.hash).toBe('#finance-client-rate');
});

it('keeps pending approval and sale rate remedies independent for the same invoice period', () => {
  const result = billingReadinessRecoveryRequest(
    {
      reasons: [
        { code: 'pending_time_finance_review', sourceId: 'time-pending' },
        { code: 'missing_client_rate', sourceId: 'time-rate' },
      ],
      includedSourceCount: 1,
      timeReadiness: {
        recordCount: 5,
        groups: [
          { status: 'pending_finance_review', recordCount: 1 },
          { status: 'missing_client_rate', recordCount: 1 },
          { status: 'pending_operational_approval', recordCount: 1 },
          { status: 'pending_correction', recordCount: 1 },
          { status: 'eligible', recordCount: 1 },
        ],
      },
    },
    {
      projectId: 'project-15',
      period: { start: '2026-10-01', end: '2026-10-31' },
      portalPath: '/j-aautomation/app',
    },
    (key, params) => portalText('en', key, params),
  );
  expect(result.links).toHaveLength(2);
  const financial = new URL(result.links![0]!.href!, 'https://example.test');
  const rate = new URL(result.links![1]!.href!, 'https://example.test');
  expect(financial.pathname).toBe('/j-aautomation/app/approvals');
  expect(financial.searchParams.get('stage')).toBe('finance');
  expect(financial.hash).toBe('#finance-review');
  expect(rate.pathname).toBe('/j-aautomation/app/finance');
  expect(rate.searchParams.get('sourceRecord')).toBe('time-rate');
  expect(rate.hash).toBe('#finance-client-rate');
  for (const url of [financial, rate]) {
    expect(url.searchParams.get('project')).toBe('project-15');
    expect(url.searchParams.get('from')).toBe('2026-10-01');
    expect(url.searchParams.get('to')).toBe('2026-10-31');
  }
  expect(result.problem.params.counts).toContain('Time records: 5.');
  expect(result.problem.params.counts).toContain(
    'Operationally approved outside correction review: 3.',
  );
  expect(result.problem.params.counts).toContain('Awaiting correction review: 1.');
  expect(result.problem.fieldErrors).toEqual({});
  expect(result.form).toBeUndefined();
});

it('routes unclassified expenses to Finance classification and ambiguous rates to sale rate configuration', () => {
  expect(
    billingReadinessReviewPath(
      ['missing_expense_classification'],
      'p',
      { start: '2026-10-01', end: '2026-10-31' },
      'expense-1',
    ),
  ).toBe(
    '/finance?view=commercial&project=p&from=2026-10-01&to=2026-10-31&expense=expense-1#expense-classification',
  );
  expect(billingReadinessReviewPath(['ambiguous_client_rate'], 'p')).toContain(
    '/finance?view=commercial&project=p',
  );
});

it.each([
  ['missing_internal_cost', 'Internal loaded cost', '#finance-internal-worker'],
  ['missing_compensation_rule', 'Worker compensation', '#finance-comp-worker'],
])(
  'routes %s to the exact worker/date configuration without proposing an amount',
  (code, task, hash) => {
    const request = billingReadinessRecoveryRequest(
      { reasons: [{ code, sourceId: 'accepted-time-1' }], includedSourceCount: 0 },
      {
        projectId: 'project-15',
        period: { start: '2026-10-15', end: '2026-10-31' },
        portalPath: '/app',
      },
      (key, params) => portalText('en', key, params),
    );
    const url = new URL(request.links![0]!.href!, 'https://example.test');
    expect(url.pathname).toBe('/app/finance');
    expect(url.searchParams.get('task')).toBe(task);
    expect(url.searchParams.get('sourceRecord')).toBe('accepted-time-1');
    expect(url.searchParams.get('project')).toBe('project-15');
    expect(url.searchParams.get('from')).toBe('2026-10-15');
    expect(url.searchParams.get('to')).toBe('2026-10-31');
    expect(url.hash).toBe(hash);
    expect(request.problem.params.blockers).not.toContain('action.');
    expect(url.searchParams.has('hourlyRateMinor')).toBe(false);
  },
);
