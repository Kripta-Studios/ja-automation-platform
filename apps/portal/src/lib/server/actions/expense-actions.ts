import { newId } from '@ja/domain';
import { withOperationalActionNames } from './operational-action-context';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { expenseInputSchema, minorUnitsSchema, versionedRecordSchema } from '@ja/schemas';
import {
  AccessDeniedError,
  ConflictError,
  DuplicateCrewExpenseError,
  V3AccessDeniedError,
  V3ConflictError,
  ValidationError,
} from '@ja/database';
import { z, type ZodError } from 'zod';
import { mondayOf } from '$lib/server/portal-week';
import { weekDates } from '$lib/portal/sections/time-entry-actions';
import { weeklyRecoveryFields } from '$lib/portal/sections/operational-recovery-fields';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  removePrivateFileIfPresent,
  writePrivateFileExclusive,
} from '$lib/server/private-artifact-access';
import {
  assertRegularPrivateFile,
  validateReportAttachmentFile,
} from '$lib/server/report-attachment-route';
import {
  actionFail,
  actionFailure,
  actionSuccess,
  type ActionMessageKey,
  type ActionMessageParams,
} from './action-message';
import { decimalToMinor, formObject, type PortalActionEvent } from '$lib/server/action-utils';
import { expenseCategories } from '$lib/portal/expense-categories';
import { normalizeAmountText } from '$lib/portal/payment-money';
import type { DatabaseSync } from 'node:sqlite';

const expenseCategorySchema = z.enum([
  'hotel',
  'rental_car',
  'fuel',
  'tolls',
  'parking',
  'airfare',
  'ground_transport',
  'meals',
  'per_diem',
  'materials',
  'tools',
  'shipping',
  'phone_data',
  'visa_permit',
  'other',
]);

const expenseValueFields = new Set([
  'id',
  'version',
  'workerId',
  'requestId',
  'projectId',
  'spentOn',
  'occurredTimeLocal',
  'timeEntryId',
  'vendor',
  'category',
  'description',
  'currency',
  'amount',
  'whoPaid',
  'paymentMethod',
  'receiptRequired',
  'receiptDocumentId',
  'weekStart',
  'entries',
  'batchForm',
]);

function safeExpenseValues(values: Record<string, unknown>): Record<string, string | boolean> {
  return {
    ...Object.fromEntries(
      Object.entries(values).filter(
        (entry): entry is [string, string] =>
          expenseValueFields.has(entry[0]) && typeof entry[1] === 'string',
      ),
    ),
    ...((values.receipt instanceof File && values.receipt.size > 0) ||
    values.receiptNeedsReattach === true
      ? { receiptNeedsReattach: true }
      : {}),
  };
}

type ExpenseFieldProblem = Readonly<{ code: string; key: ActionMessageKey; message: string }>;
const expenseFieldProblems: Record<string, ExpenseFieldProblem> = {
  projectId: {
    code: 'EXPENSE_PROJECT_INVALID',
    key: 'problem.expense.projectInvalid',
    message: 'Choose a valid project before saving this expense.',
  },
  spentOn: {
    code: 'EXPENSE_DATE_INVALID',
    key: 'problem.expense.dateInvalid',
    message: 'Enter a valid expense date. An active assignment must cover that date.',
  },
  occurredTimeLocal: {
    code: 'EXPENSE_OCCURRENCE_TIME_INVALID',
    key: 'problem.expenseDetail.correctionOccurrenceTimeInvalid',
    message: 'Enter a valid time when the expense occurred.',
  },
  timeEntryId: {
    code: 'EXPENSE_TIME_LINK_INVALID',
    key: 'problem.expense.timeLinkInvalid',
    message:
      'The linked time entry must be active and match this worker, project, and date. Review the time entry.',
  },
  vendor: {
    code: 'EXPENSE_VENDOR_INVALID',
    key: 'problem.expense.vendorInvalid',
    message: 'Enter a vendor of no more than 200 characters.',
  },
  category: {
    code: 'EXPENSE_CATEGORY_INVALID',
    key: 'problem.expenseDetail.correctionExpenseCategoryInvalid',
    message: 'Choose a valid expense category.',
  },
  description: {
    code: 'EXPENSE_DESCRIPTION_INVALID',
    key: 'problem.expense.descriptionInvalid',
    message: 'Describe the expense in 3 to 5,000 characters.',
  },
  currency: {
    code: 'EXPENSE_CURRENCY_INVALID',
    key: 'problem.expense.currencyInvalid',
    message: 'Choose a valid expense currency.',
  },
  amountMinor: {
    code: 'EXPENSE_AMOUNT_INVALID',
    key: 'problem.expense.amountInvalid',
    message: 'Enter an expense amount greater than zero.',
  },
  whoPaid: {
    code: 'EXPENSE_PAYER_INVALID',
    key: 'problem.expense.payerInvalid',
    message: 'Select who actually paid this expense.',
  },
  paymentMethod: {
    code: 'EXPENSE_PAYMENT_METHOD_INVALID',
    key: 'problem.expense.paymentMethodInvalid',
    message: 'Enter a payment method of no more than 80 characters.',
  },
  receiptDocumentId: {
    code: 'EXPENSE_RECEIPT_SELECTION_INVALID',
    key: 'problem.expense.receiptSelectionInvalid',
    message: 'Choose a valid committed receipt for this project, or reattach the receipt.',
  },
  id: {
    code: 'EXPENSE_RECORD_INVALID',
    key: 'problem.expense.recordInvalid',
    message:
      'The expense record ID or version is invalid. Review the current expense before trying again.',
  },
  version: {
    code: 'EXPENSE_RECORD_INVALID',
    key: 'problem.expense.recordInvalid',
    message:
      'The expense record ID or version is invalid. Review the current expense before trying again.',
  },
};

function expenseSchemaFailure(error: ZodError, values: Record<string, unknown>) {
  const rawFields = error.flatten().fieldErrors;
  const firstField = Object.keys(rawFields)[0] ?? '';
  const known = expenseFieldProblems[firstField] ?? {
    code: 'EXPENSE_FIELDS_INVALID',
    key: 'problem.expense.fieldsInvalid' as ActionMessageKey,
    message: 'Review the highlighted expense fields before saving.',
  };
  const fieldErrors = Object.fromEntries(
    Object.keys(rawFields).map((field) => [
      field === 'amountMinor' ? 'amount' : field,
      [expenseFieldProblems[field]?.key ?? 'problem.expense.fieldsInvalid'],
    ]),
  );
  return actionFail(400, known.key, {}, known.message, {
    code: known.code,
    values: safeExpenseValues(values),
    fieldErrors,
    remedies: [
      {
        id:
          firstField === 'receiptDocumentId'
            ? 'attach_receipt'
            : firstField === 'id' || firstField === 'version'
              ? 'review_expense'
              : Object.keys(fieldErrors).length > 1
                ? 'correct_fields'
                : 'correct_field',
      },
    ],
  });
}

/**
 * The update contract deliberately exposes only fields supported by
 * PortalRepository.updateExpense. Receipt uploads use the same validated,
 * authorized private-file pipeline as expense creation.
 */
const expenseUpdateSchema = versionedRecordSchema
  .extend({
    spentOn: z.iso.date().optional(),
    occurredTimeLocal: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    timeEntryId: z.uuid().nullable().optional(),
    vendor: z.string().trim().max(200).optional(),
    category: expenseCategorySchema.optional(),
    description: z.string().trim().max(5000).optional(),
    amountMinor: minorUnitsSchema.transform((value) => BigInt(value)),
    paymentMethod: z.string().trim().max(80).optional(),
    receiptDocumentId: z.uuid().optional(),
  })
  .strict();

/** Normalize the browser's decimal controls into the exact minor-unit update contract. */
export function parseExpenseUpdateForm(object: Record<string, unknown>) {
  const payload = { ...object };
  const amountMinor = decimalToMinor(
    normalizeExpenseAmount(payload.amount, payload.amountCurrency),
    payload.amountCurrency,
  );
  payload.amountMinor = amountMinor ?? payload.amount;
  delete payload.amount;
  delete payload.amountCurrency;

  // Empty optional controls should be omitted rather than coerced to zero.
  for (const key of ['paymentMethod', 'receiptDocumentId']) {
    if (payload[key] === '') delete payload[key];
  }
  if (payload.description === '') delete payload.description;
  if (payload.occurredTimeLocal === '') payload.occurredTimeLocal = null;
  if (payload.timeEntryId === '') payload.timeEntryId = null;
  return expenseUpdateSchema.safeParse(payload);
}

