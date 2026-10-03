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

type ExpenseDetailAction =
  | 'createCorrectionDraft'
  | 'withdrawCorrectionDraft'
  | 'withdrawCrewExpenseDraft'
  | 'submitExpense';

type ExpenseCorrectionOrigin = Readonly<{
  id: string;
  spentOn: string;
  projectNumber: string;
  projectName: string;
  category: string;
  approvalState: string;
}>;

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

const pmRetainedFields = new Set([
  'id',
  'version',
  'recordType',
  'originalId',
  'correctionId',
  'requestId',
  'reason',
  'vendor',
  'spentOn',
  'description',
  'category',
  'occurredTimeLocal',
  'timeEntryId',
]);

function roleSafeValues(values: Record<string, unknown>, projectManager: boolean) {
  if (!projectManager) return values;
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => pmRetainedFields.has(key) && typeof value === 'string',
    ),
  );
}

function retainedValues(form: FormData): Record<string, string> {
  const receipt = form.get('receipt');
  return {
    ...Object.fromEntries(
      Array.from(form.entries()).filter(
        (entry): entry is [string, string] =>
          retainedFields.has(entry[0]) && typeof entry[1] === 'string',
      ),
    ),
    ...(receipt instanceof File && receipt.size > 0 ? { receiptNeedsReattach: 'yes' } : {}),
  };
}

