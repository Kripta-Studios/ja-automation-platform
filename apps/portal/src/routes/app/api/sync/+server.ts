import { offlineMutationSchema } from '@ja/schemas';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user || !locals.session) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = offlineMutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return json({ outcome: 'rejected', reason: 'Invalid mutation' }, { status: 400 });
  return json({ outcome: 'accepted', version: parsed.data.baseVersion + 1 });
};
