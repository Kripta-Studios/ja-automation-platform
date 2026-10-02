import {
  accountingPackPeriodSchema,
  availabilityInputSchema,
  dailyReportInputSchema,
  planningAssignmentInputSchema,
  reportDecisionSchema,
  skillInputSchema,
  technicalChangeDecisionSchema,
  technicalChangeInputSchema,
  technicalReportInputSchema,
  versionedRecordSchema,
  workerSkillInputSchema,
  uuidSchema,
} from '@ja/schemas';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
  type PortalRepository,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  actionFail,
  actionFailure,
  actionSuccess,
  type ActionMessageKey,
  type ActionMessageParams,
} from './action-message';
import {
  formObject,
  normalizeLocalDateTime,
  type PortalActionEvent,
} from '$lib/server/action-utils';
import { buildCorrectionPatch } from './correction-draft-fields';
import {
  expenseActionFailure,
  saveExpenseReceipt,
  validateExpenseReceipt,
} from './expense-actions';
import {
  timeCorrectionDependency,
  timeCorrectionDependencyProblem,
} from './time-correction-dependency';

const reportValueFields = new Set([
  'id',
  'type',
  'version',
  'recordType',
  'recordId',
  'originalId',
  'correctionId',
  'workerId',
  'projectId',
  'reportDate',
  'workDate',
  'title',
  'summary',
  'activities',
  'findings',
  'recommendations',
  'siteShift',
  'tasksCompleted',
  'clientDecisions',
  'problemsFound',
  'correctiveActions',
  'blockers',
  'downtimeMinutes',
  'standbyReason',
  'openItems',
  'nextDayPlan',
  'systemName',
  'plantSite',
  'areaLine',
  'stationMachine',
  'systemType',
  'plcPlatform',
  'controller',
  'hmiScada',
  'networkProtocol',
  'softwareVersion',
  'programReference',
  'problemSymptom',
  'diagnosisRootCause',
  'changePerformed',
  'productionImpact',
  'validation',
  'validationResult',
  'openRisk',
  'rollbackPlan',
  'customerContact',
  'safetyRelated',
  'safetyImpact',
  'reason',
  'requestId',
  'ownerOverride',
  'correctionFields',
  'periodStart',
  'periodEnd',
  'fromDate',
  'toDate',
  'contentMode',
  'technicalReportIds',
  'technicalReportId',
  'component',
  'originalBehavior',
  'rootCause',
  'changeMade',
  'rollbackInformation',
]);

function safeReportValues(values: Record<string, unknown>): Record<string, string | string[]> {
  const scalar = Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] =>
        reportValueFields.has(entry[0]) && typeof entry[1] === 'string',
    ),
  );
  const selected = Array.isArray(values.technicalReportIds)
    ? values.technicalReportIds.filter((value): value is string => typeof value === 'string')
    : undefined;
  return { ...scalar, ...(selected ? { technicalReportIds: selected } : {}) };
}

const timeCorrectionValueFields = new Set([
  'recordType',
  'originalId',
  'requestId',
  'correctionFields',
  'ownerOverride',
  'reason',
  'workDate',
  'category',
  'minutes',
  'activitySummary',
  'activityCode',
  'site',
  'startTime',
  'endTime',
  'breakMinutes',
]);

function safeTimeCorrectionValues(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] =>
        timeCorrectionValueFields.has(entry[0]) && typeof entry[1] === 'string',
    ),
  );
}

const expenseCorrectionValueFields = new Set([
  'recordType',
  'originalId',
  'correctionId',
  'version',
  'requestId',
  'reason',
  'correctionFields',
  'ownerOverride',
  'vendor',
  'spentOn',
  'description',
  'category',
  'amount',
  'occurredTimeLocal',
  'paymentMethod',
  'timeEntryId',
]);

function safeExpenseCorrectionValues(values: Record<string, unknown>): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(values).filter(
        (entry): entry is [string, string] =>
          expenseCorrectionValueFields.has(entry[0]) && typeof entry[1] === 'string',
      ),
    ),
    ...((values.receipt instanceof File && values.receipt.size > 0) || values.receiptNeedsReattach
      ? { receiptNeedsReattach: 'yes' }
      : {}),
  };
}

type ExpenseCorrectionProblem = Readonly<{
  code: string;
  key: ActionMessageKey;
  message: string;
  remedy: string;
  field?: string;
  status?: number;
}>;

const expenseCorrectionProblems: Readonly<Record<string, ExpenseCorrectionProblem>> = {
  'Correction reason is required': {
    code: 'EXPENSE_CORRECTION_REASON_INVALID',
    key: 'problem.expenseDetail.correctionReasonInvalid',
    message: 'Explain the correction in at least three characters.',
    remedy: 'enter_reason',
    field: 'reason',
  },
  'Correction reason must contain at least 3 characters': {
    code: 'EXPENSE_CORRECTION_REASON_INVALID',
    key: 'problem.expenseDetail.correctionReasonInvalid',
    message: 'Explain the correction in at least three characters.',
    remedy: 'enter_reason',
    field: 'reason',
  },
  'Original record not found': {
    code: 'EXPENSE_CORRECTION_RECORD_UNAVAILABLE',
    key: 'problem.expenseDetail.correctionRecordUnavailable',
    message: 'The expense is no longer available. Review the expenses list.',
    remedy: 'review_expenses',
    status: 404,
  },
  'Expense not found': {
    code: 'EXPENSE_CORRECTION_RECORD_UNAVAILABLE',
    key: 'problem.expenseDetail.correctionRecordUnavailable',
    message: 'The expense is no longer available. Review the expenses list.',
    remedy: 'review_expenses',
    status: 404,
  },
  'Correction request payload conflicts with prior replay': {
    code: 'EXPENSE_CORRECTION_RETRY_CHANGED',
    key: 'problem.expenseDetail.correctionRetryChanged',
    message:
      'This correction request ID was already used with different details. Review the saved correction before retrying.',
    remedy: 'review_expense',
  },
  'A correction draft already exists for this original record': {
    code: 'EXPENSE_CORRECTION_ALREADY_EXISTS',
    key: 'problem.expenseDetail.correctionAlreadyExists',
    message: 'A corrected draft already exists for this expense. Review the existing correction.',
    remedy: 'review_expense',
  },
  'Only approved or reviewer-returned expenses can create a correction draft': {
    code: 'EXPENSE_CORRECTION_STATE_BLOCKED',
    key: 'problem.expenseDetail.correctionStateBlocked',
    message:
      'Only an approved or reviewer-returned expense can create a corrected draft. Review its current state.',
    remedy: 'review_expense',
  },
  'Financially finalized records require a finance correction': {
    code: 'EXPENSE_CORRECTION_FINANCIALLY_FINALIZED',
    key: 'problem.expenseDetail.correctionFinanciallyFinalized',
    message:
      'This expense has finalized billing or another financial lock. Contact Finance for an audited adjustment.',
    remedy: 'contact_finance',
  },
  'Reimbursed expense requires an explicit adjustment': {
    code: 'EXPENSE_CORRECTION_REIMBURSED',
    key: 'problem.expenseDetail.correctionReimbursed',
    message: 'This expense has already been reimbursed. Contact Finance for an audited adjustment.',
    remedy: 'contact_finance',
  },
  'Returned correction changed before retry creation': {
    code: 'EXPENSE_CORRECTION_CHANGED',
    key: 'problem.expenseDetail.correctionBlocked',
    message:
      'This expense changed or is no longer eligible for a corrected draft. Review its current state before trying again.',
    remedy: 'review_expense',
  },
  'Change at least one operational field before creating a correction': {
    code: 'EXPENSE_CORRECTION_NO_CHANGES',
    key: 'problem.expenseDetail.correctionNoChanges',
    message: 'Change at least one operational expense field before creating a corrected draft.',
    remedy: 'review_expense_fields',
  },
  'Expense category is invalid': {
    code: 'EXPENSE_CORRECTION_CATEGORY_INVALID',
    key: 'problem.expenseDetail.correctionExpenseCategoryInvalid',
    message: 'Choose a valid expense category.',
    remedy: 'review_expense_fields',
    field: 'category',
  },
  'Expense amount is invalid': {
    code: 'EXPENSE_CORRECTION_AMOUNT_INVALID',
    key: 'problem.expense.amountInvalid',
    message: 'Enter an expense amount greater than zero.',
    remedy: 'review_expense_fields',
    field: 'amount',
  },
  'Expense occurrence time is invalid': {
    code: 'EXPENSE_CORRECTION_OCCURRENCE_TIME_INVALID',
    key: 'problem.expenseDetail.correctionOccurrenceTimeInvalid',
    message: 'Enter a valid time when the expense occurred.',
    remedy: 'review_expense_fields',
    field: 'occurredTimeLocal',
  },
  'Expense description is too short': {
    code: 'EXPENSE_CORRECTION_DESCRIPTION_INVALID',
    key: 'problem.expenseDetail.correctionExpenseDescriptionInvalid',
    message: 'Enter an expense description of at least three characters.',
    remedy: 'review_expense_fields',
    field: 'description',
  },
  'Related logged hours are invalid': {
    code: 'EXPENSE_CORRECTION_TIME_LINK_INVALID',
    key: 'problem.expense.timeLinkInvalid',
    message:
      'The linked time entry must be active and match this worker, project, and date. Review the time entry.',
    remedy: 'review_expense_fields',
    field: 'timeEntryId',
  },
  'Related logged hours no longer match the corrected expense': {
    code: 'EXPENSE_CORRECTION_TIME_LINK_INVALID',
    key: 'problem.expense.timeLinkInvalid',
    message:
      'The linked time entry must be active and match this worker, project, and date. Review the time entry.',
    remedy: 'review_expense_fields',
    field: 'timeEntryId',
  },
  'Withdrawal reason is required': {
    code: 'EXPENSE_CORRECTION_WITHDRAW_REASON_INVALID',
    key: 'problem.expenseDetail.withdrawReasonInvalid',
    message: 'Enter at least three characters explaining why you are withdrawing this draft.',
    remedy: 'enter_reason',
    field: 'reason',
  },
  'Correction withdrawal is invalid': {
    code: 'EXPENSE_CORRECTION_WITHDRAW_FIELDS_INVALID',
    key: 'problem.expenseDetail.withdrawFieldsInvalid',
    message: 'Review the correction draft details before withdrawing it.',
    remedy: 'review_expense',
  },
  'Correction draft changed before withdrawal': {
    code: 'EXPENSE_CORRECTION_WITHDRAW_CHANGED',
    key: 'problem.expenseDetail.withdrawBlocked',
    message:
      'This correction draft changed or can no longer be withdrawn. Review its current state.',
    remedy: 'review_expense',
  },
  'Only an unreviewed correction draft can be withdrawn': {
    code: 'EXPENSE_CORRECTION_WITHDRAW_REVIEWED',
    key: 'problem.expenseDetail.withdrawReviewed',
    message:
      'This correction draft has review or financial history and can no longer be withdrawn. Review the record.',
    remedy: 'review_expense',
  },
};

function expenseCorrectionFailure(
  error: unknown,
  values: Record<string, unknown>,
  actionName: 'createCorrectionDraft' | 'withdrawCorrectionDraft',
) {
  if (values.recordType !== 'expense') return reportActionFailure(error, values);
  const savedValues = safeExpenseCorrectionValues(values);
  if (
    error instanceof Error &&
    [
      'Receipt content is already registered to another record',
      'Committed owned receipt required',
      'Receipt must belong to the expense project',
      'A committed receipt is required',
      'This receipt is allocated across crew shifts and cannot be edited. Create a documented correction instead.',
    ].includes(error.message)
  ) {
    const failure = expenseActionFailure(error, values);
    return actionFail(
      failure.status,
      failure.data.messageKey,
      failure.data.params ?? {},
      failure.data.message,
      {
        ...failure.data,
        actionName,
        values: savedValues,
        fieldErrors: Object.fromEntries(
          Object.entries(failure.data.fieldErrors).map(([field, messages]) => [
            field,
            [...messages],
          ]),
        ),
      },
    );
  }
  const withdrawing = actionName === 'withdrawCorrectionDraft';
  const permissionError = error instanceof AccessDeniedError;
  const linkedTimeAccessError =
    permissionError && error.message === 'A matching active time record is required';
  const known = linkedTimeAccessError
    ? { ...expenseCorrectionProblems['Related logged hours are invalid']!, status: 409 }
    : error instanceof ValidationError || error instanceof ConflictError
      ? expenseCorrectionProblems[error.message]
      : undefined;
  const fieldMatch =
    error instanceof ValidationError
      ? /^(vendor|spentOn|description|category|amount|occurredTimeLocal|paymentMethod|timeEntryId) is (?:required|invalid)$/.exec(
          error.message,
        )
      : null;
  const fallback: ExpenseCorrectionProblem | undefined =
    error instanceof ConflictError
      ? withdrawing
        ? {
            code: 'EXPENSE_CORRECTION_WITHDRAW_CHANGED',
            key: 'problem.expenseDetail.withdrawBlocked',
            message:
              'This correction draft changed or can no longer be withdrawn. Review its current state.',
            remedy: 'review_expense',
          }
        : {
            code: 'EXPENSE_CORRECTION_CHANGED',
            key: 'problem.expenseDetail.correctionBlocked',
            message:
              'This expense changed or is no longer eligible for a corrected draft. Review its current state before trying again.',
            remedy: 'review_expense',
          }
      : error instanceof ValidationError
        ? withdrawing
          ? {
              code: 'EXPENSE_CORRECTION_WITHDRAW_FIELDS_INVALID',
              key: 'problem.expenseDetail.withdrawFieldsInvalid',
              message: 'Review the correction draft details before withdrawing it.',
              remedy: 'review_expense',
            }
          : {
              code: 'EXPENSE_CORRECTION_FIELDS_INVALID',
              key: 'problem.expenseDetail.correctionFieldsInvalid',
              message: 'Review the correction fields and reason before creating a draft.',
              remedy: 'review_expense_fields',
              ...(fieldMatch ? { field: fieldMatch[1] } : {}),
            }
        : undefined;
  const problem: ExpenseCorrectionProblem | undefined =
    permissionError && !linkedTimeAccessError
      ? ({
          code: withdrawing
            ? 'EXPENSE_CORRECTION_WITHDRAW_ACCESS_REQUIRED'
            : 'EXPENSE_CORRECTION_ACCESS_REQUIRED',
          key: withdrawing
            ? 'problem.expenseDetail.withdrawAccessRequired'
            : 'problem.expenseDetail.correctionAccessRequired',
          message: withdrawing
            ? 'You cannot withdraw this correction draft. Contact the project owner to review access.'
            : 'You cannot create this correction draft. Contact the project owner to review access.',
          remedy: 'contact_project_owner',
          status: 403,
        } satisfies ExpenseCorrectionProblem)
      : (known ?? fallback);
  if (!problem) return reportActionFailure(error, { ...values, actionName });
  const status =
    problem.status ??
    (error instanceof AccessDeniedError ? 403 : error instanceof ConflictError ? 409 : 400);
  const recordId = String(values[withdrawing ? 'correctionId' : 'originalId'] ?? '');
  return actionFail(status, problem.key, {}, problem.message, {
    code: problem.code,
    actionName,
    values: savedValues,
    ...(problem.field ? { fields: { [problem.field]: [problem.key] } } : {}),
    remedies: [{ id: problem.remedy, ...(recordId ? { recordId } : {}) }],
  });
}

