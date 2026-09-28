import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { openPortalRepository } from '$lib/server/portal-repository';
import { AccessDeniedError, ValidationError } from '@ja/database';
import { reportActions } from '$lib/server/actions/operations-actions';
import { expenseActions } from '$lib/server/actions/expense-actions';
import { actionFail, type ActionMessageKey } from '$lib/server/actions/action-message';
import { expenseTimeOptions } from '$lib/server/expense-time-options';
import { resolvePortalLocalePreference } from '$lib/i18n/context';
import type { Actions, PageServerLoad } from './$types';

type ExpenseDetailAction = 'createCorrectionDraft' | 'withdrawCorrectionDraft' | 'submitExpense';

const retainedFields = new Set([
  'id',
  'version',
  'recordType',
  'originalId',
  'correctionId',
  'requestId',
  'correctionFields',
  'ownerOverride',
  'reason',
  'vendor',
  'spentOn',
  'description',
  'category',
  'amount',
  'occurredTimeLocal',
  'paymentMethod',
  'timeEntryId',
]);

function retainedValues(form: FormData): Record<string, string> {
  return Object.fromEntries(
    Array.from(form.entries()).filter(
      (entry): entry is [string, string] =>
        retainedFields.has(entry[0]) && typeof entry[1] === 'string',
    ),
  );
}

function detailFailure(
  result: unknown,
  actionName: ExpenseDetailAction,
  values: Record<string, string>,
  recordId: string,
) {
  const failure = result as { status?: number; data?: Record<string, unknown> };
  const payload = failure.data ?? {};
  const status = typeof failure.status === 'number' ? failure.status : 500;
  const originalKey =
    typeof payload.messageKey === 'string' ? payload.messageKey : 'problem.error.unexpected';
  const mapped =
    actionName === 'submitExpense' && originalKey === 'action.validation.expenseRecord'
      ? {
          key: 'problem.expenseDetail.submitFieldsInvalid',
          code: 'EXPENSE_SUBMISSION_FIELDS_INVALID',
          message: 'Review this expense before submitting it.',
        }
      : actionName === 'createCorrectionDraft' &&
          originalKey === 'action.validation.correctionDraft'
        ? {
            key: 'problem.expenseDetail.correctionFieldsInvalid',
            code: 'EXPENSE_CORRECTION_FIELDS_INVALID',
            message: 'Review the correction fields and reason before creating a draft.',
          }
        : actionName === 'withdrawCorrectionDraft' &&
            originalKey === 'action.validation.correctionDraft'
          ? {
              key: 'problem.expenseDetail.withdrawReasonInvalid',
              code: 'EXPENSE_CORRECTION_WITHDRAW_REASON_INVALID',
              message:
                'Enter at least three characters explaining why you are withdrawing this draft.',
            }
          : null;
  const messageKey = (mapped?.key ?? originalKey) as ActionMessageKey;
  const params =
    payload.params && typeof payload.params === 'object' && !Array.isArray(payload.params)
      ? (payload.params as Record<string, string | number | boolean | null>)
      : {};
  const originalRemedies =
    Array.isArray(payload.remedies) && payload.remedies.length
      ? payload.remedies
      : mapped
        ? [
            {
              id:
                actionName === 'submitExpense'
                  ? 'review_expense'
                  : actionName === 'withdrawCorrectionDraft'
                    ? 'enter_reason'
                    : 'review_expense_fields',
            },
          ]
        : [];
  const remedies = originalRemedies.map((remedy) =>
    remedy && typeof remedy === 'object' && 'id' in remedy && typeof remedy.id === 'string'
      ? { ...remedy, ...(remedy.id === 'review_expense' ? { recordId } : {}) }
      : remedy,
  );
  return actionFail(
    status,
    messageKey,
    params,
    mapped?.message ?? (typeof payload.message === 'string' ? payload.message : undefined),
    {
      ...payload,
      code: mapped?.code ?? (typeof payload.code === 'string' ? payload.code : undefined),
      actionName,
      values: {
        ...(payload.values && typeof payload.values === 'object' ? payload.values : {}),
        ...values,
      },
      remedies,
      ...(payload.fieldErrors && typeof payload.fieldErrors === 'object'
        ? { fieldErrors: payload.fieldErrors as Record<string, string[]> }
        : {}),
    },
  );
}

