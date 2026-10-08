import { expect, it } from 'vitest';
import { ReadinessError } from '@ja/database';
import { billingActionFailure } from '../../apps/portal/src/lib/server/actions/billing-actions';
import { billingReadinessReviewPath } from '../../apps/portal/src/lib/portal/billing-readiness';

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
