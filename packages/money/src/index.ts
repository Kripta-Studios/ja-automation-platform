/**
 * Curated ISO 4217 currencies the portal accepts for projects, clients, rates,
 * expenses, invoices and payments. J&A works in the Americas and Europe; the
 * list is deliberately short so pickers stay simple. Order = picker order.
 */
export const CURRENCIES = [
  'USD',
  'EUR',
  'MXN',
  'BRL',
  'CAD',
  'GBP',
  'CHF',
  'ARS',
  'CNY',
  'JPY',
] as const;

export type Currency = (typeof CURRENCIES)[number];

/** Minor-unit exponent per currency (ISO 4217). JPY has no minor unit. */
export const CURRENCY_MINOR_DIGITS: Readonly<Record<Currency, number>> = Object.freeze({
  USD: 2,
  EUR: 2,
  MXN: 2,
  BRL: 2,
  CAD: 2,
  GBP: 2,
  CHF: 2,
  ARS: 2,
  CNY: 2,
  JPY: 0,
});

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/** Number of decimals of one minor unit; throws for an unsupported code. */
export function currencyMinorDigits(currency: string): number {
  if (!isCurrency(currency)) throw new RangeError(`Unsupported currency ${currency}`);
  return CURRENCY_MINOR_DIGITS[currency];
}

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

/**
 * Sum amounts per currency. Never mixes currencies: the result has one exact
 * total per currency, in first-seen order.
 */
export function totalsByCurrency(
  values: Iterable<Readonly<{ currency: string; minorUnits: bigint }>>,
): Array<{ currency: string; minorUnits: bigint }> {
  const totals = new Map<string, bigint>();
  for (const value of values)
    totals.set(value.currency, (totals.get(value.currency) ?? 0n) + value.minorUnits);
  return [...totals].map(([currency, minorUnits]) => ({ currency, minorUnits }));
}

/**
 * Parse a typed major-unit amount ("1234", "1234.5", "1234,56") into exact
 * minor units for `currency`. No grouping separators, no sign. JPY accepts
 * whole numbers only. Returns null when the text is not a valid amount.
 */
export function parseMajorToMinor(
  text: string,
  currency: string,
  options: Readonly<{ maxWholeDigits?: number }> = {},
): bigint | null {
  if (!isCurrency(currency)) return null;
  const digits = CURRENCY_MINOR_DIGITS[currency];
  const maxWhole = options.maxWholeDigits ?? 12;
  const normalized = String(text ?? '').trim();
  const pattern =
    digits === 0
      ? new RegExp(`^(\\d{1,${maxWhole}})$`, 'u')
      : new RegExp(`^(\\d{1,${maxWhole}})(?:[.,](\\d{1,${digits}}))?$`, 'u');
  const match = pattern.exec(normalized);
  if (!match) return null;
  const whole = BigInt(match[1]!);
  const fraction = digits === 0 ? 0n : BigInt((match[2] ?? '').padEnd(digits, '0') || '0');
  return whole * 10n ** BigInt(digits) + fraction;
}

/** Plain machine/input form of exact minor units: "1234.56", "-0.05", "1500" (JPY). */
export function formatMinorPlain(minorUnits: bigint | number | string, currency: string): string {
  const value = BigInt(minorUnits);
  const digits = currencyMinorDigits(currency);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  if (digits === 0) return `${negative ? '-' : ''}${absolute}`;
  const scale = 10n ** BigInt(digits);
  return `${negative ? '-' : ''}${absolute / scale}.${(absolute % scale)
    .toString()
    .padStart(digits, '0')}`;
}

/* ------------------------------------------------------------------------ */
/* Exact decimal rates and currency conversion                              */
/* ------------------------------------------------------------------------ */

/** A positive exact decimal as a fraction numerator / 10^scale. */
export type ExactDecimal = Readonly<{ units: bigint; scale: number }>;

const MAX_RATE_SCALE = 12;

/** Parse a positive decimal rate such as "0.0544", "19.8765", "1". Rejects 0, signs, exponents. */
export function parseRate(text: string): ExactDecimal | null {
  const match = /^(\d{1,9})(?:[.,](\d{1,12}))?$/u.exec(String(text ?? '').trim());
  if (!match) return null;
  const fraction = (match[2] ?? '').replace(/0+$/u, '');
  const units = BigInt(`${match[1]}${fraction}` || '0');
  if (units <= 0n) return null;
  return { units, scale: fraction.length };
}

