import { approvalDecisionSchema, financeDecisionSchema } from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export const approvalActions = {
  approveRecord: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = approvalDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.approvalDecision', {}, 'Invalid approval decision');
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
      return actionSuccess('action.approval.decisionRecorded', {}, 'Decision recorded');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  financeApprove: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'approvals')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = financeDecisionSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.financeDecision', {}, 'Invalid finance decision');
    const context = openPortalRepository(locals);
    try {
      if (parsed.data.type === 'time')
        context.repository.financeApproveTime(
          context.principal,
          parsed.data.id,
          parsed.data.billable === 'yes',
        );
      else context.repository.financeApproveExpense(context.principal, parsed.data.id);
      return actionSuccess('action.approval.financeReviewRecorded', {}, 'Finance review recorded');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
