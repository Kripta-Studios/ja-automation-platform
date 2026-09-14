import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { openPortalRepository } from '$lib/server/portal-repository';

const querySchema = z.object({
  billingRuleId: z.string().min(1).max(200),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
});

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) return json({ error: 'Sign in required' }, { status: 401 });
  const parsed = querySchema.safeParse({
    billingRuleId: url.searchParams.get('billingRuleId') ?? '',
    periodStart: url.searchParams.get('periodStart') ?? '',
    periodEnd: url.searchParams.get('periodEnd') ?? '',
  });
  if (!parsed.success)
    return json({ error: 'Select a valid billing stream and period' }, { status: 400 });

  const context = openPortalRepository(locals);
  try {
    const readiness = context.repository.billingReadiness(
      context.principal,
      parsed.data.billingRuleId,
      parsed.data.periodStart,
      parsed.data.periodEnd,
    );
    return json(readiness, {
      headers: {
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    // Do not expose resource existence or internal financial details across the API boundary.
    return json({ error: 'The selected billing period could not be checked' }, { status: 403 });
  } finally {
    context.sqlite.close();
  }
};
