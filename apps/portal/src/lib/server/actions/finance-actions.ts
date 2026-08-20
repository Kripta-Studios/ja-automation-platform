import {
  assignmentRateOverrideInputSchema,
  clientLaborRateInputSchema,
  compensationRuleInputSchema,
  compensationSettlementInputSchema,
  internalCostRuleInputSchema,
  reimbursementInputSchema,
} from '@ja/schemas';
import { fail } from '@sveltejs/kit';
import { actionFailure, openPortalRepository } from '$lib/server/portal-repository';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export const financeActions = {
  createCompensationRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = compensationRuleInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid compensation rule',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createCompensationRule(context.principal, parsed.data);
      return { success: true, message: 'Worker compensation rule saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  settleCompensation: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = compensationSettlementInputSchema.safeParse(await formObject(request));
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid settlement period' });
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.settleCompensation(context.principal, parsed.data);
      return { success: true, message: `Settled ${result.length} compensation rule(s)` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  recordReimbursement: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.amountMinor = object.amountMinor ? String(object.amountMinor) : undefined;
    const parsed = reimbursementInputSchema.safeParse(object);
    if (!parsed.success) return fail(400, { success: false, message: 'Invalid reimbursement' });
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.recordReimbursement(context.principal, {
        expenseId: parsed.data.expenseId,
        amountMinor: parsed.data.amountMinor ? BigInt(parsed.data.amountMinor) : undefined,
        reference: parsed.data.reference,
      });
      return { success: true, message: `Reimbursement recorded: ${result.amountMinor}` };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createClientLaborRate: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const object = await formObject(request);
    object.eligibleForPercentage = object.eligibleForPercentage === 'on';
    const parsed = clientLaborRateInputSchema.safeParse(object);
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid client rate',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createClientLaborRate(context.principal, parsed.data);
      return { success: true, message: 'Client labor rate saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createInternalCostRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = internalCostRuleInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid internal cost rule',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createInternalCostRule(context.principal, parsed.data);
      return { success: true, message: 'Internal cost rule saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createAssignmentRateOverride: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return fail(404, { success: false, message: 'Wrong section' });
    const parsed = assignmentRateOverrideInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return fail(400, {
        success: false,
        message: 'Invalid assignment override',
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createAssignmentRateOverride(context.principal, parsed.data);
      return { success: true, message: 'Assignment rate override saved' };
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
