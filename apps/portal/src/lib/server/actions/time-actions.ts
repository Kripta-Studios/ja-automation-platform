import { expenseInputSchema, timeInputSchema, versionedRecordSchema } from '@ja/schemas';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess, type ActionMessageKey } from './action-message';
import { decimalToMinor, formObject, type PortalActionEvent } from '$lib/server/action-utils';
import { mondayOf } from '$lib/server/portal-week';

export const parseTimeUpdateForm = (input: Record<string, unknown>) =>
  timeInputSchema.and(versionedRecordSchema).safeParse(input);

const timeValueFields = new Set([
  'id',
  'version',
  'workerId',
  'projectId',
  'workDate',
  'category',
  'activityCode',
  'minutes',
  'summary',
  'site',
  'startTime',
  'endTime',
  'breakMinutes',
  'withExpense',
  'requestId',
  'expenseVendor',
  'expenseCategory',
  'expenseDescription',
  'expenseCurrency',
  'expenseAmount',
  'expenseWhoPaid',
  'expenseOccurredTimeLocal',
  'expensePaymentMethod',
  'sourceWeekStart',
  'targetWeekStart',
  'weekStart',
  'entries',
]);

function safeTimeValues(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] =>
        timeValueFields.has(entry[0]) && typeof entry[1] === 'string',
    ),
  );
}

type TimeProblem = {
  status: number;
  code: string;
  key: ActionMessageKey;
  message: string;
  field?: string;
  remedy: string;
};

