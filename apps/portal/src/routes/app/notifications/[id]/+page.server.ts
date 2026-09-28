import { uuidSchema } from '@ja/schemas';
import { AccessDeniedError, ValidationError } from '@ja/database';
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
    const extra = { actionName: 'markRead', correlationId: locals.correlationId };
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        ...extra,
        code: 'NOTIFICATION_SIGN_IN_REQUIRED',
        remedies: [{ id: 'sign_in_again' }],
      });
    const object = await formObject(request).catch(() => null);
    if (!object)
      return actionFail(400, 'problem.notification.invalidForm', {}, undefined, {
        ...extra,
        code: 'NOTIFICATION_INVALID_FORM',
        remedies: [{ id: 'review_notifications' }],
      });
    const parsed = uuidSchema.safeParse(object.notificationId);
    if (!parsed.success || parsed.data !== params.id)
      return actionFail(400, 'problem.notification.invalidLink', {}, undefined, {
        ...extra,
        code: 'NOTIFICATION_INVALID_LINK',
        remedies: [{ id: 'review_notifications' }],
      });
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      context.repository.markNotificationRead(context.principal, parsed.data);
      return actionSuccess('action.notifications.markedRead', {}, 'Notification marked as read');
    } catch (error) {
      if (error instanceof ValidationError && error.message === 'Notification not found')
        return actionFail(404, 'problem.notification.unavailable', {}, undefined, {
          ...extra,
          code: 'NOTIFICATION_UNAVAILABLE',
          remedies: [{ id: 'review_notifications' }],
        });
      if (error instanceof AccessDeniedError && error.message === 'Active account required')
        return actionFail(403, 'problem.notification.accessChanged', {}, undefined, {
          ...extra,
          code: 'NOTIFICATION_ACCESS_CHANGED',
          remedies: [{ id: 'contact_owner' }],
        });
      return actionFailure(error, extra);
    } finally {
      context?.sqlite.close();
    }
  },
};