export const load: PageServerLoad = ({ locals, params, url, cookies }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const record = context.repository.expenseDetail(context.principal, params.id) as Record<
      string,
      unknown
    >;
    const status = context.sqlite
      .prepare(
        `SELECT e.invoice_id,e.billing_state,e.billing_lock_id,e.reimbursement_state,e.reimbursed_at,
              (SELECT c.id FROM record_correction_link l JOIN expense c ON c.id=l.correction_id
                WHERE l.record_type='expense' AND l.original_id=COALESCE(
                  (SELECT parent.original_id FROM record_correction_link parent
                    WHERE parent.record_type='expense' AND parent.correction_id=e.id LIMIT 1),e.id)
                  AND c.approval_state<>'rejected'
                ORDER BY l.created_at DESC LIMIT 1) active_id,
              (SELECT l.actor_user_id FROM record_correction_link l
                WHERE l.record_type='expense' AND l.correction_id=e.id LIMIT 1) correction_actor,
              EXISTS(SELECT 1 FROM crew_shared_expense_allocation_group g
                WHERE g.expense_id=e.id AND g.completed=1) shared_receipt
         FROM expense e WHERE e.id=?`,
      )
      .get(params.id) as {
      invoice_id: string | null;
      billing_state: string;
      billing_lock_id: string | null;
      reimbursement_state: string;
      reimbursed_at: string | null;
      active_id: string | null;
      correction_actor: string | null;
      shared_receipt: number;
    };
    const canCreateCorrection =
      ['approved', 'needs_changes'].includes(String(record.approval_state)) &&
      (!status.active_id ||
        (status.active_id === params.id && record.approval_state === 'needs_changes')) &&
      !status.invoice_id &&
      status.billing_state !== 'locked' &&
      !status.billing_lock_id &&
      status.reimbursement_state !== 'reimbursed' &&
      !status.reimbursed_at &&
      status.shared_receipt !== 1 &&
      (context.principal.role === 'owner_admin' ||
        context.principal.role === 'project_manager' ||
        context.principal.role === 'worker');
    return {
      user: locals.user,
      locale: resolvePortalLocalePreference(
        url.searchParams.get('lang'),
        cookies.get('ja.portal.locale'),
        cookies.get('ja-portal-locale'),
      ),
      record,
      correctionRequestId: randomUUID(),
      canCreateCorrection,
      correctionTimeOptions: canCreateCorrection
        ? expenseTimeOptions(context, {
            projectId: String(record.project_id),
            date: String(record.spent_on),
            workerId: String(record.worker_id),
          })
        : [],
      canWithdrawCorrection:
        record.approval_state === 'draft' &&
        Boolean(status.correction_actor) &&
        (status.correction_actor === context.principal.userId ||
          context.principal.role === 'owner_admin'),
      canSubmitDraft:
        record.approval_state === 'draft' &&
        (context.principal.role === 'owner_admin' ||
          String(record.worker_id) === context.principal.userId ||
          context.principal.role === 'worker'),
    };
  } catch (caught) {
    if (caught instanceof AccessDeniedError) error(403, 'detail.expense.accessDenied');
    if (caught instanceof ValidationError) error(404, 'detail.expense.notFound');
    throw caught;
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  createCorrectionDraft: async (event) => {
    const values = retainedValues(await event.request.clone().formData());
    const result = await reportActions.createCorrectionDraft({
      ...event,
      params: { ...event.params, section: 'expenses' },
    });
    if ('success' in result && result.success === true)
      redirect(
        303,
        `/j-aautomation/app/expenses/${encodeURIComponent(String(result.messageParams.correctionId))}`,
      );
    return detailFailure(result, 'createCorrectionDraft', values, event.params.id);
  },
  withdrawCorrectionDraft: async (event) => {
    const values = retainedValues(await event.request.clone().formData());
    const result = await reportActions.withdrawCorrectionDraft({
      ...event,
      params: { ...event.params, section: 'expenses' },
    });
    if ('success' in result && result.success === true)
      redirect(
        303,
        `/j-aautomation/app/expenses/${encodeURIComponent(String(result.messageParams.originalId))}`,
      );
    return detailFailure(result, 'withdrawCorrectionDraft', values, event.params.id);
  },
  submitExpense: async (event) => {
    const values = retainedValues(await event.request.clone().formData());
    const result = await expenseActions.submitExpense({
      ...event,
      params: { ...event.params, section: 'expenses' },
    });
    if ('success' in result && result.success === true)
      redirect(303, `/j-aautomation/app/expenses/${encodeURIComponent(event.params.id)}`);
    return detailFailure(result, 'submitExpense', values, event.params.id);
  },
};
