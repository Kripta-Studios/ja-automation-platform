/**
 * Server-side role projections for the section loader.
 *
 * These are deliberately explicit allowlists.  A PM may see operational
 * context needed to review work, but must not receive commercial or finance
 * fields merely because a repository row happens to contain them.  Keeping
 * the projection at the serialization boundary also prevents a future
 * repository enrichment from silently widening the PM payload.
 */

type ProjectionRow = Readonly<Record<string, unknown>>;

function isSafeScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/** A scalar field copied from a database row without recursively traversing it. */
function pickFields(row: ProjectionRow, fields: readonly string[]): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const field of fields) {
    if (row[field] !== undefined && isSafeScalar(row[field])) projected[field] = row[field];
  }
  return projected;
}

const pmSearchFieldsByType: Readonly<Record<string, readonly string[]>> = {
  project: ['id', 'type', 'label', 'detail'],
  client: ['id', 'type', 'label', 'detail'],
  worker: ['id', 'type', 'label', 'detail'],
  report: ['id', 'type', 'label', 'detail'],
  expense: ['id', 'type', 'label', 'detail'],
};

const pmMilestoneFields = [
  'id',
  'project_id',
  'name',
  'description',
  'due_on',
  'approval_state',
  'version',
  'project_number',
  'project_name',
] as const;

const pmApprovalFields = [
  'type',
  'id',
  'project_id',
  'worker_id',
  'date',
  'approval_state',
  'review_stage',
] as const;

const pmDashboardFields = ['activeProjects', 'actualMinutes', 'pendingReports'] as const;

/** PM dashboard data is operational only; money and invoice totals are omitted server-side. */
export function projectManagerDashboardProjection(row: ProjectionRow): Record<string, unknown> {
  return pickFields(row, pmDashboardFields);
}

/**
 * Project-manager search rows contain operational lookup context only.
 * Invoice entities are intentionally not projected at all.  Unknown entity
 * types are also dropped closed-world, so adding a finance-backed search
 * source cannot widen the PM response by accident.
 */
export function projectManagerSearchProjection(
  rows: readonly ProjectionRow[],
): Array<Record<string, unknown>> {
  return rows.flatMap((row) => {
    const type = typeof row.type === 'string' ? row.type : '';
    const fields = pmSearchFieldsByType[type];
    return fields ? [pickFields(row, fields)] : [];
  });
}

/** Project-manager autocomplete uses the same closed-world search contract. */
export function projectManagerSearchSuggestionsProjection(
  rows: readonly ProjectionRow[],
): Array<Record<string, unknown>> {
  return projectManagerSearchProjection(rows);
}

/**
 * Milestone review is an operational approval surface for PMs.  It retains
 * identity, project context, due date, state and optimistic-concurrency
 * version, while excluding milestone money and currency entirely.
 */
export function projectManagerMilestoneProjection(
  rows: readonly ProjectionRow[],
): Array<Record<string, unknown>> {
  return rows.map((row) => pickFields(row, pmMilestoneFields));
}

/**
 * PM approval rows are operational only.  The queue's legacy `amount` column
 * represents minutes for time entries but minor units for expenses, so it is
 * retained only for time rows and dropped for every other record type.
 */
export function projectManagerApprovalQueueProjection(
  rows: readonly ProjectionRow[],
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const projected = pickFields(row, pmApprovalFields);
    if (row.type === 'time' && isSafeScalar(row.amount)) projected.amount = row.amount;
    return projected;
  });
}
