import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ValidationError } from '@ja/database';

const markNotificationRead = vi.fn();
const close = vi.fn();
vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    repository: { markNotificationRead },
    principal: { userId: 'worker-1', role: 'worker' },
    sqlite: { close },
  }),
}));

const { notificationActions } =
  await import('../../apps/portal/src/lib/server/actions/notification-actions.ts');
const notificationId = '11111111-1111-4111-8111-111111111111';

function event(id = notificationId, user = true) {
  const form = new FormData();
  form.set('notificationId', id);
  return {
    locals: {
      correlationId: 'notification-list-test',
      ...(user ? { user: { id: 'worker-1' } } : {}),
    },
    params: { section: 'notifications' },
    request: new Request('http://localhost/app/notifications', { method: 'POST', body: form }),
  } as never;
}

afterEach(() => vi.resetAllMocks());

describe('notification list action problems', () => {
  it('sends a signed-out malformed request to sign in before reading the body', async () => {
    const result = await notificationActions.markNotificationRead({
      ...event(notificationId, false),
      request: new Request('http://localhost/app/notifications', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'unreadable form',
      }),
    } as never);
    expect(result).toMatchObject({
      status: 401,
      data: {
        code: 'NOTIFICATION_SIGN_IN_REQUIRED',
        actionName: 'markNotificationRead',
        remedies: [{ id: 'sign_in_again' }],
      },
    });
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it('explains an unreadable form with an inbox remedy', async () => {
    const result = await notificationActions.markNotificationRead({
      ...event(),
      request: new Request('http://localhost/app/notifications', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'unreadable form',
      }),
    } as never);
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'NOTIFICATION_INVALID_FORM',
        messageKey: 'problem.notification.invalidForm',
        remedies: [{ id: 'review_notifications' }],
      },
    });
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it('rejects an invalid reference before opening the repository', async () => {
    const result = await notificationActions.markNotificationRead(event('invalid'));
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'NOTIFICATION_INVALID_LINK',
        fieldErrors: { notificationId: ['problem.notification.invalidLink'] },
        remedies: [{ id: 'review_notifications' }],
        values: { notificationId: 'invalid' },
      },
    });
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it('explains a deleted or inaccessible notification without exposing its owner', async () => {
    markNotificationRead.mockImplementation(() => {
      throw new ValidationError('Notification not found');
    });
    const result = await notificationActions.markNotificationRead(event());
    expect(result).toMatchObject({
      status: 404,
      data: {
        code: 'NOTIFICATION_UNAVAILABLE',
        remedies: [{ id: 'review_notifications' }],
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('gives an access remedy when the account became inactive', async () => {
    markNotificationRead.mockImplementation(() => {
      throw new AccessDeniedError('Active account required');
    });
    const result = await notificationActions.markNotificationRead(event());
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'NOTIFICATION_ACCESS_CHANGED',
        remedies: [{ id: 'contact_owner' }],
      },
    });
  });

  it('marks a notification read successfully', async () => {
    const result = await notificationActions.markNotificationRead(event());
    expect(result).toMatchObject({ success: true, messageKey: 'action.notifications.markedRead' });
    expect(markNotificationRead).toHaveBeenCalledWith(expect.anything(), notificationId);
  });
});
