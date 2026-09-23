import { describe, expect, it } from 'vitest';
import { planningAgenda, planningInterval } from '../../apps/portal/src/lib/portal/planning-agenda';

const assignment = (id: string, starts_at: string, ends_at: string) => ({
  id,
  starts_at,
  ends_at,
  status: 'published',
});
const now = new Date('2026-09-22T12:00:00Z');

describe('Worker planning agenda', () => {
  it('shows every assignment overlapping the UTC day in chronological order', () => {
    const rows = [
      assignment('later', '2026-09-22T16:00:00Z', '2026-09-22T18:00:00Z'),
      assignment('past', '2026-08-01T08:00:00Z', '2026-08-01T16:00:00Z'),
      assignment('overnight', '2026-09-21T22:00:00Z', '2026-09-22T06:00:00Z'),
      assignment('early', '2026-09-22T08:00:00Z', '2026-09-22T10:00:00Z'),
      assignment('spanning', '2026-09-20T08:00:00Z', '2026-09-24T16:00:00Z'),
    ];
    expect(planningAgenda(rows, now).today.map(({ row }) => row.id)).toEqual([
      'spanning',
      'overnight',
      'early',
      'later',
    ]);
    expect(rows[0].id).toBe('later');
  });

  it('uses exclusive interval ends and UTC midnight, independent of supplied offset', () => {
    const rows = [
      assignment('ended', '2026-09-21T22:00:00Z', '2026-09-22T00:00:00Z'),
      assignment('midnight', '2026-09-22T00:00:00Z', '2026-09-22T01:00:00Z'),
      assignment('tomorrow', '2026-09-23T00:00:00Z', '2026-09-23T01:00:00Z'),
      assignment('offset', '2026-09-21T23:30:00-02:00', '2026-09-22T00:30:00-02:00'),
    ];
    const result = planningAgenda(rows, new Date('2026-09-21T22:01:00-02:00'));
    expect(result.today.map(({ row }) => row.id)).toEqual(['midnight', 'offset']);
    expect(result.upcoming.map(({ row }) => row.id)).toEqual(['tomorrow']);
  });

  it('does not truncate future assignments or treat them as Today', () => {
    const result = planningAgenda(
      [
        assignment('far', '2028-01-01T08:00:00Z', '2028-01-01T16:00:00Z'),
        assignment('next', '2026-09-23T08:00:00Z', '2026-09-23T16:00:00Z'),
      ],
      now,
    );
    expect(result.today).toEqual([]);
    expect(result.upcoming.map(({ row }) => row.id)).toEqual(['next', 'far']);
    expect(planningAgenda([], now)).toEqual({ today: [], upcoming: [], invalidCount: 0 });
  });

  it('excludes cancelled, malformed, ambiguous and reversed intervals without crashing', () => {
    const result = planningAgenda(
      [
        {
          ...assignment('cancelled', '2026-09-22T08:00:00Z', '2026-09-22T10:00:00Z'),
          status: 'cancelled',
        },
        assignment('invalid', 'not-a-date', '2026-09-22T10:00:00Z'),
        assignment('impossible', '2026-02-30T08:00:00Z', '2026-03-01T10:00:00Z'),
        assignment('ambiguous', '2026-09-22T08:00:00', '2026-09-22T10:00:00'),
        assignment('reversed', '2026-09-22T11:00:00Z', '2026-09-22T10:00:00Z'),
        assignment('zero', '2026-09-22T10:00:00Z', '2026-09-22T10:00:00Z'),
      ],
      now,
    );
    expect(result).toEqual({ today: [], upcoming: [], invalidCount: 5 });
  });

  it('moves assignments into Today when the UTC calendar advances', () => {
    const row = assignment('next', '2026-09-23T00:00:00Z', '2026-09-23T08:00:00Z');
    expect(planningAgenda([row], new Date('2026-09-22T23:59:59Z')).upcoming).toHaveLength(1);
    expect(planningAgenda([row], new Date('2026-09-23T00:00:00Z')).today).toHaveLength(1);
  });

  it.each(['en', 'es', 'pt-BR'])(
    'formats both dates for overnight work and states UTC (%s)',
    (locale) => {
      const { today } = planningAgenda(
        [assignment('overnight', '2026-09-21T22:30:00Z', '2026-09-22T06:15:00Z')],
        now,
      );
      const label = planningInterval(today[0], locale);
      expect(label).toContain('21');
      expect(label).toContain('22');
      expect(label).toContain('2026');
      expect(label).toContain('22:30');
      expect(label).toContain('06:15');
      expect(label).toMatch(/UTC$/);
    },
  );
});
