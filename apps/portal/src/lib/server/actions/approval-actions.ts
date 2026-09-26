import { approvalDecisionSchema, financeDecisionSchema } from '@ja/schemas';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess, type ActionMessageKey } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

const approvalValueFields = new Set(['id', 'type', 'decision', 'reason', 'billable']);

function approvalValues(object: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(object).filter(
      (entry): entry is [string, string] =>
        approvalValueFields.has(entry[0]) && typeof entry[1] === 'string',
    ),
  );
}

function decisionFieldErrors(
  errors: Record<string, string[] | undefined>,
  values: Record<string, string>,
  finance: boolean,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(errors).flatMap(([field, messages]) => {
      if (!messages?.length) return [];
      const key =
        field === 'reason'
          ? (values.reason?.length ?? 0) > 1000
            ? 'problem.approval.reasonInvalid'
            : 'problem.approval.reasonRequired'
          : finance && field === 'billable'
            ? 'problem.approval.financeTreatmentRequired'
            : finance
              ? 'problem.approval.financeFieldsInvalid'
              : 'problem.approval.decisionFieldsInvalid';
      return [[field, [key]]];
    }),
  );
}

function currentReviewStatus(
  context: ReturnType<typeof openPortalRepository>,
  type: 'time' | 'expense',
  id: string,
  scope: 'operational' | 'finance',
): string | undefined {
  const row = context.sqlite
    .prepare(
      type === 'time'
        ? 'SELECT approval_state,billability_state,billing_status,invoice_id FROM time_entry WHERE id=?'
        : 'SELECT approval_state,billing_state,finance_approved_at,invoice_id FROM expense WHERE id=?',
    )
    .get(id) as
    | {
        approval_state: string;
        billability_state?: string;
        billing_status?: string;
        billing_state?: string;
        finance_approved_at?: string | null;
        invoice_id?: string | null;
      }
    | undefined;
  if (!row) return undefined;
  if (scope === 'finance') {
    if (type === 'time' && ['billable', 'non_billable'].includes(row.billability_state ?? ''))
      return row.billability_state;
    if (type === 'expense' && row.finance_approved_at) return 'finance_reviewed';
    if (row.invoice_id || row.billing_status === 'locked' || row.billing_state === 'locked')
      return 'locked';
  }
  return row.approval_state;
}

export function approvalFailure(
  error: unknown,
  type: 'time' | 'expense',
  id: string,
  values: Record<string, unknown> = {},
  scope: 'operational' | 'finance' = 'operational',
  currentStatus?: string,
) {
  if (error instanceof AccessDeniedError) {
    if (error.message === 'Active account required')
      return actionFail(
        403,
        'problem.approval.accountInactive',
        {},
        'Your account is no longer active. Contact a project owner to review access.',
        {
          code: 'APPROVAL_ACCOUNT_INACTIVE',
          remedies: [{ id: 'contact_project_owner' }],
          values,
        },
      );
    if (error.message === 'Read-only role')
      return actionFail(
        403,
        'problem.approval.readOnlyRole',
        {},
        'Your role cannot record review decisions. Contact an authorized reviewer.',
        {
          code: 'APPROVAL_READ_ONLY_ROLE',
          remedies: [
            { id: scope === 'finance' ? 'contact_finance_owner' : 'contact_project_reviewer' },
          ],
          values,
        },
      );
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
  const statusParams = { recordType: type, ...(currentStatus ? { currentStatus } : {}) };
  if (message === 'Expense not found' || message === 'Time entry not found')
    return actionFail(
      404,
      'problem.approval.recordUnavailable',
      statusParams,
      'This record is no longer available in the review queue. Refresh the queue before deciding.',
      {
        code: 'APPROVAL_RECORD_UNAVAILABLE',
        remedies: [{ id: 'review_approval_queue' }],
        values,
      },
    );
  if (message === 'Expense is not submitted' || message === 'Time entry is not submitted')
    return actionFail(
      409,
      'problem.approval.recordNotSubmitted',
      statusParams,
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
      statusParams,
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
      statusParams,
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
        fieldErrors: { reason: ['problem.approval.reasonRequired'] },
        remedies: [{ id: 'enter_reason' }],
        values,
      },
    );
  return actionFailure(error, { values });
}

export const approvalActions = {
  approveRecord: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = approvalValues(object);
    const parsed = approvalDecisionSchema.safeParse(object);
    if (!parsed.success) {
      const fields = decisionFieldErrors(parsed.error.flatten().fieldErrors, values, false);
      const reasonError = fields.reason?.[0];
      return actionFail(
        400,
        (reasonError ?? 'problem.approval.decisionFieldsInvalid') as ActionMessageKey,
        {},
        reasonError === 'problem.approval.reasonRequired'
          ? 'Enter a reason before returning or rejecting this record.'
          : reasonError === 'problem.approval.reasonInvalid'
            ? 'Keep the review reason within 1,000 characters.'
            : 'Review the decision fields before recording this decision.',
        {
          code:
            reasonError === 'problem.approval.reasonRequired'
              ? 'APPROVAL_REASON_REQUIRED'
              : reasonError === 'problem.approval.reasonInvalid'
                ? 'APPROVAL_REASON_INVALID'
                : 'APPROVAL_DECISION_FIELDS_INVALID',
          actionName: 'approveRecord',
          values,
          fields,
          remedies: [{ id: reasonError ? 'enter_reason' : 'review_approval_queue' }],
        },
      );
    }
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
      return approvalFailure(
        error,
        parsed.data.type,
        parsed.data.id,
        values,
        'operational',
        error instanceof ConflictError
          ? currentReviewStatus(context, parsed.data.type, parsed.data.id, 'operational')
          : undefined,
      );
    } finally {
      context.sqlite.close();
    }
  },
  financeApprove: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = approvalValues(object);
    const parsed = financeDecisionSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'problem.approval.financeFieldsInvalid',
        {},
        'Choose a valid record and Finance treatment before recording the review.',
        {
          code: 'FINANCE_REVIEW_FIELDS_INVALID',
          actionName: 'financeApprove',
          values,
          fields: decisionFieldErrors(parsed.error.flatten().fieldErrors, values, true),
          remedies: [{ id: 'review_approval_queue' }],
        },
      );
    if (parsed.data.type === 'time' && parsed.data.billable === undefined)
      return actionFail(
        400,
        'problem.approval.financeTreatmentRequired',
        { recordType: 'time' },
        'Choose billable or non-billable treatment for approved time before recording Finance review.',
        {
          code: 'FINANCE_REVIEW_TREATMENT_REQUIRED',
          actionName: 'financeApprove',
          values,
          fields: { billable: ['problem.approval.financeTreatmentRequired'] },
          remedies: [{ id: 'review_updated_record', recordId: parsed.data.id }],
        },
      );
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
              values,
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
              values,
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
      return approvalFailure(
        error,
        parsed.data.type,
        parsed.data.id,
        values,
        'finance',
        error instanceof ConflictError
          ? currentReviewStatus(context, parsed.data.type, parsed.data.id, 'finance')
          : undefined,
      );
    } finally {
      context.sqlite.close();
    }
  },
};
