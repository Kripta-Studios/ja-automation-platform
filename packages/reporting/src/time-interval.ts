import { normalizeReportLocale, type ReportLocale } from './report-i18n.ts';

/** Validate recorded same-day wall clocks without timezone conversion. */
export function recordedIntervalMinutes(row: Readonly<Record<string, unknown>>): number | null {
  const start = row.startTime;
  const end = row.endTime;
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
  if (
    typeof start !== 'string' ||
    typeof end !== 'string' ||
    !clock.test(start) ||
    !clock.test(end)
  )
    return null;
  const pause = row.breakMinutes === undefined ? 0 : row.breakMinutes;
  if (typeof pause !== 'number' || !Number.isSafeInteger(pause) || pause < 0) return null;
  const clockMinutes = (value: string): number =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const elapsed = clockMinutes(end) - clockMinutes(start);
  // Historical canonical entries may have a full-interval break and zero net minutes.
  return elapsed > 0 && pause <= elapsed ? elapsed - pause : null;
}

/** Clock values are recorded local wall times, not instants to timezone-convert. */
export function actualTimeInterval(
  row: Readonly<Record<string, unknown>>,
  locale: ReportLocale | string = 'en',
): string {
  const minutes = recordedIntervalMinutes(row);
  const reportedMinutes = row.actualMinutes ?? row.minutes;
  if (minutes === null || (reportedMinutes !== undefined && reportedMinutes !== minutes)) return '';
  const labels = { en: 'Break', es: 'Pausa', pt: 'Intervalo' } as const;
  const pause = row.breakMinutes;
  return `${row.startTime}–${row.endTime}${
    typeof pause === 'number' && Number.isSafeInteger(pause) && pause >= 0
      ? ` · ${labels[normalizeReportLocale(locale)]}: ${pause} min`
      : ''
  }`;
}

export function activityWithInterval(
  activity: string,
  row: Readonly<Record<string, unknown>>,
  locale: ReportLocale | string,
): string {
  const interval = actualTimeInterval(row, locale);
  return interval ? [activity, interval].filter(Boolean).join(' · ') : activity;
}
