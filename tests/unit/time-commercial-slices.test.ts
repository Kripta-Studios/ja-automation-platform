import { describe, expect, it } from 'vitest';
import { deriveTimeCommercialSlices } from '../../packages/database/src/domains/commercial/time-commercial-slices.ts';

type OperationalEntry = Readonly<{
  id: string;
  projectId: string;
  workerId: string;
  workDate: string;
  category: string;
  minutes: number;
  startTime?: string;
  endTime?: string;
}>;

type SliceInput = Readonly<{
  entries: readonly OperationalEntry[];
  policy: Readonly<{
    overtimeEnabled: boolean;
    overtimeThresholdMinutes: number | null;
    travelClientBillable: boolean;
    /**
     * Deliberately present to prove that a commercial minimum is not applied
     * by the time slicer.  Minimum billing is a downstream billing concern.
     */
    minimumBillableMinutes?: number | null;
  }>;
}>;

const basePolicy = {
  overtimeEnabled: true,
  overtimeThresholdMinutes: 600,
  travelClientBillable: true,
} as const;

function entry(
  id: string,
  minutes: number,
  startTime: string,
  endTime: string,
  overrides: Partial<OperationalEntry> = {},
): OperationalEntry {
  return {
    id,
    projectId: 'project-1',
    workerId: 'worker-1',
    workDate: '2026-08-24',
    category: 'regular',
    minutes,
    startTime,
    endTime,
    ...overrides,
  };
}

function minuteTotal(slices: readonly { minutes: number }[]): number {
  return slices.reduce((total, slice) => total + slice.minutes, 0);
}

