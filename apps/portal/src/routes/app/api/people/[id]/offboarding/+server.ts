import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, ValidationError, offboardingChecklist } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';

const noStore = { 'cache-control': 'private, no-store' };

/** T33: owner-only counts shown before suspending or offboarding a person. */
export const GET: RequestHandler = ({ locals, params }) => {
  if (!locals.user || !locals.session) return json({ error: 'sign_in' }, { status: 401, headers: noStore });
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    return json(offboardingChecklist(context.sqlite, context.principal, String(params.id ?? '')), {
      headers: noStore,
    });
  } catch (caught) {
    if (caught instanceof AccessDeniedError)
      return json({ error: 'forbidden' }, { status: 403, headers: noStore });
    if (caught instanceof ValidationError)
      return json({ error: 'not_found' }, { status: 404, headers: noStore });
    throw caught;
  } finally {
    context?.sqlite.close();
  }
};
