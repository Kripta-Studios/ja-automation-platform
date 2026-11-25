import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { invoicePdf, type InvoiceTemplateSnapshot } from '@ja/reporting';
import type { openPortalRepository } from './portal-repository';
import { writePrivateFileExclusive } from './private-artifact-access';

type Context = ReturnType<typeof openPortalRepository>;

/**
 * Render and keep the PDF of one version of a corrected invoice (migration 0092). The PDF of
 * every version is write-once; version 1 keeps the PDF that was issued. Called right after a
 * correction is saved and again on demand when a version still has no PDF.
 */
export async function ensureInvoiceRevisionPdf(
  context: Context,
  invoiceId: string,
  revisionNumber: number,
): Promise<{ ready: boolean }> {
  if (revisionNumber < 2) return { ready: false };
  const version = context.repository.invoiceVersionSnapshot(
    context.principal,
    invoiceId,
    revisionNumber,
  );
  if (version.pdf) return { ready: true };
  const bytes = invoicePdf(version.snapshot as InvoiceTemplateSnapshot);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const storageKey = `invoices/${invoiceId}/versions/v${revisionNumber}-${sha256.slice(0, 16)}.pdf`;
  const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
  try {
    await writePrivateFileExclusive(root, storageKey, bytes);
  } catch (cause) {
    // A retry of the same render finds its own file (same bytes, same name).
    if (!(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'EEXIST'))
      throw cause;
  }
  context.repository.recordInvoiceRevisionPdf(context.principal, invoiceId, revisionNumber, {
    storageKey,
    sha256,
    byteLength: bytes.byteLength,
  });
  return { ready: true };
}
