import { error, redirect } from '@sveltejs/kit';
import { invoicePeriodSchema } from '@ja/schemas';
import {
  AccessDeniedError,
  assertLiveSession,
  projectPeriodExplanation,
  V3AccessDeniedError,
  V3ValidationError,
} from '@ja/database';
import { defaultLookbackPeriod } from '$lib/server/iso-date';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { PageServerLoad } from './$types';

const financeRoles = new Set(['owner_admin', 'finance_admin', 'auditor_read_only']);

function resolvePeriod(url: URL): { periodStart: string; periodEnd: string } {
  const fallback = defaultLookbackPeriod();
  const one = (name: 'periodStart' | 'periodEnd') => {
    const values = url.searchParams.getAll(name);
    if (values.length > 1) error(400, 'Invalid finance period');
    return values[0] ?? fallback[name];
  };
  const parsed = invoicePeriodSchema
    .pick({ periodStart: true, periodEnd: true })
    .safeParse({ periodStart: one('periodStart'), periodEnd: one('periodEnd') });
  if (!parsed.success || parsed.data.periodEnd < parsed.data.periodStart)
    error(400, 'Invalid finance period');
  return parsed.data;
}

export const load: PageServerLoad = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  if (!financeRoles.has(String(locals.user.role ?? ''))) error(403, 'Finance role required');
  const { periodStart, periodEnd } = resolvePeriod(url);
  const context = openPortalRepository(locals);
  try {
    // Do not trust a client-held role or a stale session just because it reached
    // a finance URL.  This happens before loading any employee pay projection.
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    if (!financeRoles.has(context.principal.role)) error(403, 'Finance role required');
    const finance = context.v3.projectFinance(context.principal, params.id, periodStart, periodEnd);
    const explanation = projectPeriodExplanation(context.sqlite, context.principal, {
      projectId: params.id,
      periodStart,
      periodEnd,
      finance,
    });
    return { user: locals.user, explanation };
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError)
      error(403, 'Finance role required');
    if (caught instanceof V3ValidationError && /not found/i.test(caught.message))
      error(404, 'Project not found');
    throw caught;
  } finally {
    context.sqlite.close();
  }
};
