import { CURRENCY_MINOR_DIGITS, isCurrency } from '@ja/billing-engine';

/** Minor-unit exponent: curated list first (JPY 0), else what Intl knows, else 2. */
export function minorDigitsFor(currency: string): number {
  if (isCurrency(currency)) return CURRENCY_MINOR_DIGITS[currency];
  try {
    return (
      new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
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

/**
 * One locale-tolerant amount parser for typed money (T56). Accepts what the app itself
 * displays in every language: "2940,00", "2940.00", "2.940,00" (pt/es), "2,940.00" (en)
 * and "2 940,00". Returns canonical "2940.00" ("1500" for JPY), or undefined when the
 * text is not an amount. Rules: with both separators the last one is the decimal mark;
 * a separator repeated, or followed by exactly 3 digits, groups thousands; otherwise
 * it is the decimal mark (at most the currency's minor digits).
 */
export function normalizeAmountText(text: unknown, currency = 'USD'): string | undefined {
  if (typeof text !== 'string') return undefined;
  const digits = minorDigitsFor(currency);
  const value = text.trim().replace(/[\s\u00a0\u202f]/gu, '');
  if (!/^\d[\d.,]*$/u.test(value) || /[.,]$/u.test(value)) return undefined;
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  let whole = value;
  let fraction = '';
  const grouped = (part: string) => /^\d{1,3}([.,]\d{3})*$/u.test(part);
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalAt = Math.max(lastComma, lastDot);
    whole = value.slice(0, decimalAt);
    fraction = value.slice(decimalAt + 1);
    const groupMark = value[decimalAt] === ',' ? '.' : ',';
    if (whole.includes(value[decimalAt]!) || !grouped(whole) || whole.includes(groupMark) === false)
      return undefined;
  } else if (lastComma >= 0 || lastDot >= 0) {
    const mark = lastComma >= 0 ? ',' : '.';
    const count = value.split(mark).length - 1;
    const after = value.length - value.lastIndexOf(mark) - 1;
    if (count > 1 || (after === 3 && digits < 3)) {
      if (!grouped(value)) return undefined;
    } else {
      whole = value.slice(0, value.lastIndexOf(mark));
      fraction = value.slice(value.lastIndexOf(mark) + 1);
    }
  }
  whole = whole.replace(/[.,]/gu, '');
  if (!/^\d{1,15}$/u.test(whole)) return undefined;
  if (fraction.length > digits) return undefined;
  whole = whole.replace(/^0+(?=\d)/u, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Typed major units to exact minor units for the currency; null if invalid. */
export const inputTextToMinor = (text: string, currency = 'USD'): bigint | null => {
  const digits = minorDigitsFor(currency);
  const pattern =
    digits === 0 ? /^(\d{1,15})$/u : new RegExp(`^(\\d{1,15})(?:[.,](\\d{1,${digits}}))?$`, 'u');
  const match = pattern.exec(normalizeAmountText(text, currency) ?? String(text ?? '').trim());
  if (!match) return null;
  return (
    BigInt(match[1]!) * 10n ** BigInt(digits) + BigInt((match[2] ?? '').padEnd(digits, '0') || '0')
  );
};

/** HTML pattern attribute for an amount input in this currency. */
export const amountPattern = (currency = 'USD'): string =>
  minorDigitsFor(currency) === 0
    ? '^(\\d+|\\d{1,3}([., ]\\d{3})+)$'
    : `^(\\d+|\\d{1,3}([., ]\\d{3})+)([.,]\\d{1,${minorDigitsFor(currency)}})?$`;
