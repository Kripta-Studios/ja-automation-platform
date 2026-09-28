import type { DatabaseSync } from 'node:sqlite';

export type AccountingPackProjectLegalEntityScope = Readonly<{
  projectId: string;
  businessDate: string;
  tenantId: string;
  deploymentId: string;
}>;

/**
 * Resolve the point-in-time legacy legal entity used by both the Accounting
 * Pack producer and its immutable-revision validator. Canonical history is
 * authoritative whenever it exists. The legacy billing-rule fallback is only
 * valid for projects that predate canonical assignments and have exactly one
 * enabled, effective, non-null entity.
 */
export function resolveAccountingPackProjectLegalEntity(
  sqlite: DatabaseSync,
  scope: AccountingPackProjectLegalEntityScope,
): string | null {
  const assignmentRows = sqlite
    .prepare(
      `SELECT bridge.legacy_legal_entity_id
         FROM project_legal_entity_assignment assignment
         JOIN legal_entity_revision_bridge bridge
           ON bridge.canonical_revision_id=assignment.legal_entity_revision_id
          AND bridge.tenant_id=assignment.tenant_id
          AND bridge.deployment_id=assignment.deployment_id
        WHERE assignment.project_id=? AND assignment.tenant_id=? AND assignment.deployment_id=?
          AND substr(assignment.effective_from,1,10)<=?
          AND (assignment.effective_to IS NULL OR substr(assignment.effective_to,1,10)>=?)
        ORDER BY assignment.effective_from DESC,assignment.assignment_id DESC`,
    )
    .all(
      scope.projectId,
      scope.tenantId,
      scope.deploymentId,
      scope.businessDate,
      scope.businessDate,
    ) as Array<{ legacy_legal_entity_id: string }>;
  if (assignmentRows.length === 1) return assignmentRows[0]!.legacy_legal_entity_id;
  if (assignmentRows.length > 1) return null;

  const hasCanonicalHistory = Boolean(
    sqlite
      .prepare(
        `SELECT 1
           FROM project_legal_entity_assignment
          WHERE project_id=? AND tenant_id=? AND deployment_id=?
          LIMIT 1`,
      )
      .get(scope.projectId, scope.tenantId, scope.deploymentId),
  );
  if (hasCanonicalHistory) return null;

  const legacyRows = sqlite
    .prepare(
      `SELECT DISTINCT legal_entity_id
         FROM billing_rule
        WHERE project_id=? AND enabled=1 AND legal_entity_id IS NOT NULL
          AND effective_from<=?
          AND (effective_to IS NULL OR effective_to>=?)`,
    )
    .all(scope.projectId, scope.businessDate, scope.businessDate) as Array<{
    legal_entity_id: string;
  }>;
  return legacyRows.length === 1 ? legacyRows[0]!.legal_entity_id : null;
}
