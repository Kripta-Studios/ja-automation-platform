import { uuidSchema } from '@ja/schemas';
import { error, fail, redirect } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { formObject } from '$lib/server/action-utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const notification = context.repository
      .listNotifications(context.principal)
      .find((row) => row.id === params.id);
    if (!notification) error(404, 'Notification not found');
    return { user: locals.user, notification };
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  markRead: async ({ locals, request, params }) => {
    const object = await formObject(request);
    const parsed = uuidSchema.safeParse(object.notificationId);
    if (!parsed.success || parsed.data !== params.id)
      return fail(400, { success: false, message: 'Invalid notification' });
    const context = openPortalRepository(locals);
    try {
      context.repository.markNotificationRead(context.principal, parsed.data);
      return { success: true, message: 'Notification marked as read' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
