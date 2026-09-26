import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { expenseInputSchema, minorUnitsSchema, versionedRecordSchema } from '@ja/schemas';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { z, type ZodError } from 'zod';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  removePrivateFileIfPresent,
  writePrivateFileExclusive,
} from '$lib/server/private-artifact-access';
import {
  assertRegularPrivateFile,
  validateReportAttachmentFile,
} from '$lib/server/report-attachment-route';
import { actionFail, actionFailure, actionSuccess, type ActionMessageKey } from './action-message';
import { decimalToMinor, formObject, type PortalActionEvent } from '$lib/server/action-utils';

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
    message: 'Select who paid this expense. Customer billing treatment is reviewed separately.',
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
    remedies: [{ id: firstField === 'receiptDocumentId' ? 'attach_receipt' : 'review_expense' }],
  });
}

/**
 * The update contract deliberately exposes only fields supported by
 * PortalRepository.updateExpense. Receipt replacement is intentionally not
 * accepted by this browser action; the portal does not pretend to support
 * uploading/replacing a receipt from an edit form.
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
  })
  .strict();

/** Normalize the browser's decimal controls into the exact minor-unit update contract. */
export function parseExpenseUpdateForm(object: Record<string, unknown>) {
  const payload = { ...object };
  const amountMinor = decimalToMinor(payload.amount);
  payload.amountMinor = amountMinor ?? payload.amount;
  delete payload.amount;

  // Empty optional controls should be omitted rather than coerced to zero.
  for (const key of ['paymentMethod']) {
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
  'Expense changed, lacks receipt, or cannot be submitted': {
    status: 409,
    code: 'EXPENSE_SUBMISSION_BLOCKED',
    key: 'problem.expense.submissionBlocked',
    message:
      'This expense changed, is no longer a draft, or requires a receipt. Review its current state and attach a receipt if required.',
    remedy: 'review_expense',
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
    remedy: 'review_expense',
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

export function expenseActionFailure(error: unknown, values: Record<string, unknown> = {}) {
  const savedValues = safeExpenseValues(values);
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof AccessDeniedError
  ) {
    const known = expenseProblems[error.message];
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

export const expenseActions = {
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
    const receipt = object.receipt;
    const receiptFile = receipt instanceof File ? receipt : undefined;
    delete object.receipt;
    object.receiptRequired =
      object.receiptRequired === 'on' || (receiptFile !== undefined && receiptFile.size > 0);
    object.amountMinor = decimalToMinor(object.amount);
    delete object.amount;
    for (const key of ['paymentMethod', 'receiptDocumentId']) {
      if (object[key] === '') object[key] = undefined;
    }
    const preflight = expenseInputSchema.safeParse(object);
    if (!preflight.success) return expenseSchemaFailure(preflight.error, { ...object, ...values });
    const context = openPortalRepository(locals);
    let createdReceiptId: string | undefined;
    let createdReceiptStorageKey: string | undefined;
    let createdReceiptStoragePath: string | undefined;
    let receiptFileCreated = false;
    let reservationId: string | undefined;
    try {
      if (receiptFile && receiptFile.size > 0) {
        const receiptType = receiptFile.type;
        const receiptSize = receiptFile.size;
        const receiptName = receiptFile.name;
        if (
          ![
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif',
            'application/pdf',
          ].includes(receiptType) ||
          receiptSize > 10_000_000
        )
          return actionFail(
            400,
            'problem.expense.receiptTypeOrSize',
            {},
            'Choose a JPG, PNG, WebP, HEIC, HEIF, or PDF receipt under 10 MB.',
            {
              code: 'EXPENSE_RECEIPT_TYPE_OR_SIZE',
              values,
              fieldErrors: { receipt: ['problem.expense.receiptTypeOrSize'] },
              remedies: [{ id: 'attach_receipt' }],
            },
          );
        let bytes: Uint8Array;
        try {
          bytes = await validateReportAttachmentFile(receiptFile);
        } catch {
          return actionFail(
            400,
            'problem.expense.receiptContentInvalid',
            {},
            'The receipt content does not match its file type. Choose a valid receipt and reattach it.',
            {
              code: 'EXPENSE_RECEIPT_CONTENT_INVALID',
              values,
              fieldErrors: { receipt: ['problem.expense.receiptContentInvalid'] },
              remedies: [{ id: 'attach_receipt' }],
            },
          );
        }

        const reservation = context.v3.reserveUpload(context.principal, {
          projectId: String(object.projectId),
          originalFilename: receiptName.slice(0, 200),
          artifactType: 'receipt',
          description: 'Expense receipt',
          sensitivity: 'internal',
        });
        reservationId = reservation.reservationId;

        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const storageKey = reservation.storageKey;
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const target = resolve(root, storageKey);
        const targetRelativePath = relative(root, target);
        if (
          !targetRelativePath ||
          targetRelativePath.split(/[\\/]/).includes('..') ||
          targetRelativePath.startsWith('\\') ||
          targetRelativePath.startsWith('/')
        ) {
          context.v3.cancelUploadReservation(context.principal, reservation.reservationId);
          reservationId = undefined;
          return actionFail(
            400,
            'problem.expense.receiptPathInvalid',
            {},
            'The receipt filename could not be used. Rename the file and reattach it.',
            {
              code: 'EXPENSE_RECEIPT_PATH_INVALID',
              values,
              fieldErrors: { receipt: ['problem.expense.receiptPathInvalid'] },
              remedies: [{ id: 'attach_receipt' }],
            },
          );
        }

        createdReceiptStorageKey = storageKey;
        createdReceiptStoragePath = target;
        try {
          await writePrivateFileExclusive(root, storageKey, bytes);
          receiptFileCreated = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          // A collision is only idempotent when the winner is the exact same
          // receipt. Verify bytes, hash, length and declared media before the
          // reservation is allowed to become document metadata.
          await assertRegularPrivateFile(root, storageKey, sha256, receiptSize, receiptType);
        }

        const document = context.v3.finalizeUpload(context.principal, reservation.reservationId, {
          sha256,
          mediaType: receiptType,
          byteLength: receiptSize,
        });
        reservationId = undefined;

        object.receiptDocumentId = reservation.reservationId;
        if (document.created) {
          createdReceiptId = reservation.reservationId;
          createdReceiptStorageKey = storageKey;
        } else if (receiptFileCreated) {
          await removePrivateFileIfPresent(root, storageKey);
          receiptFileCreated = false;
        }
      }
      const parsed = expenseInputSchema.safeParse(object);
      if (!parsed.success) return expenseSchemaFailure(parsed.error, { ...object, ...values });
      const created = context.repository.createExpense(
        context.principal,
        parsed.data,
        workerId,
        requestId,
      );
      if (created.replayed && createdReceiptId) {
        const removedKey = context.repository.removeUnreferencedReceipt(
          context.principal,
          createdReceiptId,
        );
        if (removedKey) {
          const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
          await removePrivateFileIfPresent(root, removedKey);
        }
      }
      return actionSuccess('action.expense.draftSaved', {}, 'Expense draft saved');
    } catch (error) {
      if (reservationId) {
        try {
          context.v3.cancelUploadReservation(context.principal, reservationId);
        } catch {
          // Preserve the original expense error; stale cleanup handles a
          // reservation that could not be cancelled synchronously.
        }
      }
      if (createdReceiptId && createdReceiptStorageKey) {
        const removedKey = context.repository.removeUnreferencedReceipt(
          context.principal,
          createdReceiptId,
        );
        if (removedKey) {
          const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
          const target = resolve(root, removedKey);
          const relativePath = relative(root, target);
          if (
            relativePath &&
            !relativePath.split(/[\\/]/).includes('..') &&
            !relativePath.startsWith('\\') &&
            !relativePath.startsWith('/')
          )
            await removePrivateFileIfPresent(root, removedKey).catch(() => undefined);
        }
      }
      if (receiptFileCreated && createdReceiptStorageKey && createdReceiptStoragePath) {
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const relativePath = relative(root, createdReceiptStoragePath);
        if (
          relativePath &&
          !relativePath.split(/[\\/]/).includes('..') &&
          !relativePath.startsWith('\\') &&
          !relativePath.startsWith('/')
        )
          await removePrivateFileIfPresent(root, createdReceiptStorageKey).catch(() => undefined);
      }
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
    const parsed = parseExpenseUpdateForm(object);
    if (!parsed.success) return expenseSchemaFailure(parsed.error, values);
    const context = openPortalRepository(locals);
    try {
      context.repository.updateExpense(context.principal, parsed.data);
      return actionSuccess('action.expense.draftSaved', {}, 'Expense changes saved');
    } catch (error) {
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
      return expenseActionFailure(error, values);
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
};
