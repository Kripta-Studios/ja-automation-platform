import { CURRENCY_MINOR_DIGITS, isCurrency } from '@ja/billing-engine';

/** Minor-unit exponent: curated list first (JPY 0), else what Intl knows, else 2. */
export function minorDigitsFor(currency: string): number {
  if (isCurrency(currency)) return CURRENCY_MINOR_DIGITS[currency];
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * Format a payment or ledger amount from exact minor-unit text.
 *
 * Payment amounts can exceed JavaScript's safe integer range. Keep the value as
 * BigInt until the integer and fractional display parts have been assembled.
 * The number of decimals follows the currency (JPY has none).
 */
export const paymentMoney = (minor: unknown, currency = 'USD', locale = 'en-US'): string => {
  const raw = String(minor ?? '0').trim();
  if (!/^-?\d+$/.test(raw)) return `— ${currency}`;
  try {
    const amount = BigInt(raw);
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    const digits = minorDigitsFor(currency);
    const scale = 10n ** BigInt(digits);
    const whole = absolute / scale;
    const fraction = absolute % scale;
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    const integerFormatter = new Intl.NumberFormat(locale, { useGrouping: true });
    const parts = formatter.formatToParts(negative ? -1 : 1);
    const formattedWhole = integerFormatter.format(whole);
    let integerSeen = false;
    return parts
      .map((part) => {
        if (part.type === 'integer') {
          if (integerSeen) return '';
          integerSeen = true;
          return formattedWhole;
        }
        if (part.type === 'fraction') return fraction.toString().padStart(digits, '0');
        if (part.type === 'minusSign') return negative ? part.value : '';
        return part.value;
      })
      .join('');
  } catch {
    return `— ${currency}`;
  }
};

/** Plain input text of exact minor units for the currency ("1234.50", JPY "1500"). */
export const minorToInputText = (minor: unknown, currency = 'USD'): string => {
  const raw = String(minor ?? '').trim();
  if (!/^\d+$/u.test(raw)) return '';
  const digits = minorDigitsFor(currency);
  if (digits === 0) return BigInt(raw).toString();
  const padded = raw.padStart(digits + 1, '0');
  return `${padded.slice(0, -digits).replace(/^0+(?=\d)/u, '')}.${padded.slice(-digits)}`;
};

/** Typed major units to exact minor units for the currency; null if invalid. */
export const inputTextToMinor = (text: string, currency = 'USD'): bigint | null => {
  const digits = minorDigitsFor(currency);
  const pattern =
    digits === 0 ? /^(\d{1,15})$/u : new RegExp(`^(\\d{1,15})(?:[.,](\\d{1,${digits}}))?$`, 'u');
  const match = pattern.exec(String(text ?? '').trim());
  if (!match) return null;
  return BigInt(match[1]!) * 10n ** BigInt(digits) + BigInt((match[2] ?? '').padEnd(digits, '0') || '0');
};

/** HTML pattern attribute for an amount input in this currency. */
export const amountPattern = (currency = 'USD'): string =>
  minorDigitsFor(currency) === 0 ? '^\\d+$' : `^\\d+([.,]\\d{1,${minorDigitsFor(currency)}})?$`;
