import { timeInputSchema, versionedRecordSchema } from '@ja/schemas';
import { fail } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';
import { mondayOf } from '$lib/server/portal-week';

export const timeActions = {
  createTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time') return fail(404, { success: false, message: 'Wrong section' });
    const parsed = timeInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check time fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createTimeEntry(context.principal, parsed.data);
      return { success: true, message: 'Time draft saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  copyTimeLayout: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time') return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    const targetWeekStart = mondayOf(
      typeof object.targetWeekStart === 'string' ? object.targetWeekStart : null,
    );
    const sourceWeekStart = mondayOf(
      typeof object.sourceWeekStart === 'string' ? object.sourceWeekStart : null,
    );
    if (sourceWeekStart === targetWeekStart)
      return fail(400, { success: false, message: 'Choose a different source week' });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.copyOwnTimeLayout(
        context.principal,
        sourceWeekStart,
        targetWeekStart,
      );
      return {
        success: true,
        message: `${result.created} layout draft${result.created === 1 ? '' : 's'} added for ${targetWeekStart}; minutes remain 0.`,
      };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time') return fail(404, { success: false, message: 'Wrong section' });
    const parsed = timeInputSchema.and(versionedRecordSchema).safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Check time fields',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.updateTimeEntry(context.principal, {
        id: parsed.data.id,
        version: parsed.data.version,
        workDate: parsed.data.workDate,
        category: parsed.data.category,
        activityCode: parsed.data.activityCode,
        minutes: parsed.data.minutes,
        summary: parsed.data.summary,
      });
      return { success: true, message: 'Time draft updated' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time') return fail(404, { success: false, message: 'Wrong section' });
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid time record' });
    const context = openPortalRepository(locals);
    try {
      context.repository.submitTime(context.principal, parsed.data.id, parsed.data.version);
      return { success: true, message: 'Time submitted' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