type ExpenseProblem = {
  status: number;
  code: string;
  key: ActionMessageKey;
  message: string;
  field?: string;
  remedy: string;
};
const expenseProblems: Record<string, ExpenseProblem> = {
  'Expense receipt type or size invalid': {
    status: 400,
    code: 'EXPENSE_RECEIPT_TYPE_OR_SIZE',
    key: 'problem.expense.receiptTypeOrSize',
    message: 'Choose a JPG, PNG, WebP, HEIC, HEIF, or PDF receipt under 10 MB.',
    field: 'receipt',
    remedy: 'attach_receipt',
  },
  'Expense receipt content invalid': {
    status: 400,
    code: 'EXPENSE_RECEIPT_CONTENT_INVALID',
    key: 'problem.expense.receiptContentInvalid',
    message:
      'The receipt content does not match its file type. Choose a valid receipt and reattach it.',
    field: 'receipt',
    remedy: 'attach_receipt',
  },
  'Expense receipt path invalid': {
    status: 400,
    code: 'EXPENSE_RECEIPT_PATH_INVALID',
    key: 'problem.expense.receiptPathInvalid',
    message: 'The receipt filename could not be used. Rename the file and reattach it.',
    field: 'receipt',
    remedy: 'attach_receipt',
  },
  'Project access required': {
    status: 403,
    code: 'EXPENSE_RECEIPT_PROJECT_ACCESS_REVOKED',
    key: 'problem.expense.receiptProjectAccessRevoked',
    message:
      'Project access changed while the receipt was uploading. No expense was saved. Contact the project owner to review access, then reattach the receipt.',
    remedy: 'contact_project_owner',
  },
  'Active account required': {
    status: 403,
    code: 'EXPENSE_ACCOUNT_INACTIVE',
    key: 'problem.expense.accountInactive',
    message:
      'Your account is no longer active. Contact an owner to review access before saving an expense. Reattach any receipt after access is restored.',
    remedy: 'contact_owner',
  },
  'Live authenticated session required': {
    status: 401,
    code: 'EXPENSE_SESSION_ENDED',
    key: 'problem.expense.sessionEnded',
    message:
      'Your session ended. Sign in again, review whether the expense was saved, and reattach any receipt before trying again.',
    remedy: 'sign_in_again',
  },
  'Read-only role': {
    status: 403,
    code: 'EXPENSE_READ_ONLY_ROLE',
    key: 'problem.expense.readOnlyRole',
    message: 'Your read-only role cannot change expenses. Contact an owner to review access.',
    remedy: 'contact_owner',
  },
  'Upload conflicts with existing content': {
    status: 409,
    code: 'EXPENSE_RECEIPT_DUPLICATE_CONTENT',
    key: 'problem.expense.receiptDuplicateContent',
    message:
      'This receipt file matches existing private content. No new expense was saved. Review expenses you can access or contact the project owner.',
    remedy: 'review_expenses',
  },
  'Expense not found': {
    status: 404,
    code: 'EXPENSE_RECORD_UNAVAILABLE',
    key: 'problem.expense.recordUnavailable',
    message: 'This expense is no longer available. Review the expenses list before trying again.',
    remedy: 'review_expenses',
  },
  'Crew expense request ID required': {
    status: 400,
    code: 'EXPENSE_CREW_REQUEST_ID_INVALID',
    key: 'problem.expense.crewRequestIdInvalid',
    message: 'Refresh the crew expense form and try again. The request ID is missing or invalid.',
    field: 'requestId',
    remedy: 'review_expense',
  },
  'Money exceeds safe SQLite integer range': {
    status: 400,
    code: 'EXPENSE_AMOUNT_TOO_LARGE',
    key: 'problem.expense.amountTooLarge',
    message: 'The expense amount is too large to save. Enter a smaller amount.',
    field: 'amount',
    remedy: 'correct_field',
  },
  'Project assignment access required': {
    status: 403,
    code: 'EXPENSE_PROJECT_ACCESS_REQUIRED',
    key: 'problem.expense.projectAccessRequired',
    message: 'You no longer have access to this project expense. Contact the project owner.',
    remedy: 'contact_project_owner',
  },
  'Project manager project scope required': {
    status: 403,
    code: 'EXPENSE_PROJECT_ACCESS_REQUIRED',
    key: 'problem.expense.projectAccessRequired',
    message: 'You no longer have access to this project expense. Contact the project owner.',
    remedy: 'contact_project_owner',
  },
  'Owner administration required to record for another worker': {
    status: 403,
    code: 'EXPENSE_OWNER_ENTRY_REQUIRED',
    key: 'problem.expense.ownerEntryRequired',
    message: 'Only an owner can record an expense for another worker here.',
    field: 'workerId',
    remedy: 'contact_project_owner',
  },
  'Active worker assignment required': {
    status: 403,
    code: 'EXPENSE_ASSIGNMENT_REQUIRED',
    key: 'problem.expense.assignmentRequired',
    message:
      'An active project assignment must cover the expense date. Contact the project owner to review access.',
    field: 'spentOn',
    remedy: 'contact_project_owner',
  },
  'Expense ownership required': {
    status: 403,
    code: 'EXPENSE_OWNERSHIP_REQUIRED',
    key: 'problem.expense.ownershipRequired',
    message: 'Only the worker who recorded this expense or an owner can change this draft.',
    remedy: 'contact_project_owner',
  },
  'Expense ownership or admin rights required': {
    status: 403,
    code: 'EXPENSE_OWNERSHIP_REQUIRED',
    key: 'problem.expense.ownershipRequired',
    message: 'Only the worker who recorded this expense or an owner can change this draft.',
    remedy: 'contact_project_owner',
  },
  'Crew expense access required': {
    status: 403,
    code: 'EXPENSE_CREW_ACCESS_REQUIRED',
    key: 'problem.expense.crewAccessRequired',
    message: 'Your crew access no longer covers this expense. Contact the project owner.',
    remedy: 'contact_project_owner',
  },
  'Active project crew delegation required': {
    status: 403,
    code: 'EXPENSE_CREW_ACCESS_REQUIRED',
    key: 'problem.expense.crewAccessRequired',
    message: 'Your crew access no longer covers this expense. Contact the project owner.',
    remedy: 'contact_project_owner',
  },
  'Valid project timezone required for crew access': {
    status: 403,
    code: 'EXPENSE_PROJECT_TIMEZONE_REQUIRED',
    key: 'problem.expense.projectTimezoneRequired',
    message:
      'The project timezone needs review before you can record crew expenses. Contact the project owner.',
    remedy: 'contact_project_owner',
  },
  'Crew time record access required': {
    status: 403,
    code: 'EXPENSE_CREW_TIME_ACCESS_REQUIRED',
    key: 'problem.expense.crewTimeAccessRequired',
    message: 'Choose a crew time entry you recorded for this worker, then try again.',
    field: 'timeEntryId',
    remedy: 'review_time',
  },
  'Crew expense request was withdrawn': {
    status: 409,
    code: 'EXPENSE_CREW_REQUEST_WITHDRAWN',
    key: 'problem.expense.crewRequestWithdrawn',
    message: 'This crew expense request was withdrawn. Start a new expense instead of retrying it.',
    remedy: 'review_expenses',
  },
  'Crew expense drafts must be withdrawn with a reason': {
    status: 409,
    code: 'EXPENSE_CREW_DELETE_REQUIRES_WITHDRAWAL',
    key: 'problem.expense.crewDeleteRequiresWithdrawal',
    message:
      'This crew expense has an audit trail. Enter a reason and withdraw the draft instead of deleting it.',
    remedy: 'review_expense',
  },
  'Expense changed before submission': {
    status: 409,
    code: 'EXPENSE_SUBMISSION_CHANGED',
    key: 'problem.expense.submissionChanged',
    message:
      'This draft changed since you opened it. Review the updated expense before submitting.',
    remedy: 'review_expense',
  },
  'Expense is not a draft for submission': {
    status: 409,
    code: 'EXPENSE_SUBMISSION_NOT_DRAFT',
    key: 'problem.expense.submissionNotDraft',
    message:
      'This expense is no longer a draft. Review its current status before taking another action.',
    remedy: 'review_expense',
  },
  'Expense receipt required for submission': {
    status: 409,
    code: 'EXPENSE_SUBMISSION_RECEIPT_REQUIRED',
    key: 'problem.expense.submissionReceiptRequired',
    message:
      'This draft requires a receipt, but none is attached. In Expenses, replace this incomplete draft with one that includes the receipt, or contact the project owner for help.',
    remedy: 'review_expenses',
  },
  'Expense locked before submission': {
    status: 409,
    code: 'EXPENSE_SUBMISSION_LOCKED',
    key: 'problem.expense.submissionLocked',
    message:
      'This expense is locked. Contact the project owner or designated administrator before changing or submitting it.',
    remedy: 'contact_finance',
  },
  'Only an unlocked editable expense draft can change': {
    status: 409,
    code: 'EXPENSE_NOT_EDITABLE_DRAFT',
    key: 'problem.expense.notEditableDraft',
    message:
      'Only an unlocked expense draft can be edited. Review the record or request a correction.',
    remedy: 'review_expense',
  },
  'Expense changed or cannot be edited': {
    status: 409,
    code: 'EXPENSE_DRAFT_CHANGED',
    key: 'problem.expense.draftChanged',
    message:
      'This expense changed while you were editing. Review the current record before saving.',
    remedy: 'review_expense',
  },
  'A committed receipt is required': {
    status: 400,
    code: 'EXPENSE_RECEIPT_REQUIRED',
    key: 'problem.expense.receiptRequired',
    message: 'Attach a committed receipt before saving this expense.',
    field: 'receipt',
    remedy: 'attach_receipt',
  },
  'This receipt is already claimed by a project expense': {
    status: 409,
    code: 'EXPENSE_RECEIPT_ALREADY_CLAIMED',
    key: 'problem.expense.receiptAlreadyClaimed',
    message:
      'This receipt is already used by a project expense. Review the existing claim before submitting another.',
    field: 'receipt',
    remedy: 'review_expense',
  },
  'Crew expense retry has changed': {
    status: 409,
    code: 'EXPENSE_RETRY_CHANGED',
    key: 'problem.expense.retryChanged',
    message:
      'This request ID was already used with different expense details. Review the saved expense before trying again.',
    remedy: 'review_expense',
  },
  'Active project assignment required': {
    status: 403,
    code: 'EXPENSE_ASSIGNMENT_REQUIRED',
    key: 'problem.expense.assignmentRequired',
    message:
      'An active project assignment must cover the expense date. Contact the project owner to review access.',
    field: 'spentOn',
    remedy: 'contact_project_owner',
  },
  'A matching active time record is required': {
    status: 400,
    code: 'EXPENSE_TIME_LINK_INVALID',
    key: 'problem.expense.timeLinkInvalid',
    message:
      'The linked time entry must be active and match this worker, project, and date. Review the time entry.',
    field: 'timeEntryId',
    remedy: 'review_time',
  },
  'Expense amount must be positive': {
    status: 400,
    code: 'EXPENSE_AMOUNT_INVALID',
    key: 'problem.expense.amountInvalid',
    message: 'Enter an expense amount greater than zero.',
    field: 'amount',
    remedy: 'correct_field',
  },
  'Receipt must belong to the expense project': {
    status: 403,
    code: 'EXPENSE_RECEIPT_PROJECT_MISMATCH',
    key: 'problem.expense.receiptProjectMismatch',
    message:
      'This receipt does not belong to the selected project. Choose a receipt for this project.',
    field: 'receipt',
    remedy: 'attach_receipt',
  },
  'A linked correction draft cannot be edited': {
    status: 409,
    code: 'EXPENSE_CORRECTION_DRAFT_LOCKED',
    key: 'problem.expense.correctionDraftLocked',
    message: 'This linked correction draft cannot be edited here. Review its correction record.',
    remedy: 'review_expense',
  },
  'This receipt is allocated across crew shifts and cannot be edited. Create a documented correction instead.':
    {
      status: 409,
      code: 'EXPENSE_ALLOCATED_RECEIPT_LOCKED',
      key: 'problem.expense.allocatedReceiptLocked',
      message:
        'This receipt is allocated across crew shifts. Review the allocation and create a documented correction.',
      remedy: 'review_expense',
    },
  'This receipt is allocated across crew shifts and cannot be deleted. Create a documented correction instead.':
    {
      status: 409,
      code: 'EXPENSE_ALLOCATED_RECEIPT_LOCKED',
      key: 'problem.expense.allocatedReceiptLocked',
      message:
        'This receipt is allocated across crew shifts. Review the allocation and create a documented correction.',
      remedy: 'review_expense',
    },
  'Committed owned receipt required': {
    status: 403,
    code: 'EXPENSE_RECEIPT_NOT_AVAILABLE',
    key: 'problem.expense.receiptNotAvailable',
    message:
      'The selected receipt is unavailable or was not committed for your account. Attach a valid receipt.',
    field: 'receipt',
    remedy: 'attach_receipt',
  },
  'Receipt content is already registered to another record': {
    status: 409,
    code: 'EXPENSE_RECEIPT_ALREADY_REGISTERED',
    key: 'problem.expense.receiptAlreadyRegistered',
    message:
      'This receipt is already attached to another record. Review the existing claim before submitting another.',
    field: 'receipt',
    remedy: 'review_expense',
  },
  'Only never-submitted drafts can be deleted': {
    status: 409,
    code: 'EXPENSE_DELETE_DRAFT_ONLY',
    key: 'problem.expense.deleteDraftOnly',
    message:
      'Only an expense draft that has never been submitted can be deleted. Review the record or request a correction.',
    remedy: 'review_expense',
  },
  'Linked time and meal drafts must be withdrawn together': {
    status: 409,
    code: 'LINKED_DRAFT_DELETE_REQUIRES_PAIR_WITHDRAWAL',
    key: 'problem.linkedDraft.deleteTogether',
    message:
      'This meal belongs to a linked time and meal draft pair. Withdraw both drafts together.',
    remedy: 'review_expense',
  },
  'Linked time and meal drafts must be submitted together': {
    status: 409,
    code: 'LINKED_DRAFT_SUBMIT_TOGETHER',
    key: 'problem.linkedDraft.submitTogether',
    message: 'Submit the linked time and meal drafts together from the weekly time review.',
    remedy: 'review_time',
  },
  'Submit the linked time draft before its meal expense': {
    status: 409,
    code: 'LINKED_MEAL_TIME_DRAFT',
    key: 'problem.linkedDraft.submitTimeFirst',
    message: 'Submit the linked time week before submitting this meal expense.',
    remedy: 'review_time',
  },
  'Linked time and meal no longer match for submission': {
    status: 409,
    code: 'LINKED_MEAL_TIME_UNAVAILABLE',
    key: 'problem.linkedDraft.timeUnavailable',
    message: 'The linked time cannot support this meal submission. Review both records.',
    remedy: 'review_time',
  },
  'Linked time and meal drafts must be withdrawn before editing': {
    status: 409,
    code: 'LINKED_DRAFT_EDIT_TOGETHER',
    key: 'problem.linkedDraft.editTogether',
    message:
      'Withdraw both linked drafts, then create a new time and meal entry with the correct details.',
    remedy: 'review_expense',
  },
  'Only never-submitted expense drafts can be deleted; use a reasoned correction': {
    status: 409,
    code: 'EXPENSE_DELETE_DRAFT_ONLY',
    key: 'problem.expense.deleteDraftOnly',
    message:
      'Only an expense draft that has never been submitted can be deleted. Review the record or request a correction.',
    remedy: 'review_expense',
  },
  'Billed or locked expenses cannot be deleted': {
    status: 409,
    code: 'EXPENSE_BILLED_OR_LOCKED',
    key: 'problem.expense.billedOrLocked',
    message:
      'Billed or locked expenses cannot be deleted. Contact Finance for an audited adjustment.',
    remedy: 'contact_finance',
  },
  'Expense changed before deletion': {
    status: 409,
    code: 'EXPENSE_DELETE_CHANGED',
    key: 'problem.expense.deleteChanged',
    message: 'This expense changed before deletion. Review its current state.',
    remedy: 'review_expense',
  },
  'Record changed before deletion': {
    status: 409,
    code: 'EXPENSE_DELETE_CHANGED',
    key: 'problem.expense.deleteChanged',
    message: 'This expense changed before deletion. Review its current state.',
    remedy: 'review_expense',
  },
};

