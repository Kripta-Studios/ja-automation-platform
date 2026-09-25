import { describe, expect, it } from 'vitest';
import { mondayOf, weeklyView, type WeeklyProjectSchedule } from '$lib/server/portal-week';

const schedule = (overrides: Partial<WeeklyProjectSchedule> = {}): WeeklyProjectSchedule => ({
  project_id: 'project-a',
  effective_from: '2026-08-10',
  effective_to: null,
  monday_minutes: 600,
  tuesday_minutes: 600,
  wednesday_minutes: 600,
  thursday_minutes: 600,
  friday_minutes: 600,
  saturday_minutes: 0,
  sunday_minutes: 0,
  ...overrides,
});

describe('Worker weekly planning projection', () => {
  it('does not normalize an impossible week query into a different calendar date', () => {
    expect(mondayOf('2026-02-30')).toBe(mondayOf(null));
  });

  it('does not count rejected or void history as worked time or a day needing changes', () => {
    const view = weeklyView(
      [
        {
          project_id: 'project-a',
          work_date: '2026-08-10',
          category: 'regular',
          minutes: 60,
          approval_state: 'approved',
        },
        {
          project_id: 'project-a',
          work_date: '2026-08-10',
          category: 'regular',
          minutes: 105,
          approval_state: 'approved',
        },
        {
          project_id: 'project-a',
          work_date: '2026-08-10',
          category: 'regular',
          minutes: 360,
          approval_state: 'rejected',
        },
        {
          project_id: 'project-a',
          work_date: '2026-08-10',
          category: 'travel',
          minutes: 45,
          approval_state: 'void',
        },
      ],
      '2026-08-10',
    );
    expect(view.days[0]).toMatchObject({
      actualMinutes: 165,
      status: 'Approved',
      categories: { regular: 165 },
    });
  });

  it('counts a manager-scope correction once and restores the original after rejection', () => {
    const original = {
      project_id: 'project-a',
      work_date: '2026-08-10',
      category: 'regular',
      minutes: 105,
      approval_state: 'approved',
      active_correction_id: 'correction-1',
    };
    const correction = {
      project_id: 'project-a',
      work_date: '2026-08-10',
      category: 'regular',
      minutes: 100,
      approval_state: 'submitted',
    };
    expect(weeklyView([original, correction], '2026-08-10').days[0]).toMatchObject({
      actualMinutes: 100,
      status: 'Submitted',
    });
    expect(
      weeklyView(
        [
          { ...original, active_correction_id: null },
          { ...correction, approval_state: 'rejected' },
        ],
        '2026-08-10',
      ).days[0],
    ).toMatchObject({ actualMinutes: 105, status: 'Approved' });
  });

  it('does not fabricate a target when no effective schedule is available', () => {
    const view = weeklyView(
      [
        {
          project_id: 'project-a',
          work_date: '2026-08-10',
          category: 'regular',
          minutes: 37,
          approval_state: 'approved',
        },
      ],
      '2026-08-10',
    );

    expect(view.days[0]).toMatchObject({
      actualMinutes: 37,
      expectedMinutes: null,
      differenceMinutes: null,
      status: 'Approved',
    });
  });

  it('uses the effective project schedule as planning context and preserves actual minutes', () => {
    const view = weeklyView(
      [
        {
          project_id: 'project-a',
          work_date: '2026-08-10',
          category: 'regular',
          minutes: 37,
          approval_state: 'approved',
        },
      ],
      '2026-08-10',
      [schedule({ monday_minutes: 720 })],
    );

    expect(view.days[0]).toMatchObject({
      actualMinutes: 37,
      expectedMinutes: 720,
      differenceMinutes: -683,
      status: 'Needs note',
    });
  });

  it('does not add targets across multiple projects on one day', () => {
    const view = weeklyView(
      [
        {
          project_id: 'project-a',
          work_date: '2026-08-10',
          category: 'regular',
          minutes: 300,
          approval_state: 'approved',
        },
        {
          project_id: 'project-b',
          work_date: '2026-08-10',
          category: 'regular',
          minutes: 120,
          approval_state: 'approved',
        },
      ],
      '2026-08-10',
      [schedule(), schedule({ project_id: 'project-b', monday_minutes: 480 })],
    );

    expect(view.days[0]).toMatchObject({
      actualMinutes: 420,
      expectedMinutes: null,
      differenceMinutes: null,
      status: 'Approved',
    });
  });

  it('projects a configured target onto an empty day for one assigned project', () => {
    const view = weeklyView([], '2026-08-10', [schedule({ monday_minutes: 720 })]);

    expect(view.days[0]).toMatchObject({
      actualMinutes: 0,
      expectedMinutes: 720,
      differenceMinutes: -720,
      status: '—',
    });
  });

  it('keeps empty-day targets unavailable for multiple assigned projects', () => {
    const view = weeklyView([], '2026-08-10', [
      schedule({ monday_minutes: 720 }),
      schedule({ project_id: 'project-b', monday_minutes: 480 }),
    ]);

    expect(view.days[0]).toMatchObject({
      actualMinutes: 0,
      expectedMinutes: null,
      differenceMinutes: null,
      status: '—',
    });
  });

  it('selects the schedule effective on the recorded date', () => {
    const view = weeklyView(
      [
        {
          project_id: 'project-a',
          work_date: '2026-08-11',
          category: 'regular',
          minutes: 480,
          approval_state: 'approved',
        },
      ],
      '2026-08-10',
      [
        schedule({ tuesday_minutes: 600 }),
        schedule({ effective_from: '2026-08-11', tuesday_minutes: 480 }),
      ],
    );

    expect(view.days[1]).toMatchObject({
      actualMinutes: 480,
      expectedMinutes: 480,
      differenceMinutes: 0,
      status: 'Approved',
    });
  });
});
