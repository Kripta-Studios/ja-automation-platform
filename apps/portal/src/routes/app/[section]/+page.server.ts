import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
const sections = [
  'time',
  'reports',
  'expenses',
  'projects',
  'pay',
  'documents',
  'notifications',
  'profile',
  'planning',
  'approvals',
  'billing',
  'finance',
];
export const load: PageServerLoad = ({ locals, params }) => {
  if (!sections.includes(params.section)) error(404, 'Page not found');
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  return { user: locals.user, section: params.section };
};
