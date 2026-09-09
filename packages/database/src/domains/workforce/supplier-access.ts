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
      `SELECT g.id grant_id
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
    ) as { grant_id: string } | undefined;
  return grant ? { supplierId: profile.supplierId, grantId: grant.grant_id } : null;
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
