import {
  add,
  applyBasisPoints,
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
