import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { expenseInputSchema, minorUnitsSchema, versionedRecordSchema } from '@ja/schemas';
import { z } from 'zod';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  removePrivateFileIfPresent,
  writePrivateFileExclusive,
} from '$lib/server/private-artifact-access';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import {
  decimalToMinor,
  formObject,
  receiptSignature,
  type PortalActionEvent,
} from '$lib/server/action-utils';

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

/**
 * The update contract deliberately exposes only fields supported by
 * PortalRepository.updateExpense. Receipt replacement is intentionally not
 * accepted by this browser action; the portal does not pretend to support
 * uploading/replacing a receipt from an edit form.
 */
const expenseUpdateSchema = versionedRecordSchema
  .extend({
    spentOn: z.iso.date().optional(),
    vendor: z.string().trim().min(1).max(200).optional(),
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
  return expenseUpdateSchema.safeParse(payload);
}

export const expenseActions = {
  createExpense: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
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
    if (!preflight.success)
      return actionFail(400, 'action.validation.expenseFields', {}, 'Check expense fields', {
        fields: preflight.error.flatten().fieldErrors,
      });
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
            'action.validation.receiptTypeOrSize',
            {},
            'Receipt must be JPG, PNG or PDF under 10 MB',
          );
        const bytes = new Uint8Array(await receiptFile.arrayBuffer());
        if (!receiptSignature(receiptType, bytes))
          return actionFail(
            400,
            'action.validation.receiptContent',
            {},
            'Receipt content does not match its declared file type',
          );

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
          return actionFail(400, 'action.validation.receiptPath', {}, 'Invalid receipt path');
        }

        createdReceiptStoragePath = target;
        try {
          await writePrivateFileExclusive(root, storageKey, bytes);
          receiptFileCreated = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
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
      if (!parsed.success)
        return actionFail(400, 'action.validation.expenseFields', {}, 'Check expense fields', {
          fields: parsed.error.flatten().fieldErrors,
        });
      context.repository.createExpense(context.principal, parsed.data);
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
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateExpense: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = parseExpenseUpdateForm(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.expenseFields', {}, 'Check expense fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.updateExpense(context.principal, parsed.data);
      return actionSuccess('action.expense.draftSaved', {}, 'Expense changes saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitExpense: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.expenseRecord', {}, 'Invalid expense record');
    const context = openPortalRepository(locals);
    try {
      context.repository.submitExpense(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess('action.expense.submitted', {}, 'Expense submitted');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deleteExpense: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses' && params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.expenseRecord', {}, 'Invalid expense record');
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteExpense(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess('action.expense.removedOrVoided', {}, 'Expense entry removed/voided');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
