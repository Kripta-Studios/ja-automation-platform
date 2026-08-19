import {
  add,
  applyBasisPoints,
  divideRounded,
  hourlyRateForMinutes,
  money,
  type Currency,
  type Money,
} from '@ja/money';

export type DateRange = Readonly<{ start: string; end: string }>;
const DAY = 86_400_000;

function utcDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) throw new RangeError(`Invalid date: ${value}`);
  return date;
}

const iso = (date: Date): string => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number): Date => new Date(date.valueOf() + days * DAY);

export function anchoredFourteenDayPeriod(dateValue: string, anchorValue: string): DateRange {
  const date = utcDate(dateValue);
  const anchor = utcDate(anchorValue);
  const elapsedDays = Math.floor((date.valueOf() - anchor.valueOf()) / DAY);
  const periodIndex = Math.floor(elapsedDays / 14);
  const start = addDays(anchor, periodIndex * 14);
  return { start: iso(start), end: iso(addDays(start, 13)) };
}

export function semiMonthlyPeriod(dateValue: string): DateRange {
  const date = utcDate(dateValue);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (date.getUTCDate() <= 15)
    return {
      start: iso(new Date(Date.UTC(year, month, 1))),
      end: iso(new Date(Date.UTC(year, month, 15))),
    };
  return {
    start: iso(new Date(Date.UTC(year, month, 16))),
    end: iso(new Date(Date.UTC(year, month + 1, 0))),
  };
}

export function monthlyPeriod(dateValue: string): DateRange {
  const date = utcDate(dateValue);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    start: iso(new Date(Date.UTC(year, month, 1))),
    end: iso(new Date(Date.UTC(year, month + 1, 0))),
  };
}

export type BillingCadence =
  | 'weekly'
  | 'every_14_days'
  | 'semi_monthly'
  | 'monthly'
  | 'custom'
  | 'milestone'
  | 'manual';

export function weeklyPeriod(dateValue: string, weekStartsOn = 1): DateRange {
  const date = utcDate(dateValue);
  const day = date.getUTCDay();
  const distance = (day - weekStartsOn + 7) % 7;
  const start = addDays(date, -distance);
  return { start: iso(start), end: iso(addDays(start, 6)) };
}

export function periodForCadence(
  cadence: BillingCadence,
  dateValue: string,
  options: Readonly<{ anchorDate?: string; weekStartsOn?: number }> = {},
): DateRange | null {
  switch (cadence) {
    case 'weekly':
      return weeklyPeriod(dateValue, options.weekStartsOn ?? 1);
    case 'every_14_days':
      if (!options.anchorDate) throw new RangeError('Every 14 days requires an anchor date');
      return anchoredFourteenDayPeriod(dateValue, options.anchorDate);
    case 'semi_monthly':
      return semiMonthlyPeriod(dateValue);
    case 'monthly':
      return monthlyPeriod(dateValue);
    case 'custom':
    case 'milestone':
    case 'manual':
      return null;
  }
}

export function billableMinutesForDailyMinimum(
  actualMinutes: number,
  minimumMinutes: number | null | undefined,
): number {
  if (!Number.isInteger(actualMinutes) || actualMinutes < 0)
    throw new RangeError('Actual minutes must be a non-negative integer');
  if (minimumMinutes === null || minimumMinutes === undefined) return actualMinutes;
  if (!Number.isInteger(minimumMinutes) || minimumMinutes < 0)
    throw new RangeError('Minimum minutes must be a non-negative integer');
  return Math.max(actualMinutes, minimumMinutes);
}

export type LaborLine = Readonly<{ minutes: number; hourlyRateMinor: bigint }>;

export function laborSubtotal(currency: Currency, lines: readonly LaborLine[]): Money {
  return lines.reduce(
    (total, line) =>
      add(total, hourlyRateForMinutes(money(currency, line.hourlyRateMinor), line.minutes)),
    money(currency, 0n),
  );
}

