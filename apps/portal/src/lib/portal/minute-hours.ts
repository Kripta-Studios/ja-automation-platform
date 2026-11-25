/**
 * Display integral minutes as decimal hours. Screens show at most two
 * decimals ("9.33", never "9.3333"); every whole minute still round-trips
 * through the hours parser (2 decimals = 0.6 min resolution, so rounding the
 * typed value back to integer minutes is exact). Exports may ask for more.
 */
export function decimalHoursFromMinutes(value: unknown, places: 2 | 4 = 2): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return '—';
  const raw = String(value ?? '').trim();
  if (!/^-?\d+$/u.test(raw)) return '—';
  const minutes = BigInt(raw);
  const absolute = minutes < 0n ? -minutes : minutes;
  const unit = places === 4 ? 10_000n : 100n;
  const scaled = (absolute * unit + 30n) / 60n;
  const whole = (scaled / unit).toString();
  const fraction = (scaled % unit).toString().padStart(places, '0').replace(/0+$/u, '');
  return `${minutes < 0n && scaled > 0n ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** "9:20" style clock text for a minute count. */
export function clockHoursFromMinutes(value: unknown): string {
  const minutes = Number(value);
  if (!Number.isSafeInteger(minutes)) return '—';
  const absolute = Math.abs(minutes);
  return `${minutes < 0 ? '-' : ''}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, '0')}`;
}

/**
 * Decimal hours as a person reads them on screen: the locale's decimal
 * separator ("1,5" in Spanish and Portuguese, "1.5" in English). Inputs and
 * exports keep `decimalHoursFromMinutes`; the hours parser accepts both.
 */
export function localeDecimalHoursFromMinutes(
  value: unknown,
  locale: string | null | undefined,
  places: 2 | 4 = 2,
): string {
  const text = decimalHoursFromMinutes(value, places);
  return locale === 'es' || locale === 'pt' ? text.replace('.', ',') : text;
}
