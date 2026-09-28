import { OwnerRecordManagement } from '@ja/database';
import { error } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.user) error(401, 'Sign in required');
  const ctx = openPortalRepository(locals);
  try {
    new OwnerRecordManagement(ctx.sqlite).assertOwner(ctx.principal);
    return { managementUser: locals.user };
  } catch {
    error(403, 'Owner administration required');
  } finally {
    ctx.sqlite.close();
  }
};