type ReportProblem = {
  status: number;
  code: string;
  key: ActionMessageKey;
  message: string;
  field?: string;
  remedy: string;
};
const reportProblems: Record<string, ReportProblem> = {
  'Read-only role': {
    status: 403,
    code: 'REPORT_READ_ONLY_ROLE',
    key: 'problem.report.readOnlyRole',
    message:
      'Your read-only role cannot change reports. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Record not found': {
    status: 404,
    code: 'RECORD_UNAVAILABLE',
    key: 'problem.report.recordUnavailable',
    message: 'This record is no longer available. Review the current list before trying again.',
    remedy: 'review_report',
  },
  'Record creator access required': {
    status: 403,
    code: 'RECORD_DELETE_CREATOR_REQUIRED',
    key: 'problem.report.creatorAccessRequired',
    message:
      'Only the draft creator or an owner can delete this record. Contact the project owner.',
    remedy: 'contact_project_owner',
  },
  'Financially linked records cannot be deleted': {
    status: 409,
    code: 'RECORD_FINANCIALLY_LINKED',
    key: 'problem.report.financiallyLinked',
    message:
      'This record is linked to billing or another financial lock. Contact Finance for an audited adjustment.',
    remedy: 'contact_finance',
  },
  'Correction drafts are immutable and cannot be deleted': {
    status: 409,
    code: 'RECORD_CORRECTION_DRAFT_IMMUTABLE',
    key: 'problem.report.correctionDraftImmutable',
    message:
      'This correction draft is part of the audit history and cannot be deleted. Review its current record.',
    remedy: 'review_report',
  },
  'Technical reports with changes cannot be deleted': {
    status: 409,
    code: 'REPORT_TECHNICAL_CHANGES_LINKED',
    key: 'problem.report.technicalChangesLinked',
    message:
      'This technical report has linked changes. Review those changes before deleting the draft.',
    remedy: 'review_report',
  },
  'Record approval history cannot be deleted': {
    status: 409,
    code: 'RECORD_REVIEW_HISTORY_LOCKED',
    key: 'problem.report.recordReviewHistoryLocked',
    message: 'This record has review history and cannot be deleted. Request an audited correction.',
    remedy: 'review_report',
  },
  'This time entry is linked to another record and cannot be deleted': {
    status: 409,
    code: 'TIME_DELETE_LINKED_RECORD',
    key: 'problem.report.linkedTimeRecord',
    message:
      'This time entry is linked to another record. Review its links and request a documented correction.',
    remedy: 'review_time',
  },
  'Linked time and meal drafts must be withdrawn together': {
    status: 409,
    code: 'LINKED_DRAFT_DELETE_REQUIRES_PAIR_WITHDRAWAL',
    key: 'problem.linkedDraft.deleteTogether',
    message:
      'This meal belongs to a linked time and meal draft pair. Withdraw both drafts together.',
    remedy: 'review_expense',
  },
  'Report access required': {
    status: 403,
    code: 'REPORT_ACCESS_REQUIRED',
    key: 'problem.report.accessRequired',
    message: 'You cannot open this report. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Report submission access required': {
    status: 403,
    code: 'REPORT_SUBMISSION_ACCESS_REQUIRED',
    key: 'problem.report.submissionAccessRequired',
    message: 'You cannot submit this report. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Report not found': {
    status: 404,
    code: 'REPORT_NOT_FOUND',
    key: 'problem.report.notFound',
    message: 'This report is no longer available. Review the report list.',
    remedy: 'review_reports',
  },
  'Sign in required': {
    status: 401,
    code: 'REPORT_SIGN_IN_REQUIRED',
    key: 'problem.report.signInRequired',
    message: 'Your session ended. Sign in again before continuing with reports.',
    remedy: 'sign_in_again',
  },
  'Report edit access required': {
    status: 403,
    code: 'REPORT_EDIT_ACCESS_REQUIRED',
    key: 'problem.report.editAccessRequired',
    message: 'You cannot edit this report. Ask the project owner to review your access.',
    remedy: 'contact_project_owner',
  },
  'Active account required': {
    status: 403,
    code: 'REPORT_ACTIVE_ACCOUNT_REQUIRED',
    key: 'problem.report.activeAccountRequired',
    message:
      'Your account is no longer active. Contact an owner to review access before working with reports.',
    remedy: 'contact_project_owner',
  },
  'Project review required': {
    status: 403,
    code: 'REPORT_ASSIGNMENT_REQUIRED',
    key: 'problem.report.assignmentRequired',
    message:
      'An effective project assignment must cover the report date. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Technical report date provenance must be native': {
    status: 409,
    code: 'REPORT_DATE_PROVENANCE_CHANGED',
    key: 'problem.report.dateProvenanceChanged',
    message:
      'This technical report date has a different source. Review the current report before saving.',
    remedy: 'review_report',
  },
  'Downtime must be between 0 and 1440 minutes': {
    status: 400,
    code: 'REPORT_DOWNTIME_INVALID',
    key: 'problem.report.downtimeInvalid',
    message: 'Downtime must be between 0 and 1440 minutes. Review the entered minutes.',
    field: 'downtimeMinutes',
    remedy: 'review_report_fields',
  },
  'Report changed or cannot be edited': {
    status: 409,
    code: 'REPORT_DRAFT_CHANGED',
    key: 'problem.report.draftChanged',
    message:
      'This report changed while you were editing. Review the current version before saving.',
    remedy: 'review_report',
  },
  'Report changed before submission': {
    status: 409,
    code: 'REPORT_SUBMISSION_CHANGED',
    key: 'problem.report.submissionChanged',
    message:
      'This report changed since you opened it. Review the updated version before submitting.',
    remedy: 'review_report',
  },
  'Report status blocks submission': {
    status: 409,
    code: 'REPORT_SUBMISSION_STATE_BLOCKED',
    key: 'problem.report.submissionStateBlocked',
    message:
      'This report can no longer be submitted. Only Draft or Needs changes reports can be submitted. Review its current status.',
    remedy: 'review_report',
  },
  'Submitted or approved reports require an audited correction draft before editing': {
    status: 409,
    code: 'REPORT_CORRECTION_REQUIRED',
    key: 'problem.report.correctionRequired',
    message: 'Submitted or approved reports require an audited correction draft before editing.',
    remedy: 'request_report_correction',
  },
  'This report is part of a finalized report and cannot be edited': {
    status: 409,
    code: 'REPORT_FINALIZED',
    key: 'problem.report.finalized',
    message:
      'This report is part of a finalized report. Review the current record and request a versioned correction.',
    remedy: 'review_report',
  },
  'A linked correction draft cannot be edited': {
    status: 409,
    code: 'REPORT_CORRECTION_DRAFT_LOCKED',
    key: 'problem.report.correctionDraftLocked',
    message: 'This linked correction draft cannot be edited here. Review its correction record.',
    remedy: 'review_report',
  },
  'Only never-submitted draft reports can be deleted': {
    status: 409,
    code: 'REPORT_DELETE_DRAFT_ONLY',
    key: 'problem.report.deleteDraftOnly',
    message:
      'Only a report draft that has never been submitted can be deleted. Review the report or request a correction.',
    remedy: 'review_report',
  },
  'Only never-submitted drafts can be deleted': {
    status: 409,
    code: 'RECORD_DELETE_DRAFT_ONLY',
    key: 'problem.report.deleteDraftOnly',
    message:
      'Only a draft that has never been submitted can be deleted. Review the record or request a correction.',
    remedy: 'review_report',
  },
  'Report approval history cannot be deleted': {
    status: 409,
    code: 'REPORT_REVIEW_HISTORY_LOCKED',
    key: 'problem.report.reviewHistoryLocked',
    message: 'This report has review history and cannot be deleted. Request an audited correction.',
    remedy: 'review_report',
  },
  'Finalized reports cannot be deleted': {
    status: 409,
    code: 'REPORT_FINALIZED',
    key: 'problem.report.finalized',
    message:
      'This report is part of a finalized report. Review the current record and request a versioned correction.',
    remedy: 'review_report',
  },
  'Remove linked technical changes before deleting this report': {
    status: 409,
    code: 'REPORT_LINKED_TECHNICAL_CHANGES',
    key: 'problem.report.linkedTechnicalChanges',
    message:
      'This report has linked technical changes. Review those changes before deleting the draft.',
    remedy: 'review_report',
  },
  'Record changed before deletion': {
    status: 409,
    code: 'RECORD_DELETE_CHANGED',
    key: 'problem.report.deleteChanged',
    message: 'This record changed before deletion. Review its current state.',
    remedy: 'review_report',
  },
  'Report changed or cannot be deleted': {
    status: 409,
    code: 'REPORT_DELETE_CHANGED',
    key: 'problem.report.deleteChanged',
    message: 'This report changed before deletion. Review its current state.',
    remedy: 'review_report',
  },
  'Report is not submitted': {
    status: 409,
    code: 'REPORT_REVIEW_STATE_CHANGED',
    key: 'problem.report.reviewStateChanged',
    message:
      'This report is no longer submitted for review. Open the current version before deciding.',
    remedy: 'review_report',
  },
  'Active project required for report submission': {
    status: 403,
    code: 'REPORT_PROJECT_NOT_ACTIVE',
    key: 'problem.report.projectNotActive',
    message:
      'The project is no longer active for report submission. Contact the project owner to review its status.',
    remedy: 'contact_project_owner',
  },
  'Operational project access required': {
    status: 403,
    code: 'REPORT_PROJECT_NOT_ACTIVE',
    key: 'problem.report.projectNotActive',
    message:
      'The project is no longer available for report drafts. Contact the project owner to review its status.',
    remedy: 'contact_project_owner',
  },
  'Project assignment access required': {
    status: 403,
    code: 'REPORT_ASSIGNMENT_REQUIRED',
    key: 'problem.report.assignmentRequired',
    message:
      'An effective project assignment must cover the report date. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Effective project assignment required for submission': {
    status: 403,
    code: 'REPORT_ASSIGNMENT_REQUIRED',
    key: 'problem.report.assignmentRequired',
    message:
      'An effective project assignment must cover the report date. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Active project assignment required': {
    status: 403,
    code: 'REPORT_ASSIGNMENT_REQUIRED',
    key: 'problem.report.assignmentRequired',
    message:
      'An effective project assignment must cover the report date. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Safety-related changes require validation and rollback details': {
    status: 400,
    code: 'REPORT_SAFETY_DETAILS_REQUIRED',
    key: 'problem.report.safetyDetailsRequired',
    message: 'Safety-related changes require validation and rollback details before saving.',
    field: 'validation',
    remedy: 'review_report',
  },
  'Project access required': {
    status: 403,
    code: 'TECHNICAL_CHANGE_PROJECT_ACCESS_REQUIRED',
    key: 'problem.report.technicalChangeProjectAccessRequired',
    message:
      'You cannot save a change for this project. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Technical change submission access required': {
    status: 403,
    code: 'TECHNICAL_CHANGE_SUBMISSION_ACCESS_REQUIRED',
    key: 'problem.report.technicalChangeSubmissionAccessRequired',
    message: 'You cannot submit this technical change. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Active project required for technical change submission': {
    status: 403,
    code: 'TECHNICAL_CHANGE_PROJECT_NOT_ACTIVE',
    key: 'problem.report.technicalChangeProjectNotActive',
    message:
      'The project is no longer active for technical change submission. Contact the project owner to review its status.',
    remedy: 'contact_project_owner',
  },
  'Effective project assignment required for technical change submission': {
    status: 403,
    code: 'TECHNICAL_CHANGE_ASSIGNMENT_REQUIRED',
    key: 'problem.report.technicalChangeAssignmentRequired',
    message:
      'An effective project assignment must cover this change. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Technical change changed or cannot be submitted': {
    status: 409,
    code: 'TECHNICAL_CHANGE_SUBMISSION_CHANGED',
    key: 'problem.report.technicalChangeSubmissionChanged',
    message:
      'This technical change changed or is no longer a draft. Review its current version before submitting.',
    remedy: 'review_reports',
  },
  'Technical report does not belong to the project': {
    status: 400,
    code: 'TECHNICAL_CHANGE_REPORT_MISMATCH',
    key: 'problem.report.technicalChangeReportMismatch',
    message: 'Select a technical report from the same project as this change.',
    field: 'technicalReportId',
    remedy: 'review_report_fields',
  },
  'Safety-impacting changes require validation and rollback information': {
    status: 400,
    code: 'TECHNICAL_CHANGE_SAFETY_DETAILS_REQUIRED',
    key: 'problem.report.technicalChangeSafetyDetailsRequired',
    message: 'Enter validation and rollback information for this safety-impacting change.',
    field: 'validation',
    remedy: 'review_report_fields',
  },
};

const technicalChangeProblemMessages = new Set([
  'Project access required',
  'Technical change submission access required',
  'Active project required for technical change submission',
  'Effective project assignment required for technical change submission',
  'Technical change changed or cannot be submitted',
  'Technical report does not belong to the project',
  'Safety-impacting changes require validation and rollback information',
]);

export function reportActionFailure(
  error: unknown,
  values: Record<string, unknown> = {},
  params: ActionMessageParams = {},
) {
  const savedValues = safeReportValues(values);
  const actionName =
    values.actionName === 'updateReport' ||
    values.actionName === 'submitReport' ||
    values.actionName === 'createTechnicalChange' ||
    values.actionName === 'submitTechnicalChange'
      ? values.actionName
      : undefined;
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof AccessDeniedError ||
    error instanceof V3ValidationError ||
    error instanceof V3ConflictError ||
    error instanceof V3AccessDeniedError
  ) {
    const known = reportProblems[error.message];
    if (
      known &&
      (!technicalChangeProblemMessages.has(error.message) ||
        actionName === 'createTechnicalChange' ||
        actionName === 'submitTechnicalChange')
    ) {
      const remedy =
        known.remedy === 'review_report' && savedValues.recordType === 'time_entry'
          ? 'review_time'
          : known.remedy === 'review_report' && savedValues.recordType === 'expense'
            ? 'review_expense'
            : known.remedy;
      return actionFail(known.status, known.key, params, known.message, {
        code: known.code,
        values: savedValues,
        ...(actionName ? { actionName } : {}),
        ...(known.field
          ? {
              fields:
                known.code === 'REPORT_SAFETY_DETAILS_REQUIRED' ||
                known.code === 'TECHNICAL_CHANGE_SAFETY_DETAILS_REQUIRED'
                  ? Object.fromEntries(
                      (known.code === 'REPORT_SAFETY_DETAILS_REQUIRED'
                        ? (['validation', 'rollbackPlan'] as const)
                        : (['validation', 'rollbackInformation'] as const)
                      )
                        .filter((field) => !String(savedValues[field] ?? '').trim())
                        .map((field) => [field, [known.key]]),
                    )
                  : { [known.field]: [known.key] },
            }
          : {}),
        remedies: [{ id: remedy }],
      });
    }
  }
  return actionFailure(error, { values: savedValues, ...(actionName ? { actionName } : {}) });
}

const timeCorrectionCreateProblems: Readonly<Record<string, ReportProblem>> = {
  'A correction draft already exists for this original record': {
    status: 409,
    code: 'TIME_CORRECTION_ALREADY_EXISTS',
    key: 'problem.time.correctionAlreadyExists',
    message:
      'A corrected draft already exists for this time entry. Review the existing correction before creating another.',
    remedy: 'review_time',
  },
  'Correction request payload conflicts with prior replay': {
    status: 409,
    code: 'TIME_CORRECTION_RETRY_CHANGED',
    key: 'problem.time.correctionRetryChanged',
    message:
      'This correction request ID was already used with different details. Review the saved correction before trying again.',
    remedy: 'review_time',
  },
  'Only approved or reviewer-returned time can create a correction draft': {
    status: 409,
    code: 'TIME_CORRECTION_STATE_BLOCKED',
    key: 'problem.time.correctionStateBlocked',
    message:
      "Only approved or reviewer-returned time can be corrected. Review the time entry's current status.",
    remedy: 'review_time',
  },
  'Financially finalized records require a finance correction': {
    status: 409,
    code: 'TIME_CORRECTION_FINANCIALLY_FINALIZED',
    key: 'problem.time.correctionFinanciallyFinalized',
    message:
      'This time entry is locked by billing or another final financial state. Contact Finance for an audited adjustment.',
    remedy: 'contact_finance',
  },
  'Settled compensation time requires an explicit adjustment': {
    status: 409,
    code: 'TIME_CORRECTION_SETTLED_COMPENSATION',
    key: 'problem.time.correctionSettledCompensation',
    message:
      'This time has settled or paid worker compensation. Contact Finance for an explicit adjustment before any new correction.',
    remedy: 'contact_finance',
  },
  'Returned correction changed before retry creation': {
    status: 409,
    code: 'TIME_CORRECTION_RETURNED_CHANGED',
    key: 'problem.time.correctionReturnedChanged',
    message:
      'The returned correction changed before the new draft was created. Review the current correction before trying again.',
    remedy: 'review_time',
  },
};

const timeCorrectionCreateAccessProblem: ReportProblem = {
  status: 403,
  code: 'TIME_CORRECTION_ACCESS_REQUIRED',
  key: 'problem.time.correctionAccessRequired',
  message:
    'You can no longer create a correction for this time entry under your current access. Contact the project owner to review access.',
  remedy: 'contact_project_owner',
};

const timeCorrectionCreateValidationProblems: Readonly<Record<string, ReportProblem>> = {
  'Correction reason is required': {
    status: 400,
    code: 'TIME_CORRECTION_REASON_INVALID',
    key: 'problem.time.correctionReasonInvalid',
    message: 'Explain the correction in 3 to 2,000 characters.',
    field: 'reason',
    remedy: 'enter_reason',
  },
  'Correction reason must contain at least 3 characters': {
    status: 400,
    code: 'TIME_CORRECTION_REASON_INVALID',
    key: 'problem.time.correctionReasonInvalid',
    message: 'Explain the correction in 3 to 2,000 characters.',
    field: 'reason',
    remedy: 'enter_reason',
  },
  'Time entry not found': {
    status: 404,
    code: 'TIME_CORRECTION_RECORD_UNAVAILABLE',
    key: 'problem.time.correctionRecordUnavailable',
    message:
      'This time entry is no longer available. Review the current time register before creating a correction.',
    remedy: 'review_week',
  },
  'Original record not found': {
    status: 404,
    code: 'TIME_CORRECTION_RECORD_UNAVAILABLE',
    key: 'problem.time.correctionRecordUnavailable',
    message:
      'This time entry is no longer available. Review the current time register before creating a correction.',
    remedy: 'review_week',
  },
};

const timeCorrectionDateAssignmentProblem: ReportProblem = {
  status: 409,
  code: 'TIME_CORRECTION_DATE_ASSIGNMENT_REQUIRED',
  key: 'problem.time.correctionDateAssignmentRequired',
  message:
    "The worker's active assignment does not cover the corrected work date. Review the date and ask the project owner to review the assignment before trying again.",
  field: 'workDate',
  remedy: 'contact_project_owner',
};

const timeCorrectionAssignmentAccessProblem: ReportProblem = {
  status: 403,
  code: 'TIME_CORRECTION_ASSIGNMENT_ACCESS_CHANGED',
  key: 'problem.time.correctionAssignmentAccessChanged',
  message:
    'Your project assignment no longer permits a correction for this original time entry. Contact the project owner to review your access before trying again.',
  remedy: 'contact_project_owner',
};

const timeCorrectionCorrectedDateAccessProblem: ReportProblem = {
  status: 403,
  code: 'TIME_CORRECTION_CORRECTED_DATE_ACCESS_REQUIRED',
  key: 'problem.time.correctionCorrectedDateAccessRequired',
  message:
    'Your project access does not cover the corrected work date. Review the date and contact the project owner to update your assignment before trying again.',
  field: 'workDate',
  remedy: 'contact_project_owner',
};

function timeCorrectionCreateFailure(error: unknown, values: Record<string, unknown>) {
  let known: ReportProblem | undefined;
  if (error instanceof ConflictError) known = timeCorrectionCreateProblems[error.message];
  else if (error instanceof ValidationError)
    known = timeCorrectionCreateValidationProblems[error.message];
  else if (error instanceof AccessDeniedError) {
    if (error.message === 'Correction access required') known = timeCorrectionCreateAccessProblem;
    else if (error.message === 'Project assignment access required')
      known = timeCorrectionAssignmentAccessProblem;
    else if (error.message === 'Corrected work date outside project access')
      known = timeCorrectionCorrectedDateAccessProblem;
    else if (error.message === 'Worker assignment does not cover corrected work date')
      known = timeCorrectionDateAssignmentProblem;
  }
  if (!known) return null;
  return actionFail(known.status, known.key, {}, known.message, {
    code: known.code,
    actionName: 'createCorrectionDraft',
    values: safeTimeCorrectionValues(values),
    ...(known.field ? { fields: { [known.field]: [known.key] } } : {}),
    remedies: [{ id: known.remedy }],
  });
}

const timeWithdrawalProblems: Record<string, ReportProblem> = {
  'Correction draft changed before withdrawal': {
    status: 409,
    code: 'TIME_CORRECTION_WITHDRAW_CHANGED',
    key: 'problem.time.correctionWithdrawChanged',
    message:
      'This correction draft changed or was already withdrawn. Review the current record before trying again.',
    remedy: 'review_time',
  },
  'Only an unreviewed correction draft can be withdrawn': {
    status: 409,
    code: 'TIME_CORRECTION_WITHDRAW_REVIEWED',
    key: 'problem.time.correctionWithdrawReviewed',
    message:
      'This correction draft has review or financial history and can no longer be withdrawn. Review the record and request an audited correction.',
    remedy: 'review_time',
  },
  'Correction withdrawal access required': {
    status: 403,
    code: 'TIME_CORRECTION_WITHDRAW_ACCESS_REQUIRED',
    key: 'problem.time.correctionWithdrawAccessRequired',
    message:
      'You can no longer withdraw this correction draft under your current access. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Delegated correction withdrawal requires crew authorization': {
    status: 403,
    code: 'TIME_CORRECTION_WITHDRAW_CREW_ACCESS_REQUIRED',
    key: 'problem.time.correctionWithdrawCrewAccessRequired',
    message:
      'Your crew delegation no longer permits withdrawing this correction draft. Contact the project owner to review access.',
    remedy: 'contact_project_owner',
  },
  'Live authenticated session required': {
    status: 401,
    code: 'TIME_CORRECTION_WITHDRAW_SESSION_EXPIRED',
    key: 'problem.time.correctionWithdrawSessionExpired',
    message:
      'Your owner session ended. Sign in again, then review the correction draft before withdrawing.',
    remedy: 'sign_in_again',
  },
  'Withdrawal reason is required': {
    status: 400,
    code: 'TIME_CORRECTION_WITHDRAW_REASON_INVALID',
    key: 'problem.time.correctionWithdrawReasonInvalid',
    message: 'Explain why you are withdrawing this draft in at least three characters.',
    field: 'reason',
    remedy: 'enter_reason',
  },
  'Correction withdrawal is invalid': {
    status: 400,
    code: 'TIME_CORRECTION_WITHDRAW_REQUEST_INVALID',
    key: 'problem.time.correctionWithdrawRequestInvalid',
    message:
      'This withdrawal form is missing a valid correction or version. Review the current draft before trying again.',
    remedy: 'review_time',
  },
};

function timeCorrectionWithdrawalFailure(error: unknown, values: Record<string, unknown>) {
  const savedValues = safeReportValues(values);
  const known =
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof AccessDeniedError ||
    error instanceof V3ValidationError ||
    error instanceof V3ConflictError ||
    error instanceof V3AccessDeniedError
      ? (timeWithdrawalProblems[error.message] ?? reportProblems[error.message])
      : undefined;
  if (known) {
    const remedy = [
      'enter_reason',
      'contact_project_owner',
      'contact_finance',
      'sign_in_again',
    ].includes(known.remedy)
      ? known.remedy
      : 'review_time';
    return actionFail(known.status, known.key, {}, known.message, {
      code: known.code,
      actionName: 'withdrawCorrectionDraft',
      values: savedValues,
      ...(known.field ? { fieldErrors: { [known.field]: [known.key] } } : {}),
      remedies: [{ id: remedy }],
    });
  }
  return actionFailure(error, {
    actionName: 'withdrawCorrectionDraft',
    values: savedValues,
    remedies: [
      { id: error instanceof AccessDeniedError ? 'contact_project_owner' : 'review_time' },
    ],
  });
}

function safetyDetailsSchemaFailure(
  safetyRelated: unknown,
  issues: readonly { path: PropertyKey[] }[],
  values: Record<string, unknown>,
) {
  if (
    safetyRelated !== true ||
    issues.length === 0 ||
    !issues.every((issue) => ['validation', 'rollbackPlan'].includes(String(issue.path[0])))
  )
    return null;
  return reportActionFailure(
    new ValidationError('Safety-related changes require validation and rollback details'),
    values,
  );
}

function reportInputFailure(
  actionName: string,
  code: string,
  key: ActionMessageKey,
  message: string,
  values: Record<string, unknown>,
  fields: Record<string, string[] | undefined> = {},
  remedy = 'review_report_fields',
) {
  return actionFail(400, key, {}, message, {
    code,
    actionName,
    values: safeReportValues(values),
    fields,
    fieldErrors: fields,
    remedies: [{ id: remedy }],
  });
}

function correctionInputFailure(
  actionName: 'createCorrectionDraft' | 'withdrawCorrectionDraft',
  recordType: string,
  key: ActionMessageKey,
  code: string,
  message: string,
  values: Record<string, unknown>,
  invalidFields: readonly string[],
) {
  const fields = Object.fromEntries(invalidFields.map((field) => [field, [key]]));
  return reportInputFailure(
    actionName,
    code,
    key,
    message,
    values,
    fields,
    recordType === 'time_entry' && invalidFields.length === 1 && invalidFields[0] === 'reason'
      ? 'enter_reason'
      : recordType === 'time_entry'
        ? 'review_time'
        : 'review_report_fields',
  );
}

type WorkforceOperation =
  | 'createPlanning'
  | 'updatePlanning'
  | 'cancelPlanning'
  | 'createSkill'
  | 'setWorkerSkill'
  | 'updateSkill'
  | 'deleteSkill'
  | 'deleteWorkerSkill'
  | 'setAvailability';

const planningFields = [
  'id',
  'version',
  'projectId',
  'workerId',
  'workerIds',
  'requestKey',
  'startsAt',
  'endsAt',
  'plannedMinutes',
  'site',
  'requiredSkill',
] as const;

function safeWorkforceValues(
  values: Record<string, unknown>,
  fields: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = values[field];
      return typeof value === 'string' || typeof value === 'number' ? [[field, String(value)]] : [];
    }),
  );
}

type WorkforceProblem = Readonly<{
  key: ActionMessageKey;
  code: string;
  message: string;
  status: number;
  remedy: string;
  field?: string;
}>;

function workforceProblem(
  problem: WorkforceProblem,
  operation: WorkforceOperation,
  values: Record<string, string>,
) {
  const fields = problem.field ? { [problem.field]: [problem.key] } : undefined;
  return actionFail(problem.status, problem.key, {}, problem.message, {
    code: problem.code,
    operation,
    values,
    remedies: [{ id: problem.remedy }],
    ...(fields ? { fields, fieldErrors: fields } : {}),
  });
}

function workforceInputFailure(
  operation: WorkforceOperation,
  code: string,
  key: ActionMessageKey,
  message: string,
  values: Record<string, string>,
  fields: Record<string, string[] | undefined>,
  remedy: string,
) {
  return actionFail(400, key, {}, message, {
    code,
    operation,
    values,
    fields,
    fieldErrors: fields,
    remedies: [{ id: remedy }],
  });
}

function commonWorkforceProblem(error: unknown): WorkforceProblem | null {
  if (!(error instanceof AccessDeniedError)) return null;
  if (error.message === 'Sign in required')
    return {
      key: 'problem.workforce.sessionEnded',
      code: 'WORKFORCE_SESSION_ENDED',
      message: 'Your session ended. Sign in again before saving.',
      status: 401,
      remedy: 'sign_in_again',
    };
  if (error.message === 'Active account required')
    return {
      key: 'problem.workforce.accountInactive',
      code: 'WORKFORCE_ACCOUNT_INACTIVE',
      message: 'Your account is no longer active. Contact an owner to review access.',
      status: 403,
      remedy: 'contact_owner',
    };
  if (
    error.message === 'Read-only role' ||
    error.message === 'Read-only role cannot modify workforce data'
  )
    return {
      key: 'problem.workforce.readOnly',
      code: 'WORKFORCE_READ_ONLY',
      message:
        'Your read-only role cannot save workforce changes. Contact an owner if access needs review.',
      status: 403,
      remedy: 'contact_owner',
    };
  return null;
}

function planningActionFailure(
  error: unknown,
  operation: 'createPlanning' | 'updatePlanning' | 'cancelPlanning',
  values: Record<string, string>,
) {
  const common = commonWorkforceProblem(error);
  if (common) return workforceProblem(common, operation, values);
  if (error instanceof AccessDeniedError) {
    const managerExpired = error.message === 'Project assignment is not currently effective';
    return workforceProblem(
      {
        key: managerExpired
          ? 'problem.planning.managerAssignmentExpired'
          : 'problem.planning.accessRequired',
        code: managerExpired ? 'PLANNING_MANAGER_ASSIGNMENT_EXPIRED' : 'PLANNING_ACCESS_REQUIRED',
        message: managerExpired
          ? 'Your project assignment is no longer effective. Ask the project owner to review it before changing planning.'
          : 'Your role or project access does not permit this planning change. Contact the project owner.',
        status: 403,
        remedy: 'contact_project_owner',
      },
      operation,
      values,
    );
  }
  if (!(error instanceof ValidationError || error instanceof ConflictError))
    return actionFailure(error, { operation, values });
  const messages: Record<string, WorkforceProblem> = {
    'Worker must have an effective project assignment for the planning window': {
      key: 'action.planning.workerNotAssigned',
      code: 'PLANNING_WORKER_NOT_ASSIGNED',
      message: 'Worker must have an effective project assignment for the planning window',
      field: operation === 'createPlanning' ? 'workerIds' : 'workerId',
      status: 400,
      remedy: 'review_worker_assignments',
    },
    'Worker already has an overlapping planning assignment': {
      key: 'action.planning.workerOverlap',
      code: 'PLANNING_WORKER_OVERLAP',
      message: 'Worker already has an overlapping planning assignment',
      field: 'startsAt',
      status: 409,
      remedy: 'review_planning',
    },
    'Worker is unavailable for this planning window': {
      key: 'action.planning.workerUnavailable',
      code: 'PLANNING_WORKER_UNAVAILABLE',
      message: 'Worker is unavailable for this planning window',
      field: 'startsAt',
      status: 409,
      remedy: 'review_availability',
    },
    'Planning end must follow a valid start': {
      key: 'action.planning.invalidWindow',
      code: 'PLANNING_WINDOW_INVALID',
      message: 'Planning end must follow a valid start',
      field: 'endsAt',
      status: 400,
      remedy: 'review_planning_fields',
    },
    'Planned minutes must be between 0 and 10080': {
      key: 'action.planning.invalidMinutes',
      code: 'PLANNING_MINUTES_INVALID',
      message: 'Planned minutes must be between 0 and 10080',
      field: 'plannedMinutes',
      status: 400,
      remedy: 'review_planning_fields',
    },
    'Planning publish request changed; reload before publishing': {
      key: 'action.planning.changed',
      code: 'PLANNING_PUBLISH_REQUEST_CHANGED',
      message:
        'This publication was already saved with different values. Reload the page before publishing a new assignment.',
      status: 409,
      remedy: 'review_planning',
    },
    'Planning assignment changed; reload before editing': {
      key: 'action.planning.changed',
      code: 'PLANNING_CHANGED',
      message: 'Planning assignment changed; reload before editing',
      status: 409,
      remedy: 'review_planning',
    },
    'Planning assignment changed; reload before cancelling': {
      key: 'action.planning.changed',
      code: 'PLANNING_CHANGED',
      message: 'Planning assignment changed; reload before cancelling',
      status: 409,
      remedy: 'review_planning',
    },
    'Cancelled planning cannot be edited': {
      key: 'action.planning.alreadyCancelled',
      code: 'PLANNING_ALREADY_CANCELLED',
      message: 'Cancelled planning cannot be edited',
      status: 409,
      remedy: 'review_planning',
    },
    'Planning assignment is already cancelled': {
      key: 'action.planning.alreadyCancelled',
      code: 'PLANNING_ALREADY_CANCELLED',
      message: 'Planning assignment is already cancelled',
      status: 409,
      remedy: 'review_planning',
    },
    'Planning assignment not found': {
      key: 'action.planning.assignmentNotFound',
      code: 'PLANNING_ASSIGNMENT_NOT_FOUND',
      message: 'Planning assignment not found',
      status: 404,
      remedy: 'review_planning',
    },
    'Planning and schedules are only allowed on active, planned, or paused projects': {
      key: 'action.planning.projectUnavailable',
      code: 'PLANNING_PROJECT_UNAVAILABLE',
      message: 'Planning and schedules are only allowed on active, planned, or paused projects',
      field: 'projectId',
      status: 409,
      remedy: 'review_project_status',
    },
    'Project not found': {
      key: 'problem.planning.projectNotFound',
      code: 'PLANNING_PROJECT_NOT_FOUND',
      message: 'This project is no longer available. Review the project list before planning.',
      status: 404,
      remedy: 'review_projects',
    },
  };
  const known = messages[error.message];
  if (!known) return actionFailure(error, { operation, values });
  return workforceProblem(known, operation, values);
}

const workforceProblems: Readonly<Record<string, WorkforceProblem>> = {
  'Skill name is required': {
    key: 'problem.workforce.skillNameRequired',
    code: 'SKILL_NAME_REQUIRED',
    message: 'Enter a name for this skill before saving.',
    status: 400,
    remedy: 'review_skill_fields',
    field: 'name',
  },
  'Skill code already exists': {
    key: 'problem.workforce.skillCodeExists',
    code: 'SKILL_CODE_EXISTS',
    message: 'This skill code is already in use. Review the skill list or enter a different code.',
    status: 409,
    remedy: 'review_skills',
    field: 'code',
  },
  'Skill not found': {
    key: 'problem.workforce.skillNotFound',
    code: 'SKILL_NOT_FOUND',
    message: 'This skill is no longer available. Review the current skill list.',
    status: 404,
    remedy: 'review_skills',
    field: 'skillId',
  },
  'Active worker not found': {
    key: 'problem.workforce.workerUnavailable',
    code: 'WORKFORCE_WORKER_UNAVAILABLE',
    message: 'The selected worker is no longer active. Review the worker before saving.',
    status: 409,
    remedy: 'review_workers',
    field: 'workerId',
  },
  'Skill administration required': {
    key: 'problem.workforce.skillAdminRequired',
    code: 'SKILL_ADMIN_ACCESS_REQUIRED',
    message: 'Your role cannot manage the skill catalog. Contact an owner to review access.',
    status: 403,
    remedy: 'contact_owner',
  },
  'Worker skill ownership required': {
    key: 'problem.workforce.skillOwnershipRequired',
    code: 'WORKER_SKILL_OWNERSHIP_REQUIRED',
    message: 'You can change only your own skills. Review your profile or ask the project owner.',
    status: 403,
    remedy: 'review_own_skills',
  },
  'Worker is outside the project scope': {
    key: 'problem.workforce.skillScopeChanged',
    code: 'WORKER_SKILL_SCOPE_CHANGED',
    message:
      'This worker is no longer in a project you can manage. Ask the project owner to review assignments.',
    status: 403,
    remedy: 'contact_project_owner',
  },
  'Worker is not in your active projects': {
    key: 'problem.workforce.skillScopeChanged',
    code: 'WORKER_SKILL_SCOPE_CHANGED',
    message:
      'This worker is no longer in a project you can manage. Ask the project owner to review assignments.',
    status: 403,
    remedy: 'contact_project_owner',
  },
  'Worker availability ownership required': {
    key: 'problem.workforce.availabilityOwnershipRequired',
    code: 'AVAILABILITY_OWNERSHIP_REQUIRED',
    message:
      'This availability window does not belong to the selected worker, or you cannot edit it. Review the current window.',
    status: 403,
    remedy: 'review_availability',
  },
  'Worker availability is outside the project scope': {
    key: 'problem.workforce.availabilityScopeChanged',
    code: 'AVAILABILITY_SCOPE_CHANGED',
    message:
      'This worker is no longer in a project you can manage. Ask the project owner to review assignments.',
    status: 403,
    remedy: 'contact_project_owner',
  },
  'Availability changed before update': {
    key: 'problem.workforce.availabilityChanged',
    code: 'AVAILABILITY_CHANGED',
    message:
      'This availability window changed while the form was open. Review the updated window before saving.',
    status: 409,
    remedy: 'review_availability',
  },
  'Availability id and version are required together': {
    key: 'problem.workforce.availabilityBindingInvalid',
    code: 'AVAILABILITY_BINDING_INVALID',
    message:
      'The availability record version is incomplete. Review the current window before saving.',
    status: 400,
    remedy: 'review_availability',
    field: 'version',
  },
  'Availability dates must be valid': {
    key: 'problem.workforce.availabilityDatesInvalid',
    code: 'AVAILABILITY_DATES_INVALID',
    message: 'Enter valid start and end dates for this availability window.',
    status: 400,
    remedy: 'review_availability_fields',
    field: 'startsAt',
  },
  'Availability end must follow start': {
    key: 'problem.workforce.availabilityWindowInvalid',
    code: 'AVAILABILITY_WINDOW_INVALID',
    message: 'The availability end must be after its start. Review both dates.',
    status: 400,
    remedy: 'review_availability_fields',
    field: 'endsAt',
  },
};

function workforceActionFailure(
  error: unknown,
  operation: Exclude<WorkforceOperation, 'createPlanning' | 'updatePlanning' | 'cancelPlanning'>,
  values: Record<string, string>,
) {
  const common = commonWorkforceProblem(error);
  if (common) return workforceProblem(common, operation, values);
  if (
    error instanceof AccessDeniedError ||
    error instanceof ConflictError ||
    error instanceof ValidationError
  ) {
    const known = workforceProblems[error.message];
    if (known) return workforceProblem(known, operation, values);
  }
  return actionFailure(error, { operation, values });
}

function openWorkforceContext(
  locals: PortalActionEvent['locals'],
  operation: WorkforceOperation,
  values: Record<string, string>,
) {
  try {
    return { context: openPortalRepository(locals) } as const;
  } catch (error) {
    const failure =
      operation === 'createPlanning' ||
      operation === 'updatePlanning' ||
      operation === 'cancelPlanning'
        ? planningActionFailure(error, operation, values)
        : workforceActionFailure(error, operation, values);
    return { failure } as const;
  }
}

export const reportActions = {
  autosaveReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');

    const object = await formObject(request);
    const values = safeReportValues(object);
    object.safetyRelated = ['on', 'true', '1'].includes(String(object.safetyRelated));
    const type = object.type;
    if (object.id === undefined || (type !== 'daily' && type !== 'technical'))
      return reportInputFailure(
        'autosaveReport',
        'REPORT_AUTOSAVE_REQUEST_INVALID',
        'problem.report.autosaveRequestInvalid',
        'Select a daily or PLC report to autosave.',
        values,
        { [object.id === undefined ? 'id' : 'type']: ['problem.report.autosaveRequestInvalid'] },
        'review_report',
      );

    const parsed =
      type === 'daily'
        ? dailyReportInputSchema.and(versionedRecordSchema).safeParse(object)
        : technicalReportInputSchema.and(versionedRecordSchema).safeParse(object);
    if (!parsed.success) {
      if (type === 'technical') {
        const safetyFailure = safetyDetailsSchemaFailure(
          object.safetyRelated,
          parsed.error.issues,
          values,
        );
        if (safetyFailure) return safetyFailure;
      }
      return reportInputFailure(
        'autosaveReport',
        type === 'daily' ? 'REPORT_DAILY_FIELDS_INVALID' : 'REPORT_TECHNICAL_FIELDS_INVALID',
        'problem.report.fieldsInvalid',
        type === 'daily'
          ? 'Review the highlighted daily report fields before saving.'
          : 'Review the highlighted PLC report fields before saving.',
        values,
        parsed.error.flatten().fieldErrors,
      );
    }

    const context = openPortalRepository(locals);
    try {
      const detail = context.repository.reportDetail(context.principal, parsed.data.id);
      const state = String(detail.report.approval_state ?? '');
      if (detail.type !== type)
        return actionFail(
          409,
          'problem.report.autosaveTypeChanged',
          {},
          'This report has a different type than the open form. Review the current report before saving.',
          {
            code: 'REPORT_AUTOSAVE_TYPE_CHANGED',
            actionName: 'autosaveReport',
            values,
            remedies: [{ id: 'review_report', recordId: parsed.data.id }],
          },
        );
      if (!detail.canEdit)
        return actionFail(
          403,
          'problem.report.editAccessRequired',
          {},
          'You cannot edit this report. Ask the project owner to review your access.',
          {
            code: 'REPORT_EDIT_ACCESS_REQUIRED',
            actionName: 'autosaveReport',
            values,
            remedies: [{ id: 'contact_project_owner' }],
          },
        );
      if (state !== 'draft' && state !== 'needs_changes')
        return actionFail(
          409,
          'problem.report.autosaveStateChanged',
          { status: state },
          `This report is ${state}. Autosave is available only for drafts or reports returned for changes. Review the current report before saving.`,
          {
            code: 'REPORT_AUTOSAVE_STATE_CHANGED',
            actionName: 'autosaveReport',
            currentVersion: Number(detail.report.version ?? parsed.data.version),
            values,
            remedies: [{ id: 'review_report', recordId: parsed.data.id }],
          },
        );

      const result =
        type === 'daily'
          ? context.repository.updateDailyReport(
              context.principal,
              parsed.data as Parameters<PortalRepository['updateDailyReport']>[1],
            )
          : context.repository.updateTechnicalReport(
              context.principal,
              parsed.data as Parameters<PortalRepository['updateTechnicalReport']>[1],
            );
      return {
        ...actionSuccess(
          'action.reports.autosaved',
          { type, reportId: result.id, version: result.version },
          'Report draft autosaved',
        ),
        autosaved: true,
        id: result.id,
        type,
        version: result.version,
        changedFields: 'changedFields' in result ? result.changedFields : [],
      };
    } catch (error) {
      return reportActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
  deleteDraft: async ({ locals, request, params }: PortalActionEvent) => {
    if (!['reports', 'time', 'expenses'].includes(params.section ?? ''))
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const rawType = String(object.recordType ?? object.type ?? '');
    const recordType =
      rawType === 'daily' ? 'daily_report' : rawType === 'technical' ? 'technical_report' : rawType;
    const recordId = String(object.recordId ?? object.id ?? '');
    const version = Number(object.version);
    if (
      !['time_entry', 'expense', 'daily_report', 'technical_report'].includes(recordType) ||
      !recordId ||
      !Number.isInteger(version) ||
      version < 1
    )
      return reportInputFailure(
        'deleteDraft',
        'DRAFT_DELETE_REQUEST_INVALID',
        'problem.report.deleteRequestInvalid',
        'Select a draft with its current version before deleting it.',
        object,
        {
          ...(!['time_entry', 'expense', 'daily_report', 'technical_report'].includes(recordType)
            ? { recordType: ['problem.report.deleteRequestInvalid'] }
            : {}),
          ...(!recordId ? { recordId: ['problem.report.deleteRequestInvalid'] } : {}),
          ...(!Number.isInteger(version) || version < 1
            ? { version: ['problem.report.deleteRequestInvalid'] }
            : {}),
        },
        recordType === 'time_entry'
          ? 'review_time'
          : recordType === 'expense'
            ? 'review_expense'
            : 'review_report',
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.deleteDraft(context.principal, {
        recordType: recordType as 'time_entry' | 'expense' | 'daily_report' | 'technical_report',
        recordId,
        version,
      });
      return actionSuccess('action.reports.draftDeleted', { recordId: result.id }, 'Draft deleted');
    } catch (error) {
      if (
        recordType === 'expense' &&
        error instanceof ConflictError &&
        error.message === 'Crew expense drafts must be withdrawn with a reason'
      )
        return actionFail(
          409,
          'problem.expense.crewDeleteRequiresWithdrawal',
          {},
          'This crew expense has an audit trail. Enter a reason and withdraw the draft instead of deleting it.',
          {
            code: 'EXPENSE_CREW_DELETE_REQUIRES_WITHDRAWAL',
            actionName: 'withdrawCrewExpenseDraft',
            values: { expenseId: recordId },
            remedies: [{ id: 'review_expense', recordId }],
          },
        );
      return reportActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  withdrawLinkedDrafts: async ({ locals, request, params }: PortalActionEvent) => {
    if (!['time', 'expenses'].includes(params.section ?? ''))
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const expenseId = String(object.expenseId ?? '');
    const expenseVersion = Number(object.expenseVersion);
    const timeVersion = Number(object.timeVersion);
    const reason = String(object.reason ?? '').trim();
    if (
      !expenseId ||
      !Number.isInteger(expenseVersion) ||
      expenseVersion < 1 ||
      !Number.isInteger(timeVersion) ||
      timeVersion < 1 ||
      reason.length < 3 ||
      reason.length > 2000
    )
      return actionFail(
        400,
        'problem.linkedDraft.withdrawInvalid',
        {},
        'Enter a reason of 3 to 2,000 characters and review both draft versions.',
        {
          code: 'LINKED_DRAFT_WITHDRAW_INVALID',
          actionName: 'withdrawLinkedDrafts',
          values: { expenseId, reason },
          fieldErrors:
            reason.length < 3 || reason.length > 2000
              ? { reason: ['problem.linkedDraft.withdrawInvalid'] }
              : {},
          remedies: [{ id: 'review_expense' }],
        },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.withdrawLinkedTimeAndExpenseDrafts(context.principal, {
        expenseId,
        expenseVersion,
        timeVersion,
        reason,
      });
      return actionSuccess(
        'action.linkedDraft.withdrawn',
        {
          timeId: result.timeId,
          expenseId: result.expenseId,
        },
        'Linked time and meal drafts withdrawn',
      );
    } catch (caught) {
      if (
        caught instanceof ConflictError ||
        caught instanceof ValidationError ||
        caught instanceof AccessDeniedError
      )
        return actionFail(
          caught instanceof AccessDeniedError ? 403 : caught instanceof ConflictError ? 409 : 400,
          caught.message === 'Linked draft withdrawal access required'
            ? 'problem.linkedDraft.withdrawAccessRequired'
            : caught.message === 'Linked time and meal draft pair is unavailable'
              ? 'problem.linkedDraft.pairUnavailable'
              : 'problem.linkedDraft.withdrawChanged',
          {},
          caught.message === 'Linked draft withdrawal access required'
            ? 'You cannot withdraw this linked pair under your current access.'
            : 'This linked pair changed or can no longer be withdrawn. Review both records.',
          {
            code:
              caught instanceof AccessDeniedError
                ? 'LINKED_DRAFT_WITHDRAW_ACCESS_REQUIRED'
                : 'LINKED_DRAFT_WITHDRAW_CHANGED',
            actionName: 'withdrawLinkedDrafts',
            values: { expenseId, reason },
            remedies: [{ id: 'review_expense', recordId: expenseId }],
          },
        );
      return actionFailure(caught, {
        actionName: 'withdrawLinkedDrafts',
        values: { expenseId, reason },
      });
    } finally {
      context.sqlite.close();
    }
  },
  createCorrectionDraft: async ({ locals, request, params }: PortalActionEvent) => {
    const object = await formObject(request);
    const rawType = String(object.recordType ?? object.type ?? '');
    const recordType =
      rawType === 'daily' ? 'daily_report' : rawType === 'technical' ? 'technical_report' : rawType;
    const originalId = String(object.originalId ?? object.recordId ?? object.id ?? '');
    if (
      !['reports', 'time', 'expenses', 'approvals'].includes(params.section ?? '') &&
      params.id !== originalId
    )
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const requestId = String(object.requestId ?? '');
    const reason = String(object.reason ?? '').trim();
    if (recordType === 'time_entry' && (reason.length < 3 || reason.length > 2000))
      return actionFail(
        400,
        'problem.time.correctionReasonInvalid',
        {},
        'Explain the correction in 3 to 2,000 characters.',
        {
          code: 'TIME_CORRECTION_REASON_INVALID',
          actionName: 'createCorrectionDraft',
          values: safeTimeCorrectionValues(object),
          fields: { reason: ['problem.time.correctionReasonInvalid'] },
          remedies: [{ id: 'enter_reason' }],
        },
      );
    if (
      !['time_entry', 'expense', 'daily_report', 'technical_report'].includes(recordType) ||
      !originalId ||
      !requestId ||
      !reason
    )
      return recordType === 'expense'
        ? actionFail(
            400,
            !reason
              ? 'problem.expenseDetail.correctionReasonInvalid'
              : 'problem.expenseDetail.correctionFieldsInvalid',
            {},
            !reason
              ? 'Explain the correction in at least three characters.'
              : 'Review the correction fields and reason before creating a draft.',
            {
              code: !reason
                ? 'EXPENSE_CORRECTION_REASON_INVALID'
                : 'EXPENSE_CORRECTION_FIELDS_INVALID',
              actionName: 'createCorrectionDraft',
              values: safeExpenseCorrectionValues(object),
              ...(!reason
                ? { fields: { reason: ['problem.expenseDetail.correctionReasonInvalid'] } }
                : {}),
              remedies: [{ id: !reason ? 'enter_reason' : 'review_expense_fields' }],
            },
          )
        : correctionInputFailure(
            'createCorrectionDraft',
            recordType,
            !reason ? 'problem.correction.reasonRequired' : 'problem.correction.requestInvalid',
            !reason ? 'CORRECTION_REASON_REQUIRED' : 'CORRECTION_REQUEST_INVALID',
            !reason
              ? 'Explain why the corrected draft is needed.'
              : 'Select a record and provide a new correction request ID.',
            object,
            [
              ...(!['time_entry', 'daily_report', 'technical_report'].includes(recordType)
                ? ['recordType']
                : []),
              ...(!originalId ? ['originalId'] : []),
              ...(!requestId ? ['requestId'] : []),
              ...(!reason ? ['reason'] : []),
            ],
          );
    let patch: Record<string, unknown> | undefined;
    let originalExpense: Record<string, unknown> | undefined;
    if (typeof object.patch === 'string' && object.patch.trim()) {
      try {
        const parsed = JSON.parse(object.patch) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        patch = parsed as Record<string, unknown>;
      } catch {
        return recordType === 'expense'
          ? actionFail(
              400,
              'problem.expenseDetail.correctionFieldsInvalid',
              {},
              'Review the correction fields and reason before creating a draft.',
              {
                code: 'EXPENSE_CORRECTION_FIELDS_INVALID',
                actionName: 'createCorrectionDraft',
                values: safeExpenseCorrectionValues(object),
                remedies: [{ id: 'review_expense_fields' }],
              },
            )
          : correctionInputFailure(
              'createCorrectionDraft',
              recordType,
              'problem.correction.patchInvalid',
              'CORRECTION_PATCH_INVALID',
              'The revised fields could not be read. Review the correction and try again.',
              object,
              ['patch'],
            );
      }
    }
    const context = openPortalRepository(locals);
    const receiptFile =
      recordType === 'expense' && object.receipt instanceof File && object.receipt.size > 0
        ? object.receipt
        : undefined;
    let uploaded: Awaited<ReturnType<typeof saveExpenseReceipt>> | undefined;
    let receiptUpload: { sha256: string; documentId?: string } | undefined;
    let receiptOperation = false;
    try {
      if (object.correctionFields) {
        const original =
          recordType === 'time_entry'
            ? context.repository.timeDetail(context.principal, originalId)
            : recordType === 'expense'
              ? context.repository.expenseDetail(context.principal, originalId)
              : context.repository.reportDetail(context.principal, originalId).report;
        if (recordType === 'expense') originalExpense = original as Record<string, unknown>;
        patch = buildCorrectionPatch(
          recordType as 'time_entry' | 'expense' | 'daily_report' | 'technical_report',
          object,
          original as Record<string, unknown>,
        );
      } else if ((!patch || Object.keys(patch).length === 0) && !receiptFile) {
        return recordType === 'expense'
          ? actionFail(
              400,
              'problem.expenseDetail.correctionFieldsInvalid',
              {},
              'Review the correction fields and reason before creating a draft.',
              {
                code: 'EXPENSE_CORRECTION_FIELDS_INVALID',
                actionName: 'createCorrectionDraft',
                values: safeExpenseCorrectionValues(object),
                remedies: [{ id: 'review_expense_fields' }],
              },
            )
          : correctionInputFailure(
              'createCorrectionDraft',
              recordType,
              'problem.correction.changesRequired',
              'CORRECTION_CHANGES_REQUIRED',
              'Change at least one operational field before creating a corrected draft.',
              object,
              ['correctionFields'],
            );
      }
      if (recordType === 'expense') {
        const original =
          originalExpense ??
          (context.repository.expenseDetail(context.principal, originalId) as Record<
            string,
            unknown
          >);
        const patched = (camel: string, column: string): unknown =>
          Object.prototype.hasOwnProperty.call(patch ?? {}, camel)
            ? patch?.[camel]
            : Object.prototype.hasOwnProperty.call(patch ?? {}, column)
              ? patch?.[column]
              : original[column];
        const linkedTimeId = patched('timeEntryId', 'time_entry_id');
        const correctedDate = patched('spentOn', 'spent_on');
        if (typeof linkedTimeId === 'string' && linkedTimeId) {
          const match = context.sqlite
            .prepare(
              `SELECT 1 FROM time_entry
                WHERE id=? AND project_id=? AND worker_id=? AND work_date=?
                  AND approval_state NOT IN ('rejected','void') LIMIT 1`,
            )
            .get(
              linkedTimeId,
              String(original.project_id ?? ''),
              String(original.worker_id ?? ''),
              String(correctedDate ?? ''),
            );
          if (!match)
            throw new ConflictError('Related logged hours no longer match the corrected expense');
        }
        if (receiptFile) {
          receiptOperation = true;
          const bytes = await validateExpenseReceipt(receiptFile);
          receiptUpload = { sha256: createHash('sha256').update(bytes).digest('hex') };
          receiptOperation = false;
          const preflight = context.repository.preflightExpenseCorrectionDraft(
            context.principal,
            {
              recordType: 'expense',
              originalId,
              requestId,
              reason,
              patch,
              receiptUpload,
            },
            String(object.ownerOverride ?? '') === 'yes',
          );
          if (preflight.replayed)
            return actionSuccess(
              'action.reports.correctionDraftCreated',
              { correctionId: preflight.correctionId },
              'Correction draft created',
            );
          receiptOperation = true;
          uploaded = await saveExpenseReceipt(
            context,
            String(original.project_id),
            receiptFile,
            bytes,
          );
          receiptUpload.documentId = uploaded.id;
          receiptOperation = false;
        }
      }
      const correctionInput = {
        recordType: recordType as 'time_entry' | 'expense' | 'daily_report' | 'technical_report',
        originalId,
        requestId,
        reason,
        patch,
        ...(receiptUpload ? { receiptUpload } : {}),
      };
      const result =
        String(object.ownerOverride ?? '') === 'yes'
          ? context.repository.ownerOverrideCorrectionDraft(context.principal, correctionInput)
          : context.repository.createCorrectionDraft(context.principal, correctionInput);
      if ('replayed' in result && result.replayed) await uploaded?.cleanup();
      return actionSuccess(
        'action.reports.correctionDraftCreated',
        { correctionId: result.correctionId },
        'Correction draft created',
      );
    } catch (error) {
      await uploaded?.cleanup().catch(() => undefined);
      if (recordType === 'expense' && receiptOperation) {
        const failure = expenseActionFailure(error, object);
        return actionFail(
          failure.status,
          failure.data.messageKey,
          failure.data.params ?? {},
          failure.data.message,
          {
            ...failure.data,
            actionName: 'createCorrectionDraft',
            values: safeExpenseCorrectionValues(object),
            fieldErrors: Object.fromEntries(
              Object.entries(failure.data.fieldErrors).map(([field, messages]) => [
                field,
                [...messages],
              ]),
            ),
          },
        );
      }
      if (recordType === 'expense')
        return expenseCorrectionFailure(error, object, 'createCorrectionDraft');
      if (
        ['daily_report', 'technical_report'].includes(recordType) &&
        error instanceof ValidationError &&
        error.message === 'Change at least one operational field before creating a correction'
      )
        return correctionInputFailure(
          'createCorrectionDraft',
          recordType,
          'problem.correction.changesRequired',
          'CORRECTION_CHANGES_REQUIRED',
          'Change at least one operational field before creating a corrected draft.',
          object,
          ['correctionFields'],
        );
      if (recordType === 'time_entry') {
        const known = timeCorrectionCreateFailure(error, object);
        if (known) return known;
      }
      return reportActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  withdrawCorrectionDraft: async ({ locals, request, params }: PortalActionEvent) => {
    const object = await formObject(request);
    const recordType = String(object.recordType ?? '');
    const correctionId = String(object.correctionId ?? '');
    const version = Number(object.version);
    const reason = String(object.reason ?? '').trim();
    if (recordType === 'time_entry' && reason.length > 2000)
      return correctionInputFailure(
        'withdrawCorrectionDraft',
        recordType,
        'problem.time.correctionWithdrawReasonTooLong',
        'TIME_CORRECTION_WITHDRAW_REASON_TOO_LONG',
        'Explain the withdrawal in no more than 2,000 characters.',
        object,
        ['reason'],
      );
    if (
      !['time_entry', 'expense', 'daily_report', 'technical_report'].includes(recordType) ||
      !correctionId ||
      !Number.isSafeInteger(version) ||
      reason.length < 3 ||
      (!['time', 'expenses', 'reports'].includes(params.section ?? '') &&
        params.id !== correctionId)
    )
      return recordType === 'expense'
        ? actionFail(
            400,
            reason.length < 3
              ? 'problem.expenseDetail.withdrawReasonInvalid'
              : 'problem.expenseDetail.withdrawFieldsInvalid',
            {},
            reason.length < 3
              ? 'Enter at least three characters explaining why you are withdrawing this draft.'
              : 'Review the correction draft details before withdrawing it.',
            {
              code:
                reason.length < 3
                  ? 'EXPENSE_CORRECTION_WITHDRAW_REASON_INVALID'
                  : 'EXPENSE_CORRECTION_WITHDRAW_FIELDS_INVALID',
              actionName: 'withdrawCorrectionDraft',
              values: safeExpenseCorrectionValues(object),
              ...(reason.length < 3
                ? { fields: { reason: ['problem.expenseDetail.withdrawReasonInvalid'] } }
                : {}),
              remedies: [{ id: reason.length < 3 ? 'enter_reason' : 'review_expense' }],
            },
          )
        : correctionInputFailure(
            'withdrawCorrectionDraft',
            recordType,
            reason.length < 3
              ? 'problem.correction.withdrawReasonInvalid'
              : 'problem.correction.withdrawRequestInvalid',
            reason.length < 3
              ? 'CORRECTION_WITHDRAW_REASON_INVALID'
              : 'CORRECTION_WITHDRAW_REQUEST_INVALID',
            reason.length < 3
              ? 'Explain the withdrawal in at least three characters.'
              : 'Select a corrected draft with its current version before withdrawing it.',
            object,
            [
              ...(!['time_entry', 'daily_report', 'technical_report'].includes(recordType)
                ? ['recordType']
                : []),
              ...(!correctionId ? ['correctionId'] : []),
              ...(!Number.isSafeInteger(version) ? ['version'] : []),
              ...(reason.length < 3 ? ['reason'] : []),
            ],
          );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.withdrawCorrectionDraft(context.principal, {
        recordType: recordType as 'time_entry' | 'expense' | 'daily_report' | 'technical_report',
        correctionId,
        version,
        reason,
      });
      return actionSuccess(
        'action.reports.correctionDraftWithdrawn',
        {
          originalId: result.originalId,
        },
        'Correction draft withdrawn',
      );
    } catch (error) {
      if (
        recordType === 'time_entry' &&
        error instanceof ConflictError &&
        error.message === 'Correction draft has dependent records'
      ) {
        try {
          const dependency = timeCorrectionDependency(
            context.sqlite,
            context.repository,
            context.principal,
            correctionId,
          );
          const currentDependency = dependency ?? { kind: 'other' as const };
          const problem = timeCorrectionDependencyProblem(currentDependency);
          return actionFail(409, problem.key, {}, problem.message, {
            code: problem.code,
            actionName: 'withdrawCorrectionDraft',
            values: safeReportValues(object),
            remedies: [
              {
                id:
                  currentDependency.kind === 'other' && context.principal.role === 'owner_admin'
                    ? 'contact_finance'
                    : problem.remedy,
                ...(dependency?.recordId ? { recordId: dependency.recordId } : {}),
              },
            ],
          });
        } catch (lookupError) {
          return actionFailure(lookupError, {
            actionName: 'withdrawCorrectionDraft',
            values: safeReportValues(object),
            remedies: [{ id: 'review_time' }],
          });
        }
      }
      return recordType === 'time_entry'
        ? timeCorrectionWithdrawalFailure(error, object)
        : expenseCorrectionFailure(error, object, 'withdrawCorrectionDraft');
    } finally {
      context.sqlite.close();
    }
  },
  generatePeriodReports: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const periodValues = {
      ...Object.fromEntries(formData),
      technicalReportIds: formData.getAll('technicalReportIds').map(String),
    };
    const parsed = accountingPackPeriodSchema
      .extend({
        projectId: uuidSchema,
        contentMode: z
          .enum([
            'hours_only',
            'hours_activity',
            'hours_activity_selected_technical',
            'hours_activity_all_technical',
          ])
          .default('hours_activity_all_technical'),
        technicalReportIds: z.array(uuidSchema).default([]),
      })
      .safeParse({
        ...Object.fromEntries(formData),
        technicalReportIds: formData.getAll('technicalReportIds').map(String),
      });
    if (!parsed.success)
      return reportInputFailure(
        'generatePeriodReports',
        'REPORT_PERIOD_SELECTION_INVALID',
        'problem.report.periodSelectionInvalid',
        'Select a project and a valid reporting period before generating reports.',
        periodValues,
        parsed.error.flatten().fieldErrors,
        'review_report_period',
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.refreshAndQueuePeriodReports(context.principal, parsed.data);
      return actionSuccess(
        'action.reports.periodReportsRefreshed',
        {
          reportCount: result.reports.length,
          jobId: result.jobId,
          jobCreated: result.jobCreated,
          jobState: result.jobState,
        },
        `${result.reports.length} period reports refreshed. Rendering job: ${result.jobState}.`,
      );
    } catch (error) {
      return reportActionFailure(error, periodValues);
    } finally {
      context.sqlite.close();
    }
  },
  createDailyReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeReportValues(object);
    const workerId =
      typeof object.workerId === 'string' && object.workerId ? object.workerId : undefined;
    delete object.workerId;
    object.safetyRelated = object.safetyRelated === 'on';
    const parsed = dailyReportInputSchema.safeParse(object);
    if (!parsed.success)
      return reportInputFailure(
        'createDailyReport',
        'REPORT_DAILY_FIELDS_INVALID',
        'problem.report.fieldsInvalid',
        'Review the highlighted daily report fields before saving.',
        values,
        parsed.error.flatten().fieldErrors,
      );
    const context = openPortalRepository(locals);
    try {
      if (['owner_admin', 'project_manager'].includes(context.principal.role) && !workerId)
        return reportInputFailure(
          'createDailyReport',
          'REPORT_WORKER_REQUIRED',
          'problem.report.workerRequired',
          'Select a worker assigned to this project on the report date.',
          values,
          { workerId: ['problem.report.workerRequired'] },
        );
      context.repository.createDailyReport(context.principal, parsed.data, workerId);
      return actionSuccess('action.reports.dailyDraftSaved', {}, 'Daily report draft saved');
    } catch (error) {
      return reportActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
  createTechnicalReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeReportValues(object);
    const workerId =
      typeof object.workerId === 'string' && object.workerId ? object.workerId : undefined;
    delete object.workerId;
    object.safetyRelated = object.safetyRelated === 'on';
    const parsed = technicalReportInputSchema.safeParse(object);
    if (!parsed.success) {
      const safetyFailure = safetyDetailsSchemaFailure(
        object.safetyRelated,
        parsed.error.issues,
        values,
      );
      if (safetyFailure) return safetyFailure;
      return reportInputFailure(
        'createTechnicalReport',
        'REPORT_TECHNICAL_FIELDS_INVALID',
        'problem.report.fieldsInvalid',
        'Review the highlighted PLC report fields before saving.',
        values,
        parsed.error.flatten().fieldErrors,
      );
    }
    const context = openPortalRepository(locals);
    try {
      if (['owner_admin', 'project_manager'].includes(context.principal.role) && !workerId)
        return reportInputFailure(
          'createTechnicalReport',
          'REPORT_WORKER_REQUIRED',
          'problem.report.workerRequired',
          'Select a worker assigned to this project on the report date.',
          values,
          { workerId: ['problem.report.workerRequired'] },
        );
      context.repository.createTechnicalReport(context.principal, parsed.data, workerId);
      return actionSuccess('action.reports.technicalDraftSaved', {}, 'PLC report draft saved');
    } catch (error) {
      return reportActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
  createTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeReportValues(object);
    object.safetyImpact = object.safetyImpact === 'on';
    const parsed = technicalChangeInputSchema.safeParse(object);
    if (!parsed.success) {
      if (
        object.safetyImpact === true &&
        parsed.error.issues.length > 0 &&
        parsed.error.issues.every((issue) =>
          ['validation', 'rollbackInformation'].includes(String(issue.path[0])),
        )
      )
        return reportActionFailure(
          new V3ValidationError(
            'Safety-impacting changes require validation and rollback information',
          ),
          { ...values, actionName: 'createTechnicalChange' },
        );
      return reportInputFailure(
        'createTechnicalChange',
        'TECHNICAL_CHANGE_FIELDS_INVALID',
        'problem.report.technicalChangeFieldsInvalid',
        'Review the highlighted technical change fields before saving.',
        values,
        parsed.error.flatten().fieldErrors,
      );
    }
    const context = openPortalRepository(locals);
    try {
      context.v3.createTechnicalChange(context.principal, parsed.data);
      return actionSuccess(
        'action.reports.technicalChangeDraftSaved',
        {},
        'Technical change draft saved',
      );
    } catch (error) {
      return reportActionFailure(error, { ...values, actionName: 'createTechnicalChange' });
    } finally {
      context.sqlite.close();
    }
  },
  submitReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    if (!locals.user) {
      const values = await formObject(request).catch(() => ({}));
      return reportActionFailure(new AccessDeniedError('Sign in required'), {
        ...values,
        actionName: 'submitReport',
      });
    }
    const object = await formObject(request).catch(() => null);
    if (!object)
      return reportInputFailure(
        'submitReport',
        'REPORT_SUBMISSION_FIELDS_INVALID',
        'problem.report.submissionFieldsInvalid',
        'Select a report type and its current version before submitting.',
        {},
        {},
        'review_report',
      );
    const type = object.type;
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success || (type !== 'daily' && type !== 'technical'))
      return reportInputFailure(
        'submitReport',
        'REPORT_SUBMISSION_FIELDS_INVALID',
        'problem.report.submissionFieldsInvalid',
        'Select a report type and its current version before submitting.',
        object,
        {
          ...(parsed.success ? {} : parsed.error.flatten().fieldErrors),
          ...(type !== 'daily' && type !== 'technical'
            ? { type: ['problem.report.submissionFieldsInvalid'] }
            : {}),
        },
        'review_report',
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      context.repository.submitReport(context.principal, type, parsed.data.id, parsed.data.version);
      return actionSuccess('action.reports.submitted', {}, 'Report submitted for review');
    } catch (error) {
      const status =
        context &&
        error instanceof ConflictError &&
        error.message === 'Report status blocks submission'
          ? (
              context.sqlite
                .prepare(
                  `SELECT approval_state FROM ${type === 'daily' ? 'daily_report' : 'technical_report'} WHERE id=?`,
                )
                .get(parsed.data.id) as { approval_state: string } | undefined
            )?.approval_state
          : undefined;
      return reportActionFailure(
        error,
        { ...object, actionName: 'submitReport' },
        status ? { status } : {},
      );
    } finally {
      context?.sqlite.close();
    }
  },
  submitTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success)
      return reportInputFailure(
        'submitTechnicalChange',
        'TECHNICAL_CHANGE_SUBMISSION_FIELDS_INVALID',
        'problem.report.technicalChangeSubmissionInvalid',
        'Select a technical change with its current version before submitting.',
        object,
        parsed.error.flatten().fieldErrors,
        'review_report',
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.submitTechnicalChange(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess(
        'action.reports.technicalChangeSubmitted',
        {},
        'Technical change submitted for review',
      );
    } catch (error) {
      return reportActionFailure(error, { ...object, actionName: 'submitTechnicalChange' });
    } finally {
      context.sqlite.close();
    }
  },
  createPlanning: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const submitted = await request.formData();
    const object: Record<string, unknown> = Object.fromEntries(submitted);
    const workerIds = submitted.getAll('workerIds');
    // Retain single-worker clients while the browser publishes a whole group.
    object.workerIds = workerIds.length ? workerIds : object.workerId ? [object.workerId] : [];
    const values = safeWorkforceValues(
      { ...object, workerIds: JSON.stringify(object.workerIds) },
      planningFields,
    );
    // Planning's datetime-local controls represent UTC, independent of the server timezone.
    for (const key of ['startsAt', 'endsAt']) {
      const value = object[key];
      object[key] =
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
          ? `${value}:00.000Z`
          : value;
    }
    const parsed = planningAssignmentInputSchema
      .omit({ workerId: true })
      .extend({
        workerIds: z
          .array(uuidSchema)
          .min(1, 'Select at least one worker')
          .max(100)
          .refine(
            (workers) => new Set(workers).size === workers.length,
            'Select each worker only once',
          ),
        requestKey: uuidSchema,
      })
      .safeParse(object);
    if (!parsed.success)
      return workforceInputFailure(
        'createPlanning',
        'PLANNING_FIELDS_INVALID',
        'problem.planning.fieldsInvalid',
        'Review the highlighted planning assignment fields before publishing.',
        values,
        parsed.error.flatten().fieldErrors,
        'review_planning_fields',
      );
    const opened = openWorkforceContext(locals, 'createPlanning', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      const result = context.repository.createPlanningAssignments(context.principal, parsed.data);
      return {
        ...actionSuccess(
          result.replayed
            ? 'action.planning.assignmentAlreadyPublished'
            : 'action.planning.assignmentPublished',
          {},
          result.replayed
            ? 'Assignment already published. No duplicates were created.'
            : 'Assignment published',
        ),
        operation: 'createPlanning',
        projectId: parsed.data.projectId,
      };
    } catch (error) {
      return planningActionFailure(error, 'createPlanning', values);
    } finally {
      context.sqlite.close();
    }
  },
  updatePlanning: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeWorkforceValues(object, planningFields);
    for (const key of ['startsAt', 'endsAt']) {
      const value = object[key];
      object[key] =
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
          ? `${value}:00.000Z`
          : value;
    }
    const parsed = planningAssignmentInputSchema.and(versionedRecordSchema).safeParse(object);
    if (!parsed.success)
      return workforceInputFailure(
        'updatePlanning',
        'PLANNING_FIELDS_INVALID',
        'problem.planning.fieldsInvalid',
        'Review the highlighted planning assignment fields before saving.',
        values,
        parsed.error.flatten().fieldErrors,
        'review_planning_fields',
      );
    const opened = openWorkforceContext(locals, 'updatePlanning', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      context.repository.updatePlanningAssignment(context.principal, parsed.data);
      return actionSuccess('action.planning.assignmentUpdated', {}, 'Assignment updated');
    } catch (error) {
      return planningActionFailure(error, 'updatePlanning', values);
    } finally {
      context.sqlite.close();
    }
  },
  cancelPlanning: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeWorkforceValues(object, planningFields);
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success)
      return workforceInputFailure(
        'cancelPlanning',
        'PLANNING_CANCEL_FIELDS_INVALID',
        'problem.planning.cancelFieldsInvalid',
        'Select a planning assignment with its current version before cancelling.',
        values,
        parsed.error.flatten().fieldErrors,
        'review_planning',
      );
    const opened = openWorkforceContext(locals, 'cancelPlanning', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      context.repository.cancelPlanningAssignment(context.principal, parsed.data);
      return actionSuccess('action.planning.assignmentCancelled', {}, 'Assignment cancelled');
    } catch (error) {
      return planningActionFailure(error, 'cancelPlanning', values);
    } finally {
      context.sqlite.close();
    }
  },
  createSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeWorkforceValues(object, ['code', 'name']);
    const parsed = skillInputSchema.safeParse(object);
    if (!parsed.success)
      return workforceInputFailure(
        'createSkill',
        'SKILL_FIELDS_INVALID',
        'problem.workforce.skillFieldsInvalid',
        'Enter a valid skill code and name before saving.',
        values,
        parsed.error.flatten().fieldErrors,
        'review_skill_fields',
      );
    const opened = openWorkforceContext(locals, 'createSkill', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      context.repository.createSkill(context.principal, parsed.data);
      return actionSuccess('action.planning.skillSaved', {}, 'Skill saved');
    } catch (error) {
      return workforceActionFailure(error, 'createSkill', values);
    } finally {
      context.sqlite.close();
    }
  },
  setWorkerSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning' && params.section !== 'profile')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeWorkforceValues(object, ['workerId', 'skillId', 'proficiency']);
    const parsed = workerSkillInputSchema.safeParse(object);
    if (!parsed.success)
      return workforceInputFailure(
        'setWorkerSkill',
        'WORKER_SKILL_FIELDS_INVALID',
        'problem.workforce.workerSkillFieldsInvalid',
        'Select a worker, skill, and valid proficiency before saving.',
        values,
        parsed.error.flatten().fieldErrors,
        'review_worker_skills',
      );
    const opened = openWorkforceContext(locals, 'setWorkerSkill', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      context.repository.setWorkerSkill(context.principal, parsed.data);
      return actionSuccess('action.planning.workerSkillUpdated', {}, 'Worker skill updated');
    } catch (error) {
      return workforceActionFailure(error, 'setWorkerSkill', values);
    } finally {
      context.sqlite.close();
    }
  },
  updateSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('skillId')?.toString();
    const values = safeWorkforceValues(Object.fromEntries(formData), ['skillId', 'name']);
    if (!id)
      return workforceInputFailure(
        'updateSkill',
        'SKILL_SELECTION_REQUIRED',
        'problem.workforce.skillSelectionRequired',
        'Select a skill before saving its changes.',
        values,
        { skillId: ['problem.workforce.skillSelectionRequired'] },
        'review_skills',
      );

    const input: Record<string, unknown> = {};
    if (formData.has('name')) input.name = formData.get('name')?.toString();

    const opened = openWorkforceContext(locals, 'updateSkill', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      context.repository.updateSkill(context.principal, id, input);
      return actionSuccess('action.planning.skillUpdated', {}, 'Skill updated');
    } catch (error) {
      return workforceActionFailure(error, 'updateSkill', values);
    } finally {
      context.sqlite.close();
    }
  },
  deleteSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('skillId')?.toString();
    const values = safeWorkforceValues(Object.fromEntries(formData), ['skillId']);
    if (!id)
      return workforceInputFailure(
        'deleteSkill',
        'SKILL_SELECTION_REQUIRED',
        'problem.workforce.skillSelectionRequired',
        'Select a skill before deleting it.',
        values,
        { skillId: ['problem.workforce.skillSelectionRequired'] },
        'review_skills',
      );
    const opened = openWorkforceContext(locals, 'deleteSkill', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      context.repository.deleteSkill(context.principal, id);
      return actionSuccess('action.planning.skillDeleted', {}, 'Skill deleted');
    } catch (error) {
      return workforceActionFailure(error, 'deleteSkill', values);
    } finally {
      context.sqlite.close();
    }
  },
  deleteWorkerSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning' && params.section !== 'profile')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const workerId = formData.get('workerId')?.toString();
    const skillId = formData.get('skillId')?.toString();
    const values = safeWorkforceValues(Object.fromEntries(formData), ['workerId', 'skillId']);
    if (!workerId || !skillId)
      return workforceInputFailure(
        'deleteWorkerSkill',
        'WORKER_SKILL_SELECTION_REQUIRED',
        'problem.workforce.workerSkillSelectionRequired',
        'Select a worker and skill before removing the skill.',
        values,
        {
          ...(!workerId ? { workerId: ['problem.workforce.workerSkillSelectionRequired'] } : {}),
          ...(!skillId ? { skillId: ['problem.workforce.workerSkillSelectionRequired'] } : {}),
        },
        'review_worker_skills',
      );
    const opened = openWorkforceContext(locals, 'deleteWorkerSkill', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      context.repository.deleteWorkerSkill(context.principal, workerId, skillId);
      return actionSuccess('action.planning.workerSkillDeleted', {}, 'Worker skill deleted');
    } catch (error) {
      return workforceActionFailure(error, 'deleteWorkerSkill', values);
    } finally {
      context.sqlite.close();
    }
  },
  setAvailability: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning' && params.section !== 'profile')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeWorkforceValues(object, [
      'id',
      'version',
      'workerId',
      'startsAt',
      'endsAt',
      'availability',
      'note',
    ]);
    object.startsAt = normalizeLocalDateTime(object.startsAt);
    object.endsAt = normalizeLocalDateTime(object.endsAt);
    const parsed = availabilityInputSchema.safeParse(object);
    if (!parsed.success)
      return workforceInputFailure(
        'setAvailability',
        'AVAILABILITY_FIELDS_INVALID',
        'problem.workforce.availabilityFieldsInvalid',
        'Select a worker, availability status, and valid dates before saving.',
        values,
        parsed.error.flatten().fieldErrors,
        'review_availability_fields',
      );
    const opened = openWorkforceContext(locals, 'setAvailability', values);
    if (opened.failure) return opened.failure;
    const context = opened.context;
    try {
      context.repository.setWorkerAvailability(context.principal, parsed.data);
      return actionSuccess('action.planning.availabilitySaved', {}, 'Availability saved');
    } catch (error) {
      return workforceActionFailure(error, 'setAvailability', values);
    } finally {
      context.sqlite.close();
    }
  },
  reviewReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, 'Sign in again to continue.', {
        code: 'APPROVAL_SIGN_IN_REQUIRED',
        actionName: 'reviewReport',
        remedies: [{ id: 'sign_in_again' }],
      });
    const object = await formObject(request).catch(() => null);
    if (!object)
      return actionFail(400, 'problem.approval.formUnreadable', {}, undefined, {
        code: 'APPROVAL_REVIEW_FORM_UNREADABLE',
        actionName: 'reviewReport',
        remedies: [{ id: 'review_approval_queue' }],
      });
    const values = reviewPostedValues(object);
    const parsed = reportDecisionSchema.safeParse(object);
    if (!parsed.success)
      return reviewSchemaFailure('reviewReport', values, parsed.error.flatten().fieldErrors);
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      context.repository.reviewReport(
        context.principal,
        parsed.data.type,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return actionSuccess('action.approvals.reportReviewRecorded', {}, 'Report review recorded');
    } catch (error) {
      return approvalReviewFailure(error, 'report', parsed.data.type, parsed.data.id, values);
    } finally {
      context?.sqlite.close();
    }
  },
  reviewTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, 'Sign in again to continue.', {
        code: 'APPROVAL_SIGN_IN_REQUIRED',
        actionName: 'reviewTechnicalChange',
        remedies: [{ id: 'sign_in_again' }],
      });
    const object = await formObject(request).catch(() => null);
    if (!object)
      return actionFail(400, 'problem.approval.formUnreadable', {}, undefined, {
        code: 'APPROVAL_REVIEW_FORM_UNREADABLE',
        actionName: 'reviewTechnicalChange',
        remedies: [{ id: 'review_approval_queue' }],
      });
    const values = reviewPostedValues(object);
    const parsed = technicalChangeDecisionSchema.safeParse(object);
    if (!parsed.success)
      return reviewSchemaFailure(
        'reviewTechnicalChange',
        values,
        parsed.error.flatten().fieldErrors,
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      context.v3.reviewTechnicalChange(
        context.principal,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return actionSuccess(
        'action.approvals.technicalChangeReviewRecorded',
        {},
        'Technical change review recorded',
      );
    } catch (error) {
      return approvalReviewFailure(
        error,
        'technical_change',
        'technical_change',
        parsed.data.id,
        values,
      );
    } finally {
      context?.sqlite.close();
    }
  },
  reviewMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, 'Sign in again to continue.', {
        code: 'APPROVAL_SIGN_IN_REQUIRED',
        actionName: 'reviewMilestone',
        remedies: [{ id: 'sign_in_again' }],
      });
    const object = await formObject(request).catch(() => null);
    if (!object)
      return actionFail(400, 'problem.approval.formUnreadable', {}, undefined, {
        code: 'APPROVAL_REVIEW_FORM_UNREADABLE',
        actionName: 'reviewMilestone',
        remedies: [{ id: 'review_approval_queue' }],
      });
    const values = reviewPostedValues(object);
    const parsed = technicalChangeDecisionSchema.safeParse(object);
    if (!parsed.success)
      return reviewSchemaFailure('reviewMilestone', values, parsed.error.flatten().fieldErrors);
    if (parsed.data.decision === 'needs_changes')
      return actionFail(
        400,
        'problem.approval.milestoneDecisionInvalid',
        {},
        'Milestones can only be approved or rejected. Choose one of those decisions.',
        {
          code: 'APPROVAL_MILESTONE_DECISION_INVALID',
          actionName: 'reviewMilestone',
          values,
          fieldErrors: { decision: ['problem.approval.milestoneDecisionInvalid'] },
          remedies: [{ id: 'review_approval_queue' }],
        },
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      context.repository.reviewProjectMilestone(
        context.principal,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return actionSuccess(
        'action.approvals.milestoneReviewRecorded',
        {},
        'Milestone review recorded',
      );
    } catch (error) {
      return approvalReviewFailure(error, 'milestone', 'milestone', parsed.data.id, values);
    } finally {
      context?.sqlite.close();
    }
  },
};

