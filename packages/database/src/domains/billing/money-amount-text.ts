/**
 * T56 (audit 2026-11-22): read a typed money amount the way people write it.
 *
 * "50000", "50,000", "50.000", "2.940,00", "2,940.00", "50 000" and "1234,5" are all
 * accepted. The rule is exact for money with at most two decimals: when both separators
 * appear, the last one is the decimal separator; a single separator kind that repeats, or
 * that is followed by exactly three digits, groups thousands; otherwise (one or two digits
 * after it) it is the decimal separator. Returns the canonical "1234.56" text, or null.
 * No floating point is involved; callers convert to minor units with bigint.
 */
export function canonicalMoneyAmountText(raw: unknown): string | null {
  const text = String(raw ?? '')
    .trim()
    .replace(/[\s  ']/gu, '');
  if (!text || !/^\d[\d.,]*$/u.test(text)) return null;
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  let whole = text;
  let fraction = '';
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    const group = decimalAt === lastDot ? ',' : '.';
    whole = text.slice(0, decimalAt);
    fraction = text.slice(decimalAt + 1);
    if (whole.includes(text[decimalAt]!)) return null;
    if (!/^\d{1,3}(?:\d*|(?:[.,]\d{3})*)$/u.test(whole)) return null;
    if (whole.includes(group) && !new RegExp(`^\\d{1,3}(?:[${group}]\\d{3})+$`, 'u').test(whole))
      return null;
    whole = whole.split(group).join('');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? '.' : ',';
    const parts = text.split(separator);
    const tail = parts.at(-1)!;
    if (parts.length > 2 || tail.length === 3) {
      if (!new RegExp(`^\\d{1,3}(?:[${separator}]\\d{3})+$`, 'u').test(text)) return null;
      whole = parts.join('');
    } else {
      whole = parts[0]!;
      fraction = tail;
    }
  }
  if (!/^\d+$/u.test(whole) || !/^\d{0,2}$/u.test(fraction)) return null;
  const normalizedWhole = whole.replace(/^0+(?=\d)/u, '');
  return fraction ? `${normalizedWhole}.${fraction}` : normalizedWhole;
}
