import { describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ValidationError } from '@ja/database';

const notificationId = '11111111-1111-4111-8111-111111111111';
const markNotificationRead = vi.fn();
const close = vi.fn();

vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository: () => ({
    principal: { userId: 'worker-1', role: 'worker' },
    repository: { markNotificationRead },
    sqlite: { close },
  }),
}));

import { actions } from '../../apps/portal/src/routes/app/notifications/[id]/+page.server';

function request(id: string): Request {
  const form = new FormData();
  form.set('notificationId', id);
  return new Request('http://localhost/j-aautomation/app/notifications/' + notificationId, {
    method: 'POST',
    body: form,
  });
}

describe('notification form problem contract', () => {
  it('explains a form body that cannot be read', async () => {
    markNotificationRead.mockClear();
    const result = await actions.markRead!({
      locals: { user: { id: 'worker-1' }, correlationId: 'notification-test' },
      params: { id: notificationId },
      request: new Request('http://localhost/j-aautomation/app/notifications/' + notificationId, {
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
        correlationId: 'notification-test',
      },
    });
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it('explains an invalid link without opening the repository', async () => {
    markNotificationRead.mockClear();
    const result = await actions.markRead!({
      locals: { user: { id: 'worker-1' } },
      params: { id: notificationId },
      request: request('bad-id'),
    } as never);
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'NOTIFICATION_INVALID_LINK',
        messageKey: 'problem.notification.invalidLink',
        remedies: [{ id: 'review_notifications' }],
      },
    });
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it('returns a role-safe unavailable problem for a missing notification', async () => {
    markNotificationRead.mockImplementationOnce(() => {
      throw new ValidationError('Notification not found');
    });
    const result = await actions.markRead!({
      locals: { user: { id: 'worker-1' } },
      params: { id: notificationId },
      request: request(notificationId),
    } as never);
    expect(result).toMatchObject({
      status: 404,
      data: {
        code: 'NOTIFICATION_UNAVAILABLE',
        messageKey: 'problem.notification.unavailable',
        remedies: [{ id: 'review_notifications' }],
      },
    });
    expect(close).toHaveBeenCalled();
  });

  it('directs a deactivated account to an owner', async () => {
    markNotificationRead.mockImplementationOnce(() => {
      throw new AccessDeniedError('Active account required');
    });
    const result = await actions.markRead!({
      locals: { user: { id: 'worker-1' } },
      params: { id: notificationId },
      request: request(notificationId),
    } as never);
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'NOTIFICATION_ACCESS_CHANGED',
        messageKey: 'problem.notification.accessChanged',
        remedies: [{ id: 'contact_owner' }],
      },
    });
    expect(close).toHaveBeenCalled();
  });
});