describe('deriveTimeCommercialSlices', () => {
  it('splits chronological same-worker/project/date actual time at the configured overtime boundary', () => {
    const input: SliceInput = {
      // Deliberately reverse the input order; interval chronology is the
      // authoritative order for a commercial threshold, not request order.
      entries: [entry('evening', 240, '16:00', '20:00'), entry('morning', 480, '08:00', '16:00')],
      policy: basePolicy,
    };

    const slices = deriveTimeCommercialSlices(input);

    expect(slices).toMatchObject([
      {
        sourceEntryId: 'morning',
        operationalCategory: 'regular',
        category: 'regular',
        minutes: 480,
      },
      {
        sourceEntryId: 'evening',
        operationalCategory: 'regular',
        category: 'regular',
        minutes: 120,
      },
      {
        sourceEntryId: 'evening',
        operationalCategory: 'regular',
        category: 'overtime',
        minutes: 120,
      },
    ]);
    expect(minuteTotal(slices)).toBe(720);
    expect(slices.every((slice) => Number.isInteger(slice.minutes))).toBe(true);
  });

  it('resets the overtime threshold for each worker/project/date group', () => {
    const slices = deriveTimeCommercialSlices({
      entries: [
        entry('target-late', 240, '16:00', '20:00'),
        entry('target-early', 480, '08:00', '16:00'),
        entry('other-project', 240, '08:00', '12:00', { projectId: 'project-2' }),
        entry('other-worker', 240, '08:00', '12:00', { workerId: 'worker-2' }),
        entry('other-date', 240, '08:00', '12:00', { workDate: '2026-08-25' }),
      ],
      policy: basePolicy,
    });

    expect(
      slices.filter((slice) => slice.category === 'overtime').map((slice) => slice.sourceEntryId),
    ).toEqual(['target-late']);
    expect(
      slices
        .filter((slice) => slice.category === 'overtime')
        .reduce((total, slice) => total + slice.minutes, 0),
    ).toBe(120);
    expect(minuteTotal(slices)).toBe(1_440);
  });

  it('keeps all actual minutes ordinary when overtime is disabled', () => {
    const slices = deriveTimeCommercialSlices({
      entries: [entry('disabled', 900, '08:00', '23:00')],
      policy: {
        ...basePolicy,
        overtimeEnabled: false,
      },
    });

    expect(slices).toMatchObject([
      {
        sourceEntryId: 'disabled',
        category: 'regular',
        minutes: 900,
      },
    ]);
    expect(slices.some((slice) => slice.category === 'overtime')).toBe(false);
    expect(minuteTotal(slices)).toBe(900);
  });

  it.each([
    ['10-hour', 600, 900, 300],
    ['12-hour', 720, 900, 180],
    ['14-hour', 840, 900, 60],
    ['custom 11-hour', 660, 900, 240],
  ] as const)(
    'accepts the %s configured threshold without changing actual minutes',
    (_label, threshold, actual, overtime) => {
      const slices = deriveTimeCommercialSlices({
        entries: [entry('threshold', actual, '08:00', '23:00')],
        policy: {
          ...basePolicy,
          overtimeThresholdMinutes: threshold,
        },
      });

      expect(minuteTotal(slices)).toBe(actual);
      expect(
        slices
          .filter((slice) => slice.category === 'overtime')
          .reduce((total, slice) => total + slice.minutes, 0),
      ).toBe(overtime);
    },
  );

  it('does not fabricate minimum billable or reference hours', () => {
    const slices = deriveTimeCommercialSlices({
      entries: [entry('short-day', 90, '08:00', '09:30')],
      policy: {
        ...basePolicy,
        overtimeEnabled: false,
        minimumBillableMinutes: 600,
      },
    });

    expect(minuteTotal(slices)).toBe(90);
    expect(slices).toMatchObject([
      {
        sourceEntryId: 'short-day',
        minutes: 90,
      },
    ]);
  });

  it('preserves Travel as an operational category while applying only the project travel billability rule', () => {
    const travel = entry('travel', 90, '08:00', '09:30', { category: 'travel' });

    const billable = deriveTimeCommercialSlices({
      entries: [travel],
      policy: { ...basePolicy, travelClientBillable: true },
    });
    const nonBillable = deriveTimeCommercialSlices({
      entries: [travel],
      policy: { ...basePolicy, travelClientBillable: false },
    });

    expect(billable).toMatchObject([
      {
        sourceEntryId: 'travel',
        operationalCategory: 'travel',
        category: 'regular',
        clientBillable: true,
        minutes: 90,
      },
    ]);
    expect(nonBillable).toMatchObject([
      {
        sourceEntryId: 'travel',
        operationalCategory: 'travel',
        clientBillable: false,
        minutes: 90,
      },
    ]);
  });

  it('does not accept worker compensation or emit money-bearing values', () => {
    const input = {
      entries: [entry('travel', 90, '08:00', '09:30', { category: 'travel' })],
      policy: { ...basePolicy, travelClientBillable: false },
      workerCompensation: {
        travelMethod: 'NONE',
        overtimeMultiplierBps: 25000,
        rateMinor: 999_999,
      },
    };

    const slices = deriveTimeCommercialSlices(input);

    expect(slices).toMatchObject([
      {
        operationalCategory: 'travel',
        clientBillable: false,
        minutes: 90,
      },
    ]);
    for (const slice of slices) {
      expect(slice).not.toHaveProperty('amountMinor');
      expect(slice).not.toHaveProperty('rateMinor');
      expect(slice).not.toHaveProperty('compensationAmountMinor');
      expect(slice).not.toHaveProperty('internalCostMinor');
      expect(slice).not.toHaveProperty('clientRateMinor');
    }
  });

  it('rejects an enabled overtime policy without a positive integer threshold', () => {
    expect(() =>
      deriveTimeCommercialSlices({
        entries: [entry('invalid', 60, '08:00', '09:00')],
        policy: { ...basePolicy, overtimeThresholdMinutes: null },
      }),
    ).toThrow(/overtime threshold/i);

    expect(() =>
      deriveTimeCommercialSlices({
        entries: [entry('invalid', 60, '08:00', '09:00')],
        policy: { ...basePolicy, overtimeThresholdMinutes: 0 },
      }),
    ).toThrow(/overtime threshold/i);
  });

  it('rejects overlapping intervals instead of silently inventing chronological order', () => {
    expect(() =>
      deriveTimeCommercialSlices({
        entries: [entry('first', 120, '08:00', '10:00'), entry('overlap', 120, '09:00', '11:00')],
        policy: basePolicy,
      }),
    ).toThrow(/overlap|ambiguous|chronological/i);
  });
});
