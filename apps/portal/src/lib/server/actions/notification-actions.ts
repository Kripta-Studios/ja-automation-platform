import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export const notificationActions = {
  markNotificationRead: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'notifications')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    if (typeof object.notificationId !== 'string' || !object.notificationId)
      return actionFail(
        400,
        'action.validation.notificationIdRequired',
        {},
        'Notification is required',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.markNotificationRead(context.principal, object.notificationId);
      return actionSuccess('action.notifications.markedRead', {}, 'Notification marked as read');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
