import { localToday } from './time-entry-clock';

export type DatePreset = 'today' | 'week' | 'month' | 'last-month';
/** Calendar arithmetic at local noon avoids UTC and DST shifts in date-only filters. */
export function datePresetRange(
  preset: DatePreset,
  now = new Date(),
): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const end = new Date(start);
  if (preset === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
  } else if (preset === 'month') {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  } else if (preset === 'last-month') {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
  }
  return { from: localToday(start), to: localToday(end) };
}
