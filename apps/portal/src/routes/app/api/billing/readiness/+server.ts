import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
  AccessDeniedError,
  ValidationError,
  V3AccessDeniedError,
  V3ValidationError,
} from '@ja/database';
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
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError)
      return json({ error: 'Billing access is required to check this period.' }, { status: 403 });
    if (caught instanceof ValidationError || caught instanceof V3ValidationError)
      return json(
        {
          error: /inactive/i.test(caught.message)
            ? 'This billing stream is inactive. Choose an active stream or configure a new one.'
            : /cadence/i.test(caught.message)
              ? 'The selected dates do not match this stream’s billing cadence. Choose its complete billing period.'
              : 'The selected billing period is invalid. Check its start and end dates.',
        },
        { status: 400 },
      );
    return json(
      { error: 'The selected billing period could not be checked. Try again.' },
      { status: 500 },
    );
  } finally {
    context.sqlite.close();
  }
};
