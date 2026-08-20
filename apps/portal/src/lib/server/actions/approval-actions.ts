import { approvalDecisionSchema, financeDecisionSchema } from '@ja/schemas';
import { fail } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export const approvalActions = {
  approveRecord: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = approvalDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid approval decision' });
    const context = openPortalRepository(locals);
    try {
      if (parsed.data.type === 'time')
        context.repository.operationalApproveTime(
          context.principal,
          parsed.data.id,
          parsed.data.decision,
          parsed.data.reason,
        );
      else
        context.repository.operationalApproveExpense(
          context.principal,
          parsed.data.id,
          parsed.data.decision,
          parsed.data.reason,
        );
      return { success: true, message: 'Decision recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  financeApprove: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = financeDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid finance decision' });
    const context = openPortalRepository(locals);
    try {
      if (parsed.data.type === 'time')
        context.repository.financeApproveTime(
          context.principal,
          parsed.data.id,
          parsed.data.billable === 'yes',
        );
      else context.repository.financeApproveExpense(context.principal, parsed.data.id);
      return { success: true, message: 'Finance review recorded' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
