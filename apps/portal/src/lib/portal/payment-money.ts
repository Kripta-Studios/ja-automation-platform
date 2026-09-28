/**
 * Format a payment or ledger amount from exact minor-unit text.
 *
 * Payment amounts can exceed JavaScript's safe integer range. Keep the value as
 * BigInt until the integer and fractional display parts have been assembled.
 */
export const paymentMoney = (minor: unknown, currency = 'USD', locale = 'en-US'): string => {
  const raw = String(minor ?? '0').trim();
  if (!/^-?\d+$/.test(raw)) return `— ${currency}`;
  try {
    const amount = BigInt(raw);
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    const whole = absolute / 100n;
    const cents = absolute % 100n;
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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
        if (part.type === 'fraction') return cents.toString().padStart(2, '0');
        if (part.type === 'minusSign') return negative ? part.value : '';
        return part.value;
      })
      .join('');
  } catch {
    return `— ${currency}`;
  }
};
