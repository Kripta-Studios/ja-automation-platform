/** Display integral minutes as hours, rounded to four decimal places. */
export function decimalHoursFromMinutes(value: unknown): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return '—';
  const raw = String(value ?? '').trim();
  if (!/^-?\d+$/u.test(raw)) return '—';
  const minutes = BigInt(raw);
  const absolute = minutes < 0n ? -minutes : minutes;
  const scaled = (absolute * 10_000n + 30n) / 60n;
  const whole = (scaled / 10_000n).toString();
  const fraction = (scaled % 10_000n).toString().padStart(4, '0').replace(/0+$/u, '');
  return `${minutes < 0n && scaled > 0n ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
