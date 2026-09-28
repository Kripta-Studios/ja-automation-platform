import { describe, expect, it } from 'vitest';
import { accessActions } from '../../apps/portal/src/lib/server/actions/access-actions';

function ownerEvent(action: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return {
    params: { section: 'projects' },
    locals: {
      correlationId: 'access-precheck-qa',
      user: { email: 'antonny.luty@j-aautomation.com', role: 'owner_admin' },
      session: { id: 'session-1' },
    },
    request: new Request(`https://example.test/app/projects?/${action}`, {
      method: 'POST',
      body,
    }),
  } as never;
}

describe('owner access prechecks', () => {
  it('points to a mismatched confirmation and preserves the intended role and reason', async () => {
    const result = await accessActions.changeMailboxRole(
      ownerEvent('changeMailboxRole', {
        portalUserId: '00000000-0000-4000-8000-000000000001',
        email: 'worker@example.test',
        confirmation: 'other@example.test',
        role: 'project_manager',
        reason: 'New project responsibility',
      }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'ACCESS_ROLE_CHANGE_FIELDS_INVALID',
        actionName: 'changeMailboxRole',
        values: { role: 'project_manager', reason: 'New project responsibility' },
        fieldErrors: { confirmation: ['problem.access.confirmationMismatch'] },
        remedies: [{ id: 'review_user_access' }],
      },
    });
  });

  it('names the missing offboarding reason without removing portal access', async () => {
    const result = await accessActions.deprovisionMailboxUser(
      ownerEvent('deprovisionMailboxUser', {
        portalUserId: '00000000-0000-4000-8000-000000000001',
        email: 'worker@example.test',
        confirmation: 'worker@example.test',
        reason: '',
      }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'ACCESS_OFFBOARD_FIELDS_INVALID',
        actionName: 'deprovisionMailboxUser',
        fieldErrors: { reason: ['problem.access.reasonRequired'] },
        values: { email: 'worker@example.test', reason: '' },
      },
    });
  });
});
