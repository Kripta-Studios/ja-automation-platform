import { describe, expect, it } from 'vitest';
import {
  compatibleBillingPeriod,
  suggestedBillingPeriod,
} from '../../apps/portal/src/lib/portal/billing-period-recovery';

describe('compatible billing periods', () => {
  const monthly = { cadence: 'monthly' as const, effectiveFrom: '2026-10-15' };
  it('includes effective day 15 in the initial compatible current cycle', () => {
    expect(suggestedBillingPeriod(monthly, '2026-10-16')).toEqual({
      start: '2026-10-15',
      end: '2026-10-31',
    });
  });
  it('clips the first cycle inclusively and aligns a period ending before effectiveness', () => {
    expect(compatibleBillingPeriod(monthly, { start: '2026-10-01', end: '2026-10-31' })).toEqual({
      start: '2026-10-15',
      end: '2026-10-31',
    });
    expect(compatibleBillingPeriod(monthly, { start: '2026-10-14', end: '2026-10-14' })).toEqual({
      start: '2026-10-15',
      end: '2026-10-31',
    });
  });
  it('respects cadence and both effective boundaries', () => {
    expect(
      compatibleBillingPeriod(
        { ...monthly, effectiveTo: '2026-10-20' },
        { start: '2026-10-15', end: '2026-10-31' },
      ),
    ).toEqual({ start: '2026-10-15', end: '2026-10-20' });
    expect(
      compatibleBillingPeriod(
        { cadence: 'semi_monthly', effectiveFrom: '2026-10-15' },
        { start: '2026-10-15', end: '2026-10-15' },
      ),
    ).toEqual({ start: '2026-10-15', end: '2026-10-15' });
    expect(
      compatibleBillingPeriod(
        { cadence: 'every_14_days', effectiveFrom: '2026-10-15', anchorDate: '2026-10-12' },
        { start: '2026-10-14', end: '2026-10-20' },
      ),
    ).toEqual({ start: '2026-10-15', end: '2026-10-25' });
  });
  it('retains custom dates and refuses missing anchors or impossible dates', () => {
    expect(
      compatibleBillingPeriod(
        { cadence: 'custom', effectiveFrom: '2026-10-15' },
        { start: '2026-10-15', end: '2026-10-16' },
      ),
    ).toEqual({ start: '2026-10-15', end: '2026-10-16' });
    expect(
      compatibleBillingPeriod(
        { cadence: 'every_14_days', effectiveFrom: '2026-10-15' },
        { start: '2026-10-15', end: '2026-10-16' },
      ),
    ).toBeNull();
    expect(compatibleBillingPeriod(monthly, { start: '2026-02-30', end: '2026-03-01' })).toBeNull();
  });
});
