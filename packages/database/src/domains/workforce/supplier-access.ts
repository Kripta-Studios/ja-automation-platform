import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';

export type SupplierProfile = 'external_technician' | 'supplier_coordinator';

export type SupplierUserProfile = Readonly<{
  profile: SupplierProfile;
  supplierId: string;
}>;

export type SupplierCoordinatorGrant = Readonly<{
  supplierId: string;
  grantId: string;
  startsOn: string;
  endsOn: string | null;
}>;

export function readSupplierProfile(
  sqlite: DatabaseSync,
  userId: string,
): SupplierUserProfile | null {
  const row = sqlite
    .prepare('SELECT profile,supplier_id FROM supplier_user_profile WHERE user_id=?')
    .get(userId) as { profile: SupplierProfile; supplier_id: string } | undefined;
  return row ? { profile: row.profile, supplierId: row.supplier_id } : null;
}

/**
 * Returns the current, date-effective installation grant for a coordinator.
 * This is deliberately an operational authority check, not a historical
 * provenance lookup: a revoked, expired, suspended, or inactive-supplier
 * grant cannot be used through an ordinary project_member assignment.
 */
export function readLiveSupplierCoordinatorGrant(
  sqlite: DatabaseSync,
  principal: Principal,
  projectId: string,
  operationDate: string,
  currentDate = new Date().toISOString().slice(0, 10),
): SupplierCoordinatorGrant | null {
  const profile = readSupplierProfile(sqlite, principal.userId);
  if (profile?.profile !== 'supplier_coordinator') return null;
  const grant = sqlite
    .prepare(
      `SELECT g.id grant_id,g.starts_on,g.ends_on
         FROM supplier_project_grant g
         JOIN supplier s ON s.id=g.supplier_id AND s.status='active'
         JOIN project p ON p.id=g.project_id
         JOIN project_member pm ON pm.project_id=g.project_id AND pm.user_id=g.coordinator_id
         JOIN user u ON u.id=g.coordinator_id
        WHERE g.supplier_id=? AND g.coordinator_id=? AND g.project_id=? AND g.status='active'
          AND u.role='worker' AND u.status='active'
          AND p.status IN ('active','planned','paused')
          AND g.starts_on<=? AND (g.ends_on IS NULL OR g.ends_on>=?)
          AND g.starts_on<=? AND (g.ends_on IS NULL OR g.ends_on>=?)
          AND pm.status='active' AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
        ORDER BY g.starts_on DESC LIMIT 1`,
    )
    .get(
      profile.supplierId,
      principal.userId,
      projectId,
      currentDate,
      currentDate,
      operationDate,
      operationDate,
      currentDate,
      currentDate,
    ) as { grant_id: string; starts_on: string; ends_on: string | null } | undefined;
  return grant
    ? {
        supplierId: profile.supplierId,
        grantId: grant.grant_id,
        startsOn: grant.starts_on,
        endsOn: grant.ends_on,
      }
    : null;
}

/**
 * Resolve supplier provenance from immutable recorder/history records rather
 * than from the worker's current profile. Corrections inherit the provenance
 * of their canonical source record.
 */
export function isSupplierTimeEntry(sqlite: DatabaseSync, timeEntryId: string): boolean {
  const row = sqlite
    .prepare(
      `SELECT 1
         FROM time_entry t
        WHERE t.id=? AND (
          EXISTS(
            SELECT 1 FROM supplier_time_entry_recorder recorder
             WHERE recorder.time_entry_id=t.id
          )
          OR EXISTS(
            SELECT 1 FROM supplier_user_profile_period period
             WHERE period.user_id=t.worker_id
               AND period.profile IN ('external_technician','supplier_coordinator')
               AND t.created_at>=period.starts_at
               AND (period.ends_at IS NULL OR t.created_at<period.ends_at)
          )
          OR EXISTS(
            SELECT 1
              FROM record_correction_link link
              JOIN time_entry source ON source.id=link.original_id
             WHERE link.record_type='time_entry' AND link.correction_id=t.id
               AND (
                 EXISTS(
                   SELECT 1 FROM supplier_time_entry_recorder source_recorder
                    WHERE source_recorder.time_entry_id=source.id
                 )
                 OR EXISTS(
                   SELECT 1 FROM supplier_user_profile_period source_period
                    WHERE source_period.user_id=source.worker_id
                      AND source_period.profile IN ('external_technician','supplier_coordinator')
                      AND source.created_at>=source_period.starts_at
                      AND (source_period.ends_at IS NULL OR source.created_at<source_period.ends_at)
                 )
               )
          )
        )
        LIMIT 1`,
    )
    .get(timeEntryId);
  return Boolean(row);
}

export function isSupplierCoordinator(sqlite: DatabaseSync, userId: string): boolean {
  return readSupplierProfile(sqlite, userId)?.profile === 'supplier_coordinator';
}

/**
 * Callers that expose a finance projection can pass their normal 403 error
 * class.  An absent profile is deliberately the legacy/internal-worker path.
 */
export function assertNoSupplierFinancialAccess(
  sqlite: DatabaseSync,
  userId: string,
  AccessError: new (message: string) => Error = Error,
): void {
  if (readSupplierProfile(sqlite, userId))
    throw new AccessError('Supplier workforce accounts cannot access financial data');
}
