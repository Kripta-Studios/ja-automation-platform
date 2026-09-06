type TimeDeleteRow = Readonly<{
  worker_id?: unknown;
  approval_state?: unknown;
  correction_linked?: unknown;
}>;

/**
 * A SQLite EXISTS projection is numeric (0/1), while browser-provided data
 * may also preserve it as a boolean or string. A linked correction draft is
 * immutable history and must never receive a destructive affordance.
 */
export function canDeleteTimeDraft(row: TimeDeleteRow, currentUserId: string): boolean {
  return (
    String(row.worker_id) === currentUserId &&
    String(row.approval_state) === 'draft' &&
    Number(row.correction_linked ?? 0) !== 1
  );
}
