import type { PortalRow as Row } from '../portal-data';
import type { ExpenseCopyKey } from './expense-copy';

/** One plain-language status per expense, shared by capture and overview. */
export type ExpenseStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'needs_changes'
  | 'rejected'
  | 'reimbursed'
  | 'withdrawn';

export function expenseStatusOf(row: Row): ExpenseStatus {
  const state = String(row.approval_state ?? '');
  if (
    ['approved', 'locked'].includes(state) &&
    (row.reimbursement_state === 'reimbursed' || Boolean(row.reimbursed_at))
  )
    return 'reimbursed';
  if (state === 'locked') return 'approved';
  if (['draft', 'submitted', 'approved', 'needs_changes', 'rejected'].includes(state))
    return state as ExpenseStatus;
  return 'withdrawn';
}

export const expenseStatusLabel: Record<ExpenseStatus, ExpenseCopyKey> = {
  draft: 'statusDraft',
  submitted: 'statusSubmitted',
  approved: 'statusApproved',
  needs_changes: 'statusNeedsChanges',
  rejected: 'statusRejected',
  reimbursed: 'statusReimbursed',
  withdrawn: 'statusWithdrawn',
};

export const expenseStatusVariant: Record<
  ExpenseStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'success',
  needs_changes: 'warning',
  rejected: 'danger',
  reimbursed: 'success',
  withdrawn: 'neutral',
};
