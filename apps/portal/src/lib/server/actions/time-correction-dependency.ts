import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import {
  AccessDeniedError,
  V3AccessDeniedError,
  V3ValidationError,
  ValidationError,
  type PortalRepository,
} from '@ja/database';
import type { ActionMessageKey } from './action-message';

export type TimeCorrectionDependency = Readonly<{
  kind: 'expense' | 'report' | 'other';
  recordId?: string;
}>;

const inaccessible = (error: unknown): boolean =>
  error instanceof AccessDeniedError ||
  error instanceof V3AccessDeniedError ||
  error instanceof ValidationError ||
  error instanceof V3ValidationError;

/** Caller has a correction draft; verify its scope again before resolving any linked record. */
export function timeCorrectionDependency(
  sqlite: DatabaseSync,
  repository: PortalRepository,
  principal: Principal,
  correctionId: string,
): TimeCorrectionDependency | null {
  repository.timeDetail(principal, correctionId);
  const hasDependency = sqlite
    .prepare(
      `SELECT 1 WHERE EXISTS(SELECT 1 FROM expense WHERE time_entry_id=?)
         OR EXISTS(SELECT 1 FROM report_time_link WHERE time_entry_id=?)
         OR EXISTS(SELECT 1 FROM operational_time_expense_request WHERE time_entry_id=?)
         OR EXISTS(SELECT 1 FROM crew_shared_expense_allocation WHERE time_entry_id=?)`,
    )
    .get(correctionId, correctionId, correctionId, correctionId);
  if (!hasDependency) return null;
  const expenses = sqlite
    .prepare('SELECT id FROM expense WHERE time_entry_id=? ORDER BY created_at DESC LIMIT 100')
    .all(correctionId) as { id: string }[];
  for (const expense of expenses) {
    try {
      repository.expenseDetail(principal, expense.id);
      return { kind: 'expense', recordId: expense.id };
    } catch (error) {
      if (!inaccessible(error)) throw error;
    }
  }
  const reports = sqlite
    .prepare('SELECT report_id id FROM report_time_link WHERE time_entry_id=? LIMIT 100')
    .all(correctionId) as { id: string }[];
  for (const report of reports) {
    try {
      repository.reportDetail(principal, report.id);
      return { kind: 'report', recordId: report.id };
    } catch (error) {
      if (!inaccessible(error)) throw error;
    }
  }
  return { kind: 'other' };
}

export type TimeCorrectionDependencyProblem = Readonly<{
  code: string;
  key: ActionMessageKey;
  message: string;
  remedy: string;
}>;

export function timeCorrectionDependencyProblem(
  dependency: TimeCorrectionDependency,
): TimeCorrectionDependencyProblem {
  if (dependency.kind === 'expense')
    return {
      code: 'TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE',
      key: 'problem.time.correctionWithdrawLinkedExpense',
      message:
        'This correction draft is linked to a saved expense, so it cannot be withdrawn. Review that expense and request an audited correction if the records need to change.',
      remedy: 'review_linked_expense',
    };
  if (dependency.kind === 'report')
    return {
      code: 'TIME_CORRECTION_WITHDRAW_LINKED_REPORT',
      key: 'problem.time.correctionWithdrawLinkedReport',
      message:
        'This correction draft is linked to a saved report, so it cannot be withdrawn. Review that report and request an audited correction if the records need to change.',
      remedy: 'review_linked_report',
    };
  return {
    code: 'TIME_CORRECTION_WITHDRAW_HAS_DEPENDENCIES',
    key: 'problem.time.correctionWithdrawHasDependencies',
    message:
      'This correction draft is linked to another saved record, so it cannot be withdrawn. Ask an authorized reviewer to inspect the link and coordinate an audited correction.',
    remedy: 'contact_project_owner',
  };
}
