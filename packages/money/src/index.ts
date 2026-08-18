export type Currency = 'USD' | 'BRL' | 'EUR';

export type Money = Readonly<{ currency: Currency; minorUnits: bigint }>;
export type MoneyJson = Readonly<{ currency: Currency; minorUnits: string }>;

export function money(currency: Currency, minorUnits: bigint): Money {
  return { currency, minorUnits };
}

function sameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) throw new Error('Currency mismatch');
}

export function add(left: Money, right: Money): Money {
  sameCurrency(left, right);
  return money(left.currency, left.minorUnits + right.minorUnits);
}

export function subtract(left: Money, right: Money): Money {
  sameCurrency(left, right);
  return money(left.currency, left.minorUnits - right.minorUnits);
}

/** Integer division rounded half away from zero. */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('Denominator must be positive');
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2n >= denominator ? 1n : 0n));
}

export function applyRatio(value: Money, numerator: bigint, denominator: bigint): Money {
  return money(value.currency, divideRounded(value.minorUnits * numerator, denominator));
}

export function hourlyRateForMinutes(rate: Money, minutes: number): Money {
  if (!Number.isInteger(minutes) || minutes < 0)
    throw new RangeError('Minutes must be a non-negative integer');
  return applyRatio(rate, BigInt(minutes), 60n);
}

export function applyBasisPoints(value: Money, basisPoints: number): Money {
  if (!Number.isInteger(basisPoints)) throw new RangeError('Basis points must be an integer');
  return applyRatio(value, BigInt(basisPoints), 10_000n);
}

export const toJson = (value: Money): MoneyJson => ({
  currency: value.currency,
  minorUnits: value.minorUnits.toString(),
});

export const fromJson = (value: MoneyJson): Money =>
  money(value.currency, BigInt(value.minorUnits));
