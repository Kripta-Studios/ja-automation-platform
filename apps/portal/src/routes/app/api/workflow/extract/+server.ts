import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, assertLiveSession } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  extractLocalDocumentText,
  LocalTextError,
  LOCAL_TEXT_MAX_BYTES,
} from '$lib/server/local-document-text';

const attempts = new Map<string, number>();
const reply = (value: unknown, status = 200) =>
  json(value, { status, headers: { 'cache-control': 'private, no-store' } });

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user || !locals.session) return reply({ error: 'sign_in' }, 401);
  const context = openPortalRepository(locals);
  try {
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    const actor = context.sqlite
      .prepare('SELECT status,role FROM user WHERE id=?')
      .get(context.principal.userId) as { status: string; role: string } | undefined;
    if (!actor || actor.status !== 'active' || actor.role !== context.principal.role)
      return reply({ error: 'access' }, 403);
  } catch (error) {
    if (error instanceof AccessDeniedError) return reply({ error: 'access' }, 403);
    throw error;
  } finally {
    context.sqlite.close();
  }
  const now = Date.now();
  for (const [id, time] of attempts) if (now - time > 60_000) attempts.delete(id);
  if (now - (attempts.get(locals.user.id) ?? 0) < 10_000) return reply({ error: 'busy' }, 429);
  attempts.set(locals.user.id, now);
  const length = Number(request.headers.get('content-length'));
  if (length > LOCAL_TEXT_MAX_BYTES + 64 * 1024) return reply({ error: 'invalid_file' }, 413);
  try {
    const form = await request.formData();
    const file = form.get('file');
    const locale = form.get('locale');
    if (!(file instanceof File) || file.size > LOCAL_TEXT_MAX_BYTES)
      return reply({ error: 'invalid_file' }, 400);
    return reply(
      await extractLocalDocumentText(
        new Uint8Array(await file.arrayBuffer()),
        file.type,
        locale === 'es' || locale === 'pt' ? locale : 'en',
      ),
    );
  } catch (error) {
    if (error instanceof LocalTextError)
      return reply(
        { error: error.code },
        error.code === 'busy' ? 429 : error.code === 'invalid_file' ? 400 : 422,
      );
    return reply({ error: 'failed' }, 422);
  }
};
