import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';
import { uuidSchema } from '@ja/schemas';
import { AccessDeniedError, ValidationError } from '@ja/database';

export const notificationActions = {
  markNotificationRead: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'notifications')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request).catch(() => null);
    if (!object)
      return actionFail(
        400,
        'problem.notification.invalidLink',
        {},
        'The submitted notification could not be read. Return to your notifications.',
        {
          code: 'NOTIFICATION_INVALID_FORM',
          actionName: 'markNotificationRead',
          remedies: [{ id: 'review_notifications' }],
          correlationId: locals.correlationId,
        },
      );
    const notificationId = String(object.notificationId ?? '');
    const values = { notificationId };
    const extra = {
      actionName: 'markNotificationRead',
      values,
      correlationId: locals.correlationId,
    };
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, 'Sign in again to continue.', {
        ...extra,
        code: 'NOTIFICATION_SIGN_IN_REQUIRED',
        remedies: [{ id: 'sign_in_again' }],
      });
    if (!uuidSchema.safeParse(notificationId).success)
      return actionFail(
        400,
        'problem.notification.invalidLink',
        {},
        'The notification reference is invalid. Return to your notifications.',
        {
          ...extra,
          code: 'NOTIFICATION_INVALID_LINK',
          fieldErrors: { notificationId: ['problem.notification.invalidLink'] },
          remedies: [{ id: 'review_notifications' }],
        },
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      context.repository.markNotificationRead(context.principal, notificationId);
      return actionSuccess('action.notifications.markedRead', {}, 'Notification marked as read');
    } catch (error) {
      if (error instanceof ValidationError && error.message === 'Notification not found')
        return actionFail(
          404,
          'problem.notification.unavailable',
          {},
          'This notification is no longer available. Review your current notifications.',
          {
            ...extra,
            code: 'NOTIFICATION_UNAVAILABLE',
            remedies: [{ id: 'review_notifications' }],
          },
        );
      if (error instanceof AccessDeniedError && error.message === 'Active account required')
        return actionFail(
          403,
          'problem.notification.accessChanged',
          {},
          'Your account is no longer active. Contact an owner to review access.',
          {
            ...extra,
            code: 'NOTIFICATION_ACCESS_CHANGED',
            remedies: [{ id: 'contact_owner' }],
          },
        );
      return actionFailure(error, extra);
    } finally {
      context?.sqlite.close();
    }
  },
};
