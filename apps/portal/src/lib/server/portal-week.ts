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

export const weeklyView = (
  rows: readonly Record<string, unknown>[],
  weekStart: string,
): {
  weekStart: string;
  weekEnd: string;
  days: Array<{
    date: string;
    label: string;
    expectedMinutes: number;
    actualMinutes: number;
    differenceMinutes: number;
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
    const status =
      dayRows.length === 0
        ? '—'
        : states.has('needs_changes') || states.has('rejected')
          ? 'Needs changes'
          : states.has('submitted')
            ? 'Submitted'
            : states.has('draft')
              ? 'Draft'
              : actualMinutes !== 600 && index < 6
                ? 'Needs note'
                : 'Approved';
    const expectedMinutes = index < 6 ? 600 : 0;
    return {
      date: dateValue,
      label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      expectedMinutes,
      actualMinutes,
      differenceMinutes: actualMinutes - expectedMinutes,
      status,
      categories,
    };
  });
  const end = new Date(`${weekStart}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { weekStart, weekEnd: end.toISOString().slice(0, 10), days };
};
