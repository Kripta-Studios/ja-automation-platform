import { describe, expect, it } from 'vitest';
import { pendingTimeFinanceReviewSourceIds } from '../../packages/database/src/domains/billing/time-finance-review';
import {
  billingReadinessMessageKey,
  billingReadinessRemedyId,
  billingReadinessReviewPath,
} from '../../apps/portal/src/lib/portal/billing-readiness';
import { decimalHoursFromMinutes } from '../../apps/portal/src/lib/portal/minute-hours';

describe('approved time commercial review readiness', () => {
  it('requires Finance classification of unbilled approved/locked time without choosing billability', () => {
    const rows = [
      {
        id: 'approved',
        approval_state: 'approved',
        billability_state: 'pending',
        invoice_id: null,
      },
      {
        id: 'approved',
        approval_state: 'approved',
        billability_state: 'pending',
        invoice_id: null,
      },
      { id: 'locked', approval_state: 'locked', billability_state: 'pending', invoice_id: null },
      { id: 'draft', approval_state: 'draft', billability_state: 'pending', invoice_id: null },
      {
        id: 'billable',
        approval_state: 'approved',
        billability_state: 'billable',
        invoice_id: null,
      },
      {
        id: 'not-billable',
        approval_state: 'approved',
        billability_state: 'non_billable',
        invoice_id: null,
      },
      {
        id: 'invoiced',
        approval_state: 'approved',
        billability_state: 'pending',
        invoice_id: 'historical-invoice',
      },
    ];
    const before = structuredClone(rows);
    expect(pendingTimeFinanceReviewSourceIds(rows)).toEqual(['approved', 'locked']);
    expect(rows).toEqual(before);
  });

  it('provides the commercial review message and project-scoped finance approval link', () => {
    const code = 'pending_time_finance_review';
    expect(billingReadinessMessageKey(code)).toBe(
      'action.billing.readiness.pendingTimeFinanceReview',
    );
    expect(billingReadinessRemedyId(code, 'finance_admin')).toBe('review_pending_records');
    expect(billingReadinessReviewPath([code], 'project & audit')).toBe(
      '/approvals?stage=finance&project=project%20%26%20audit#finance-review',
    );
  });
});

describe('exact minute-based hour display', () => {
  it.each([
    ['135', '2.25'],
    ['30', '0.5'],
    ['60', '1'],
    ['1', '0.0167'],
    ['7', '0.1167'],
    ['59', '0.9833'],
    ['-135', '-2.25'],
    ['0', '0'],
    ['-0', '0'],
    ['9000000000000000000', '150000000000000000'],
  ])('formats %s minutes as %s hours without truncation', (minutes, hours) => {
    expect(decimalHoursFromMinutes(minutes)).toBe(hours);
  });
  it.each([null, undefined, '1.5', 'unknown', Number.MAX_SAFE_INTEGER + 1])(
    'rejects non-integral or unsafe minute values',
    (value) => {
      expect(decimalHoursFromMinutes(value)).toBe('—');
    },
  );
});