type ApprovalReviewAction = 'reviewReport' | 'reviewTechnicalChange' | 'reviewMilestone';
type ApprovalReviewKind = 'report' | 'technical_change' | 'milestone';
type ApprovalReviewProblem = Readonly<{
  status: number;
  code: string;
  key: ActionMessageKey;
  message: string;
  remedy: string;
  field?: string;
}>;

const approvalReviewValueFields = new Set(['id', 'type', 'decision', 'reason']);

function reviewPostedValues(object: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(object).filter(
      (entry): entry is [string, string] =>
        approvalReviewValueFields.has(entry[0]) && typeof entry[1] === 'string',
    ),
  );
}

function reviewSchemaFailure(
  actionName: ApprovalReviewAction,
  values: Record<string, string>,
  errors: Record<string, string[] | undefined>,
) {
  const reasonError = Boolean(errors.reason?.length);
  const overlongReason = reasonError && (values.reason?.length ?? 0) > 2000;
  const messageKey: ActionMessageKey = reasonError
    ? overlongReason
      ? 'problem.approval.reviewReasonInvalid'
      : 'problem.approval.reasonRequired'
    : 'problem.approval.reviewFieldsInvalid';
  const message = reasonError
    ? overlongReason
      ? 'Keep the review reason within 2,000 characters.'
      : 'Enter a reason before returning or rejecting this record.'
    : 'Review the record and decision fields before recording this review.';
  const fields = Object.fromEntries(
    Object.entries(errors).flatMap(([field, issues]) =>
      issues?.length
        ? [[field, [field === 'reason' ? messageKey : 'problem.approval.reviewFieldsInvalid']]]
        : [],
    ),
  );
  return actionFail(400, messageKey, {}, message, {
    code: reasonError
      ? overlongReason
        ? 'APPROVAL_REVIEW_REASON_INVALID'
        : 'APPROVAL_REVIEW_REASON_REQUIRED'
      : 'APPROVAL_REVIEW_FIELDS_INVALID',
    actionName,
    values,
    fields,
    remedies: [{ id: reasonError ? 'enter_reason' : 'review_approval_queue' }],
  });
}

