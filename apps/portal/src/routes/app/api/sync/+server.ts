import { offlineMutationSchema } from '@ja/schemas';
import { unlink } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { json } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = offlineMutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return json({ outcome: 'rejected', reason: 'Invalid mutation' }, { status: 400 });
  const context = openPortalRepository(locals);
  const cleanupReceipt = async () => {
    if (parsed.data.entityType !== 'expense') return;
    const documentId = parsed.data.payload.receiptDocumentId;
    if (typeof documentId !== 'string' || !documentId) return;
    const storageKey = context.repository.removeUnreferencedReceipt(context.principal, documentId);
    if (!storageKey) return;
    const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
    const target = resolve(root, storageKey);
    const remainder = relative(root, target);
    if (!remainder || remainder.startsWith('..') || remainder.includes(':')) return;
    await unlink(target).catch(() => undefined);
  };
  try {
    const result = context.v3.syncMutation(context.principal, parsed.data);
    if (
      !result ||
      typeof result !== 'object' ||
      !('outcome' in result) ||
      result.outcome !== 'accepted'
    )
      await cleanupReceipt();
    const status =
      result && typeof result === 'object' && 'outcome' in result
        ? result.outcome === 'accepted'
          ? 200
          : result.outcome === 'conflict'
            ? 409
            : 400
        : 400;
    return json(result, { status });
  } catch (error) {
    await cleanupReceipt();
    const failure = actionFailure(error);
    return json(
      { outcome: 'rejected', reason: failure?.data?.message ?? 'Sync failed' },
      { status: failure?.status ?? 400 },
    );
  } finally {
    context.sqlite.close();
  }
};
