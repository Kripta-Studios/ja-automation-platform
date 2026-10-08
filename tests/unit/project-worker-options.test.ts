import { describe, expect, it } from 'vitest';
import type { PortalRow } from '../../apps/portal/src/lib/portal/portal-data.ts';
import {
  assignedTimeProjectsForDate,
  assignedTimeWorkersForProjectDate,
} from '../../apps/portal/src/lib/portal/sections/time-worker-options.ts';

const projects: PortalRow[] = [
  { id: 'project-a', project_number: 'PRJ-1' },
  { id: 'project-b', project_number: 'PRJ-2' },
  { id: 'project-unassigned', project_number: 'PRJ-3' },
];

const workers: PortalRow[] = [
  { id: 'worker-a', name: 'Ana' },
  { id: 'worker-b', name: 'Bruno' },
  { id: 'worker-c', name: 'Carla' },
];

const assignments: PortalRow[] = [
  {
    project_id: 'project-a',
    worker_id: 'worker-a',
    starts_on: '2026-10-01',
    ends_on: '2026-10-08',
  },
  {
    project_id: 'project-a',
    worker_id: 'worker-b',
    starts_on: '2026-10-08',
    ends_on: null,
  },
  {
    project_id: 'project-b',
    worker_id: 'worker-c',
    starts_on: '2026-10-09',
    ends_on: null,
  },
  {
    project_id: 'project-b',
    worker_id: 'worker-b',
    starts_on: '2026-10-01',
    ends_on: null,
    status: 'inactive',
  },
];

describe('project worker options for time entry', () => {
  it('limits project choices to projects with an active assignment covering the work date', () => {
    expect(assignedTimeProjectsForDate(projects, assignments, '2026-10-08')).toEqual([projects[0]]);
    expect(assignedTimeProjectsForDate(projects, assignments, '2026-10-09')).toEqual([
      projects[0],
      projects[1],
    ]);
  });

  it('lists only workers assigned to the selected project on the selected date', () => {
    expect(
      assignedTimeWorkersForProjectDate(workers, assignments, 'project-a', '2026-10-08'),
    ).toEqual([workers[0], workers[1]]);
    expect(
      assignedTimeWorkersForProjectDate(workers, assignments, 'project-b', '2026-10-08'),
    ).toEqual([]);
    expect(
      assignedTimeWorkersForProjectDate(workers, assignments, 'project-b', '2026-10-09'),
    ).toEqual([workers[2]]);
  });

  it('returns no all-worker fallback when project or date is missing', () => {
    expect(assignedTimeWorkersForProjectDate(workers, assignments, '', '2026-10-08')).toEqual([]);
    expect(assignedTimeWorkersForProjectDate(workers, assignments, 'project-a', '')).toEqual([]);
    expect(assignedTimeProjectsForDate(projects, assignments, '')).toEqual([]);
  });
});