const approvalReviewProblems: Readonly<Record<string, ApprovalReviewProblem>> = {
  'report:A reason is required': {
    status: 400,
    code: 'APPROVAL_REVIEW_REASON_REQUIRED',
    key: 'problem.approval.reasonRequired',
    message: 'Enter a reason before returning or rejecting this record.',
    remedy: 'enter_reason',
    field: 'reason',
  },
  'report:Report not found': {
    status: 404,
    code: 'APPROVAL_REPORT_UNAVAILABLE',
    key: 'problem.approval.recordUnavailable',
    message:
      'This record is no longer available in the review queue. Refresh the queue before deciding.',
    remedy: 'review_approval_queue',
  },
  'report:Report is not submitted': {
    status: 409,
    code: 'APPROVAL_REPORT_NOT_SUBMITTED',
    key: 'problem.approval.recordNotSubmitted',
    message: 'This record is no longer submitted. Review its current status before deciding.',
    remedy: 'review_updated_record',
  },
  'technical_change:A review reason is required': {
    status: 400,
    code: 'APPROVAL_REVIEW_REASON_REQUIRED',
    key: 'problem.approval.reasonRequired',
    message: 'Enter a reason before returning or rejecting this record.',
    remedy: 'enter_reason',
    field: 'reason',
  },
  'technical_change:Technical change not found': {
    status: 404,
    code: 'APPROVAL_TECHNICAL_CHANGE_UNAVAILABLE',
    key: 'problem.approval.recordUnavailable',
    message:
      'This record is no longer available in the review queue. Refresh the queue before deciding.',
    remedy: 'review_approval_queue',
  },
  'technical_change:Technical change is not submitted': {
    status: 409,
    code: 'APPROVAL_TECHNICAL_CHANGE_NOT_SUBMITTED',
    key: 'problem.approval.recordNotSubmitted',
    message: 'This record is no longer submitted. Review its current status before deciding.',
    remedy: 'review_approval_queue',
  },
  'technical_change:Safety-impacting changes cannot be approved without validation and rollback information':
    {
      status: 400,
      code: 'APPROVAL_SAFETY_EVIDENCE_REQUIRED',
      key: 'problem.approval.safetyEvidenceRequired',
      message:
        'This safety-impacting change needs validation and rollback information before approval. Return it for correction.',
      remedy: 'return_for_correction',
    },
  'milestone:A rejection reason is required': {
    status: 400,
    code: 'APPROVAL_REVIEW_REASON_REQUIRED',
    key: 'problem.approval.reasonRequired',
    message: 'Enter a reason before returning or rejecting this record.',
    remedy: 'enter_reason',
    field: 'reason',
  },
  'milestone:Milestone not found': {
    status: 404,
    code: 'APPROVAL_MILESTONE_UNAVAILABLE',
    key: 'problem.approval.recordUnavailable',
    message:
      'This record is no longer available in the review queue. Refresh the queue before deciding.',
    remedy: 'review_approval_queue',
  },
  'milestone:Submitted milestone required': {
    status: 409,
    code: 'APPROVAL_MILESTONE_NOT_SUBMITTED',
    key: 'problem.approval.recordNotSubmitted',
    message: 'This record is no longer submitted. Review its current status before deciding.',
    remedy: 'review_approval_queue',
  },
};

