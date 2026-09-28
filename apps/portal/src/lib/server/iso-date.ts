const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function isRealIsoDate(value: string): boolean {
  const match = isoDatePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= (daysInMonth ?? 0);
}

const padUtc = (value: number): string => String(value).padStart(2, '0');

/** Previous UTC month start through today, so recent operational months remain visible. */
export function defaultLookbackPeriod(now = new Date()): {
  periodStart: string;
  periodEnd: string;
} {
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return {
    periodStart: `${previous.getUTCFullYear()}-${padUtc(previous.getUTCMonth() + 1)}-01`,
    periodEnd: now.toISOString().slice(0, 10),
  };
}

/** Last fully completed UTC calendar month. */
export function previousCompleteMonth(now = new Date()): {
  periodStart: string;
  periodEnd: string;
} {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}
