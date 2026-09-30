import type { DatabaseSync } from 'node:sqlite';

export type SupplierProjectRosterRow = Readonly<{
  id: string;
  name: string;
  supplierId: string;
  startsOn: string;
  endsOn: string | null;
}>;

/** This reader accepts only the supplier/grant scope already authorized by the repository. */
export function readSupplierProjectRoster(
  sqlite: DatabaseSync,
  projectId: string,
  scope?: Readonly<{ supplierId: string; startsOn: string; endsOn: string | null }>,
): SupplierProjectRosterRow[] {
  const filters = [
    'pm.project_id=?',
    "pm.status='active'",
    "u.role='worker'",
    "u.status='active'",
    "sup.profile='external_technician'",
    "s.status='active'",
  ];
  const values: (string | null)[] = [projectId];
  if (scope) {
    filters.push(
      'sup.supplier_id=?',
      "pm.starts_on<=COALESCE(?, '9999-12-31')",
      '(pm.ends_on IS NULL OR pm.ends_on>=?)',
    );
    values.push(scope.supplierId, scope.endsOn, scope.startsOn);
  }
  const rows = sqlite
    .prepare(
      `SELECT u.id,u.name,sup.supplier_id supplierId,pm.starts_on startsOn,pm.ends_on endsOn
         FROM project_member pm
         JOIN user u ON u.id=pm.user_id
         JOIN supplier_user_profile sup ON sup.user_id=u.id
         JOIN supplier s ON s.id=sup.supplier_id
        WHERE ${filters.join(' AND ')} ORDER BY u.name,u.id,pm.starts_on`,
    )
    .all(...values) as SupplierProjectRosterRow[];
  return rows.map((row) => intersectSupplierAssignment(row, scope));
}

/** Clamp visible eligibility to the authorized grant, including its inclusive final day. */
export function intersectSupplierAssignment(
  row: SupplierProjectRosterRow,
  scope?: Readonly<{ startsOn: string; endsOn: string | null }>,
): SupplierProjectRosterRow {
  if (!scope) return row;
  return {
    ...row,
    startsOn: row.startsOn > scope.startsOn ? row.startsOn : scope.startsOn,
    endsOn:
      row.endsOn === null
        ? scope.endsOn
        : scope.endsOn === null || row.endsOn < scope.endsOn
          ? row.endsOn
          : scope.endsOn,
  };
}
