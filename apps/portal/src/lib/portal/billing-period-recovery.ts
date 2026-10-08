import {
  lastCompletePeriodForCadence,
  isStrictIsoCalendarDate,
  periodForCadence,
  type BillingCadence,
} from '@ja/billing-engine';

export type BillingPeriodStream = Readonly<{
  cadence: BillingCadence;
  effectiveFrom: string;
  effectiveTo?: string;
  anchorDate?: string;
  monthlyCutoffDay?: number;
}>;
export type BillingPeriod = Readonly<{ start: string; end: string }>;

function inWindow(period: BillingPeriod, stream: BillingPeriodStream): BillingPeriod | null {
  const start = period.start < stream.effectiveFrom ? stream.effectiveFrom : period.start;
  const end =
    stream.effectiveTo && period.end > stream.effectiveTo ? stream.effectiveTo : period.end;
  return start <= end ? { start, end } : null;
}

/** First/last cadence periods are partial when an effective window starts/ends mid-cycle.
 * Effective dates are inclusive; the 15th is never advanced to the 16th.
 */
export function compatibleBillingPeriod(
  stream: BillingPeriodStream,
  selected: BillingPeriod,
): BillingPeriod | null {
  if (
    !isStrictIsoCalendarDate(selected.start) ||
    !isStrictIsoCalendarDate(selected.end) ||
    selected.end < selected.start
  )
    return null;
  try {
    const date =
      selected.end < stream.effectiveFrom
        ? stream.effectiveFrom
        : stream.effectiveTo && selected.start > stream.effectiveTo
          ? stream.effectiveTo
          : selected.start < stream.effectiveFrom
            ? stream.effectiveFrom
            : selected.start;
    const cadence = periodForCadence(stream.cadence, date, stream);
    return inWindow(cadence ?? selected, stream);
  } catch {
    return null;
  }
}

export function suggestedBillingPeriod(
  stream: BillingPeriodStream,
  today: string,
): BillingPeriod | null {
  try {
    const completed = lastCompletePeriodForCadence(stream.cadence, today, stream);
    const clipped = completed ? inWindow(completed, stream) : null;
    if (clipped) return clipped;
    // A newly effective stream can have current-cycle work before its first full cycle closes.
    const date = today < stream.effectiveFrom ? stream.effectiveFrom : today;
    const current = periodForCadence(stream.cadence, date, stream);
    return current ? inWindow(current, stream) : null;
  } catch {
    return null;
  }
}
