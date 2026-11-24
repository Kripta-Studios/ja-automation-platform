import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { isDocumentNavigation } from '$lib/server/document-navigation';
import { AccessDeniedError, ValidationError } from '@ja/database';
import { clientRecordIdSchema } from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';

const reply = (value: unknown, status = 200) =>
  json(value, { status, headers: { 'cache-control': 'private, no-store' } });

/** Counts shown in the "Delete permanently" confirmation dialog (owner only). */
export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (isDocumentNavigation(request))
    redirect(303, `/j-aautomation/app/projects${url.searchParams.get('lang') ? `?lang=${encodeURIComponent(url.searchParams.get('lang')!)}` : ''}`);
  if (!locals.user || !locals.session) return reply({ error: 'sign_in' }, 401);
  const projectId = url.searchParams.get('projectId') ?? undefined;
  const clientId = url.searchParams.get('clientId') ?? undefined;
  const id = projectId ?? clientId;
  if (!id || (projectId && clientId) || !clientRecordIdSchema.safeParse(id).success)
    return reply({ error: 'invalid' }, 400);
  const context = openPortalRepository(locals);
  try {
    return reply(
      context.repository.previewPermanentDeletion(
        context.principal,
        projectId ? { projectId } : { clientId },
      ),
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) return reply({ error: 'access' }, 403);
    if (error instanceof ValidationError) return reply({ error: 'not_found' }, 404);
    throw error;
  } finally {
    context.sqlite.close();
  }
};
