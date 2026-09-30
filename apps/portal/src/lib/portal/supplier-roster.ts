type DatedTechnician = { id: string; startsOn: string; endsOn: string | null };

/** Blank dates allow native forms to show the schedule; the action still checks the work date. */
export function supplierRosterForDate<T extends DatedTechnician>(
  roster: readonly T[],
  workDate: string,
): T[] {
  const seen = new Set<string>();
  return roster.filter((row) => {
    if (workDate && (workDate < row.startsOn || (row.endsOn !== null && workDate > row.endsOn)))
      return false;
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}
