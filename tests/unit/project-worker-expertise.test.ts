import { describe, expect, it } from 'vitest';
import {
  eligibleProjectWorkers,
  workersWithExpertise,
} from '../../apps/portal/src/lib/portal/sections/project-worker-expertise';

const workers = [
  { id: 'a', name: 'Installer A', role: 'worker', status: 'active' },
  { id: 'b', name: 'Installer B', role: 'worker', status: 'active' },
  { id: 'c', name: 'Inactive installer', role: 'worker', status: 'inactive' },
  { id: 'd', name: 'Coordinator', role: 'project_manager', status: 'active' },
  { id: 'e', name: 'Owner', role: 'owner_admin', status: 'active' },
];

const workerExpertise = [
  { worker_id: 'a', skill_id: 'installation' },
  { worker_id: 'b', skill_id: 'plc' },
  { worker_id: 'c', skill_id: 'installation' },
  { worker_id: 'd', skill_id: 'installation' },
];

describe('project worker expertise selection', () => {
  it('only offers active assignment-eligible people', () => {
    expect(eligibleProjectWorkers(workers).map((worker) => worker.id)).toEqual(['a', 'b', 'd']);
  });

  it('filters by existing skill ID without admitting an inactive or unrelated person', () => {
    expect(
      workersWithExpertise(workers, workerExpertise, 'installation').map((worker) => worker.id),
    ).toEqual(['a', 'd']);
    expect(
      workersWithExpertise(workers, workerExpertise, 'plc').map((worker) => worker.id),
    ).toEqual(['b']);
    expect(workersWithExpertise(workers, workerExpertise, '').map((worker) => worker.id)).toEqual([
      'a',
      'b',
      'd',
    ]);
  });
});
