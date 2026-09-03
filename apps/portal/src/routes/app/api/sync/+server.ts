import { offlineMutationSchema } from '@ja/schemas';
import { json } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { removePrivateFileIfPresent } from '$lib/server/private-artifact-access';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.JA_OFFLINE_ENABLED?.trim().toLowerCase() === 'false')
    return json(
      { offlineEnabled: false, error: 'Offline sync is disabled for this deployment' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
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
    const root = process.env.JA_DOCUMENT_ROOT ?? 'data/documents';
    await removePrivateFileIfPresent(root, storageKey).catch(() => undefined);
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
