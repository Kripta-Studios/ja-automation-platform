import { inputTextToMinor, minorDigitsFor, minorToInputText } from '../payment-money';

/** Project budgets are stored as integral minor units and minutes. */
export function minorToProjectAmount(value: string, currency = 'USD'): string {
  if (!/^\d+$/.test(value)) return '';
  // The currency's own decimals: JPY 1500 minor is "1500", USD 1500 minor is "15.00".
  return minorToInputText(value, currency);
}

export function projectAmountToMinor(value: string, currency = 'USD'): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const minor = inputTextToMinor(trimmed, currency);
  return minor === null ? '' : String(minor);
}

/** HTML pattern for a budget amount in this currency (JPY: whole units only). */
export function projectAmountPattern(currency = 'USD'): string {
  const digits = minorDigitsFor(currency);
  return digits === 0 ? '[0-9]+' : `[0-9]+([.,][0-9]{1,${digits}})?`;
}

/** HTML pattern for typed hours: decimals ("7.5", "7,5") or hours:minutes ("8:15"). */
export const HOURS_INPUT_PATTERN = '[0-9]+([.,][0-9]{1,4})?|[0-9]+:[0-5][0-9]';

export function minutesToProjectHours(value: string): string {
  if (!/^\d+$/.test(value)) return '';
  const minutes = Number(value);
  if (!Number.isSafeInteger(minutes)) return '';
  return String(Number((minutes / 60).toFixed(4)));
}

/**
 * Typed hours to whole minutes. Accepts decimals ("7.5", "7,5", up to 4 decimals)
 * and hours:minutes ("8:15" = 495), like the Time screen. No upper bound here:
 * budgets can exceed a day; callers apply their own range.
 */
export function projectHoursToMinutes(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const clock = /^(\d+):([0-5]\d)$/u.exec(trimmed);
  if (clock) {
    const minutes = Number(clock[1]) * 60 + Number(clock[2]);
    return Number.isSafeInteger(minutes) ? String(minutes) : '';
  }
  if (!/^\d+(?:[.,]\d{1,4})?$/.test(trimmed)) return '';
  const minutes = Math.round(Number(trimmed.replace(',', '.')) * 60);
  return Number.isSafeInteger(minutes) ? String(minutes) : '';
}
