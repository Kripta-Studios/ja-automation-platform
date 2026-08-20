import { fail } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export const notificationActions = {
  markNotificationRead: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'notifications')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    if (typeof object.notificationId !== 'string' || !object.notificationId)
      return fail(400, { success: false, message: 'Notification is required' });
    const context = openPortalRepository(locals);
    try {
      context.repository.markNotificationRead(context.principal, object.notificationId);
      return { success: true, message: 'Notification marked as read' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
