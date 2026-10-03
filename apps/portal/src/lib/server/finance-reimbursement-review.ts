import type { AssignmentExpensePolicyRepository } from '@ja/database';
import type { DatabaseSync } from 'node:sqlite';
import { expenseCategories } from '$lib/portal/expense-categories';
import type {
  FinanceReimbursementReview,
  ReimbursementReviewInputs,
  ReimbursementReviewPerson,
} from '$lib/portal/portal-data';
import { isRealIsoDate } from './iso-date';

let snapshotSequence = 0;

/** A deferred read snapshot, nestable without committing an outer transaction. */
export function withFinanceReimbursementSnapshot<T>(sqlite: DatabaseSync, read: () => T): T {
  const savepoint = `ja_reimbursement_review_${++snapshotSequence}`;
  sqlite.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = read();
    sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (caught) {
    try {
      sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
    } catch {
      // Preserve the read error; the caller closes its connection in finally.
    }
    throw caught;
  }
}

/** Caller must first complete the live Owner/Finance listForProject authorization. */
export function reviewFinanceReimbursement(
  sqlite: DatabaseSync,
  repository: AssignmentExpensePolicyRepository,
  projectId: string,
  people: readonly ReimbursementReviewPerson[],
  requested: boolean,
  inputs: ReimbursementReviewInputs,
): FinanceReimbursementReview {
  let person = people.find((row) => row.assignmentId === inputs.assignmentId) ?? null;
  const retainedInputs = {
    assignmentId: person?.assignmentId ?? '',
    date: inputs.date.slice(0, 40),
    payer: inputs.payer.slice(0, 40),
    category: inputs.category.slice(0, 80),
  };
  const base = { inputs: retainedInputs, person };
  if (!requested) return { ...base, status: 'idle' };
  if (!isRealIsoDate(inputs.date)) return { ...base, status: 'invalid', issue: 'invalid_date' };
  if (!['worker', 'company_card', 'company_direct', 'client', 'third_party'].includes(inputs.payer))
    return { ...base, status: 'invalid', issue: 'invalid_payer' };
  if (!expenseCategories.some(([category]) => category === inputs.category))
    return { ...base, status: 'invalid', issue: 'invalid_category' };
  if (!inputs.assignmentId) return { ...base, status: 'invalid', issue: 'person_required' };
  if (!person) return { ...base, status: 'unavailable', issue: 'person_unavailable' };
  // Keep the displayed identity/window in the same snapshot as policy resolution.
  const currentPerson = sqlite
    .prepare(
      `SELECT pm.id assignmentId,pm.user_id workerId,u.name workerName,
              pm.starts_on startsOn,pm.ends_on endsOn
         FROM project_member pm JOIN user u ON u.id=pm.user_id
        WHERE pm.id=? AND pm.project_id=? AND pm.user_id=?
          AND ((pm.status='active' AND u.status='active')
            OR (pm.status='inactive' AND pm.ends_on IS NOT NULL))
          AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)`,
    )
    .get(person.assignmentId, projectId, person.workerId, inputs.date, inputs.date) as
    | ReimbursementReviewPerson
    | undefined;
  if (!currentPerson)
    return {
      inputs: { ...retainedInputs, assignmentId: '' },
      person: null,
      status: 'unavailable',
      issue: 'person_unavailable',
    };
  person = currentPerson;
  if (inputs.date < person.startsOn || (person.endsOn && inputs.date > person.endsOn))
    return { ...base, status: 'unavailable', issue: 'missing_assignment' };

  const resolution = repository.resolve({
    projectId,
    workerId: person.workerId,
    spentOn: inputs.date,
    category: inputs.category,
    whoPaid: inputs.payer,
  });
  if (!resolution.policy)
    return { ...base, person, status: 'unavailable', issue: resolution.issue ?? 'missing_policy' };
  const policy = resolution.policy;
  if (policy.projectMemberId !== person.assignmentId)
    return { ...base, status: 'unavailable', issue: 'context_changed' };
  const preference = repository.effectiveReimbursementPreference(
    projectId,
    person.assignmentId,
    inputs.date,
  );
  const source =
    inputs.payer !== 'worker'
      ? 'non_worker_payer'
      : preference.source === 'assignment_override'
        ? 'assignment_override'
        : preference.source === 'project_default'
          ? 'project_default'
          : preference.source === 'person_policy'
            ? 'person_policy'
            : null;
  if (source === null) return { ...base, person, status: 'unavailable', issue: 'context_changed' };
  return {
    ...base,
    status: 'resolved',
    person,
    behavior: policy.workerReimbursement,
    source,
    sourceEffectiveFrom:
      source === 'assignment_override'
        ? preference.overrideEffectiveFrom
        : source === 'project_default'
          ? preference.projectEffectiveFrom
          : source === 'person_policy'
            ? policy.effectiveFrom
            : null,
    policy: {
      id: policy.id,
      version: policy.version,
      payer: policy.payer,
      category: policy.category,
      effectiveFrom: policy.effectiveFrom,
      effectiveTo: policy.effectiveTo,
    },
  };
}
