type TimeReviewSource = Readonly<{
  id: string;
  approval_state: string;
  billability_state: string;
  invoice_id: string | null;
}>;

/** Operational approval does not decide commercial billability. Sources here
 * already passed the caller's date, correction and authorization filters.
 */
export function pendingTimeFinanceReviewSourceIds(rows: readonly TimeReviewSource[]): string[] {
  return [
    ...new Set(
      rows
        .filter(
          (row) =>
            ['approved', 'locked'].includes(row.approval_state) &&
            row.billability_state === 'pending' &&
            row.invoice_id === null,
        )
        .map((row) => row.id),
    ),
  ];
}
