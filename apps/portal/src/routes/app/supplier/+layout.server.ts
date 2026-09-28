import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  return {
    supplierUser: {
      id: locals.user.id,
      name: locals.user.name,
      role: locals.user.role,
      workforceProfile: locals.user.workforceProfile,
    },
  };
};
