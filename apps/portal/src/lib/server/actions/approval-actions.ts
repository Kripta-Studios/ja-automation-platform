import { approvalDecisionSchema, financeDecisionSchema } from '@ja/schemas';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export function approvalFailure(
  error: unknown,
  type: 'time' | 'expense',
  id: string,
  values: Record<string, unknown> = {},
) {
  if (error instanceof AccessDeniedError) {
    if (error.message === 'Finance role required')
      return actionFail(
        403,
        'problem.finance.roleRequired',
        {},
        'Finance access is required for this review.',
        { code: 'FINANCE_ROLE_REQUIRED', remedies: [{ id: 'contact_finance_owner' }], values },
      );
    if (error.message === 'Supplier workforce time can only be reviewed by an Owner')
      return actionFail(
        403,
        'problem.approval.ownerReviewRequired',
        {},
        'This supplier time requires Owner review. Contact an Owner to decide it.',
        {
          code: 'APPROVAL_OWNER_REVIEW_REQUIRED',
          remedies: [{ id: 'contact_project_owner' }],
          values,
        },
      );
    if (error.message === 'Project review required')
      return actionFail(
        403,
        'problem.approval.reviewPermissionRequired',
        {},
        'You no longer have review access to this project. Contact a project reviewer.',
        {
          code: 'APPROVAL_REVIEW_PERMISSION_REQUIRED',
          remedies: [{ id: 'contact_project_reviewer' }],
          values,
        },
      );
  }
  if (!(error instanceof ConflictError) && !(error instanceof ValidationError))
    return actionFailure(error, { values });
  const message = error.message;
  const review = [{ id: 'review_updated_record', recordId: id }] as const;
  if (message === 'Expense is not submitted' || message === 'Time entry is not submitted')
    return actionFail(
      409,
      'problem.approval.recordNotSubmitted',
      { recordType: type },
      'This record is no longer submitted. Review its current status before deciding.',
      { code: 'APPROVAL_RECORD_NOT_SUBMITTED', remedies: review, values },
    );
  if (
    message === 'Expense changed before approval' ||
    message === 'Time entry changed or is not submitted'
  )
    return actionFail(
      409,
      'problem.approval.recordChanged',
      { recordType: type },
      'This record changed while you were reviewing it. Review the updated record before deciding.',
      { code: 'APPROVAL_RECORD_CHANGED', remedies: review, values },
    );
  if (
    message === 'Approved unlocked time required' ||
    message === 'Approved, classified, unlocked expense required'
  )
    return actionFail(
      409,
      'problem.approval.financeReviewUnavailable',
      { recordType: type },
      'Finance review is no longer available for this record. Review its current approval and billing status.',
      { code: 'FINANCE_REVIEW_UNAVAILABLE', remedies: review, values },
    );
  if (message === 'A reason is required')
    return actionFail(
      400,
      'problem.approval.reasonRequired',
      {},
      'Enter a reason before returning or rejecting this record.',
      {
        code: 'APPROVAL_REASON_REQUIRED',
        fieldErrors: { reason: ['A reason is required'] },
        values,
      },
    );
  return actionFailure(error, { values });
}

export const approvalActions = {
  approveRecord: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = approvalDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.approvalDecision', {}, 'Invalid approval decision');
    const context = openPortalRepository(locals);
    try {
      if (parsed.data.type === 'time')
        context.repository.operationalApproveTime(
          context.principal,
          parsed.data.id,
          parsed.data.decision,
          parsed.data.reason,
        );
      else
        context.repository.operationalApproveExpense(
          context.principal,
          parsed.data.id,
          parsed.data.decision,
          parsed.data.reason,
        );
      return actionSuccess('action.approval.decisionRecorded', {}, 'Decision recorded');
    } catch (error) {
      return approvalFailure(error, parsed.data.type, parsed.data.id, parsed.data);
    } finally {
      context.sqlite.close();
    }
  },
  financeApprove: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = financeDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.financeDecision', {}, 'Invalid finance decision');
    const context = openPortalRepository(locals);
    try {
      if (parsed.data.type === 'expense') {
        // A stale page can still submit after classification changes. Keep the
        // prerequisite explicit at the action boundary as well as in the UI.
        if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
          return actionFail(
            403,
            'problem.finance.roleRequired',
            {},
            'Finance access is required for this review.',
            {
              code: 'FINANCE_ROLE_REQUIRED',
              remedies: [{ id: 'contact_finance_owner' }],
              values: parsed.data,
            },
          );
        const expense = context.sqlite
          .prepare('SELECT commercial_classification_state FROM expense WHERE id=?')
          .get(parsed.data.id) as { commercial_classification_state: string } | undefined;
        if (expense && expense.commercial_classification_state !== 'classified')
          return actionFail(
            409,
            'problem.approval.expenseClassificationRequired',
            {},
            'Classify this expense in Finance before recording Finance review.',
            {
              code: 'EXPENSE_CLASSIFICATION_REQUIRED',
              remedies: [{ id: 'classify_expense', recordId: parsed.data.id }],
              values: parsed.data,
            },
          );
      }
      if (parsed.data.type === 'time')
        context.repository.financeApproveTime(
          context.principal,
          parsed.data.id,
          parsed.data.billable === 'yes',
        );
      else context.repository.financeApproveExpense(context.principal, parsed.data.id);
      return actionSuccess('action.approval.financeReviewRecorded', {}, 'Finance review recorded');
    } catch (error) {
      return approvalFailure(error, parsed.data.type, parsed.data.id, parsed.data);
    } finally {
      context.sqlite.close();
    }
  },
};