/** Canonical text of an exact decimal ("0.0544", "20"). */
export function formatDecimal(value: ExactDecimal): string {
  if (value.scale === 0) return value.units.toString();
  const scale = 10n ** BigInt(value.scale);
  const fraction = (value.units % scale).toString().padStart(value.scale, '0').replace(/0+$/u, '');
  return fraction ? `${value.units / scale}.${fraction}` : `${value.units / scale}`;
}

/**
 * Divide two exact decimals, rounding half away from zero to `scale` decimals
 * (used for ECB cross rates: from→to = (EUR→to) / (EUR→from)).
 */
export function divideDecimals(
  numerator: ExactDecimal,
  denominator: ExactDecimal,
  scale = 10,
): ExactDecimal {
  if (denominator.units <= 0n) throw new RangeError('Denominator must be positive');
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_RATE_SCALE)
    throw new RangeError('Unsupported rate scale');
  // n/10^a ÷ d/10^b = n·10^b / (d·10^a); scale by 10^scale.
  const top = numerator.units * 10n ** BigInt(denominator.scale) * 10n ** BigInt(scale);
  const bottom = denominator.units * 10n ** BigInt(numerator.scale);
  const units = divideRounded(top, bottom);
  return normalizeDecimal({ units, scale });
}

function normalizeDecimal(value: ExactDecimal): ExactDecimal {
  let { units, scale } = value;
  while (scale > 0 && units % 10n === 0n) {
    units /= 10n;
    scale -= 1;
  }
  return { units, scale };
}

/**
 * ECB publishes "1 EUR = x QUOTE". Return the exact-decimal rate for
 * 1 `from` = r `to`, given both EUR legs (EUR itself has rate 1).
 */
export function crossRate(
  from: string,
  to: string,
  eurRates: Readonly<Record<string, string>>,
  scale = 10,
): ExactDecimal | null {
  if (from === to) return { units: 1n, scale: 0 };
  const leg = (code: string): ExactDecimal | null =>
    code === 'EUR' ? { units: 1n, scale: 0 } : eurRates[code] ? parseRate(eurRates[code]!) : null;
  const eurFrom = leg(from);
  const eurTo = leg(to);
  if (!eurFrom || !eurTo) return null;
  return divideDecimals(eurTo, eurFrom, scale);
}

export type ExactConversion = Readonly<{
  source: Money;
  target: Money;
  /** 1 source currency unit = rate target currency units (canonical decimal text). */
  rate: string;
}>;

/**
 * Convert an exact amount with an exact decimal rate (1 source = rate target),
 * honouring both currencies' minor-unit exponents, rounding half away from
 * zero once. Never uses floating point.
 *
 *   convertExact(money('MXN', 100_000n), '0.0544', 'USD') -> 54.40 USD (5_440n)
 *   convertExact(money('USD', 1_000n), '151.37', 'JPY')   -> 1,514 JPY (1_514n)
 */
export function convertExact(source: Money, rate: string | ExactDecimal, to: Currency): ExactConversion {
  if (!isCurrency(source.currency) || !isCurrency(to)) throw new RangeError('Unsupported currency');
  if (source.currency === to) throw new RangeError('Source and target currency are the same');
  const parsed = typeof rate === 'string' ? parseRate(rate) : rate;
  if (!parsed || parsed.units <= 0n) throw new RangeError('Rate must be a positive decimal');
  const fromDigits = BigInt(CURRENCY_MINOR_DIGITS[source.currency]);
  const toDigits = BigInt(CURRENCY_MINOR_DIGITS[to]);
  // target_minor = source_minor / 10^fromDigits · rate · 10^toDigits
  const numerator = source.minorUnits * parsed.units * 10n ** toDigits;
  const denominator = 10n ** BigInt(parsed.scale) * 10n ** fromDigits;
  return {
    source,
    target: money(to, divideRounded(numerator, denominator)),
    rate: formatDecimal(normalizeDecimal(parsed)),
  };
}

/**
 * The exact rate implied by a manually typed converted amount
 * (target / source, `scale` decimals), used to show/audit an edited amount.
 */
export function impliedRate(source: Money, target: Money, scale = 10): string {
  if (source.minorUnits <= 0n || target.minorUnits < 0n) throw new RangeError('Amounts must be positive');
  const fromDigits = CURRENCY_MINOR_DIGITS[source.currency];
  const toDigits = CURRENCY_MINOR_DIGITS[target.currency];
  return formatDecimal(
    divideDecimals(
      { units: target.minorUnits, scale: toDigits },
      { units: source.minorUnits, scale: fromDigits },
      scale,
    ),
  );
}