export function taxComponents(
  subtotal: Money,
  ratesBasisPoints: readonly number[],
): readonly Money[] {
  return ratesBasisPoints.map((rate) => applyBasisPoints(subtotal, rate));
}

export type TaxComponentRule = Readonly<{
  basisPoints: number;
  compound: boolean;
}>;

export function calculateTaxComponents(
  subtotal: Money,
  components: readonly TaxComponentRule[],
): Readonly<{ components: readonly Money[]; total: Money }> {
  let taxable = subtotal;
  const calculated: Money[] = [];
  for (const component of components) {
    const tax = applyBasisPoints(taxable, component.basisPoints);
    calculated.push(tax);
    if (component.compound) taxable = add(taxable, tax);
  }
  return {
    components: calculated,
    total: calculated.reduce((value, item) => add(value, item), money(subtotal.currency, 0n)),
  };
}

export type OvertimeMethod =
  | 'NONE'
  | 'FIXED_RATE'
  | 'BASE_RATE_MULTIPLIER'
  | 'FIXED_ADDITION_PER_HOUR'
  | 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME';

export function overtimeRate(
  baseRateMinor: bigint,
  method: OvertimeMethod,
  options: Readonly<{
    multiplierBps?: number;
    fixedRateMinor?: bigint;
    fixedAdditionMinor?: bigint;
  }> = {},
): bigint {
  if (baseRateMinor < 0n) throw new RangeError('Base rate must be non-negative');
  switch (method) {
    case 'NONE':
      return baseRateMinor;
    case 'FIXED_RATE':
      if (options.fixedRateMinor === undefined || options.fixedRateMinor < 0n)
        throw new RangeError('Fixed overtime rate is required');
      return options.fixedRateMinor;
    case 'BASE_RATE_MULTIPLIER':
      if (!Number.isInteger(options.multiplierBps) || (options.multiplierBps ?? 0) < 0)
        throw new RangeError('Overtime multiplier is required');
      return divideRounded(baseRateMinor * BigInt(options.multiplierBps ?? 0), 10_000n);
    case 'FIXED_ADDITION_PER_HOUR':
      if (options.fixedAdditionMinor === undefined || options.fixedAdditionMinor < 0n)
        throw new RangeError('Fixed overtime addition is required');
      return baseRateMinor + options.fixedAdditionMinor;
    case 'PERCENTAGE_OF_ELIGIBLE_CLIENT_OVERTIME':
      throw new RangeError('Percentage overtime requires a client-labor basis');
  }
}

export type PercentageLaborBasis = Readonly<{
  currency: Currency;
  eligibleLaborMinor: bigint;
  percentageBps: number;
}>;

export function percentageOfEligibleClientLabor(input: PercentageLaborBasis): Money {
  if (
    !Number.isInteger(input.percentageBps) ||
    input.percentageBps < 0 ||
    input.percentageBps > 10_000
  )
    throw new RangeError('Percentage must be basis points from 0 to 10000');
  if (input.eligibleLaborMinor < 0n) throw new RangeError('Eligible labor must be non-negative');
  return applyBasisPoints(money(input.currency, input.eligibleLaborMinor), input.percentageBps);
}

export type RateCandidate = Readonly<{
  id: string;
  assignmentSpecific: boolean;
  workerSpecific: boolean;
  categorySpecific: boolean;
  activitySpecific: boolean;
  priority: number;
  effectiveFrom: string;
}>;

export function chooseMostSpecificRate<T extends RateCandidate>(
  candidates: readonly T[],
): T | null {
  return (
    [...candidates].sort((left, right) => {
      const specificity = (candidate: RateCandidate) =>
        Number(candidate.assignmentSpecific) * 8 +
        Number(candidate.workerSpecific) * 4 +
        Number(candidate.categorySpecific) * 2 +
        Number(candidate.activitySpecific);
      return (
        specificity(right) - specificity(left) ||
        right.priority - left.priority ||
        right.effectiveFrom.localeCompare(left.effectiveFrom) ||
        left.id.localeCompare(right.id)
      );
    })[0] ?? null
  );
}
