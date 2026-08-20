import { invitationInputSchema, uuidSchema } from '@ja/schemas';
import { fail } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export const accessActions = {
  createInvitation: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = invitationInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid invitation',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.createInvitation(context.principal, parsed.data);
      const publicBase = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';
      return { success: true, message: `Invite created: ${publicBase}/app/invite/${result.token}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateUserStatus: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const userId = typeof object.userId === 'string' ? object.userId : '';
    const status = typeof object.status === 'string' ? object.status : '';
    const parsedId = uuidSchema.safeParse(userId);
    if (!parsedId.success || !['active', 'suspended', 'offboarded', 'archived'].includes(status))
      return fail(400, { success: false, message: 'Invalid account status change' });
    const context = openPortalRepository(locals);
    try {
      context.repository.updateUserStatus(
        context.principal,
        userId,
        status as 'active' | 'suspended' | 'offboarded' | 'archived',
      );
      return { success: true, message: `Account marked ${status}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
