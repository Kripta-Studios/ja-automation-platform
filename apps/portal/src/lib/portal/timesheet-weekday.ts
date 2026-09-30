import { documentLanguage, type PortalLocale } from '../portal-i18n';

/** Localize an ISO calendar day's caption without shifting its date. */
export function timesheetWeekday(date: string, locale: PortalLocale): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '—';
  const value = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value.valueOf()) || value.toISOString().slice(0, 10) !== date) return '—';
  return new Intl.DateTimeFormat(documentLanguage(locale), {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(value);
}
