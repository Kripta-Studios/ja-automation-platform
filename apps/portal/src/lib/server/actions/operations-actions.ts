import {
  availabilityInputSchema,
  dailyReportInputSchema,
  planningAssignmentInputSchema,
  reportDecisionSchema,
  skillInputSchema,
  technicalChangeDecisionSchema,
  technicalChangeInputSchema,
  technicalReportInputSchema,
  versionedRecordSchema,
  workerSkillInputSchema,
} from '@ja/schemas';
import { fail } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import {
  formObject,
  normalizeLocalDateTime,
  type PortalActionEvent,
} from '$lib/server/action-utils';

export const reportActions = {
  createDailyReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.safetyRelated = object.safetyRelated === 'on';
    const parsed = dailyReportInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check the daily report fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createDailyReport(context.principal, parsed.data);
      return { success: true, message: 'Daily report draft saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createTechnicalReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.safetyRelated = object.safetyRelated === 'on';
    const parsed = technicalReportInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check the PLC report fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createTechnicalReport(context.principal, parsed.data);
      return { success: true, message: 'PLC report draft saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.safetyImpact = object.safetyImpact === 'on';
    const parsed = technicalChangeInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check technical change fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createTechnicalChange(context.principal, parsed.data);
      return { success: true, message: 'Technical change draft saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const type = object.type;
    const parsed = versionedRecordSchema.safeParse(object);
    if (!parsed.success || (type !== 'daily' && type !== 'technical'))
      return fail(400, { success: false, message: 'Invalid report' });
    const context = openPortalRepository(locals);
    try {
      context.repository.submitReport(context.principal, type, parsed.data.id, parsed.data.version);
      return { success: true, message: 'Report submitted for review' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'reports')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid technical change' });
    const context = openPortalRepository(locals);
    try {
      context.v3.submitTechnicalChange(context.principal, parsed.data.id, parsed.data.version);
      return { success: true, message: 'Technical change submitted for review' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createPlanning: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = planningAssignmentInputSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Check planning fields' });
    const context = openPortalRepository(locals);
    try {
      context.repository.createPlanningAssignment(context.principal, parsed.data);
      return { success: true, message: 'Assignment published' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = skillInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check skill fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createSkill(context.principal, parsed.data);
      return { success: true, message: 'Skill saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setWorkerSkill: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = workerSkillInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check worker skill fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.setWorkerSkill(context.principal, parsed.data);
      return { success: true, message: 'Worker skill updated' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setAvailability: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'planning' && params.section !== 'profile')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.startsAt = normalizeLocalDateTime(object.startsAt);
    object.endsAt = normalizeLocalDateTime(object.endsAt);
    const parsed = availabilityInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check availability fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.setWorkerAvailability(context.principal, parsed.data);
      return { success: true, message: 'Availability saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  reviewReport: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = reportDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid report decision' });
    const context = openPortalRepository(locals);
    try {
      context.repository.reviewReport(
        context.principal,
        parsed.data.type,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return { success: true, message: 'Report review recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  reviewTechnicalChange: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = technicalChangeDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, { success: false, message: 'Invalid technical change decision' });
    const context = openPortalRepository(locals);
    try {
      context.v3.reviewTechnicalChange(
        context.principal,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return { success: true, message: 'Technical change review recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  reviewMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = technicalChangeDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, { success: false, message: 'Invalid milestone decision' });
    if (parsed.data.decision === 'needs_changes')
      return fail(400, { success: false, message: 'Milestones must be approved or rejected' });
    const context = openPortalRepository(locals);
    try {
      context.repository.reviewProjectMilestone(
        context.principal,
        parsed.data.id,
        parsed.data.decision,
        parsed.data.reason,
      );
      return { success: true, message: 'Milestone review recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
