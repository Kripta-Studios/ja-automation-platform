import { ValidationError } from '@ja/database';
import {
  convertExact,
  currencyMinorDigits,
  exactMoney,
  isCurrency,
  parseMajorToMinor,
  type Currency,
} from '@ja/billing-engine';

/**
 * Exact conversion of a foreign-currency expense, entered at the point of need (invoice
 * preparation). The owner types either the rate the bank/card used ("1 EUR = 1.0834 USD") or
 * the converted amount from the statement; nothing is fetched or guessed. Integer math only:
 * minor units × rate digits, rounded half away from zero once.
 *
 * Minor-unit exponents come from the curated currency list in @ja/money (JPY has 0
 * decimals); the arithmetic is the shared `convertExact` (round half away from zero once).
 */
export type ExpenseConversionEntry = { rate?: string | null; convertedAmount?: string | null };
export type ExactConversion = { projectCurrencyAmountMinor: number; rate: string | null; rateBps: number | null };

const minorDigits = (currency: string) => (isCurrency(currency) ? currencyMinorDigits(currency) : 2);

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
    const parsed = isCurrency(projectCurrency)
      ? parseMajorToMinor(amountText, projectCurrency, { maxWholeDigits: 10 })
      : null;
    if (parsed === null)
      throw new ValidationError(digits === 0 ? 'Enter the converted amount like 2167' : 'Enter the converted amount like 21.67');
    const minor = parsed;
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
  if (!isCurrency(sourceCurrency) || !isCurrency(projectCurrency) || sourceCurrency === projectCurrency)
    throw new ValidationError('Choose a supported currency');
  const minor = convertExact(
    exactMoney(sourceCurrency as Currency, BigInt(sourceAmountMinor)),
    { units: scaled, scale: fraction.length },
    projectCurrency as Currency,
  ).target.minorUnits;
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new ValidationError('Converted amount is invalid');
  const normalized = fraction ? `${BigInt(match[1]!)}.${fraction}` : String(BigInt(match[1]!));
  const bps = fraction.length <= 4 ? scaled * 10n ** BigInt(4 - fraction.length) : null;
  return {
    projectCurrencyAmountMinor: Number(minor),
    rate: normalized,
    rateBps: bps !== null && bps <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bps) : null,
  };
}
