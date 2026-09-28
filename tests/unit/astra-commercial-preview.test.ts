import { describe, expect, it } from 'vitest';
import {
  previewCommercialExample,
  upcomingBillingPeriods,
  type CommercialExample,
} from '../../apps/portal/src/lib/server/commercial-preview.ts';

const example: CommercialExample = {
  currency: 'USD',
  pricing: 'hourly',
  expenseTreatment: 'included',
  workMinutes: 480,
  referenceMinutes: 720,
  minimumMinutes: 0,
  overtimeThresholdMinutes: null,
  sellRate: '120',
  workerRate: '55',
  loadedCostRate: '65',
  sellOvertimeBps: 16000,
  workerOvertimeBps: 20000,
  costOvertimeBps: 20000,
  expenseAmount: '190',
  workerAdvancedExpense: true,
  fixedPrice: '1500',
};

describe('agreement example uses exact billing primitives without writing project truth', () => {
  it('separates hourly included, recoverable and customer-direct expenses', () => {
    expect(previewCommercialExample(example)).toMatchObject({
      actualMinutes: 480,
      revenueMinor: '96000',
      workerCompensationMinor: '44000',
      directCostMinor: '71000',
      contributionMinor: '25000',
      workerReimbursementMinor: '19000',
    });
    expect(previewCommercialExample({ ...example, expenseTreatment: 'recoverable' })).toMatchObject(
      {
        laborRevenueMinor: '96000',
        expenseRevenueMinor: '19000',
        revenueMinor: '115000',
        directCostMinor: '71000',
        contributionMinor: '44000',
      },
    );
    expect(
      previewCommercialExample({
        ...example,
        expenseTreatment: 'customer_direct',
        workerAdvancedExpense: false,
      }),
    ).toMatchObject({
      revenueMinor: '96000',
      directCostMinor: '52000',
      workerReimbursementMinor: '0',
    });
  });
  it('preserves four actual hours and independent pay under a twelve-hour reference and eight-hour minimum', () => {
    expect(
      previewCommercialExample({
        ...example,
        workMinutes: 240,
        minimumMinutes: 480,
        sellRate: '100',
        workerRate: '50',
        loadedCostRate: '60',
        expenseAmount: '0',
      }),
    ).toMatchObject({
      actualMinutes: 240,
      referenceMinutes: 720,
      minimumAdjustmentMinutes: 240,
      laborRevenueMinor: '80000',
      workerCompensationMinor: '20000',
      directCostMinor: '24000',
      contributionMinor: '56000',
    });
    expect(
      previewCommercialExample({ ...example, workMinutes: 0, minimumMinutes: 480 }),
    ).toMatchObject({
      laborRevenueMinor: '0',
      workerCompensationMinor: '0',
      minimumAdjustmentMinutes: 0,
    });
  });
  it('applies independent total overtime multipliers without adding pay twice to loaded cost', () => {
    expect(
      previewCommercialExample({
        ...example,
        workMinutes: 720,
        overtimeThresholdMinutes: 480,
        sellRate: '100',
        workerRate: '50',
        loadedCostRate: '60',
        expenseAmount: '0',
      }),
    ).toMatchObject({
      actualMinutes: 720,
      overtimeMinutes: 240,
      laborRevenueMinor: '144000',
      workerCompensationMinor: '80000',
      directCostMinor: '96000',
      contributionMinor: '48000',
    });
  });
  it('keeps fixed labour explicitly distinct without altering actual hours or compensation', () => {
    expect(
      previewCommercialExample({ ...example, pricing: 'fixed', minimumMinutes: 720 }),
    ).toMatchObject({
      actualMinutes: 480,
      laborRevenueMinor: '150000',
      workerCompensationMinor: '44000',
      minimumAdjustmentMinutes: 0,
    });
  });
  it('rounds fractional-hour money with the shared exact-money policy', () => {
    expect(
      previewCommercialExample({ ...example, workMinutes: 1, sellRate: '0.30', expenseAmount: '0' })
        .laborRevenueMinor,
    ).toBe('1');
  });
  it('rejects ambiguous payer, malformed or negative rates and invalid durations', () => {
    expect(() =>
      previewCommercialExample({ ...example, expenseTreatment: 'customer_direct' }),
    ).toThrow(/cannot also/);
    for (const sellRate of ['NaN', '-1', '1e3', '1.001', '1,000'])
      expect(() => previewCommercialExample({ ...example, sellRate })).toThrow();
    expect(() => previewCommercialExample({ ...example, workMinutes: 1441 })).toThrow();
    expect(() => previewCommercialExample({ ...example, overtimeThresholdMinutes: 0 })).toThrow();
  });
  it('distinguishes anchored fortnightly and semi-monthly windows including leap year', () => {
    expect(upcomingBillingPeriods('every_14_days', '2026-09-01', '2026-09-01')).toEqual([
      { start: '2026-09-01', end: '2026-09-14' },
      { start: '2026-09-15', end: '2026-09-28' },
    ]);
    expect(upcomingBillingPeriods('semi_monthly', '2028-02-01')).toEqual([
      { start: '2028-02-01', end: '2028-02-15' },
      { start: '2028-02-16', end: '2028-02-29' },
    ]);
    expect(() => upcomingBillingPeriods('every_14_days', '2026-09-01')).toThrow(/anchor/);
    expect(() => upcomingBillingPeriods('monthly', '2026-02-30')).toThrow();
  });
});
