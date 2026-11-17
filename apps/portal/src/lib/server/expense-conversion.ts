import { ValidationError } from '@ja/database';

/** Positive integer division rounded half up (same rule as @ja/money divideRounded). */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return quotient + ((numerator % denominator) * 2n >= denominator ? 1n : 0n);
}

/**
 * Exact conversion of a foreign-currency expense, entered at the point of need (invoice
 * preparation). The owner types either the rate the bank/card used ("1 EUR = 1.0834 USD") or
 * the converted amount from the statement; nothing is fetched or guessed. Integer math only:
 * minor units × rate digits, rounded half away from zero once.
 *
 * Both sides are assumed to use 2 decimals (USD, EUR, BRL, MXN …); a currency list with other
 * exponents can replace `minorDigits` without changing callers.
 */
export type ExpenseConversionEntry = { rate?: string | null; convertedAmount?: string | null };
export type ExactConversion = { projectCurrencyAmountMinor: number; rate: string | null; rateBps: number | null };

const minorDigits = (_currency: string) => 2;

export function exactExpenseConversion(
  sourceAmountMinor: number,
  sourceCurrency: string,
  projectCurrency: string,
  entry: ExpenseConversionEntry,
): ExactConversion {
  if (!Number.isSafeInteger(sourceAmountMinor) || sourceAmountMinor <= 0)
    throw new ValidationError('Expense amount is invalid');
  const amountText = entry.convertedAmount?.trim().replace(/\s/gu, '').replace(',', '.');
  if (amountText) {
    const digits = minorDigits(projectCurrency);
    const match = new RegExp(`^(\\d{1,10})(?:\\.(\\d{1,${digits}}))?$`, 'u').exec(amountText);
    if (!match) throw new ValidationError('Enter the converted amount like 21.67');
    const minor = BigInt(match[1]!) * 10n ** BigInt(digits) + BigInt((match[2] ?? '').padEnd(digits, '0') || '0');
    if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new ValidationError('Converted amount is invalid');
    return { projectCurrencyAmountMinor: Number(minor), rate: null, rateBps: null };
  }
  const rateText = entry.rate?.trim().replace(/\s/gu, '').replace(',', '.');
  if (!rateText) throw new ValidationError('Enter the exchange rate or the converted amount');
  const match = /^(\d{1,6})(?:\.(\d{1,8}))?$/u.exec(rateText);
  if (!match) throw new ValidationError('Enter the exchange rate like 1.0834');
  const fraction = match[2] ?? '';
  const scaled = BigInt(`${match[1]}${fraction}`);
  if (scaled <= 0n) throw new ValidationError('Exchange rate must be above 0');
  const shift = minorDigits(projectCurrency) - minorDigits(sourceCurrency);
  const numerator = BigInt(sourceAmountMinor) * scaled * 10n ** BigInt(Math.max(0, shift));
  const denominator = 10n ** BigInt(fraction.length) * 10n ** BigInt(Math.max(0, -shift));
  const minor = divideRounded(numerator, denominator);
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new ValidationError('Converted amount is invalid');
  const normalized = fraction ? `${BigInt(match[1]!)}.${fraction}` : String(BigInt(match[1]!));
  const bps = fraction.length <= 4 ? scaled * 10n ** BigInt(4 - fraction.length) : null;
  return {
    projectCurrencyAmountMinor: Number(minor),
    rate: normalized,
    rateBps: bps !== null && bps <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bps) : null,
  };
}
