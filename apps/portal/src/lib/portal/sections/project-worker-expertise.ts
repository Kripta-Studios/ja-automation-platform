import type { PortalRow } from '../portal-data';

export function eligibleProjectWorkers(workers: readonly PortalRow[]): PortalRow[] {
  return workers.filter(
    (worker) =>
      worker.status === 'active' &&
      (worker.role === 'worker' || worker.role === 'project_manager') &&
      typeof worker.id === 'string' &&
      worker.id.length > 0,
  );
}

export function workersWithExpertise(
  workers: readonly PortalRow[],
  workerExpertise: readonly PortalRow[],
  expertiseId: string,
): PortalRow[] {
  const eligible = eligibleProjectWorkers(workers);
  if (!expertiseId) return eligible;
  const matchingWorkerIds = new Set(
    workerExpertise
      .filter((row) => String(row.skill_id ?? '') === expertiseId)
      .map((row) => String(row.worker_id ?? '')),
  );
  return eligible.filter((worker) => matchingWorkerIds.has(String(worker.id)));
}
