import { describe, expect, it } from 'vitest';
import { weeklyView, type WeeklyProjectSchedule } from '$lib/server/portal-week';

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
