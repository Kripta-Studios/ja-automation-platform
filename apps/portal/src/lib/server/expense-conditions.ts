import { createHash } from 'node:crypto';
import {
  AccessDeniedError,
  AssignmentExpensePolicyRepository,
  ConflictError,
  ValidationError,
} from '@ja/database';
import type { openPortalRepository } from './portal-repository';
import { withAssignmentFinanceTransaction } from './actions/assignment-finance';

/**
 * One-click "apply the project's expense conditions" for one expense, shared by the
 * advanced invoice composer and the one-screen invoice. Idempotent on the request key.
 */
export function applyProjectExpenseConditions(
  current: ReturnType<typeof openPortalRepository>,
  input: { projectId: string; source: { id: string; version: number }; requestKey: string },
) {
  return withAssignmentFinanceTransaction(current.sqlite, () => {
    const row = current.sqlite
      .prepare(
        `SELECT project_id,version,tax_amount_minor,(SELECT r.tax_bps FROM expense_classification_series s JOIN expense_classification_authority_event a ON a.id=s.current_authority_event_id JOIN expense_classification_revision r ON r.id=a.revision_id WHERE s.expense_id=expense.id) tax_bps FROM expense WHERE id=?`,
      )
      .get(input.source.id);
    if (!row || row.project_id !== input.projectId)
      throw new AccessDeniedError('Expense is outside the selected project');
    // Recover the completed canonical command before checking the original
    // expected version: a successful first attempt necessarily increments it.
    const prior = current.sqlite
      .prepare(
        `SELECT c.state,c.principal_id,c.session_id_hash,r.expense_id,r.project_id,r.reason,
      json_extract(CAST(e.canonical_blob AS TEXT),'$.expected_version') expected_version
      FROM finance_command c JOIN deployment_identity d ON d.singleton=1 AND d.tenant_id=c.tenant_id AND d.deployment_id=c.deployment_id
      LEFT JOIN expense_classification_revision r ON r.command_id=c.command_id
      LEFT JOIN finance_hash_evidence e ON e.evidence_hash=r.revision_hash AND e.evidence_type='expense_classification_revision'
      WHERE c.operation='expense.classify' AND c.idempotency_key=?`,
      )
      .get(input.requestKey);
    if (prior) {
      const sessionHash = createHash('sha256')
        .update(current.principal.sessionId ?? '')
        .digest('hex');
      if (
        prior.state !== 'completed' ||
        prior.principal_id !== current.principal.userId ||
        prior.session_id_hash !== sessionHash ||
        prior.expense_id !== input.source.id ||
        prior.project_id !== input.projectId ||
        prior.expected_version !== input.source.version ||
        prior.reason !== 'Apply configured project expense conditions from invoice preparation'
      )
        throw new ConflictError(
          'Expense condition request key was already used for another operation',
        );
      return { version: Number(row.version), replayed: true };
    }
    if (row.version !== input.source.version)
      throw new ConflictError('Selected expense changed. Reload before continuing.');
    const policy = new AssignmentExpensePolicyRepository(current.sqlite).preview(
      current.principal,
      input.source.id,
    );
    if (
      policy.issues.length ||
      !policy.policy ||
      !policy.clientTreatment ||
      !policy.billingTreatment ||
      policy.markupBps == null
    )
      throw new ValidationError(
        'Configure the dated assignment expense policy and exact currency conversion before applying it.',
      );
    if (row.tax_bps == null && Number(row.tax_amount_minor ?? 0) !== 0)
      throw new ValidationError(
        'Review the existing expense tax classification in Finance before applying project conditions.',
      );
    return current.repository.classifyExpenseCommercially(current.principal, {
      expenseId: input.source.id,
      expectedVersion: input.source.version,
      clientTreatment: policy.clientTreatment,
      billingTreatment: policy.billingTreatment,
      markupBps: policy.markupBps,
      taxBps: Number(row.tax_bps ?? 0),
      reason: 'Apply configured project expense conditions from invoice preparation',
      idempotencyKey: input.requestKey,
    });
  });
}
