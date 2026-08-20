import {
  assignmentInputSchema,
  clientContactInputSchema,
  clientInputSchema,
  milestoneInputSchema,
  projectInputSchema,
  scheduleInputSchema,
  versionedRecordSchema,
} from '@ja/schemas';
import { fail } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export const projectActions = {
  createClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = clientInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check client fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.createClient(context.principal, parsed.data);
      return { success: true, message: `Created ${result.clientNumber}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createClientContact: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.isBillingContact = object.isBillingContact === 'on';
    object.isPrimary = object.isPrimary === 'on';
    const parsed = clientContactInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check contact fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createClientContact(context.principal, parsed.data);
      return { success: true, message: 'Client contact saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = projectInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check project fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.createProject(context.principal, parsed.data);
      return { success: true, message: `Created ${result.projectNumber}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = milestoneInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check milestone fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createProjectMilestone(context.principal, parsed.data);
      return { success: true, message: 'Milestone draft saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid milestone record' });
    const context = openPortalRepository(locals);
    try {
      context.repository.submitProjectMilestone(
        context.principal,
        parsed.data.id,
        parsed.data.version,
      );
      return { success: true, message: 'Milestone submitted for review' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateSchedule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = scheduleInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check schedule fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.updateProjectSchedule(context.principal, parsed.data);
      return { success: true, message: 'Expected schedule saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  assignWorker: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = assignmentInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check assignment fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.assignWorker(context.principal, parsed.data);
      return { success: true, message: 'Assignment created' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
