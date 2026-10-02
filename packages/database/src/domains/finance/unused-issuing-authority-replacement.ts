import type { Principal } from '@ja/domain';
import { recordAuditEvent } from '../../core/audit.ts';
import { canonicalJson, sha256 } from '../../core/canonical-json.ts';
import { ensureCommand, ensureEvidence } from './finance-command-writer.ts';
import type {
  CanonicalProjectLegalEntityRepositoryDependencies,
  ProjectLegalEntityAssignmentInput,
  ProjectLegalEntityAssignmentResult,
} from './canonical-project-legal-entity-repository.ts';

export type UnusedIssuingAuthorityReplacementInput = Readonly<{
  originalAssignmentId: string;
  legalEntityRevisionId: string;
  reason: string;
  idempotencyKey: string;
}>;

export type UnusedIssuingAuthorityReplacementResult = ProjectLegalEntityAssignmentResult &
  Readonly<{ replacementId: string; originalAssignmentId: string }>;

const CONTRACT = 'client-essential-unused-issuing-authority-replacement-v1';
type Assignment = {
  assignment_id: string;
  project_id: string;
  legal_entity_revision_id: string;
  tenant_id: string;
  deployment_id: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  command_id: string;
};

/** Caller checks current persisted Finance role and live session before delegation. */
export function replaceUnusedIssuingAuthority(
  deps: CanonicalProjectLegalEntityRepositoryDependencies,
  principal: Principal,
  input: UnusedIssuingAuthorityReplacementInput,
  assign: (input: ProjectLegalEntityAssignmentInput) => ProjectLegalEntityAssignmentResult,
): UnusedIssuingAuthorityReplacementResult {
  const text = (value: unknown, field: string, min: number, max: number): string => {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
      return deps.errors.validation(`${field} is invalid`);
    return value.trim();
  };
  const originalAssignmentId = text(input.originalAssignmentId, 'Original assignment', 1, 200);
  const revisionId = text(input.legalEntityRevisionId, 'Legal entity revision', 1, 200);
  const reason = text(input.reason, 'Reason', 5, 2000);
  const token = text(input.idempotencyKey, 'Idempotency key', 8, 240);
  return deps.transaction(() => {
    const deployment = deps.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!deployment) return deps.errors.validation('Deployment identity is not configured');
    const original = deps.sqlite
      .prepare('SELECT * FROM project_legal_entity_assignment WHERE assignment_id=?')
      .get(originalAssignmentId) as Assignment | undefined;
    if (!original) return deps.errors.conflict('Original issuing authority is unavailable');
    if (
      original.tenant_id !== deployment.tenant_id ||
      original.deployment_id !== deployment.deployment_id
    )
      return deps.errors.accessDenied('Legal-entity revision scope mismatch');
    const scope = { tenantId: deployment.tenant_id, deploymentId: deployment.deployment_id };
    const replacementId = `ce-issuer-replacement-${sha256(
      `${scope.tenantId}:${scope.deploymentId}:${originalAssignmentId}:${token}`,
    ).slice(0, 40)}`;
    // The normal assignment writer derives the same immutable identity.
    const assignmentToken = `${replacementId}:assignment`;
    const assignmentId = `ce-project-legal-entity-assignment-${sha256(
      `${scope.tenantId}:${scope.deploymentId}:${original.project_id}:${assignmentToken}`,
    ).slice(0, 40)}`;
    const payload = {
      schema_version: CONTRACT,
      replacement_id: replacementId,
      original_assignment: original,
      original_assignment_hash: sha256(canonicalJson(original)),
      replacement_assignment_id: assignmentId,
      replacement_revision_id: revisionId,
      reason,
    };
    const createdAt = deps.now();
    const previous = deps.sqlite
      .prepare(
        `SELECT replacement_id,replacement_assignment_id,replacement_revision_id,reason,command_id
           FROM project_legal_entity_assignment_replacement WHERE original_assignment_id=?`,
      )
      .get(originalAssignmentId) as
      | {
          replacement_id: string;
          replacement_assignment_id: string;
          replacement_revision_id: string;
          reason: string;
          command_id: string;
        }
      | undefined;
    if (previous) {
      if (
        previous.replacement_id !== replacementId ||
        previous.replacement_assignment_id !== assignmentId ||
        previous.replacement_revision_id !== revisionId ||
        previous.reason !== reason
      )
        return deps.errors.conflict('Original issuing authority was already replaced');
      const saved = deps.sqlite
        .prepare('SELECT * FROM project_legal_entity_assignment WHERE assignment_id=?')
        .get(assignmentId) as Assignment | undefined;
      if (!saved) return deps.errors.conflict('Issuing authority replacement is incomplete');
      return {
        replacementId,
        originalAssignmentId,
        assignmentId,
        projectId: saved.project_id,
        legalEntityRevisionId: saved.legal_entity_revision_id,
        effectiveFrom: saved.effective_from,
        effectiveTo: saved.effective_to,
        commandId: previous.command_id,
        idempotent: true,
      };
    }
    const command = ensureCommand(
      deps.sqlite,
      scope,
      principal,
      {
        operation: 'project_legal_entity_assignment.replace_unused',
        targetKind: 'project_legal_entity_assignment_replacement',
        targetSemanticId: replacementId,
        targetContractVersion: CONTRACT,
        idempotencyKey: token,
        effectiveAt: original.effective_from,
        payload,
        createdAt,
        contractVersion: 'client-essential-finance-command-v1',
        evidenceNamespace: 'client-essential',
        evidenceIdPrefix: 'ce',
        commandIdPrefix: 'ce-cmd',
        currency: null,
        amountMinor: null,
      },
      deps.errors.conflict,
    );
    if (revisionId === original.legal_entity_revision_id)
      return deps.errors.validation('Choose a different issuing authority revision');
    const revision = deps.sqlite
      .prepare(
        `SELECT revision.*,project.currency project_currency
           FROM legal_entity_revision revision JOIN project ON project.id=?
          WHERE revision.revision_id=?`,
      )
      .get(original.project_id, revisionId) as
      | {
          tenant_id: string;
          deployment_id: string;
          effective_from: string;
          effective_to: string | null;
          base_currency: string;
          project_currency: string;
          revision_hash: string;
        }
      | undefined;
    if (!revision) return deps.errors.validation('Legal-entity revision not found');
    if (revision.tenant_id !== scope.tenantId || revision.deployment_id !== scope.deploymentId)
      return deps.errors.accessDenied('Legal-entity revision scope mismatch');
    if (revision.base_currency.toUpperCase() !== revision.project_currency.toUpperCase())
      return deps.errors.conflict(
        'Canonical legal-entity currency does not match project currency',
      );
    if (revision.effective_from > original.effective_from)
      return deps.errors.validation('Assignment starts before the legal-entity revision');
    if (
      revision.effective_to !== null &&
      (original.effective_to === null || original.effective_to > revision.effective_to)
    )
      return deps.errors.validation(
        'Assignment must end within the legal-entity revision interval',
      );
    if (
      !deps.sqlite
        .prepare(
          `SELECT 1 FROM finance_hash_evidence WHERE evidence_type='legal_entity_revision'
             AND contract_version='client-essential-legal-entity-revision-v1' AND evidence_hash=?`,
        )
        .get(revision.revision_hash)
    )
      return deps.errors.conflict(
        'Project authority requires a complete Client Essential legal-entity revision',
      );
    // Project scope is intentional: any persisted monetary interpretation or
    // financial snapshot makes retroactive authority replacement unsafe. Raw
    // operational approval does not appear in this view.
    if (
      deps.sqlite
        .prepare('SELECT 1 FROM project_issuing_authority_financial_use WHERE project_id=? LIMIT 1')
        .get(original.project_id)
    )
      return deps.errors.conflict('Project issuing authority has persisted financial use');
    const evidenceId = `ce-issuer-replacement-evidence-${replacementId}`;
    const evidenceHash = ensureEvidence(
      deps.sqlite,
      evidenceId,
      'configuration_revision',
      CONTRACT,
      replacementId,
      Buffer.from(canonicalJson(payload)),
      createdAt,
      deps.errors.conflict,
    );
    // Deferred FK requires the new assignment at outer commit. If assignment
    // insertion, command/evidence, change event or audit fails, everything rolls
    // back, including the cancellation event.
    deps.sqlite
      .prepare(
        `INSERT INTO project_legal_entity_assignment_replacement(
           replacement_id,original_assignment_id,replacement_assignment_id,replacement_revision_id,
           reason,principal_id,command_id,evidence_id,evidence_hash,created_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        replacementId,
        originalAssignmentId,
        assignmentId,
        revisionId,
        reason,
        principal.userId,
        command.commandId,
        evidenceId,
        evidenceHash,
        createdAt,
      );
    const result = assign({
      projectId: original.project_id,
      legalEntityRevisionId: revisionId,
      effectiveFrom: original.effective_from,
      ...(original.effective_to === null ? {} : { effectiveTo: original.effective_to }),
      reason,
      idempotencyKey: assignmentToken,
    });
    deps.sqlite
      .prepare(
        `INSERT INTO finance_change_event(
           change_id,tenant_id,deployment_id,entity_kind,entity_id,change_kind,effective_at,
           evidence_type,evidence_id,evidence_hash,command_id,created_at
         ) VALUES(?,?,?,?,?,'replace_unused',?,'configuration_revision',?,?,?,?)`,
      )
      .run(
        `ce-change-${replacementId}`,
        scope.tenantId,
        scope.deploymentId,
        'project_legal_entity_assignment_replacement',
        replacementId,
        original.effective_from,
        evidenceId,
        evidenceHash,
        command.commandId,
        createdAt,
      );
    recordAuditEvent(
      deps.sqlite,
      { ...principal, correlationId: command.commandId },
      'project_legal_entity.replace_unused',
      'project_legal_entity_assignment_replacement',
      replacementId,
      {
        projectId: original.project_id,
        before: original,
        after: result,
        reason,
        commandId: command.commandId,
        commandHash: command.commandHash,
        evidenceId,
        evidenceHash,
      },
    );
    return { ...result, replacementId, originalAssignmentId, commandId: command.commandId };
  });
}
