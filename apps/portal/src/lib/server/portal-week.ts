const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const mondayOf = (value: string | null): string => {
  const candidate =
    value && isoDatePattern.test(value) ? value : new Date().toISOString().slice(0, 10);
  const date = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return mondayOf(null);
  const distance = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - distance);
  return date.toISOString().slice(0, 10);
};

export type WeeklyProjectSchedule = Readonly<{
  project_id: string;
  assignment_starts_on?: string | null;
  assignment_ends_on?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  monday_minutes?: number | null;
  tuesday_minutes?: number | null;
  wednesday_minutes?: number | null;
  thursday_minutes?: number | null;
  friday_minutes?: number | null;
  saturday_minutes?: number | null;
  sunday_minutes?: number | null;
}>;

const scheduleMinutesForDay = (
  schedule: WeeklyProjectSchedule,
  dayIndex: number,
): number | null => {
  const values = [
    schedule.monday_minutes,
    schedule.tuesday_minutes,
    schedule.wednesday_minutes,
    schedule.thursday_minutes,
    schedule.friday_minutes,
    schedule.saturday_minutes,
    schedule.sunday_minutes,
  ];
  const value = values[dayIndex];
  return value !== null &&
    value !== undefined &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 1440
    ? value
    : null;
};

const scheduleForDate = (
  schedules: readonly WeeklyProjectSchedule[],
  projectId: string,
  date: string,
): WeeklyProjectSchedule | null =>
  schedules
    .filter(
      (schedule) =>
        schedule.project_id === projectId &&
        (!schedule.assignment_starts_on || schedule.assignment_starts_on <= date) &&
        (!schedule.assignment_ends_on || schedule.assignment_ends_on >= date) &&
        schedule.effective_from !== null &&
        schedule.effective_from !== undefined &&
        schedule.effective_from <= date &&
        (!schedule.effective_to || schedule.effective_to >= date),
    )
    .sort((left, right) => {
      const effectiveDate = (right.effective_from ?? '').localeCompare(left.effective_from ?? '');
      return effectiveDate || left.project_id.localeCompare(right.project_id);
    })[0] ?? null;

export const weeklyView = (
  rows: readonly Record<string, unknown>[],
  weekStart: string,
  schedules: readonly WeeklyProjectSchedule[] = [],
): {
  weekStart: string;
  weekEnd: string;
  days: Array<{
    date: string;
    label: string;
    expectedMinutes: number | null;
    actualMinutes: number;
    differenceMinutes: number | null;
    status: string;
    categories: Record<string, number>;
  }>;
} => {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${weekStart}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const dateValue = date.toISOString().slice(0, 10);
    const dayRows = rows.filter((row) => row.work_date === dateValue);
    const actualMinutes = dayRows.reduce((sum, row) => sum + Number(row.minutes ?? 0), 0);
    const categories = dayRows.reduce<Record<string, number>>((result, row) => {
      const category = String(row.category ?? 'other');
      result[category] = (result[category] ?? 0) + Number(row.minutes ?? 0);
      return result;
    }, {});
    const states = new Set(dayRows.map((row) => String(row.approval_state ?? 'draft')));
    const rowProjectIds = new Set(
      dayRows
        .map((row) => String(row.project_id ?? ''))
        .filter((projectId) => projectId.length > 0),
    );
    // A worker can be assigned to more than one project. We deliberately do not add
    // project targets together: without an explicit allocation rule that would turn
    // planning context into a fabricated expectation. A day is targetable only when
    // exactly one project assignment applies and that project has an effective schedule.
    const assignedProjectIds = new Set(
      schedules
        .filter(
          (schedule) =>
            (!schedule.assignment_starts_on || schedule.assignment_starts_on <= dateValue) &&
            (!schedule.assignment_ends_on || schedule.assignment_ends_on >= dateValue),
        )
        .map((schedule) => schedule.project_id),
    );
    const projectIds = assignedProjectIds.size > 0 ? assignedProjectIds : rowProjectIds;
    const onlyProjectId = projectIds.size === 1 ? projectIds.values().next().value : undefined;
    const expectedSchedule = onlyProjectId
      ? scheduleForDate(schedules, onlyProjectId, dateValue)
      : null;
    const expectedMinutes = expectedSchedule
      ? scheduleMinutesForDay(expectedSchedule, index)
      : null;
    const status =
      dayRows.length === 0
        ? '—'
        : states.has('needs_changes') || states.has('rejected')
          ? 'Needs changes'
          : states.has('submitted')
            ? 'Submitted'
            : states.has('draft')
              ? 'Draft'
              : expectedMinutes !== null && actualMinutes !== expectedMinutes
                ? 'Needs note'
                : 'Approved';
    return {
      date: dateValue,
      label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      expectedMinutes,
      actualMinutes,
      differenceMinutes: expectedMinutes === null ? null : actualMinutes - expectedMinutes,
      status,
      categories,
    };
  });
  const end = new Date(`${weekStart}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { weekStart, weekEnd: end.toISOString().slice(0, 10), days };
};
