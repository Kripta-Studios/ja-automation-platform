import { redirect } from '@sveltejs/kit';
import { AccessDeniedError, assertLiveSession } from '@ja/database';
import { base } from '$app/paths';
import { manualRevision, manualsForPersona, personaForPrincipal } from '$lib/server/manual-catalog';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
  if (!locals.user || !locals.session) redirect(303, `${base}/app/login?reason=access-revoked`);

  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
  } catch {
    context?.sqlite.close();
    redirect(303, `${base}/app/login?reason=access-revoked`);
  }

  try {
    const { locale } = await parent();
    const persona = personaForPrincipal(context.sqlite, context.principal);
    return {
      locale,
      revision: manualRevision,
      user: {
        name: locals.user.name,
        persona,
        workforceProfile:
          persona === 'supplier-coordinator'
            ? 'supplier_coordinator'
            : persona === 'external-technician'
              ? 'external_technician'
              : undefined,
        role: context.principal.role,
      },
      manuals: manualsForPersona(persona),
    };
  } finally {
    context.sqlite.close();
  }
};
