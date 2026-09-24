import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, CrewLeaderRepository, ValidationError } from '@ja/database';
import { z } from 'zod';
import { openPortalRepository } from '$lib/server/portal-repository';

const query = z.object({ projectId: z.uuid(), date: z.iso.date() });

/** Only the signed-in chief's currently delegated workers, for one project/day. */
export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) return json({ error: 'Sign in required' }, { status: 401 });
  const parsed = query.safeParse({
    projectId: url.searchParams.get('projectId'),
    date: url.searchParams.get('date'),
  });
  if (!parsed.success) return json({ error: 'Project and date are required' }, { status: 400 });
  const context = openPortalRepository(locals);
  try {
    const crew = new CrewLeaderRepository(context.sqlite);
    const workers = crew.assignedWorkers(
      context.principal,
      parsed.data.projectId,
      parsed.data.date,
    );
    return json({ workers }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (caught) {
    if (caught instanceof AccessDeniedError)
      return json({ error: 'Crew access denied' }, { status: 403 });
    if (caught instanceof ValidationError) return json({ error: caught.message }, { status: 400 });
    throw caught;
  } finally {
    context.sqlite.close();
  }
};
