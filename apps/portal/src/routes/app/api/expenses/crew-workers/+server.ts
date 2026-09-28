import { json, type RequestHandler } from '@sveltejs/kit';
import { CrewLeaderRepository } from '@ja/database';
import { z } from 'zod';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  expenseLookupCaught,
  expenseLookupInvalid,
  expenseLookupSignIn,
} from '$lib/server/expense-lookup-problem';

const query = z.object({ projectId: z.uuid(), date: z.iso.date() });

/** Only the signed-in chief's currently delegated workers, for one project/day. */
export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) return expenseLookupSignIn(locals.correlationId);
  const parsed = query.safeParse({
    projectId: url.searchParams.get('projectId'),
    date: url.searchParams.get('date'),
  });
  if (!parsed.success) return expenseLookupInvalid('crew', locals.correlationId);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const crew = new CrewLeaderRepository(context.sqlite);
    const workers = crew.assignedWorkers(
      context.principal,
      parsed.data.projectId,
      parsed.data.date,
    );
    return json({ workers }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (caught) {
    return expenseLookupCaught('crew', caught, locals.correlationId);
  } finally {
    context?.sqlite.close();
  }
};