export function expenseActionFailure(
  error: unknown,
  values: Record<string, unknown> = {},
  params: ActionMessageParams = {},
) {
  const savedValues = safeExpenseValues(values);
  if (error instanceof DuplicateCrewExpenseError)
    return actionFail(
      409,
      'problem.expense.possibleCrewDuplicate',
      {},
      'A possible duplicate expense is already saved for this worker, project, and date. Review it before saving another.',
      {
        code: 'EXPENSE_POSSIBLE_CREW_DUPLICATE',
        values: savedValues,
        remedies: [{ id: 'review_expense', recordId: error.expenseId }],
      },
    );
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof V3ConflictError ||
    error instanceof AccessDeniedError ||
    error instanceof V3AccessDeniedError
  ) {
    const known = expenseProblems[error.message];
    if (known)
      return actionFail(known.status, known.key, params, known.message, {
        code: known.code,
        values: savedValues,
        ...(known.field ? { fieldErrors: { [known.field]: [known.key] } } : {}),
        remedies: [{ id: known.remedy }],
      });
  }
  return actionFailure(error, { values: savedValues });
}

function expenseWeekFailure(
  status: number,
  code: string,
  message: string,
  values: Record<string, unknown>,
  field = 'entries',
  remedy = 'review_expenses',
) {
  return actionFail(status, `problem.expenseWeek.${code}`, {}, message, {
    code: `EXPENSE_WEEK_${code.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`,
    values: safeExpenseValues(values),
    fieldErrors: { [field]: [message] },
    remedies: [{ id: remedy }],
  });
}