function approvalReviewFailure(
  error: unknown,
  kind: ApprovalReviewKind,
  recordType: string,
  id: string,
  values: Record<string, string>,
) {
  const actionName: ApprovalReviewAction =
    kind === 'report'
      ? 'reviewReport'
      : kind === 'technical_change'
        ? 'reviewTechnicalChange'
        : 'reviewMilestone';
  const denied = error instanceof AccessDeniedError || error instanceof V3AccessDeniedError;
  const conflict = error instanceof ConflictError || error instanceof V3ConflictError;
  const validation = error instanceof ValidationError || error instanceof V3ValidationError;
  if (!denied && !conflict && !validation) return actionFailure(error, { actionName, values });
  const message = error.message;
  const mapped = approvalReviewProblems[`${kind}:${message}`];
  const problem: ApprovalReviewProblem | undefined =
    denied && message === 'Sign in required'
      ? {
          status: 401,
          code: 'APPROVAL_SIGN_IN_REQUIRED',
          key: 'action.error.unauthenticated',
          message: 'Sign in again to continue.',
          remedy: 'sign_in_again',
        }
      : denied && message === 'Active account required'
        ? {
            status: 403,
            code: 'APPROVAL_ACCOUNT_INACTIVE',
            key: 'problem.approval.accountInactive',
            message: 'Your account is no longer active. Contact a project owner to review access.',
            remedy: 'contact_project_owner',
          }
        : denied && message === 'Read-only role'
          ? {
              status: 403,
              code: 'APPROVAL_READ_ONLY_ROLE',
              key: 'problem.approval.readOnlyRole',
              message: 'Your role cannot record review decisions. Contact an authorized reviewer.',
              remedy: 'contact_project_reviewer',
            }
          : denied &&
              ['Project review required', 'Technical change review required'].includes(message)
            ? {
                status: 403,
                code: 'APPROVAL_REVIEW_PERMISSION_REQUIRED',
                key: 'problem.approval.reviewPermissionRequired',
                message:
                  'You no longer have review access to this project. Contact a project reviewer.',
                remedy: 'contact_project_reviewer',
              }
            : denied &&
                [
                  'Active project required for report review',
                  'Active project required for technical change review',
                  'Active project required for milestone review',
                ].includes(message)
              ? {
                  status: 403,
                  code: 'APPROVAL_PROJECT_NOT_ACTIVE',
                  key: 'problem.approval.projectNotActive',
                  message:
                    'This project is no longer Active, so its review cannot be recorded. Contact the project owner to review its status.',
                  remedy: 'contact_project_owner',
                }
              : mapped &&
                  ((mapped.status === 400 && validation) ||
                    (mapped.status === 404 && validation) ||
                    (mapped.status === 409 && conflict))
                ? mapped
                : undefined;
  if (!problem) return actionFailure(error, { actionName, values });
  return actionFail(problem.status, problem.key, { recordType }, problem.message, {
    code: problem.code,
    actionName,
    values,
    ...(problem.field ? { fieldErrors: { [problem.field]: [problem.key] } } : {}),
    remedies: [
      {
        id: problem.remedy,
        ...(problem.remedy === 'review_updated_record' ? { recordId: id } : {}),
      },
    ],
  });
}
