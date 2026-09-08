import {
  billableMinutesForDailyMinimum,
  laborSubtotal,
  overtimeRate,
  periodForCadence,
  type BillingCadence,
} from '@ja/billing-engine';
import type { Currency } from '@ja/money';

/** Explicit single-worker example, not a replacement for effective project rate resolution. */
export type CommercialExample = {
  currency: Currency;
  pricing: 'hourly' | 'fixed';
  expenseTreatment: 'included' | 'recoverable' | 'customer_direct';
  workMinutes: number;
  referenceMinutes: number;
  minimumMinutes: number;
  overtimeThresholdMinutes: number | null;
  sellRate: string;
  workerRate: string;
  loadedCostRate: string;
  sellOvertimeBps: number;
  workerOvertimeBps: number;
  costOvertimeBps: number;
  expenseAmount: string;
  workerAdvancedExpense: boolean;
  fixedPrice: string;
};

function decimalMinor(value: string): bigint {
  if (typeof value !== 'string' || !/^\d{1,12}(?:\.\d{1,2})?$/u.test(value))
    throw new RangeError('Enter a non-negative amount with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function minutes(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 1440)
    throw new RangeError(`${label} must be whole minutes between 0 and 1440.`);
  return value;
}

export function previewCommercialExample(input: CommercialExample) {
  if (!['USD', 'EUR', 'BRL'].includes(input.currency)) throw new RangeError('Select a currency.');
  if (!['hourly', 'fixed'].includes(input.pricing)) throw new RangeError('Select a pricing basis.');
  if (!['included', 'recoverable', 'customer_direct'].includes(input.expenseTreatment))
    throw new RangeError('Select the expense responsibility.');
  const actual = minutes(input.workMinutes, 'Actual work');
  minutes(input.referenceMinutes, 'Reference day');
  minutes(input.minimumMinutes, 'Customer minimum');
  if (input.overtimeThresholdMinutes !== null) {
    minutes(input.overtimeThresholdMinutes, 'Overtime threshold');
    if (input.overtimeThresholdMinutes === 0)
      throw new RangeError('Overtime threshold must be positive.');
  }
  for (const multiplier of [input.sellOvertimeBps, input.workerOvertimeBps, input.costOvertimeBps])
    if (!Number.isInteger(multiplier) || multiplier < 0 || multiplier > 100_000)
      throw new RangeError('Overtime multipliers must be between 0 and 10.');
  if (typeof input.workerAdvancedExpense !== 'boolean')
    throw new RangeError('Select the expense payer.');
  if (input.expenseTreatment === 'customer_direct' && input.workerAdvancedExpense)
    throw new RangeError('A customer-direct expense cannot also have been advanced by the worker.');
  const sell = decimalMinor(input.sellRate);
  const pay = decimalMinor(input.workerRate);
  const cost = decimalMinor(input.loadedCostRate);
  const expense = decimalMinor(input.expenseAmount);
  const fixed = decimalMinor(input.fixedPrice);
  const regular = Math.min(actual, input.overtimeThresholdMinutes ?? actual);
  const overtime = actual - regular;
  const subtotal = (rate: bigint, multiplierBps: number) =>
    laborSubtotal(input.currency, [
      { minutes: regular, hourlyRateMinor: rate },
      {
        minutes: overtime,
        hourlyRateMinor: overtimeRate(rate, 'BASE_RATE_MULTIPLIER', { multiplierBps }),
      },
    ]).minorUnits;
  // An unattended zero-work example does not trigger a contractual minimum.
  const topUp =
    input.pricing === 'hourly' && actual > 0
      ? billableMinutesForDailyMinimum(actual, input.minimumMinutes) - actual
      : 0;
  const minimumAmount = laborSubtotal(input.currency, [
    { minutes: topUp, hourlyRateMinor: sell },
  ]).minorUnits;
  const laborRevenue =
    input.pricing === 'fixed' ? fixed : subtotal(sell, input.sellOvertimeBps) + minimumAmount;
  const workerPay = subtotal(pay, input.workerOvertimeBps);
  const loadedLaborCost = subtotal(cost, input.costOvertimeBps);
  const expenseRevenue = input.expenseTreatment === 'recoverable' ? expense : 0n;
  const expenseCost = input.expenseTreatment === 'customer_direct' ? 0n : expense;
  const directCost = loadedLaborCost + expenseCost;
  return {
    currency: input.currency,
    pricing: input.pricing,
    actualMinutes: actual,
    regularMinutes: regular,
    overtimeMinutes: overtime,
    referenceMinutes: input.referenceMinutes,
    minimumAdjustmentMinutes: topUp,
    minimumAdjustmentMinor: minimumAmount.toString(),
    laborRevenueMinor: laborRevenue.toString(),
    expenseRevenueMinor: expenseRevenue.toString(),
    revenueMinor: (laborRevenue + expenseRevenue).toString(),
    workerCompensationMinor: workerPay.toString(),
    loadedLaborCostMinor: loadedLaborCost.toString(),
    expenseCostMinor: expenseCost.toString(),
    directCostMinor: directCost.toString(),
    contributionMinor: (laborRevenue + expenseRevenue - directCost).toString(),
    workerReimbursementMinor: (input.workerAdvancedExpense ? expense : 0n).toString(),
  };
}

export function upcomingBillingPeriods(cadence: BillingCadence, date: string, anchorDate?: string) {
  const options = anchorDate ? { anchorDate } : {};
  const first = periodForCadence(cadence, date, options);
  if (!first) return [];
  const nextDate = new Date(`${first.end}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const second = periodForCadence(cadence, nextDate.toISOString().slice(0, 10), options);
  return second ? [first, second] : [first];
}
