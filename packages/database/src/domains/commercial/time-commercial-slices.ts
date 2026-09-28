/**
 * The time commercial projection is deliberately a small, pure boundary
 * between operational time and downstream commercial calculations.
 *
 * It does not calculate money, worker compensation, minimum billing, tax, or
 * rates.  It only partitions the recorded actual minutes at the configured
 * project threshold and carries the project Travel billability decision.
 */

export type CommercialOperationalEntry = Readonly<{
  id: string;
  projectId: string;
  workerId: string;
  workDate: string;
  category: string;
  minutes: number;
  startTime?: string;
  endTime?: string;
}>;

export type TimeCommercialPolicy = Readonly<{
  overtimeEnabled: boolean;
  overtimeThresholdMinutes: number | null;
  travelClientBillable: boolean;
  // Kept out of the calculation on purpose.  Minimum billing is a downstream
  // billing concern and must never change recorded actual minutes here.
  minimumBillableMinutes?: number | null;
}>;

export type TimeCommercialSlice = Readonly<{
  sourceEntryId: string;
  projectId: string;
  workerId: string;
  workDate: string;
  operationalCategory: string;
  category: 'regular' | 'overtime';
  minutes: number;
  clientBillable: boolean;
  startTime?: string;
  endTime?: string;
}>;

export type TimeCommercialSlicesInput = Readonly<{
  entries: readonly CommercialOperationalEntry[];
  policy: TimeCommercialPolicy;
}>;

type NormalizedEntry = Readonly<{
  entry: CommercialOperationalEntry;
  inputIndex: number;
  startMinute?: number;
  endMinute?: number;
}>;

type EntryGroup = Readonly<{
  key: string;
  entries: readonly NormalizedEntry[];
}>;

const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function parseClock(value: string, field: string): number {
  if (!CLOCK_PATTERN.test(value)) {
    throw new Error(`${field} must use strict HH:mm format`);
  }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function formatClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function assertEntryIdentity(entry: CommercialOperationalEntry): void {
  if (typeof entry.id !== 'string' || entry.id.trim().length === 0)
    throw new Error('Time entry id is required');
  if (typeof entry.projectId !== 'string' || entry.projectId.trim().length === 0)
    throw new Error('Time entry project id is required');
  if (typeof entry.workerId !== 'string' || entry.workerId.trim().length === 0)
    throw new Error('Time entry worker id is required');
  if (typeof entry.workDate !== 'string' || entry.workDate.trim().length === 0)
    throw new Error('Time entry work date is required');
  if (typeof entry.category !== 'string' || entry.category.trim().length === 0)
    throw new Error('Time entry category is required');
}

function normalizeEntry(entry: CommercialOperationalEntry, inputIndex: number): NormalizedEntry {
  assertEntryIdentity(entry);

  if (!Number.isInteger(entry.minutes) || entry.minutes < 0 || entry.minutes > 1440) {
    throw new Error('Time entry minutes must be an integer from 0 to 1440');
  }

  const hasStart = entry.startTime !== undefined;
  const hasEnd = entry.endTime !== undefined;
  if (hasStart !== hasEnd) {
    throw new Error('Start and end time must be provided together');
  }

  if (!hasStart) return { entry, inputIndex };

  const startMinute = parseClock(entry.startTime as string, 'Start time');
  const endMinute = parseClock(entry.endTime as string, 'End time');
  if (endMinute <= startMinute) {
    throw new Error('End time must be later on the same day');
  }

  const elapsedMinutes = endMinute - startMinute;
  if (entry.minutes !== elapsedMinutes) {
    throw new Error('Minutes must equal elapsed time for a supplied interval');
  }

  return { entry, inputIndex, startMinute, endMinute };
}

function groupEntries(entries: readonly CommercialOperationalEntry[]): readonly EntryGroup[] {
  const groups = new Map<string, NormalizedEntry[]>();
  const seenIds = new Set<string>();

  entries.forEach((entry, inputIndex) => {
    const normalized = normalizeEntry(entry, inputIndex);
    if (seenIds.has(entry.id)) throw new Error(`Duplicate time entry id: ${entry.id}`);
    seenIds.add(entry.id);

    const key = `${entry.projectId}\u0000${entry.workerId}\u0000${entry.workDate}`;
    const group = groups.get(key);
    if (group) group.push(normalized);
    else groups.set(key, [normalized]);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => {
      const withIntervals = group.filter(
        (candidate) => candidate.startMinute !== undefined && candidate.endMinute !== undefined,
      );
      if (withIntervals.length !== 0 && withIntervals.length !== group.length) {
        throw new Error(
          'Chronological order is ambiguous when only some time entries have intervals',
        );
      }

      const ordered = [...group].sort((left, right) => {
        if (left.startMinute !== undefined && right.startMinute !== undefined) {
          return (
            left.startMinute - right.startMinute ||
            (left.endMinute as number) - (right.endMinute as number) ||
            left.entry.id.localeCompare(right.entry.id)
          );
        }
        // Untimed records do not provide chronology.  Retain their supplied
        // order for a single source stream; threshold application is then
        // deterministic without inventing clock values.
        return left.inputIndex - right.inputIndex;
      });

      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1]!;
        const current = ordered[index]!;
        if (
          previous.startMinute !== undefined &&
          previous.endMinute !== undefined &&
          current.startMinute !== undefined &&
          current.endMinute !== undefined &&
          previous.endMinute > current.startMinute
        ) {
          throw new Error('Time intervals cannot overlap for the same worker, project and date');
        }
      }

      return { key, entries: ordered };
    });
}

