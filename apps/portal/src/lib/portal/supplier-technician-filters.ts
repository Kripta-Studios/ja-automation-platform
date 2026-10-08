/**
 * Small, data-only filters shared by the owner supplier directory and the
 * project team directory. Assignment rows must already be authorized by the
 * server loader; this module never discovers or expands their scope.
 */
export type SupplierTechnicianFilters = Readonly<{
  projectId?: string;
  supplierId?: string;
  technicianId?: string;
}>;

type AssignmentRow = object;
type PersonRow = object;
type SupplierRow = object;

function value(row: object, ...keys: string[]): string {
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (candidate !== null && candidate !== undefined && String(candidate).trim())
      return String(candidate).trim();
  }
  return '';
}

function personId(row: object): string {
  return value(row, 'id', 'workerId', 'worker_id', 'user_id');
}

function supplierId(row: object): string {
  return value(row, 'supplierId', 'supplier_id');
}

function assignmentPersonId(row: object): string {
  return value(row, 'workerId', 'worker_id', 'user_id', 'id');
}

function assignmentProjectId(row: object): string {
  return value(row, 'projectId', 'project_id');
}

function assignmentSupplierId(row: object): string {
  return value(row, 'supplierId', 'supplier_id');
}

function assignmentMatches(
  assignment: AssignmentRow,
  filters: SupplierTechnicianFilters,
  personSupplierId = '',
): boolean {
  if (filters.projectId && assignmentProjectId(assignment) !== filters.projectId) return false;
  if (filters.supplierId) {
    const assignedSupplierId = assignmentSupplierId(assignment) || personSupplierId;
    if (assignedSupplierId !== filters.supplierId) return false;
  }
  if (filters.technicianId && assignmentPersonId(assignment) !== filters.technicianId) return false;
  return true;
}

/** Filter technicians through their already-authorized project assignments. */
export function filterTechniciansByProjectRelations<T extends PersonRow, A extends AssignmentRow>(
  technicians: readonly T[],
  assignments: readonly A[],
  filters: SupplierTechnicianFilters,
): T[] {
  return technicians.filter((technician) => {
    const id = personId(technician);
    if (!id || (filters.technicianId && id !== filters.technicianId)) return false;

    const ownSupplierId = supplierId(technician);
    if (filters.supplierId && ownSupplierId && ownSupplierId !== filters.supplierId) return false;

    if (!filters.projectId) return true;

    return assignments.some(
      (assignment) =>
        assignmentPersonId(assignment) === id &&
        assignmentMatches(assignment, filters, ownSupplierId),
    );
  });
}

/** Filter suppliers to those represented by the selected project/person relation. */
export function filterSuppliersByProjectRelations<
  S extends SupplierRow,
  T extends PersonRow,
  A extends AssignmentRow,
>(
  suppliers: readonly S[],
  technicians: readonly T[],
  assignments: readonly A[],
  filters: SupplierTechnicianFilters,
): S[] {
  const selectedTechnician = filters.technicianId
    ? technicians.find((technician) => personId(technician) === filters.technicianId)
    : undefined;
  const selectedPersonSupplierId = selectedTechnician ? supplierId(selectedTechnician) : '';
  return suppliers.filter((supplier) => {
    const id = value(supplier, 'id', 'supplierId', 'supplier_id');
    if (!id || (filters.supplierId && id !== filters.supplierId)) return false;
    if (filters.technicianId && selectedPersonSupplierId !== id) return false;
    if (!filters.projectId) return true;
    return assignments.some(
      (assignment) =>
        assignmentProjectId(assignment) === filters.projectId &&
        assignmentSupplierId(assignment) === id &&
        (!filters.technicianId || assignmentPersonId(assignment) === filters.technicianId),
    );
  });
}

/**
 * Team management uses canonical assignments, whose supplier relation is
 * carried by the worker projection. Apply the same project/person/provider
 * intersection while retaining the original row objects for existing UI.
 */
export function filterProjectTeamWorkers<W extends PersonRow, A extends AssignmentRow>(
  workers: readonly W[],
  assignments: readonly A[],
  filters: SupplierTechnicianFilters,
): W[] {
  return workers.filter((worker) => {
    const id = personId(worker);
    if (!id || (filters.technicianId && id !== filters.technicianId)) return false;
    const ownSupplierId = supplierId(worker);
    if (filters.supplierId && ownSupplierId !== filters.supplierId) return false;
    if (!filters.projectId) return true;
    return assignments.some(
      (assignment) =>
        assignmentPersonId(assignment) === id &&
        assignmentMatches(assignment, filters, ownSupplierId),
    );
  });
}
