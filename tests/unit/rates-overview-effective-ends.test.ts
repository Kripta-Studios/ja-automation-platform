import { describe, expect, it } from 'vitest';
import {
  isNegativeMargin,
  withEffectiveRuleEnds,
} from '../../apps/portal/src/lib/server/rates-overview';
import type { RateRuleRow } from '../../apps/portal/src/lib/portal/money-overview-types';

const rule = (id: string, overrides: Partial<RateRuleRow>): RateRuleRow => ({
  id,
  kind: 'pay',
  projectId: 'p',
  projectLabel: 'P',
  workerId: 'w',
  workerName: 'Gabriel Lamoglia',
  category: null,
  currency: 'USD',
  rateMinor: '5500',
  basis: 'hourly',
  effectiveFrom: '2026-11-01',
  effectiveTo: '2026-12-20',
  status: 'current',
  ...overrides,
});

describe('rates overview (audit 2026-11-22 T62)', () => {
  it('shows a superseded rule ending the day before its replacement', () => {
    const rows = withEffectiveRuleEnds(
      [
        rule('old', {}),
        rule('new', { rateMinor: '4500', effectiveFrom: '2026-12-01', status: 'scheduled' }),
        rule('cost', { kind: 'cost', effectiveFrom: '2026-11-01', effectiveTo: null }),
      ],
      '2026-11-24',
    );
    expect(rows[0]).toMatchObject({ effectiveTo: '2026-11-30', replacedFrom: '2026-12-01', status: 'current' });
    expect(rows[1]).toMatchObject({ effectiveTo: '2026-12-20', status: 'scheduled' });
    expect(rows[1].replacedFrom).toBeUndefined();
    // A different scope (cost) is never cut by a pay rule.
    expect(rows[2]).toMatchObject({ effectiveTo: null });
  });

  it('marks the replaced rule ended once the replacement applies', () => {
    const rows = withEffectiveRuleEnds(
      [rule('old', { effectiveTo: null }), rule('new', { effectiveFrom: '2026-11-22', effectiveTo: null })],
      '2026-11-24',
    );
    expect(rows[0]).toMatchObject({ effectiveTo: '2026-11-21', status: 'ended' });
    expect(rows[1]).toMatchObject({ effectiveTo: null, status: 'current' });
  });

  it('flags people who cost more per hour than the client is charged', () => {
    const base = { clientRateMinor: '5000', clientRateBasis: 'hourly', payType: 'Hourly' };
    expect(isNegativeMargin({ ...base, payRateMinor: '5500', costRateMinor: null })).toBe(true);
    expect(isNegativeMargin({ ...base, payRateMinor: '5500', costRateMinor: '4000' })).toBe(false);
    expect(isNegativeMargin({ ...base, payRateMinor: '2500', costRateMinor: null })).toBe(false);
    expect(
      isNegativeMargin({ ...base, payRateMinor: '900000', payType: 'FixedPerBillingPeriod', costRateMinor: null }),
    ).toBe(false);
    expect(isNegativeMargin({ ...base, clientRateBasis: 'daily', payRateMinor: '9000', costRateMinor: null })).toBe(
      false,
    );
  });
});