/** Phone keyboards in ES/PT locales type "12,50"; accept one decimal comma as the separator. */
/**
 * Typed amount to the canonical "1234.50" the minor-unit converter expects. Uses the
 * same locale-tolerant parser as the form (T56: "2.940,00" in pt/es, "2,940.00" in en).
 */
export function normalizeExpenseAmount(value: unknown, currency?: unknown): unknown {
  if (typeof value !== 'string') return value;
  return (
    normalizeAmountText(value, typeof currency === 'string' && currency ? currency : 'USD') ??
    value.trim()
  );
}

/**
 * Workers record facts only. When the simplified form omits the note, keep the
 * repository's description contract with a neutral operational default.
 */
export function defaultExpenseDescription(object: Record<string, unknown>): string {
  const vendor = typeof object.vendor === 'string' ? object.vendor.trim() : '';
  if (vendor.length >= 3) return vendor;
  const category = expenseCategories.find(([value]) => value === object.category)?.[1];
  return category ? `${category} expense` : 'Expense';
}

/**
 * The payer is configuration, not worker data entry: derive it from the
 * assignment expense policy effective on the expense date. A worker-paid policy
 * wins when several payers are configured (it is the only one that can be
 * reimbursed); otherwise the single configured payer is used. With no policy
 * the historical default (worker paid) applies and Finance sees the
 * missing-policy issue during classification as before.
 */
export function defaultExpensePayer(
  sqlite: DatabaseSync,
  input: Readonly<{ projectId: string; workerId: string; spentOn: string; category: string }>,
): 'worker' | 'company_card' | 'company_direct' | 'client' | 'third_party' {
  const member = sqlite
    .prepare(
      `SELECT id FROM project_member WHERE project_id=? AND user_id=? AND status='active'
         AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) ORDER BY starts_on DESC LIMIT 2`,
    )
    .all(input.projectId, input.workerId, input.spentOn, input.spentOn) as Array<{ id: string }>;
  if (member.length !== 1) return 'worker';
  const payers = sqlite
    .prepare(
      `SELECT payer FROM assignment_expense_policy
        WHERE project_member_id=? AND (category=? OR category IS NULL)
          AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
        ORDER BY CASE WHEN category=? THEN 1 ELSE 0 END DESC, effective_from DESC, version DESC`,
    )
    .all(member[0]!.id, input.category, input.spentOn, input.spentOn, input.category) as Array<{
    payer: string;
  }>;
  if (!payers.length || payers.some((row) => row.payer === 'worker')) return 'worker';
  const first = payers[0]!.payer;
  return (
    (['company_card', 'company_direct', 'client', 'third_party'] as const).find(
      (value) => value === first,
    ) ?? 'worker'
  );
}

function validWeekStart(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value &&
    mondayOf(value) === value
  );
}

// Existing repository operations nest using savepoints, so validation and every
// expense transition/creation share a single write transaction and audit outcome.
function expenseWeekTransaction<T>(
  context: ReturnType<typeof openPortalRepository>,
  work: () => T,
): T {
  context.sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    context.sqlite.exec('COMMIT');
    return result;
  } catch (error) {
    context.sqlite.exec('ROLLBACK');
    throw error;
  }
}

export async function validateExpenseReceipt(file: File): Promise<Uint8Array> {
  if (
    ![
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf',
    ].includes(file.type) ||
    file.size > 10_000_000
  )
    throw new ValidationError('Expense receipt type or size invalid');
  try {
    return await validateReportAttachmentFile(file);
  } catch {
    throw new ValidationError('Expense receipt content invalid');
  }
}

/**
 * The signed-in person's own expense that already carries a receipt with these bytes
 * (T46). Only the uploader's own files are compared, so the answer never reveals other
 * people's records; naming the expense tells the person where the photo is used.
 */
function ownReceiptUse(
  context: ReturnType<typeof openPortalRepository>,
  sha256: string,
): { spentOn: string; category: string; vendor: string } | undefined {
  return context.sqlite
    .prepare(
      `SELECT e.spent_on spentOn,e.category category,COALESCE(e.vendor,'') vendor
         FROM expense e JOIN document d ON d.id=e.receipt_document_id
        WHERE d.sha256=? AND d.owner_id=? AND d.artifact_type='receipt'
          AND e.approval_state<>'void'
        ORDER BY e.created_at DESC,e.id DESC LIMIT 1`,
    )
    .get(sha256, context.principal.userId) as
    | { spentOn: string; category: string; vendor: string }
    | undefined;
}

function receiptAlreadyAttached(
  use: { spentOn: string; category: string; vendor: string },
  values: Record<string, unknown>,
) {
  const expense = [use.vendor, use.category].filter(Boolean).join(' · ');
  return actionFail(
    409,
    'problem.expense.receiptAlreadyAttached',
    { spentOn: use.spentOn, expense },
    `This receipt is already attached to your expense of ${use.spentOn} (${expense}). No new expense was saved. Open that expense instead, or choose another photo.`,
    {
      code: 'EXPENSE_RECEIPT_DUPLICATE_CONTENT',
      values,
      fieldErrors: {},
      remedies: [{ id: 'review_expenses' }],
    },
  );
}

/** A batch receipt is already stored or repeated in the batch: nothing saved, rows named. */
function duplicateBatchReceipt(batchRows: number[]) {
  return actionFail(
    409,
    'problem.expense.receiptDuplicateContent',
    {},
    'This receipt file matches existing private content. No new expense was saved. Review expenses you can access or contact the project owner.',
    {
      code: 'EXPENSE_RECEIPT_DUPLICATE_CONTENT',
      batchRow: batchRows[0],
      batchRows,
      remedies: [{ id: 'review_expenses' }],
    },
  );
}

