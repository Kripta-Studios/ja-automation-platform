import { describe, expect, it } from 'vitest';
import {
  billableMinutesForDailyMinimum,
  calculateTaxComponents,
  chooseMostSpecificRate,
  laborSubtotal,
  lastCompletePeriodForCadence,
  overtimeRate,
  percentageOfEligibleClientLabor,
} from '@ja/billing-engine';
import { money } from '@ja/money';

describe('billing engine financial boundaries', () => {
  it('keeps client daily minimum independent from actual minutes', () => {
    expect(billableMinutesForDailyMinimum(180, 600)).toBe(600);
    expect(billableMinutesForDailyMinimum(720, 600)).toBe(720);
    expect(billableMinutesForDailyMinimum(180, null)).toBe(180);
    expect(() => billableMinutesForDailyMinimum(-1, 600)).toThrow();
  });

  it('calculates every supported overtime method with integer rounding', () => {
    expect(overtimeRate(10_000n, 'NONE')).toBe(10_000n);
    expect(overtimeRate(10_000n, 'FIXED_RATE', { fixedRateMinor: 12_500n })).toBe(12_500n);
    expect(overtimeRate(10_000n, 'BASE_RATE_MULTIPLIER', { multiplierBps: 12_500 })).toBe(12_500n);
    expect(overtimeRate(10_001n, 'FIXED_ADDITION_PER_HOUR', { fixedAdditionMinor: 1_999n })).toBe(
      12_000n,
    );
    expect(
      overtimeRate(10_000n, 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME', {
        eligibleClientOvertimeMinor: 24_000n,
        percentageBps: 5_500,
      }),
    ).toBe(13_200n);
    expect(() => overtimeRate(10_000n, 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME')).toThrow();
  });

  it('keeps percentage compensation tied to eligible client labor only', () => {
    expect(
      percentageOfEligibleClientLabor({
        currency: 'USD',
        eligibleLaborMinor: 10_001n,
        percentageBps: 5_500,
      }).minorUnits,
    ).toBe(5_501n);
    expect(() =>
      percentageOfEligibleClientLabor({
        currency: 'USD',
        eligibleLaborMinor: 1n,
        percentageBps: 10_001,
      }),
    ).toThrow();
  });

  it('applies compound taxes and preserves money rounding at minute boundaries', () => {
    const tax = calculateTaxComponents(money('USD', 10_001n), [
      { basisPoints: 500, compound: false },
      { basisPoints: 1000, compound: true },
    ]);
    expect(tax.components.map((item) => item.minorUnits)).toEqual([500n, 1_000n]);
    expect(tax.total.minorUnits).toBe(1_500n);
    expect(
      laborSubtotal('USD', [
        { minutes: 1, hourlyRateMinor: 10_000n },
        { minutes: 59, hourlyRateMinor: 10_000n },
      ]).minorUnits,
    ).toBe(10_000n);
  });

  it('resolves assignment and category specificity deterministically', () => {
    const selected = chooseMostSpecificRate([
      {
        id: 'base',
        assignmentSpecific: false,
        workerSpecific: false,
        categorySpecific: false,
        activitySpecific: false,
        priority: 99,
        effectiveFrom: '2026-08-19',
      },
      {
        id: 'category',
        assignmentSpecific: false,
        workerSpecific: true,
        categorySpecific: true,
        activitySpecific: false,
        priority: 1,
        effectiveFrom: '2026-08-01',
      },
    ]);
    expect(selected?.id).toBe('category');
  });

  it('returns the last complete weekly cadence period before today', () => {
    expect(lastCompletePeriodForCadence('weekly', '2026-09-02')).toEqual({
      start: '2026-08-24',
      end: '2026-08-30',
    });
  });
});
