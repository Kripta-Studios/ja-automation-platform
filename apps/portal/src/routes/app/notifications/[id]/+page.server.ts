import { uuidSchema } from '@ja/schemas';
import { error, redirect } from '@sveltejs/kit';
import { actionFail, actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import { openPortalRepository } from '$lib/server/portal-repository';
import { formObject } from '$lib/server/action-utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const notification = context.repository
      .listNotifications(context.principal)
      .find((row) => row.id === params.id);
    if (!notification) error(404, 'detail.notification.notFound');
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
      return actionFail(
        400,
        'action.validation.notificationIdRequired',
        {},
        'Invalid notification',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.markNotificationRead(context.principal, parsed.data);
      return actionSuccess('action.notifications.markedRead', {}, 'Notification marked as read');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
