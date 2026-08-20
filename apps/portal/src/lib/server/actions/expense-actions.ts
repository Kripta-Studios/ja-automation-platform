import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { expenseInputSchema, versionedRecordSchema } from '@ja/schemas';
import { fail } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import {
  decimalToMinor,
  formObject,
  receiptSignature,
  type PortalActionEvent,
} from '$lib/server/action-utils';

export const expenseActions = {
  createExpense: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const receipt = object.receipt;
    object.receiptRequired =
      object.receiptRequired === 'on' || (receipt instanceof File && receipt.size > 0);
    object.amountMinor = decimalToMinor(object.amount);
    for (const key of [
      'projectCurrencyAmountMinor',
      'fxRateBps',
      'taxAmountMinor',
      'markupBps',
      'paymentMethod',
      'receiptDocumentId',
    ]) {
      if (object[key] === '') object[key] = undefined;
    }
    const preflight = expenseInputSchema.safeParse(object);
    if (!preflight.success)
      return fail(400, {
        success: false,
        message: 'Check expense fields',
        fields: preflight.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    let createdReceiptId: string | undefined;
    let createdReceiptStorageKey: string | undefined;
    let createdReceiptStoragePath: string | undefined;
    let receiptFileCreated = false;
    try {
      if (receipt instanceof File && receipt.size > 0) {
        if (
          ![
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif',
            'application/pdf',
          ].includes(receipt.type) ||
          receipt.size > 10_000_000
        )
          return fail(400, {
            success: false,
            message: 'Receipt must be JPG, PNG or PDF under 10 MB',
          });
        const bytes = new Uint8Array(await receipt.arrayBuffer());
        if (!receiptSignature(receipt.type, bytes))
          return fail(400, {
            success: false,
            message: 'Receipt content does not match its declared file type',
          });
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const extension =
          receipt.type === 'application/pdf'
            ? 'pdf'
            : receipt.type === 'image/png'
              ? 'png'
              : receipt.type === 'image/webp'
                ? 'webp'
                : receipt.type === 'image/heic'
                  ? 'heic'
                  : receipt.type === 'image/heif'
                    ? 'heif'
                    : 'jpg';
        const storageKey = `${sha256.slice(0, 2)}/${sha256}.${extension}`;
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const target = resolve(root, storageKey);
        const targetRelativePath = relative(root, target);
        if (
          !targetRelativePath ||
          targetRelativePath.split(/[\\/]/).includes('..') ||
          targetRelativePath.startsWith('\\') ||
          targetRelativePath.startsWith('/')
        )
          return fail(400, { success: false, message: 'Invalid receipt path' });
        createdReceiptStoragePath = target;
        await mkdir(resolve(root, sha256.slice(0, 2)), { recursive: true });
        try {
          await writeFile(target, bytes, { flag: 'wx' });
          receiptFileCreated = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
        const document = context.repository.registerReceipt(context.principal, {
          projectId: String(object.projectId),
          sha256,
          mediaType: receipt.type,
          byteLength: receipt.size,
          storageKey,
          originalFilename: receipt.name.slice(0, 200),
        });
        object.receiptDocumentId = document.id;
        if (document.created) {
          createdReceiptId = document.id;
          createdReceiptStorageKey = storageKey;
        } else if (receiptFileCreated) {
          await unlink(target);
          receiptFileCreated = false;
        }
      }
      const parsed = expenseInputSchema.safeParse(object);
      if (!parsed.success)
        return fail(400, {
          success: false,
          message: 'Check expense fields',
          fields: parsed.error.flatten().fieldErrors,
        });
      context.repository.createExpense(context.principal, parsed.data);
      return { success: true, message: 'Expense draft saved' };
    } catch (error) {
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
            await unlink(target).catch(() => undefined);
        }
      }
      if (receiptFileCreated && createdReceiptStoragePath) {
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const relativePath = relative(root, createdReceiptStoragePath);
        if (
          relativePath &&
          !relativePath.split(/[\\/]/).includes('..') &&
          !relativePath.startsWith('\\') &&
          !relativePath.startsWith('/')
        )
          await unlink(createdReceiptStoragePath).catch(() => undefined);
      }
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitExpense: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'expenses')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid expense record' });
    const context = openPortalRepository(locals);
    try {
      context.repository.submitExpense(context.principal, parsed.data.id, parsed.data.version);
      return { success: true, message: 'Expense submitted' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
