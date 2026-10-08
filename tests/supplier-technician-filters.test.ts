import { describe, expect, it } from 'vitest';
import {
  filterProjectTeamWorkers,
  filterSuppliersByProjectRelations,
  filterTechniciansByProjectRelations,
} from '../apps/portal/src/lib/portal/supplier-technician-filters';

const suppliers = [
  { id: 'supplier-a', name: 'Alpha' },
  { id: 'supplier-b', name: 'Beta' },
  { id: 'supplier-c', name: 'No assignments' },
];
const technicians = [
  { id: 'worker-1', name: 'Alex', supplierId: 'supplier-a' },
  { id: 'worker-2', name: 'Blair', supplierId: 'supplier-b' },
  { id: 'worker-3', name: 'Casey', supplierId: 'supplier-a' },
  { id: 'worker-4', name: 'Drew', supplierId: 'supplier-c' },
];
const supplierAssignments = [
  { projectId: 'project-1', workerId: 'worker-1', supplierId: 'supplier-a' },
  { projectId: 'project-1', workerId: 'worker-2', supplierId: 'supplier-b' },
  { projectId: 'project-2', workerId: 'worker-3', supplierId: 'supplier-a' },
];

describe('supplier and technician directory filters', () => {
  it('intersects project, supplier, and technician filters across both directory lists', () => {
    const filters = {
      projectId: 'project-1',
      supplierId: 'supplier-a',
      technicianId: 'worker-1',
    };

    expect(
      filterTechniciansByProjectRelations(technicians, supplierAssignments, filters).map(
        (row) => row.id,
      ),
    ).toEqual(['worker-1']);
    expect(
      filterSuppliersByProjectRelations(suppliers, technicians, supplierAssignments, filters).map(
        (row) => row.id,
      ),
    ).toEqual(['supplier-a']);
  });

  it('returns empty matches when individually valid filters conflict', () => {
    expect(
      filterTechniciansByProjectRelations(technicians, supplierAssignments, {
        projectId: 'project-2',
        supplierId: 'supplier-b',
      }),
    ).toEqual([]);
    expect(
      filterSuppliersByProjectRelations(suppliers, technicians, supplierAssignments, {
        projectId: 'project-1',
        technicianId: 'worker-3',
      }),
    ).toEqual([]);
  });

  it('leaves unassigned directory entries visible when no relation filter is selected', () => {
    expect(
      filterTechniciansByProjectRelations(technicians, supplierAssignments, {}).map(
        (row) => row.id,
      ),
    ).toEqual(['worker-1', 'worker-2', 'worker-3', 'worker-4']);
    expect(
      filterSuppliersByProjectRelations(suppliers, technicians, supplierAssignments, {}).map(
        (row) => row.id,
      ),
    ).toEqual(['supplier-a', 'supplier-b', 'supplier-c']);
  });

  it('filters canonical team workers by authorized project and supplied provider relation', () => {
    const workers = [
      { id: 'worker-1', supplier_id: 'supplier-a' },
      { id: 'worker-2', supplier_id: 'supplier-b' },
      { id: 'worker-3', supplier_id: 'supplier-a' },
      { id: 'internal-worker', supplier_id: null },
    ];
    const assignments = [
      { project_id: 'project-1', user_id: 'worker-1' },
      { project_id: 'project-1', user_id: 'worker-2' },
      { project_id: 'project-2', user_id: 'worker-3' },
    ];
    expect(
      filterProjectTeamWorkers(workers, assignments, { supplierId: 'supplier-a' }).map(
        (row) => row.id,
      ),
    ).toEqual(['worker-1', 'worker-3']);
    expect(
      filterProjectTeamWorkers(workers, assignments, {
        projectId: 'project-1',
        supplierId: 'supplier-a',
        technicianId: 'worker-1',
      }).map((row) => row.id),
    ).toEqual(['worker-1']);
    expect(
      filterProjectTeamWorkers(workers, assignments, {
        projectId: 'project-1',
        supplierId: 'supplier-a',
      }).map((row) => row.id),
    ).toEqual(['worker-1']);
  });
});
