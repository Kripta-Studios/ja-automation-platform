import { timeInputSchema, versionedRecordSchema } from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';
import { mondayOf } from '$lib/server/portal-week';

export const timeActions = {
  createTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = timeInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.timeFields',
        {},
        'Check time fields',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.createTimeEntry(context.principal, parsed.data);
      return actionSuccess('action.time.draftSaved', {}, 'Time draft saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  copyTimeLayout: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const targetWeekStart = mondayOf(
      typeof object.targetWeekStart === 'string' ? object.targetWeekStart : null,
    );
    const sourceWeekStart = mondayOf(
      typeof object.sourceWeekStart === 'string' ? object.sourceWeekStart : null,
    );
    if (sourceWeekStart === targetWeekStart)
      return actionFail(
        400,
        'action.validation.timeSourceWeekDifferent',
        {},
        'Choose a different source week',
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.copyOwnTimeLayout(
        context.principal,
        sourceWeekStart,
        targetWeekStart,
      );
      return actionSuccess(
        'action.time.layoutCopied',
        { created: result.created, targetWeekStart },
        `${result.created} layout draft${result.created === 1 ? '' : 's'} added for ${targetWeekStart}; minutes remain 0.`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = timeInputSchema.and(versionedRecordSchema).safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.timeFields',
        {},
        'Check time fields',
        { fields: parsed.error.flatten().fieldErrors },
      );
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
      return actionSuccess('action.time.draftUpdated', {}, 'Time draft updated');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.timeRecord', {}, 'Invalid time record');
    const context = openPortalRepository(locals);
    try {
      context.repository.submitTime(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess('action.time.submitted', {}, 'Time submitted');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deleteTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time' && params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.timeRecord', {}, 'Invalid time record');
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteTime(context.principal, parsed.data.id, parsed.data.version);
      return actionSuccess('action.time.removedOrVoided', {}, 'Time entry removed/voided');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
