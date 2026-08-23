import { invitationInputSchema, uuidSchema } from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export const accessActions = {
  createInvitation: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = invitationInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.invitation',
        {},
        'Invalid invitation',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.createInvitation(context.principal, parsed.data);
      const publicBase = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';
      return actionSuccess(
        'action.access.invitation.created',
        { path: `${publicBase}/app/invite/${result.token}` },
        `Invite created: ${publicBase}/app/invite/${result.token}`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateUserStatus: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const userId = typeof object.userId === 'string' ? object.userId : '';
    const status = typeof object.status === 'string' ? object.status : '';
    const parsedId = uuidSchema.safeParse(userId);
    if (!parsedId.success || !['active', 'suspended', 'offboarded', 'archived'].includes(status))
      return actionFail(
        400,
        'action.validation.accountStatus',
        {},
        'Invalid account status change',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.updateUserStatus(
        context.principal,
        userId,
        status as 'active' | 'suspended' | 'offboarded' | 'archived',
      );
      return actionSuccess(
        'action.access.accountStatus.updated',
        { status },
        `Account marked ${status}`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateWorkerProfile: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const workerId = typeof object.workerId === 'string' ? object.workerId : '';
    const name = typeof object.name === 'string' ? object.name : '';
    const email = typeof object.email === 'string' ? object.email : '';
    const role = typeof object.role === 'string' ? object.role : '';
    const joinedAt = typeof object.joinedAt === 'string' ? object.joinedAt : '';

    const parsedId = uuidSchema.safeParse(workerId);
    if (!parsedId.success || !name || !email || !role || !joinedAt)
      return actionFail(
        400,
        'action.validation.workerProfile',
        {},
        'Invalid worker profile data',
      );

    const context = openPortalRepository(locals);
    try {
      context.repository.updateWorkerProfile(context.principal, workerId, {
        name,
        email,
        role,
        joinedAt,
      });
      return actionSuccess('action.access.workerProfile.updated', {}, 'Worker profile updated');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