function detailFailure(
  result: unknown,
  actionName: ExpenseDetailAction,
  values: Record<string, string>,
  recordId: string,
  projectManager: boolean,
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
      values: roleSafeValues(
        {
          ...(payload.values && typeof payload.values === 'object' ? payload.values : {}),
          ...values,
        },
        projectManager,
      ),
      remedies,
      ...(projectManager && payload.fields && typeof payload.fields === 'object'
        ? {
            fields: Object.fromEntries(
              Object.entries(payload.fields).filter(([key]) => pmRetainedFields.has(key)),
            ) as Record<string, string[]>,
          }
        : {}),
      ...(payload.fieldErrors && typeof payload.fieldErrors === 'object'
        ? {
            fieldErrors: Object.fromEntries(
              Object.entries(payload.fieldErrors).filter(
                ([key]) => !projectManager || pmRetainedFields.has(key),
              ),
            ) as Record<string, string[]>,
          }
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
    const correctionLink = context.sqlite
      .prepare(
        `SELECT original_id FROM record_correction_link
          WHERE record_type='expense' AND correction_id=?
            AND tenant_id=(SELECT tenant_id FROM deployment_identity WHERE singleton=1)
          LIMIT 1`,
      )
      .get(params.id) as { original_id: string } | undefined;
    let correctionOrigin: ExpenseCorrectionOrigin | null = null;
    if (correctionLink) {
      try {
        const original = context.repository.expenseDetail(
          context.principal,
          correctionLink.original_id,
        ) as Record<string, unknown>;
        correctionOrigin = {
          id: String(original.id),
          spentOn: String(original.spent_on),
          projectNumber: String(original.project_number ?? ''),
          projectName: String(original.project_name ?? ''),
          category: String(original.category),
          approvalState: String(original.approval_state),
        };
      } catch (caught) {
        // A readable correction does not grant access to its original's metadata.
        if (!(caught instanceof AccessDeniedError || caught instanceof ValidationError))
          throw caught;
      }
    }
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
                WHERE g.expense_id=e.id AND g.completed=1) shared_receipt,
              (SELECT r.time_entry_id FROM operational_time_expense_request r
                WHERE r.expense_id=e.id LIMIT 1) linked_pair_time_id,
              (SELECT rec.recorded_by_user_id FROM crew_expense_recorder rec
                WHERE rec.expense_id=e.id LIMIT 1) crew_recorded_by
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
      linked_pair_time_id: string | null;
      crew_recorded_by: string | null;
    };
    const canReviewExpense =
      context.principal.role !== 'project_manager' ||
      Boolean(
        context.sqlite
          .prepare(
            `SELECT 1 FROM project_member
          WHERE project_id=? AND user_id=? AND status='active' AND can_review=1
            AND starts_on<=date('now') AND (ends_on IS NULL OR ends_on>=date('now')) LIMIT 1`,
          )
          .get(String(record.project_id), context.principal.userId),
      );
    const canCreateCorrection =
      canReviewExpense &&
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
      reviewOnly: false,
      expenseMoneyVisible: context.principal.role !== 'project_manager',
      locale: resolvePortalLocalePreference(
        url.searchParams.get('lang'),
        cookies.get('ja.portal.locale'),
        cookies.get('ja-portal-locale'),
      ),
      record,
      correctionOrigin,
      linkedPairTimeId: status.linked_pair_time_id,
      crewRecorded: Boolean(status.crew_recorded_by),
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
        canReviewExpense &&
        record.approval_state === 'draft' &&
        Boolean(status.correction_actor) &&
        (status.correction_actor === context.principal.userId ||
          context.principal.role === 'owner_admin'),
      canWithdrawCrewDraft:
        record.approval_state === 'draft' &&
        !status.linked_pair_time_id &&
        Boolean(status.crew_recorded_by) &&
        (context.principal.role === 'owner_admin' ||
          String(record.worker_id) === context.principal.userId ||
          status.crew_recorded_by === context.principal.userId),
      canSubmitDraft:
        record.approval_state === 'draft' &&
        !status.linked_pair_time_id &&
        (context.principal.role === 'owner_admin' ||
          String(record.worker_id) === context.principal.userId ||
          context.principal.role === 'worker'),
    };
  } catch (caught) {
    if (caught instanceof AccessDeniedError) {
      if (context.principal.role === 'project_manager') {
        // Queue membership is the narrow authority for operational review of an older record.
        // Its amount and finance fields must never enter the fallback page response.
        const queued = context.repository
          .listApprovalQueue(context.principal)
          .find((row) => row.type === 'expense' && row.id === params.id);
        if (
          queued &&
          typeof queued.project_id === 'string' &&
          typeof queued.approval_state === 'string'
        ) {
          const row = context.sqlite
            .prepare(
              `SELECT e.id,e.project_id,e.spent_on,e.approval_state,e.category,
                      e.vendor,e.description,u.name worker_name,
                      p.project_number,p.name project_name
                 FROM expense e
                 JOIN user u ON u.id=e.worker_id
                 JOIN project p ON p.id=e.project_id
                WHERE e.id=? AND e.project_id=? AND e.approval_state=?`,
            )
            .get(params.id, queued.project_id, queued.approval_state) as
            | {
                id: string;
                project_id: string;
                spent_on: string;
                approval_state: string;
                category: string;
                vendor: string;
                description: string;
                worker_name: string;
                project_number: string;
                project_name: string;
              }
            | undefined;
          if (row) {
            return {
              user: locals.user,
              locale: resolvePortalLocalePreference(
                url.searchParams.get('lang'),
                cookies.get('ja.portal.locale'),
                cookies.get('ja-portal-locale'),
              ),
              reviewOnly: true,
              expenseMoneyVisible: false,
              correctionOrigin: null,
              record: {
                id: row.id,
                project_id: row.project_id,
                spent_on: row.spent_on,
                approval_state: row.approval_state,
                category: row.category,
                vendor: row.vendor,
                description: row.description,
                worker_name: row.worker_name,
                project_number: row.project_number,
                project_name: row.project_name,
              },
            };
          }
        }
      }
      error(403, 'detail.expense.accessDenied');
    }
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
    return detailFailure(
      result,
      'createCorrectionDraft',
      values,
      event.params.id,
      event.locals.user?.role === 'project_manager',
    );
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
    return detailFailure(
      result,
      'withdrawCorrectionDraft',
      values,
      event.params.id,
      event.locals.user?.role === 'project_manager',
    );
  },
  withdrawCrewExpenseDraft: async (event) => {
    const values = retainedValues(await event.request.clone().formData());
    const result = await expenseActions.withdrawCrewExpenseDraft({
      ...event,
      params: { ...event.params, section: 'expenses' },
    });
    if ('success' in result && result.success === true) return result;
    return detailFailure(
      result,
      'withdrawCrewExpenseDraft',
      values,
      event.params.id,
      event.locals.user?.role === 'project_manager',
    );
  },
  submitExpense: async (event) => {
    const values = retainedValues(await event.request.clone().formData());
    const result = await expenseActions.submitExpense({
      ...event,
      params: { ...event.params, section: 'expenses' },
    });
    if ('success' in result && result.success === true)
      redirect(303, `/j-aautomation/app/expenses/${encodeURIComponent(event.params.id)}`);
    return detailFailure(
      result,
      'submitExpense',
      values,
      event.params.id,
      event.locals.user?.role === 'project_manager',
    );
  },
};