function validatePolicy(policy: TimeCommercialPolicy): void {
  if (typeof policy.overtimeEnabled !== 'boolean')
    throw new Error('Overtime enabled policy must be boolean');
  if (typeof policy.travelClientBillable !== 'boolean')
    throw new Error('Travel client billability policy must be boolean');
  // A disabled policy intentionally does not validate or interpret the stale
  // threshold value.  This lets Finance turn overtime off without making an
  // irrelevant nullable setting a data-entry failure.
  const threshold = policy.overtimeThresholdMinutes;
  if (
    policy.overtimeEnabled &&
    (threshold === null || !Number.isInteger(threshold) || threshold <= 0)
  ) {
    throw new Error('An enabled overtime policy requires a positive integer overtime threshold');
  }
}

function billabilityFor(entry: CommercialOperationalEntry, policy: TimeCommercialPolicy): boolean {
  return entry.category.trim().toLowerCase() === 'travel' ? policy.travelClientBillable : true;
}

/**
 * Derive regular/overtime slices from operational actual time.
 *
 * The threshold is reset independently for each project/worker/work-date
 * group.  Every output minute belongs to exactly one source entry and the
 * sum of output minutes is therefore exactly the sum of input actual time.
 */
export function deriveTimeCommercialSlices(
  input: TimeCommercialSlicesInput,
): readonly TimeCommercialSlice[] {
  validatePolicy(input.policy);
  const groups = groupEntries(input.entries);
  const slices: TimeCommercialSlice[] = [];
  const threshold = input.policy.overtimeEnabled
    ? input.policy.overtimeThresholdMinutes
    : Number.POSITIVE_INFINITY;
  if (threshold === null)
    throw new Error('An enabled overtime policy requires a positive integer overtime threshold');

  for (const group of groups) {
    let consumedMinutes = 0;
    for (const normalized of group.entries) {
      const source = normalized.entry;
      let remainingMinutes = source.minutes;
      let sourceOffset = 0;

      // A zero-minute operational row remains represented, but never creates
      // an overtime slice or changes the threshold.
      if (remainingMinutes === 0) {
        slices.push({
          sourceEntryId: source.id,
          projectId: source.projectId,
          workerId: source.workerId,
          workDate: source.workDate,
          operationalCategory: source.category,
          category: 'regular',
          minutes: 0,
          clientBillable: billabilityFor(source, input.policy),
          ...(normalized.startMinute !== undefined
            ? { startTime: source.startTime, endTime: source.endTime }
            : {}),
        });
        continue;
      }

      while (remainingMinutes > 0) {
        const regularMinutes = Math.max(0, Math.min(remainingMinutes, threshold - consumedMinutes));
        const sliceMinutes = regularMinutes > 0 ? regularMinutes : remainingMinutes;
        const category: 'regular' | 'overtime' = regularMinutes > 0 ? 'regular' : 'overtime';
        const sliceStart =
          normalized.startMinute === undefined ? undefined : normalized.startMinute + sourceOffset;
        const sliceEnd = sliceStart === undefined ? undefined : sliceStart + sliceMinutes;

        slices.push({
          sourceEntryId: source.id,
          projectId: source.projectId,
          workerId: source.workerId,
          workDate: source.workDate,
          operationalCategory: source.category,
          category,
          minutes: sliceMinutes,
          clientBillable: billabilityFor(source, input.policy),
          ...(sliceStart !== undefined && sliceEnd !== undefined
            ? { startTime: formatClock(sliceStart), endTime: formatClock(sliceEnd) }
            : {}),
        });

        remainingMinutes -= sliceMinutes;
        sourceOffset += sliceMinutes;
        consumedMinutes += sliceMinutes;
      }
    }
  }

  return slices;
}