const timeProblems: Record<string, TimeProblem> = {
  'Week changed. Refresh and review its drafts before submitting': {
    status: 409,
    code: 'TIME_WEEK_CHANGED',
    key: 'problem.time.weekChanged',
    message: 'The week changed after you opened it. Review its current drafts before submitting.',
    remedy: 'review_week',
  },
  'Linked meal no longer matches its time entry': {
    status: 409,
    code: 'TIME_LINKED_MEAL_CHANGED',
    key: 'problem.time.linkedMealChanged',
    message:
      'A linked meal no longer matches its time entry. Review both drafts before submitting the week.',
    remedy: 'review_week',
  },
  'Time entry changed or cannot be submitted': {
    status: 409,
    code: 'TIME_SUBMISSION_CHANGED',
    key: 'problem.time.submissionChanged',
    message:
      'This time entry changed or is no longer a draft. Review its current state before submitting.',
    remedy: 'review_time',
  },
  'Time entry changed or cannot be edited': {
    status: 409,
    code: 'TIME_DRAFT_CHANGED',
    key: 'problem.time.draftChanged',
    message:
      'This time entry changed while you were editing. Review the current draft before saving.',
    remedy: 'review_time',
  },
  'Only an unlocked never-submitted time draft can change': {
    status: 409,
    code: 'TIME_NOT_EDITABLE_DRAFT',
    key: 'problem.time.notEditableDraft',
    message:
      'Only an unlocked time draft that has never been submitted can be edited. Review the record or request a correction.',
    remedy: 'review_time',
  },
  'Active project assignment required': {
    status: 403,
    code: 'TIME_ASSIGNMENT_REQUIRED',
    key: 'problem.time.assignmentRequired',
    message:
      'An active project assignment must cover this work date. Contact the project owner to review access.',
    field: 'workDate',
    remedy: 'contact_project_owner',
  },
  'Project assignment access required': {
    status: 403,
    code: 'TIME_ASSIGNMENT_REQUIRED',
    key: 'problem.time.assignmentRequired',
    message:
      'An active project assignment must cover this work date. Contact the project owner to review access.',
    field: 'workDate',
    remedy: 'contact_project_owner',
  },
  'Active worker assignment required': {
    status: 403,
    code: 'TIME_WORKER_ASSIGNMENT_REQUIRED',
    key: 'problem.time.workerAssignmentRequired',
    message:
      'The selected worker has no active assignment covering this work date. Review the worker and date.',
    field: 'workerId',
    remedy: 'review_worker_assignment',
  },
  'Time intervals cannot overlap for the same worker and date': {
    status: 400,
    code: 'TIME_INTERVAL_OVERLAP',
    key: 'problem.time.intervalOverlap',
    message:
      'This worker already has time recorded in the selected interval. Adjust the start or end time.',
    field: 'startTime',
    remedy: 'review_time',
  },
  'Time and expense retry has changed': {
    status: 409,
    code: 'TIME_EXPENSE_RETRY_CHANGED',
    key: 'problem.time.expenseRetryChanged',
    message:
      'This time and meal request was already used with different details. Review the saved drafts before trying again.',
    remedy: 'review_time',
  },
  'A linked correction draft cannot be edited': {
    status: 409,
    code: 'TIME_CORRECTION_DRAFT_LOCKED',
    key: 'problem.time.correctionDraftLocked',
    message: 'This linked correction draft cannot be edited here. Review its correction record.',
    remedy: 'review_time',
  },
  'Returned, submitted, or approved time requires the reviewed correction path': {
    status: 409,
    code: 'TIME_CORRECTION_REQUIRED',
    key: 'problem.time.correctionRequired',
    message: 'Reviewed time cannot be deleted. Open the record and request an audited correction.',
    remedy: 'review_time',
  },
  'Locked or invoiced time is immutable and cannot be voided': {
    status: 409,
    code: 'TIME_LOCKED_OR_INVOICED',
    key: 'problem.time.lockedOrInvoiced',
    message: 'Locked or invoiced time cannot be voided. Contact Finance for an audited adjustment.',
    remedy: 'contact_finance',
  },
  'This crew time is linked to an allocated receipt and cannot be deleted': {
    status: 409,
    code: 'TIME_ALLOCATED_RECEIPT',
    key: 'problem.time.allocatedReceipt',
    message:
      'This crew time is linked to an allocated receipt. Review the allocation and request a documented correction.',
    remedy: 'review_time',
  },
  'This crew time is linked to an allocated receipt; its work date cannot change': {
    status: 409,
    code: 'TIME_ALLOCATED_RECEIPT_DATE_LOCKED',
    key: 'problem.time.allocatedReceiptDateLocked',
    message:
      'The work date cannot change while this crew time is linked to an allocated receipt. Review the allocation and request a documented correction.',
    field: 'workDate',
    remedy: 'review_time',
  },
  'Time entry changed or cannot be deleted': {
    status: 409,
    code: 'TIME_DELETE_CHANGED',
    key: 'problem.time.deleteChanged',
    message: 'This time entry changed before deletion. Review its current state.',
    remedy: 'review_time',
  },
  'Time entry changed or cannot be discarded': {
    status: 409,
    code: 'TIME_DELETE_CHANGED',
    key: 'problem.time.deleteChanged',
    message: 'This time entry changed before deletion. Review its current state.',
    remedy: 'review_time',
  },
  'A time batch can contain only one entry per day': {
    status: 400,
    code: 'TIME_BATCH_DUPLICATE_DAY',
    key: 'problem.time.batchDuplicateDay',
    message:
      'The batch contains more than one entry for a day. Keep one entry per day and save again.',
    field: 'entries',
    remedy: 'review_week',
  },
  'Week start must be a Monday': {
    status: 400,
    code: 'TIME_WEEK_START_INVALID',
    key: 'problem.time.weekStartInvalid',
    message: 'Select a week that starts on Monday, then review its drafts before submitting.',
    field: 'weekStart',
    remedy: 'review_week',
  },
  'Minutes must be an integer from 0 to 1440': {
    status: 400,
    code: 'TIME_MINUTES_INVALID',
    key: 'problem.time.minutesInvalid',
    message: 'Enter a whole number of minutes between 0 and 1440.',
    field: 'minutes',
    remedy: 'review_time',
  },
  'A worker cannot enter more than 1440 minutes per day': {
    status: 400,
    code: 'TIME_DAILY_LIMIT',
    key: 'problem.time.dailyLimit',
    message: 'This worker already has time on the selected day. Total time cannot exceed 24 hours.',
    field: 'workDate',
    remedy: 'review_time',
  },
  'Start and end time must be provided together': {
    status: 400,
    code: 'TIME_INTERVAL_INCOMPLETE',
    key: 'problem.time.intervalIncomplete',
    message: 'Enter both start and end time, or leave both empty.',
    field: 'startTime',
    remedy: 'review_time',
  },
  'End time must be later on the same day': {
    status: 400,
    code: 'TIME_INTERVAL_ORDER_INVALID',
    key: 'problem.time.intervalOrderInvalid',
    message: 'End time must be later than start time on the same day.',
    field: 'endTime',
    remedy: 'review_time',
  },
  'Break minutes must be an integer within the shift': {
    status: 400,
    code: 'TIME_BREAK_INVALID',
    key: 'problem.time.breakInvalid',
    message: 'Break minutes must be a whole number within the shift.',
    field: 'breakMinutes',
    remedy: 'review_time',
  },
  'Break minutes are invalid': {
    status: 400,
    code: 'TIME_BREAK_INVALID',
    key: 'problem.time.breakInvalid',
    message: 'Break minutes must be a whole number within the shift.',
    field: 'breakMinutes',
    remedy: 'review_time',
  },
  'Minutes must equal elapsed time less break minutes': {
    status: 400,
    code: 'TIME_DURATION_MISMATCH',
    key: 'problem.time.durationMismatch',
    message: 'Recorded minutes must equal the time between start and end, less the break.',
    field: 'minutes',
    remedy: 'review_time',
  },
};

