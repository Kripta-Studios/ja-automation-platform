import { documentLanguage, normalizePortalLocale } from './context';
import type { PortalLocale, PortalLocaleInput } from './catalog';

function intlLocale(locale: PortalLocaleInput): string {
  return documentLanguage(normalizePortalLocale(locale));
}

export function formatPortalDate(
  value: Date | string | number,
  locale: PortalLocaleInput,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', ...options }).format(
    date,
  );
}

export function formatPortalNumber(
  value: number,
  locale: PortalLocaleInput,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(intlLocale(locale), { useGrouping: 'always', ...options }).format(
    value,
  );
}

/** `minorUnits` is an integer amount, never a floating-point major-unit value. */
export function formatPortalMoney(
  minorUnits: number | bigint,
  locale: PortalLocaleInput,
  currency: string,
): string {
  const integer = typeof minorUnits === 'bigint' ? minorUnits : BigInt(minorUnits);
  if (typeof minorUnits === 'number' && !Number.isSafeInteger(minorUnits)) {
    throw new RangeError('minorUnits must be a safe integer');
  }

  const currencyFormatter = new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
  });
  const formatter = new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: 'always',
  });
  const fractionDigits = currencyFormatter.resolvedOptions().maximumFractionDigits ?? 0;
  const scale = 10n ** BigInt(fractionDigits);
  const negative = integer < 0n;
  const absolute = negative ? -integer : integer;
  const whole = absolute / scale;
  const fraction =
    fractionDigits === 0 ? '' : (absolute % scale).toString().padStart(fractionDigits, '0');
  const signedWhole = Number(negative ? -whole : whole);
  if (!Number.isSafeInteger(signedWhole))
    throw new RangeError('minorUnits exceeds formatter range');

  const parts = formatter.formatToParts(signedWhole);
  if (fractionDigits === 0) return parts.map((part) => part.value).join('');
  const decimal =
    new Intl.NumberFormat(intlLocale(locale))
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.';
  const lastNumberIndex = parts.reduce(
    (last, candidate, candidateIndex) => (candidate.type === 'integer' ? candidateIndex : last),
    -1,
  );
  const insertionIndex = lastNumberIndex + 1;
  const rendered = parts
    .flatMap((part, index) => {
      return index === insertionIndex ? [{ value: decimal }, { value: fraction }, part] : [part];
    })
    .map((part) => part.value)
    .join('');
  return insertionIndex >= parts.length ? `${rendered}${decimal}${fraction}` : rendered;
}

export function formatPortalDuration(totalMinutes: number, locale: PortalLocale): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '0 h 0 min';
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return locale === 'en' ? `${hours} hr ${minutes} min` : `${hours} h ${minutes} min`;
}

/**
 * Percentage from integer basis points ("1196" → 11.96 %), in the reader's
 * language (decimal comma and spacing for ES/PT). Display only: the digits
 * come straight from the integer, so nothing is rounded (audit T78).
 */
export function formatPortalBps(value: unknown, locale: PortalLocaleInput): string {
  const raw = String(value ?? '').trim();
  if (!/^-?\d+$/.test(raw)) return '—';
  const negative = raw.startsWith('-');
  const digits = (negative ? raw.slice(1) : raw).padStart(3, '0');
  const whole = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
  const fraction = digits.slice(-2);
  // Let Intl decide separator and spacing on a sample, then put exact digits in.
  const parts = new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: 'always',
  }).formatToParts(negative ? -0.0123 : 0.0123);
  const group =
    new Intl.NumberFormat(intlLocale(locale), { useGrouping: 'always' })
      .formatToParts(1000000)
      .find((part) => part.type === 'group')?.value ?? ',';
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return parts
    .map((part) =>
      part.type === 'integer' ? groupedWhole : part.type === 'fraction' ? fraction : part.value,
    )
    .join('');
}
