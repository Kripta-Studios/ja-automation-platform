import { expenseInputSchema, timeInputSchema, versionedRecordSchema } from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { decimalToMinor, formObject, type PortalActionEvent } from '$lib/server/action-utils';
import { mondayOf } from '$lib/server/portal-week';

export const parseTimeUpdateForm = (input: Record<string, unknown>) =>
  timeInputSchema.and(versionedRecordSchema).safeParse(input);

export const timeActions = {
  createTimeBatch: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const workerId = String(object.workerId ?? '');
    let rawEntries: unknown;
    try {
      rawEntries = JSON.parse(String(object.entries ?? ''));
    } catch {
      return actionFail(400, 'action.validation.timeFields', {}, 'Check batch time fields');
    }
    if (!Array.isArray(rawEntries) || rawEntries.length < 1 || rawEntries.length > 31)
      return actionFail(400, 'action.validation.timeFields', {}, 'Choose 1 to 31 daily entries');
    const parsed = rawEntries.map((entry) => timeInputSchema.safeParse(entry));
    if (parsed.some((entry) => !entry.success))
      return actionFail(400, 'action.validation.timeFields', {}, 'Check batch time fields');
    const context = openPortalRepository(locals);
    try {
      if (context.principal.role !== 'owner_admin')
        return actionFail(403, 'action.access.denied', {}, 'Owner access required');
      const result = context.repository.createTimeBatch(
        context.principal,
        workerId,
        parsed.map((entry) => entry.data!),
      );
      return actionSuccess(
        'action.time.batchDraftsSaved',
        { count: result.created.length },
        `${result.created.length} daily time drafts saved`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createTime: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const workerId =
      typeof object.workerId === 'string' && object.workerId ? object.workerId : undefined;
    delete object.workerId;
    const withExpense = object.withExpense === 'on';
    delete object.withExpense;
    const requestId = typeof object.requestId === 'string' ? object.requestId : '';
    delete object.requestId;
    const expenseFields = {
      vendor: object.expenseVendor,
      category: object.expenseCategory,
      description: object.expenseDescription,
      currency: object.expenseCurrency,
      amountMinor: decimalToMinor(object.expenseAmount),
      whoPaid: object.expenseWhoPaid,
      occurredTimeLocal: object.expenseOccurredTimeLocal,
      paymentMethod: object.expensePaymentMethod,
    };
    for (const key of [
      'expenseVendor',
      'expenseCategory',
      'expenseDescription',
      'expenseCurrency',
      'expenseAmount',
      'expenseWhoPaid',
      'expenseOccurredTimeLocal',
      'expensePaymentMethod',
    ])
      delete object[key];
    const parsed = timeInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.timeFields', {}, 'Check time fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const parsedExpense = withExpense
      ? expenseInputSchema.safeParse({
          ...expenseFields,
          projectId: parsed.data.projectId,
          spentOn: parsed.data.workDate,
          receiptRequired: false,
          paymentMethod: expenseFields.paymentMethod || undefined,
        })
      : null;
    if (withExpense && expenseFields.category !== 'meals')
      return actionFail(
        400,
        'action.validation.expenseFields',
        {},
        'Only meals can be added in Log time',
      );
    if (withExpense && !/^[a-zA-Z0-9_-]{16,200}$/u.test(requestId))
      return actionFail(400, 'action.validation.expenseFields', {}, 'Check expense fields', {
        fields: { requestId: ['Refresh the form and try again'] },
      });
    if (parsedExpense && !parsedExpense.success) {
      const fields = Object.fromEntries(
        Object.entries(parsedExpense.error.flatten().fieldErrors).map(([key, errors]) => [
          `expense${key[0]!.toUpperCase()}${key.slice(1).replace(/Minor$/u, '')}`,
          errors,
        ]),
      );
      return actionFail(400, 'action.validation.expenseFields', {}, 'Check expense fields', {
        fields,
      });
    }
    const context = openPortalRepository(locals);
    try {
      if (parsedExpense?.success) {
        context.repository.createTimeWithExpense(
          context.principal,
          parsed.data,
          parsedExpense.data,
          requestId,
          workerId,
        );
        return actionSuccess('action.time.expenseDraftsSaved', {}, 'Time and expense drafts saved');
      }
      context.repository.createTimeEntry(context.principal, parsed.data, workerId);
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
        `${result.created} layout draft${result.created === 1 ? '' : 's'} added for ${targetWeekStart}; hours remain 0.`,
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
    const parsed = parseTimeUpdateForm(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.timeFields', {}, 'Check time fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      const interval =
        parsed.data.startTime !== undefined && parsed.data.endTime !== undefined
          ? {
              startTime: parsed.data.startTime,
              endTime: parsed.data.endTime,
              breakMinutes: parsed.data.breakMinutes ?? 0,
            }
          : {};
      context.repository.updateTimeEntry(context.principal, {
        id: parsed.data.id,
        version: parsed.data.version,
        workDate: parsed.data.workDate,
        category: parsed.data.category,
        activityCode: parsed.data.activityCode,
        minutes: parsed.data.minutes,
        summary: parsed.data.summary,
        ...interval,
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
  submitTimeWeek: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'time')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const workerId = String(object.workerId ?? '');
    const weekStart = String(object.weekStart ?? '');
    let expected: unknown;
    try {
      expected = JSON.parse(String(object.entries ?? ''));
    } catch {
      return actionFail(400, 'action.validation.timeRecord', {}, 'Refresh the week and try again');
    }
    if (
      !Array.isArray(expected) ||
      expected.length < 1 ||
      expected.length > 200 ||
      expected.some(
        (row) =>
          !row ||
          typeof row !== 'object' ||
          typeof row.id !== 'string' ||
          !Number.isInteger(row.version) ||
          row.version < 1,
      )
    )
      return actionFail(400, 'action.validation.timeRecord', {}, 'Refresh the week and try again');
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.submitTimeWeek(
        context.principal,
        workerId,
        weekStart,
        expected as Array<{ id: string; version: number }>,
      );
      return actionSuccess(
        'action.time.weekSubmitted',
        result,
        `${result.timeSubmitted} time drafts and ${result.mealsSubmitted} linked meal expenses submitted`,
      );
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