export async function saveExpenseReceipt(
  context: ReturnType<typeof openPortalRepository>,
  projectId: string,
  file: File,
  bytes: Uint8Array,
) {
  const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
  let reservationId: string | undefined;
  let storageKey: string | undefined;
  let fileCreated = false;
  let committed = false;
  const cleanup = async () => {
    if (!reservationId) return;
    if (committed) {
      const removed = context.repository.removeUnreferencedReceipt(
        context.principal,
        reservationId,
      );
      if (removed) await removePrivateFileIfPresent(root, removed);
    } else {
      try {
        context.v3.cancelUploadReservation(context.principal, reservationId);
      } catch {
        /* Stale reservation cleanup preserves the original failure. */
      }
      if (fileCreated && storageKey) await removePrivateFileIfPresent(root, storageKey);
    }
  };
  try {
    const reservation = context.v3.reserveUpload(context.principal, {
      projectId,
      originalFilename: file.name.slice(0, 200),
      artifactType: 'receipt',
      description: 'Expense receipt',
      sensitivity: 'internal',
    });
    reservationId = reservation.reservationId;
    storageKey = reservation.storageKey;
    const target = resolve(root, storageKey);
    const path = relative(root, target);
    if (
      !path ||
      path.split(/[\\/]/).includes('..') ||
      path.startsWith('\\') ||
      path.startsWith('/')
    )
      throw new ValidationError('Expense receipt path invalid');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    try {
      await writePrivateFileExclusive(root, storageKey, bytes);
      fileCreated = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await assertRegularPrivateFile(root, storageKey, sha256, file.size, file.type);
    }
    context.v3.finalizeUpload(context.principal, reservationId, {
      sha256,
      mediaType: file.type,
      byteLength: file.size,
    });
    committed = true;
    return { id: reservationId, sha256, cleanup };
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
}

export const expenseActions = withOperationalActionNames({
  submitExpenseWeek: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const weekStart = String(object.weekStart ?? '');
    if (!validWeekStart(weekStart))
      return expenseWeekFailure(
        400,
        'startInvalid',
        'Select a valid week starting on Monday.',
        object,
        'weekStart',
      );
    let raw: unknown;
    try {
      raw = JSON.parse(String(object.entries ?? ''));
    } catch {
      raw = null;
    }
    const parsed = z
      .array(z.object({ id: z.string().uuid(), version: z.number().int().positive() }).strict())
      .min(1)
      .max(200)
      .safeParse(raw);
    if (
      !parsed.success ||
      new Set(parsed.success ? parsed.data.map((row) => row.id) : []).size !==
        (parsed.success ? parsed.data.length : 0)
    )
      return expenseWeekFailure(
        400,
        'selectionInvalid',
        'Select a week containing 1 to 200 distinct draft expenses, then review and try again.',
        object,
      );
    const context = openPortalRepository(locals);
    try {
      if (context.principal.role === 'auditor_read_only')
        throw new AccessDeniedError('Read-only role');
      const workerId = String(object.workerId || context.principal.userId);
      if (context.principal.role !== 'owner_admin' && workerId !== context.principal.userId)
        return expenseWeekFailure(
          403,
          'workerForbidden',
          'Only the owner can submit another worker’s expense week. Submit your own week or contact the owner.',
          object,
          'workerId',
        );
      const dates = weekDates(weekStart);
      const submitted = expenseWeekTransaction(context, () => {
        const rows = context.sqlite
          .prepare(
            `SELECT e.id,e.version,r.time_entry_id linkedTimeId,t.approval_state linkedTimeState
               FROM expense e
               LEFT JOIN operational_time_expense_request r ON r.expense_id=e.id
               LEFT JOIN time_entry t ON t.id=r.time_entry_id
              WHERE e.worker_id=? AND e.spent_on BETWEEN ? AND ? AND e.approval_state='draft'
                AND EXISTS (SELECT 1 FROM project p WHERE p.id=e.project_id AND p.status<>'archived')
              ORDER BY e.spent_on,e.id`,
          )
          .all(workerId, weekStart, dates[6]!) as Array<{
          id: string;
          version: number;
          linkedTimeId: string | null;
          linkedTimeState: string | null;
        }>;
        const versions = new Map(parsed.data.map((row) => [row.id, row.version]));
        if (
          rows.length !== parsed.data.length ||
          rows.some((row) => versions.get(row.id) !== row.version)
        )
          throw new ConflictError('Expense week changed before submission');
        if (rows.some((row) => row.linkedTimeId && row.linkedTimeState === 'draft'))
          throw new ConflictError('Expense week has a linked time draft awaiting submission');
        if (
          rows.some(
            (row) =>
              row.linkedTimeId &&
              !['submitted', 'needs_changes', 'approved', 'locked'].includes(
                row.linkedTimeState ?? '',
              ),
          )
        )
          throw new ConflictError('Expense week has an unavailable linked time entry');
        for (const row of rows)
          context.repository.submitExpense(context.principal, row.id, row.version);
        return rows.length;
      });
      return actionSuccess(
        submitted === 1 ? 'action.expense.weekSubmittedOne' : 'action.expense.weekSubmitted',
        { submitted },
        submitted === 1 ? '1 expense sent for review.' : `${submitted} expenses sent for review.`,
      );
    } catch (error) {
      if (
        error instanceof ConflictError &&
        error.message === 'Expense week changed before submission'
      )
        return expenseWeekFailure(
          409,
          'changed',
          'This week changed after you opened it. Refresh and review the current drafts before submitting. No expenses were submitted.',
          object,
        );
      if (
        error instanceof ConflictError &&
        error.message === 'Expense week has a linked time draft awaiting submission'
      )
        return expenseWeekFailure(
          409,
          'linkedTimeDraft',
          'A meal expense is linked to time that is still a draft. Submit the time week first, then submit this expense week. No expenses were submitted.',
          object,
          'entries',
          'review_time',
        );
      if (
        error instanceof ConflictError &&
        error.message === 'Expense week has an unavailable linked time entry'
      )
        return expenseWeekFailure(
          409,
          'linkedTimeUnavailable',
          'A meal expense is linked to time that cannot be submitted. Review the linked time and meal before retrying. No expenses were submitted.',
          object,
          'entries',
          'review_time',
        );
      return expenseActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },
  createExpenseWeek: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const weekStart = String(object.weekStart ?? '');
    if (!validWeekStart(weekStart))
      return expenseWeekFailure(
        400,
        'startInvalid',
        'Select a valid week starting on Monday.',
        object,
        'weekStart',
      );
    const requestId = String(object.requestId ?? '');
    if (!/^[a-zA-Z0-9_-]{16,200}$/.test(requestId))
      return expenseWeekFailure(
        400,
        'requestInvalid',
        'The save request expired. Reopen the weekly table before saving.',
        object,
        'requestId',
      );
    let raw: unknown;
    try {
      raw = JSON.parse(String(object.entries ?? ''));
    } catch {
      raw = null;
    }
    const dates = weekDates(weekStart);
    const rows = z
      .array(
        z
          .object({
            spentOn: z.string(),
            amount: z.string(),
            description: z.string(),
            category: expenseCategorySchema,
            vendor: z.string().max(200).default(''),
          })
          .strict(),
      )
      .min(1)
      .max(7)
      .safeParse(raw);
    if (!rows.success) {
      const fieldErrors = Object.assign(
        {},
        ...rows.error.issues.flatMap((issue) => {
          if (
            !Array.isArray(raw) ||
            typeof issue.path[0] !== 'number' ||
            typeof issue.path[1] !== 'string'
          )
            return [];
          const row = raw[issue.path[0]];
          if (!row || typeof row !== 'object') return [];
          const field = issue.path[1];
          return [
            weeklyRecoveryFields(
              { [field]: [expenseFieldProblems[field]?.key ?? 'problem.expense.fieldsInvalid'] },
              String(row.spentOn ?? ''),
              dates,
              'expense',
            ),
          ];
        }),
      );
      return actionFail(
        400,
        'problem.expenseWeek.rowsInvalid',
        {},
        'Enter 1 to 7 daily expenses with a date, category, amount and description. No drafts were saved.',
        {
          code: 'EXPENSE_WEEK_ROWS_INVALID',
          values: safeExpenseValues(object),
          fieldErrors: Object.keys(fieldErrors).length
            ? fieldErrors
            : { entries: ['problem.expense.fieldsInvalid'] },
          remedies: [{ id: 'review_expenses' }],
        },
      );
    }
    if (
      new Set(rows.data.map((row) => row.spentOn)).size !== rows.data.length ||
      rows.data.some((row) => !dates.includes(row.spentOn))
    )
      return expenseWeekFailure(
        400,
        'datesInvalid',
        'Each daily expense must have a distinct date in the selected week. No drafts were saved.',
        object,
      );
    const inputs = rows.data.map((row) =>
      expenseInputSchema.safeParse({
        projectId: object.projectId,
        spentOn: row.spentOn,
        vendor: row.vendor,
        category: row.category,
        description: row.description,
        currency: object.currency,
        amountMinor: decimalToMinor(
          normalizeExpenseAmount(row.amount, object.currency),
          object.currency,
        ),
        whoPaid: object.whoPaid,
        receiptRequired: false,
      }),
    );
    const invalidRows = inputs.flatMap((input, index) => {
      if (input.success) return [];
      const failure = expenseSchemaFailure(input.error, object);
      return [
        {
          date: String(rows.data[index]?.spentOn ?? ''),
          failure,
          fields: weeklyRecoveryFields(
            failure.data.fieldErrors,
            String(rows.data[index]?.spentOn ?? ''),
            dates,
            'expense',
          ),
        },
      ];
    });
    if (invalidRows.length) {
      const first = invalidRows[0]!;
      return actionFail(
        400,
        'problem.expenseWeek.rowInvalid',
        {},
        `${first.date}: ${first.failure.data.message} No drafts were saved.`,
        {
          code: 'EXPENSE_WEEK_ROW_INVALID',
          values: safeExpenseValues(object),
          fieldErrors: Object.assign({}, ...invalidRows.map((row) => row.fields)),
          remedies: [{ id: 'review_expenses' }],
        },
      );
    }
    const context = openPortalRepository(locals);
    try {
      if (context.principal.role === 'auditor_read_only')
        throw new AccessDeniedError('Read-only role');
      const workerId = String(object.workerId || context.principal.userId);
      if (context.principal.role !== 'owner_admin' && workerId !== context.principal.userId)
        return expenseWeekFailure(
          403,
          'workerForbidden',
          'Choose your own expense week. The owner can record a week for another worker.',
          object,
          'workerId',
        );
      const activeAssignment = context.sqlite.prepare(
        "SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) LIMIT 1",
      );
      for (const row of rows.data) {
        if (
          activeAssignment.get(String(object.projectId ?? ''), workerId, row.spentOn, row.spentOn)
        )
          continue;
        return actionFail(
          403,
          'problem.expenseWeek.dateOutsideAssignment',
          { spentOn: row.spentOn },
          `${row.spentOn} is outside this worker's active assignment to the project. Correct the date or ask the owner to extend the assignment. No drafts were saved.`,
          {
            code: 'EXPENSE_WEEK_DATE_OUTSIDE_ASSIGNMENT',
            values: safeExpenseValues(object),
            fieldErrors: {},
            remedies: [{ id: 'review_expenses' }],
          },
        );
      }
      const payloadHash = createHash('sha256')
        .update(
          JSON.stringify({
            workerId,
            weekStart,
            projectId: object.projectId,
            currency: object.currency,
            whoPaid: object.whoPaid,
            rows: rows.data,
          }),
        )
        .digest('hex');
      const result = expenseWeekTransaction(context, () => {
        const prior = context.sqlite
          .prepare(
            "SELECT details_json FROM audit_event WHERE actor_id=? AND action='expense.create' AND json_extract(details_json,'$.expenseWeekRequestId')=? LIMIT 1",
          )
          .get(context.principal.userId, requestId) as { details_json: string } | undefined;
        if (prior) {
          const details = JSON.parse(prior.details_json) as {
            expenseWeekPayloadHash: string;
            expenseWeekCount: number;
            expenseIds: string[];
          };
          if (details.expenseWeekPayloadHash !== payloadHash)
            throw new ConflictError('Expense week retry has changed');
          for (const id of details.expenseIds)
            context.repository.expenseDetail(context.principal, id);
          return { created: details.expenseWeekCount, replayed: true };
        }
        // The batch's retry identity rides on the first expense's own expense.create
        // audit event, so every expense has exactly one "Expense recorded" event.
        const ids = inputs.map(() => newId());
        const created = inputs.map((input, index) => {
          if (!input.success) throw new ValidationError('Expense fields are invalid');
          return context.repository.createExpense(
            context.principal,
            input.data,
            workerId,
            undefined,
            {
              id: ids[index],
              ...(index === 0
                ? {
                    auditDetails: {
                      projectId: String(object.projectId),
                      expenseWeekRequestId: requestId,
                      expenseWeekPayloadHash: payloadHash,
                      expenseWeekCount: inputs.length,
                      expenseIds: ids,
                    },
                  }
                : {}),
            },
          );
        });
        return { created: created.length, replayed: false };
      });
      return actionSuccess(
        result.replayed
          ? 'action.expense.weekDraftsAlreadySaved'
          : result.created === 1
            ? 'action.expense.weekDraftsSavedOne'
            : 'action.expense.weekDraftsSaved',
        result,
        result.replayed
          ? `${result.created} weekly expense drafts were already saved. No duplicates were created.`
          : `${result.created} weekly expense drafts saved`,
      );
    } catch (error) {
      if (error instanceof ConflictError && error.message === 'Expense week retry has changed')
        return expenseWeekFailure(
          409,
          'retryChanged',
          'This save request already created drafts with different details. Review the saved expenses before starting a new weekly table.',
          object,
        );
      return expenseActionFailure(error, object);
    } finally {
      context.sqlite.close();
    }
  },

  /**
   * Bulk capture (owner request 2026-11-16): several expenses for one project in
   * one save, each row with its own date, category, amount, optional note and
   * receipt. All-or-nothing: rows are validated first, receipts are validated
   * and stored, then every draft is created in one transaction with a retry
   * identity so a resubmitted form never duplicates drafts. Payer and
   * commercial treatment follow the assignment policy, exactly like a single
   * expense.
   */
  createExpenseBatch: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    // "Save & send N expenses": create the drafts and submit them in the same
    // transaction (same canonical submit command, RBAC and audit as week submit).
    const submitNow = object.submitNow === 'on';
    const rowCount = Number(object.rowCount);
    const requestId = String(object.requestId ?? '');
    if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > 20)
      return expenseWeekFailure(
        400,
        'rowsInvalid',
        'Enter 1 to 20 expenses with a date, category and amount. No drafts were saved.',
        {},
      );
    if (!/^[a-zA-Z0-9_-]{16,200}$/.test(requestId))
      return expenseWeekFailure(
        400,
        'requestInvalid',
        'The save request expired. Reopen the form before saving.',
        {},
        'requestId',
      );
    type BatchRow = { index: number; input: Record<string, unknown>; receipt?: File };
    const rows: BatchRow[] = [];
    for (let index = 0; index < rowCount; index += 1) {
      const amount = String(object[`amount_${index}`] ?? '').trim();
      const receipt = object[`receipt_${index}`];
      const receiptFile = receipt instanceof File && receipt.size > 0 ? receipt : undefined;
      // A fully blank row is ignored so people can leave spare rows empty.
      if (!amount && !receiptFile) continue;
      const input: Record<string, unknown> = {
        projectId: object.projectId,
        spentOn: object[`spentOn_${index}`],
        category: object[`category_${index}`],
        currency: object.currency,
        amountMinor: decimalToMinor(
          normalizeExpenseAmount(amount, object.currency),
          object.currency,
        ),
        description: String(object[`note_${index}`] ?? '').trim(),
        whoPaid: 'worker',
        receiptRequired: Boolean(receiptFile),
      };
      if (!input.description) input.description = defaultExpenseDescription(input);
      rows.push({ index, input, receipt: receiptFile });
    }
    if (!rows.length)
      return expenseWeekFailure(
        400,
        'rowsInvalid',
        'Enter 1 to 20 expenses with a date, category and amount. No drafts were saved.',
        {},
      );
    for (const row of rows) {
      const checked = expenseInputSchema.safeParse(row.input);
      if (checked.success) continue;
      const failure = expenseSchemaFailure(checked.error, {});
      return actionFail(failure.status, failure.data.messageKey, {}, failure.data.message, {
        code: failure.data.code,
        batchRow: row.index,
        fieldErrors: Object.fromEntries(
          Object.entries(failure.data.fieldErrors).map(([field, errors]) => [
            field === 'projectId' || field === 'currency' ? field : `${field}_${row.index}`,
            [...errors],
          ]),
        ),
        remedies: failure.data.remedies,
      });
    }
    const context = openPortalRepository(locals);
    const uploads: Array<Awaited<ReturnType<typeof saveExpenseReceipt>>> = [];
    const cleanup = async () => {
      for (const upload of uploads) await upload.cleanup().catch(() => undefined);
    };
    try {
      if (context.principal.role === 'auditor_read_only')
        throw new AccessDeniedError('Read-only role');
      const workerId = String(object.workerId || context.principal.userId);
      if (context.principal.role !== 'owner_admin' && workerId !== context.principal.userId)
        return expenseWeekFailure(
          403,
          'workerForbidden',
          'Record your own expenses. The owner can record expenses for another worker.',
          {},
          'workerId',
        );
      const bytes = new Map<number, Uint8Array>();
      for (const row of rows)
        if (row.receipt) bytes.set(row.index, await validateExpenseReceipt(row.receipt));
      // Name every row whose receipt is already stored or repeats another row's
      // photo, before anything is stored, so the person can fix just those rows.
      const seen = new Set<string>();
      const duplicateRows = new Set<number>();
      const storedContent = context.sqlite.prepare(
        'SELECT 1 FROM document WHERE sha256=? AND byte_length=? LIMIT 1',
      );
      for (const row of rows) {
        const rowBytes = bytes.get(row.index);
        if (!rowBytes) continue;
        const sha256 = createHash('sha256').update(rowBytes).digest('hex');
        const key = `${sha256}:${rowBytes.byteLength}`;
        // The same photo twice: the later row is the repeat; the first one may stay.
        if (seen.has(key)) duplicateRows.add(row.index);
        else seen.add(key);
        if (storedContent.get(sha256, rowBytes.byteLength)) duplicateRows.add(row.index);
      }
      if (duplicateRows.size)
        return duplicateBatchReceipt([...duplicateRows].sort((a, b) => a - b));
      for (const row of rows)
        row.input.whoPaid = defaultExpensePayer(context.sqlite, {
          projectId: String(row.input.projectId),
          workerId,
          spentOn: String(row.input.spentOn),
          category: String(row.input.category),
        });
      const payloadHash = createHash('sha256')
        .update(
          JSON.stringify({
            workerId,
            submitNow,
            rows: rows.map((row) => ({
              ...row.input,
              receipt: bytes.has(row.index)
                ? createHash('sha256').update(bytes.get(row.index)!).digest('hex')
                : null,
            })),
          }),
        )
        .digest('hex');
      const prior = () => {
        const found = context.sqlite
          .prepare(
            "SELECT details_json FROM audit_event WHERE actor_id=? AND action='expense.create' AND json_extract(details_json,'$.expenseBatchRequestId')=? LIMIT 1",
          )
          .get(context.principal.userId, requestId) as { details_json: string } | undefined;
        if (!found) return undefined;
        const details = JSON.parse(found.details_json) as {
          expenseBatchPayloadHash: string;
          expenseBatchCount: number;
        };
        if (details.expenseBatchPayloadHash !== payloadHash)
          throw new ConflictError('Expense week retry has changed');
        return { created: details.expenseBatchCount, replayed: true };
      };
      const replay = prior();
      if (replay)
        return actionSuccess(
          'action.expense.weekDraftsAlreadySaved',
          { created: replay.created },
          `${replay.created} expense drafts were already saved. No duplicates were created.`,
        );
      for (const row of rows) {
        const rowBytes = bytes.get(row.index);
        if (!row.receipt || !rowBytes) continue;
        let upload: Awaited<ReturnType<typeof saveExpenseReceipt>>;
        try {
          upload = await saveExpenseReceipt(
            context,
            String(row.input.projectId),
            row.receipt,
            rowBytes,
          );
        } catch (error) {
          // Same receipt stored by someone else in the meantime: mark that row.
          if (
            error instanceof Error &&
            error.message === 'Upload conflicts with existing content'
          ) {
            await cleanup();
            return duplicateBatchReceipt([row.index]);
          }
          throw error;
        }
        uploads.push(upload);
        row.input.receiptDocumentId = upload.id;
      }
      const result = expenseWeekTransaction(context, () => {
        const replayed = prior();
        if (replayed) return replayed;
        // Retry identity on the first expense's own expense.create event (no duplicate).
        const ids = rows.map(() => newId());
        const created = rows.map((row, index) => {
          const parsed = expenseInputSchema.safeParse(row.input);
          if (!parsed.success) throw new ValidationError('Expense fields are invalid');
          return context.repository.createExpense(
            context.principal,
            parsed.data,
            workerId,
            undefined,
            {
              id: ids[index],
              ...(index === 0
                ? {
                    auditDetails: {
                      projectId: String(object.projectId),
                      expenseBatchRequestId: requestId,
                      expenseBatchPayloadHash: payloadHash,
                      expenseBatchCount: rows.length,
                      expenseIds: ids,
                    },
                  }
                : {}),
            },
          );
        });
        if (submitNow)
          for (const row of created)
            context.repository.submitExpense(context.principal, row.id, row.version);
        return { created: created.length, replayed: false };
      });
      if (result.replayed) await cleanup();
      if (submitNow && !result.replayed)
        return actionSuccess(
          result.created === 1 ? 'action.expense.weekSubmittedOne' : 'action.expense.weekSubmitted',
          { created: result.created, submitted: result.created },
          `${result.created} expenses sent for review`,
        );
      return actionSuccess(
        result.replayed
          ? 'action.expense.weekDraftsAlreadySaved'
          : result.created === 1
            ? 'action.expense.weekDraftsSavedOne'
            : 'action.expense.weekDraftsSaved',
        { created: result.created },
        `${result.created} expense drafts saved`,
      );
    } catch (error) {
      await cleanup();
      if (error instanceof ConflictError && error.message === 'Expense week retry has changed')
        return expenseWeekFailure(
          409,
          'retryChanged',
          'This save request already created drafts with different details. Review the saved expenses before saving again.',
          {},
        );
      return expenseActionFailure(error, {});
    } finally {
      context.sqlite.close();
    }
  },

  createExpense: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeExpenseValues(object);
    const workerId =
      typeof object.workerId === 'string' && object.workerId ? object.workerId : undefined;
    delete object.workerId;
    const requestId = typeof object.requestId === 'string' ? object.requestId : undefined;
    delete object.requestId;
    const allowSeparateExpense = object.allowSeparateExpense === 'on';
    delete object.allowSeparateExpense;
    // "Save & send": create the draft and submit it in the same transaction
    // (same canonical submit command, RBAC and audit as the week submit).
    const submitNow = object.submitNow === 'on';
    delete object.submitNow;
    const receipt = object.receipt;
    const receiptFile = receipt instanceof File ? receipt : undefined;
    delete object.receipt;
    object.receiptRequired =
      object.receiptRequired === 'on' || (receiptFile !== undefined && receiptFile.size > 0);
    object.amountMinor = decimalToMinor(
      normalizeExpenseAmount(object.amount, object.currency),
      object.currency,
    );
    delete object.amount;
    for (const key of ['paymentMethod', 'receiptDocumentId', 'vendor']) {
      if (object[key] === '') object[key] = undefined;
    }
    if (typeof object.description !== 'string' || !object.description.trim())
      object.description = defaultExpenseDescription(object);
    const payerFromPolicy = typeof object.whoPaid !== 'string' || !object.whoPaid;
    if (payerFromPolicy) object.whoPaid = 'worker';
    let preflight = expenseInputSchema.safeParse(object);
    if (!preflight.success) return expenseSchemaFailure(preflight.error, { ...object, ...values });
    const context = openPortalRepository(locals);
    let uploaded: Awaited<ReturnType<typeof saveExpenseReceipt>> | undefined;
    try {
      if (context.principal.role === 'auditor_read_only')
        throw new AccessDeniedError('Read-only role');
      if (payerFromPolicy) {
        object.whoPaid = defaultExpensePayer(context.sqlite, {
          projectId: preflight.data.projectId,
          workerId: workerId || context.principal.userId,
          spentOn: preflight.data.spentOn,
          category: preflight.data.category,
        });
        preflight = expenseInputSchema.safeParse(object);
        if (!preflight.success)
          return expenseSchemaFailure(preflight.error, { ...object, ...values });
      }
      const bytes =
        receiptFile && receiptFile.size > 0 ? await validateExpenseReceipt(receiptFile) : undefined;
      const receiptHash = bytes
        ? createHash('sha256').update(bytes).digest('hex')
        : object.receiptDocumentId
          ? String(
              context.sqlite
                .prepare('SELECT sha256 FROM document WHERE id=? AND owner_id=?')
                .get(String(object.receiptDocumentId), context.principal.userId)?.sha256 ?? '',
            )
          : null;
      const payloadHash = createHash('sha256')
        .update(
          JSON.stringify({
            ...preflight.data,
            amountMinor: preflight.data.amountMinor.toString(),
            receiptDocumentId: undefined,
            receiptHash,
            workerId: workerId || context.principal.userId,
          }),
        )
        .digest('hex');
      const retryIdentity =
        requestId && /^[a-zA-Z0-9_-]{16,200}$/.test(requestId) ? requestId : undefined;
      const priorResult = () => {
        if (!retryIdentity) return undefined;
        const prior = context.sqlite
          .prepare(
            "SELECT entity_id,details_json FROM audit_event WHERE actor_id=? AND action='expense.create' AND json_extract(details_json,'$.expenseRequestId')=? LIMIT 1",
          )
          .get(context.principal.userId, retryIdentity) as
          | { entity_id: string; details_json: string }
          | undefined;
        if (!prior) return undefined;
        const details = JSON.parse(prior.details_json) as { expensePayloadHash: string };
        if (details.expensePayloadHash !== payloadHash)
          throw new ConflictError('Crew expense retry has changed');
        const existing = context.repository.expenseDetail(context.principal, prior.entity_id);
        if (existing.approval_state === 'void')
          throw new ConflictError('Crew expense request was withdrawn');
        return { id: prior.entity_id, version: Number(existing.version), replayed: true };
      };
      if (priorResult())
        return actionSuccess(
          'action.expense.draftAlreadySaved',
          {},
          'Expense draft already saved. No duplicate was created.',
        );
      if (receiptFile && bytes) {
        try {
          uploaded = await saveExpenseReceipt(
            context,
            String(object.projectId),
            receiptFile,
            bytes,
          );
        } catch (error) {
          // Access and validation run first (inside the reservation). Only when the bytes are
          // already stored is the person's OWN expense with that receipt named (T46).
          const use =
            receiptHash &&
            error instanceof Error &&
            error.message === 'Upload conflicts with existing content'
              ? ownReceiptUse(context, receiptHash)
              : undefined;
          if (use) return receiptAlreadyAttached(use, values);
          throw error;
        }
        object.receiptDocumentId = uploaded.id;
      }
      const parsed = expenseInputSchema.safeParse(object);
      if (!parsed.success) {
        await uploaded?.cleanup();
        return expenseSchemaFailure(parsed.error, { ...object, ...values });
      }
      const created = expenseWeekTransaction(context, () => {
        const replayed = priorResult();
        if (replayed) return replayed;
        if (!allowSeparateExpense && !parsed.data.receiptDocumentId) {
          // Same person, date, category and amount with no receipt usually means the same
          // cost was typed twice. Ask once ("Save anyway?"); the crew-chief path keeps its
          // own stricter check inside the repository.
          const duplicate = context.sqlite
            .prepare(
              `SELECT id FROM expense
                WHERE worker_id=? AND spent_on=? AND category=? AND currency=? AND amount_minor=?
                  AND receipt_document_id IS NULL
                  AND approval_state NOT IN ('void','rejected')
                  AND NOT EXISTS (SELECT 1 FROM record_correction_link rcl
                    WHERE rcl.record_type='expense' AND rcl.correction_id=expense.id)
                ORDER BY created_at DESC, id DESC LIMIT 1`,
            )
            .get(
              workerId || context.principal.userId,
              parsed.data.spentOn,
              parsed.data.category,
              parsed.data.currency,
              parsed.data.amountMinor,
            ) as { id: string } | undefined;
          if (duplicate) throw new DuplicateCrewExpenseError(duplicate.id);
        }
        // The retry identity is stored on the expense's own expense.create audit
        // event: one "Expense recorded" per expense (T17 double emit).
        const created = context.repository.createExpense(
          context.principal,
          parsed.data,
          workerId,
          requestId,
          {
            allowSeparateExpense,
            ...(retryIdentity
              ? {
                  auditDetails: {
                    projectId: parsed.data.projectId,
                    expenseRequestId: retryIdentity,
                    expensePayloadHash: payloadHash,
                  },
                }
              : {}),
          },
        );
        if (submitNow && !created.replayed)
          context.repository.submitExpense(context.principal, created.id, created.version);
        return created;
      });
      if (created.replayed) await uploaded?.cleanup();
      if (submitNow && !created.replayed)
        return actionSuccess('action.expense.submitted', {}, 'Expense submitted');
      return actionSuccess(
        created.replayed ? 'action.expense.draftAlreadySaved' : 'action.expense.draftSaved',
        {},
        created.replayed
          ? 'Expense draft already saved. No duplicate was created.'
          : 'Expense draft saved',
      );
    } catch (error) {
      await uploaded?.cleanup().catch(() => undefined);
      return expenseActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
  updateExpense: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeExpenseValues(object);
    const receipt = object.receipt;
    const receiptFile = receipt instanceof File && receipt.size > 0 ? receipt : undefined;
    delete object.receipt;
    const submitNow = object.submitNow === 'on';
    delete object.submitNow;
    const parsed = parseExpenseUpdateForm(object);
    if (!parsed.success) return expenseSchemaFailure(parsed.error, values);
    const context = openPortalRepository(locals);
    let uploaded: Awaited<ReturnType<typeof saveExpenseReceipt>> | undefined;
    try {
      if (receiptFile) {
        // Authorize the expense itself before reserving storage; project read
        // access alone does not grant permission to replace another worker's receipt.
        const detail = context.repository.expenseDetail(context.principal, parsed.data.id);
        if (
          detail.worker_id !== context.principal.userId &&
          context.principal.role !== 'owner_admin' &&
          context.principal.role !== 'worker'
        )
          throw new AccessDeniedError('Expense ownership required');
        if (detail.approval_state !== 'draft')
          throw new ConflictError('Only an unlocked editable expense draft can change');
        if (Number(detail.version) !== parsed.data.version)
          throw new ConflictError('Expense changed or cannot be edited');
        const bytes = await validateExpenseReceipt(receiptFile);
        uploaded = await saveExpenseReceipt(context, String(detail.project_id), receiptFile, bytes);
      }
      if (submitNow) {
        // Save the edit and send it in one transaction: both or neither.
        expenseWeekTransaction(context, () => {
          context.repository.updateExpense(context.principal, {
            ...parsed.data,
            ...(uploaded ? { receiptDocumentId: uploaded.id } : {}),
          });
          const current = context.sqlite
            .prepare('SELECT version FROM expense WHERE id=?')
            .get(parsed.data.id) as { version: number } | undefined;
          context.repository.submitExpense(
            context.principal,
            parsed.data.id,
            Number(current?.version),
          );
        });
        return actionSuccess('action.expense.submitted', {}, 'Expense submitted');
      }
      context.repository.updateExpense(context.principal, {
        ...parsed.data,
        ...(uploaded ? { receiptDocumentId: uploaded.id } : {}),
      });
      return actionSuccess('action.expense.draftSaved', {}, 'Expense changes saved');
    } catch (error) {
      await uploaded?.cleanup().catch(() => undefined);
      return expenseActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
  submitExpense: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeExpenseValues(object);
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success) return expenseSchemaFailure(parsed.error, values);
    const context = openPortalRepository(locals);
    try {
      context.repository.submitExpense(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess('action.expense.submitted', {}, 'Expense submitted');
    } catch (error) {
      const status =
        error instanceof ConflictError && error.message === 'Expense is not a draft for submission'
          ? (
              context.sqlite
                .prepare('SELECT approval_state FROM expense WHERE id=?')
                .get(parsed.data.id) as { approval_state: string } | undefined
            )?.approval_state
          : undefined;
      return expenseActionFailure(error, values, status ? { status } : {});
    } finally {
      context.sqlite.close();
    }
  },
  withdrawCrewExpenseDraft: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const expenseId = String(object.expenseId ?? '');
    const version = Number(object.version);
    const reason = String(object.reason ?? '').trim();
    const values = { expenseId, reason };
    if (
      !expenseId ||
      !Number.isInteger(version) ||
      version < 1 ||
      reason.length < 3 ||
      reason.length > 2000
    )
      return actionFail(
        400,
        'problem.expense.crewWithdrawalInvalid',
        {},
        'Enter a reason of 3 to 2,000 characters and review the current draft version.',
        {
          code: 'EXPENSE_CREW_WITHDRAWAL_INVALID',
          actionName: 'withdrawCrewExpenseDraft',
          values,
          ...(reason.length < 3 || reason.length > 2000
            ? { fieldErrors: { reason: ['problem.expense.crewWithdrawalInvalid'] } }
            : {}),
          remedies: [{ id: 'correct_fields' }],
        },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.withdrawCrewExpenseDraft(context.principal, {
        expenseId,
        version,
        reason,
      });
      return actionSuccess(
        'action.expense.crewDraftWithdrawn',
        { expenseId: result.id, alreadyWithdrawn: result.alreadyWithdrawn },
        'Crew expense draft withdrawn',
      );
    } catch (error) {
      if (
        error instanceof ConflictError ||
        error instanceof ValidationError ||
        error instanceof AccessDeniedError
      ) {
        const access = error instanceof AccessDeniedError;
        const invalid = error instanceof ValidationError;
        return actionFail(
          access ? 403 : invalid ? 400 : 409,
          access
            ? 'problem.expense.crewWithdrawalAccess'
            : invalid
              ? 'problem.expense.crewWithdrawalInvalid'
              : 'problem.expense.crewWithdrawalChanged',
          {},
          access
            ? 'You cannot withdraw this crew expense under your current access. Contact the project owner.'
            : invalid
              ? 'Enter a reason of 3 to 2,000 characters and review the current draft version.'
              : 'This crew expense changed or has review, allocation, or financial history. Review the current record before withdrawing.',
          {
            code: access
              ? 'EXPENSE_CREW_WITHDRAWAL_ACCESS'
              : invalid
                ? 'EXPENSE_CREW_WITHDRAWAL_INVALID'
                : 'EXPENSE_CREW_WITHDRAWAL_CHANGED',
            actionName: 'withdrawCrewExpenseDraft',
            values,
            ...(invalid
              ? { fieldErrors: { reason: ['problem.expense.crewWithdrawalInvalid'] } }
              : {}),
            remedies: [
              { id: access ? 'contact_project_owner' : 'review_expense', recordId: expenseId },
            ],
          },
        );
      }
      return actionFailure(error, { actionName: 'withdrawCrewExpenseDraft', values });
    } finally {
      context.sqlite.close();
    }
  },
  // Legacy form endpoint retained for route compatibility. The repository now
  // accepts only never-submitted drafts; reviewed records must use correction.
  deleteExpense: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses' && params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeExpenseValues(object);
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success) return expenseSchemaFailure(parsed.error, values);
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteExpense(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess('action.reports.draftDeleted', {}, 'Expense draft deleted');
    } catch (error) {
      return expenseActionFailure(error, values);
    } finally {
      context.sqlite.close();
    }
  },
});