/** Domain-specific repository verdicts keep the same contract as other SvelteKit actions. */
export function timeActionFailure(error: unknown, values: Record<string, unknown> = {}) {
  const savedValues = safeTimeValues(values);
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof AccessDeniedError
  ) {
    const known = timeProblems[error.message];
    if (known)
      return actionFail(known.status, known.key, {}, known.message, {
        code: known.code,
        values: savedValues,
        ...(known.field ? { fields: { [known.field]: [known.message] } } : {}),
        remedies: [{ id: known.remedy }],
      });
  }
  return actionFailure(error, { values: savedValues });
}

export const timeActions = {
  createTimeBatch: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const workerId = String(object.workerId ?? '');
    let rawEntries: unknown;
    try {
      rawEntries = JSON.parse(String(object.entries ?? ''));
    } catch {
      return actionFail(400, 'action.validation.timeFields', {}, 'Check batch time fields', {
        values: safeTimeValues(object),
      });
    }
    if (!Array.isArray(rawEntries) || rawEntries.length < 1 || rawEntries.length > 31)
      return actionFail(400, 'action.validation.timeFields', {}, 'Choose 1 to 31 daily entries', {
        values: safeTimeValues(object),
      });
    const parsed = rawEntries.map((entry) => timeInputSchema.safeParse(entry));
    if (parsed.some((entry) => !entry.success))
      return actionFail(400, 'action.validation.timeFields', {}, 'Check batch time fields', {
        values: safeTimeValues(object),
      });
    const context = openPortalRepository(locals);
    try {
      if (context.principal.role !== 'owner_admin')
        return actionFail(403, 'action.access.denied', {}, 'Owner access required');
      const result = context.repository.createTimeBatch(
        context.principal,
        workerId,
        parsed.map((entry) => entry.data!),
      );
      return actionSuccess(
        'action.time.batchDraftsSaved',
        { count: result.created.length },
        `${result.created.length} daily time drafts saved`,
      );
    } catch (error) {
      return timeActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  createTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeTimeValues(object);
    const workerId =
      typeof object.workerId === 'string' && object.workerId ? object.workerId : undefined;
    delete object.workerId;
    const withExpense = object.withExpense === 'on';
    delete object.withExpense;
    const requestId = typeof object.requestId === 'string' ? object.requestId : '';
    delete object.requestId;
    const expenseFields = {
      vendor: object.expenseVendor,
      category: object.expenseCategory,
      description: object.expenseDescription,
      currency: object.expenseCurrency,
      amountMinor: decimalToMinor(object.expenseAmount),
      whoPaid: object.expenseWhoPaid,
      occurredTimeLocal: object.expenseOccurredTimeLocal,
      paymentMethod: object.expensePaymentMethod,
    };
    for (const key of [
      'expenseVendor',
      'expenseCategory',
      'expenseDescription',
      'expenseCurrency',
      'expenseAmount',
      'expenseWhoPaid',
      'expenseOccurredTimeLocal',
      'expensePaymentMethod',
    ])
      delete object[key];
    const parsed = timeInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.timeFields', {}, 'Check time fields', {
        fields: parsed.error.flatten().fieldErrors,
        values,
      });
    const parsedExpense = withExpense
      ? expenseInputSchema.safeParse({
          ...expenseFields,
          projectId: parsed.data.projectId,
          spentOn: parsed.data.workDate,
          receiptRequired: false,
          paymentMethod: expenseFields.paymentMethod || undefined,
        })
      : null;
    if (withExpense && expenseFields.category !== 'meals')
      return actionFail(
        400,
        'action.validation.expenseFields',
        {},
        'Only meals can be added in Log time',
        {
          code: 'TIME_LINKED_EXPENSE_MEALS_ONLY',
          values,
          fields: { expenseCategory: ['Choose meals for an expense linked to logged time.'] },
        },
      );
    if (withExpense && !/^[a-zA-Z0-9_-]{16,200}$/u.test(requestId))
      return actionFail(400, 'action.validation.expenseFields', {}, 'Check expense fields', {
        fields: { requestId: ['Refresh the form and try again'] },
        values,
      });
    if (parsedExpense && !parsedExpense.success) {
      const fields = Object.fromEntries(
        Object.entries(parsedExpense.error.flatten().fieldErrors).map(([key, errors]) => [
          `expense${key[0]!.toUpperCase()}${key.slice(1).replace(/Minor$/u, '')}`,
          errors,
        ]),
      );
      return actionFail(400, 'action.validation.expenseFields', {}, 'Check expense fields', {
        fields,
        values,
      });
    }
    const context = openPortalRepository(locals);
    try {
      if (parsedExpense?.success) {
        context.repository.createTimeWithExpense(
          context.principal,
          parsed.data,
          parsedExpense.data,
          requestId,
          workerId,
        );
        return actionSuccess('action.time.expenseDraftsSaved', {}, 'Time and expense drafts saved');
      }
      context.repository.createTimeEntry(context.principal, parsed.data, workerId);
      return actionSuccess('action.time.draftSaved', {}, 'Time draft saved');
    } catch (error) {
      return timeActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
  copyTimeLayout: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const targetWeekStart = mondayOf(
      typeof object.targetWeekStart === 'string' ? object.targetWeekStart : null,
    );
    const sourceWeekStart = mondayOf(
      typeof object.sourceWeekStart === 'string' ? object.sourceWeekStart : null,
    );
    if (sourceWeekStart === targetWeekStart)
      return actionFail(
        400,
        'action.validation.timeSourceWeekDifferent',
        {},
        'Choose a different source week',
        {
          code: 'TIME_SOURCE_WEEK_SAME',
          values: safeTimeValues(object),
          fields: { sourceWeekStart: ['Choose a different source week.'] },
        },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.copyOwnTimeLayout(
        context.principal,
        sourceWeekStart,
        targetWeekStart,
      );
      return actionSuccess(
        'action.time.layoutCopied',
        { created: result.created, targetWeekStart },
        `${result.created} layout draft${result.created === 1 ? '' : 's'} added for ${targetWeekStart}; hours remain 0.`,
      );
    } catch (error) {
      return timeActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  updateTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = parseTimeUpdateForm(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.timeFields', {}, 'Check time fields', {
        fields: parsed.error.flatten().fieldErrors,
        values: safeTimeValues(object),
      });
    const context = openPortalRepository(locals);
    try {
      const interval =
        parsed.data.startTime !== undefined && parsed.data.endTime !== undefined
          ? {
              startTime: parsed.data.startTime,
              endTime: parsed.data.endTime,
              breakMinutes: parsed.data.breakMinutes ?? 0,
            }
          : {};
      context.repository.updateTimeEntry(context.principal, {
        id: parsed.data.id,
        version: parsed.data.version,
        workDate: parsed.data.workDate,
        category: parsed.data.category,
        activityCode: parsed.data.activityCode,
        minutes: parsed.data.minutes,
        summary: parsed.data.summary,
        ...interval,
      });
      return actionSuccess('action.time.draftUpdated', {}, 'Time draft updated');
    } catch (error) {
      return timeActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  submitTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.timeRecord', {}, 'Invalid time record', {
        values: safeTimeValues(object),
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.submitTime(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess('action.time.submitted', {}, 'Time submitted');
    } catch (error) {
      return timeActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  submitTimeWeek: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const workerId = String(object.workerId ?? '');
    const weekStart = String(object.weekStart ?? '');
    let expected: unknown;
    try {
      expected = JSON.parse(String(object.entries ?? ''));
    } catch {
      return actionFail(400, 'action.validation.timeRecord', {}, 'Refresh the week and try again', {
        code: 'TIME_WEEK_SELECTION_INVALID',
        values: safeTimeValues(object),
        remedies: [{ id: 'review_week' }],
      });
    }
    if (
      !Array.isArray(expected) ||
      expected.length < 1 ||
      expected.length > 200 ||
      expected.some(
        (row) =>
          !row ||
          typeof row !== 'object' ||
          typeof row.id !== 'string' ||
          !Number.isInteger(row.version) ||
          row.version < 1,
      )
    )
      return actionFail(400, 'action.validation.timeRecord', {}, 'Refresh the week and try again', {
        code: 'TIME_WEEK_SELECTION_INVALID',
        values: safeTimeValues(object),
        remedies: [{ id: 'review_week' }],
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.submitTimeWeek(
        context.principal,
        workerId,
        weekStart,
        expected as Array<{ id: string; version: number }>,
      );
      return actionSuccess(
        'action.time.weekSubmitted',
        result,
        `${result.timeSubmitted} time drafts and ${result.mealsSubmitted} linked meal expenses submitted`,
      );
    } catch (error) {
      return timeActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  deleteTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time' && params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.timeRecord', {}, 'Invalid time record', {
        values: safeTimeValues(object),
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteTime(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess('action.time.removedOrVoided', {}, 'Time entry removed/voided');
    } catch (error) {
      return timeActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
};
