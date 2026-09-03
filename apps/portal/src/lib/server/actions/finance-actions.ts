import {
  assignmentRateOverrideInputSchema,
  clientLaborRateInputSchema,
  compensationRuleInputSchema,
  compensationSettlementPlanningInputSchema,
  compensationSettlementInputSchema,
  expenseCommercialClassificationInputSchema,
  expensePlanningDatesInputSchema,
  internalCostRuleInputSchema,
  projectCommercialPolicyInputSchema,
  projectLegalEntityAssignmentInputSchema,
  reimbursementInputSchema,
  uuidSchema,
} from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

function parseRuleId(value: FormDataEntryValue | null): string | undefined {
  const parsed = uuidSchema.safeParse(value?.toString() ?? '');
  return parsed.success ? parsed.data : undefined;
}

export const financeActions = {
  assignProjectLegalEntity: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const context = openPortalRepository(locals);
    try {
      if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
        return actionFail(403, 'action.error.forbidden', {}, 'Finance role required');
      const parsed = projectLegalEntityAssignmentInputSchema.safeParse(await formObject(request));
      if (!parsed.success)
        return actionFail(
          400,
          'action.validation.projectLegalEntityAssignment',
          {},
          'Invalid project legal-entity assignment',
          { fields: parsed.error.flatten().fieldErrors },
        );
      const result = context.v3.assignCanonicalLegalEntityToProject(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.projectLegalEntityAssigned',
        { idempotent: result.idempotent },
        'Project issuing authority saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  classifyExpenseCommercially: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const form = await formObject(request);
    // These are UI-only controls that synchronize canonical fields. Never pass
    // convenience values across the strict domain schema boundary.
    delete form.expensePreset;
    delete form.taxPercent;
    const parsed = expenseCommercialClassificationInputSchema.safeParse(form);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.expenseCommercialClassification',
        {},
        'Invalid expense commercial classification',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
        return actionFail(403, 'action.error.forbidden', {}, 'Finance role required');
      const result = context.repository.classifyExpenseCommercially(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.expenseClassified',
        { version: result.version },
        'Expense commercial classification saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setExpensePlanningDates: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = expensePlanningDatesInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.expensePlanningDates',
        {},
        'Invalid expense planning dates',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.setExpensePlanningDates(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.expensePlanningDatesSaved',
        { version: result.version },
        'Expense planning dates saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setCompensationSettlementExpectedPaymentOn: async ({
    locals,
    request,
    params,
  }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = compensationSettlementPlanningInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.compensationSettlementPlanning',
        {},
        'Invalid compensation settlement planning date',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.setCompensationSettlementExpectedPaymentOn(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.compensationExpectedPaymentSaved',
        {},
        'Expected worker payment date saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createProjectCommercialPolicy: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = projectCommercialPolicyInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.projectCommercialPolicy',
        {},
        'Invalid project commercial policy',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
        return actionFail(403, 'action.error.forbidden', {}, 'Finance role required');
      const policy = context.repository.createProjectCommercialPolicy(
        context.principal,
        parsed.data,
      );
      return actionSuccess(
        'action.finance.projectCommercialPolicySaved',
        { version: policy.version },
        'Project commercial policy saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createCompensationRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = compensationRuleInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.compensationRule',
        {},
        'Invalid compensation rule',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.createCompensationRule(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.compensationRuleSaved',
        {},
        'Worker compensation rule saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  supersedeCompensationRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const supersedesId = parseRuleId(object.supersedesId as FormDataEntryValue | null);
    if (!supersedesId)
      return actionFail(
        400,
        'action.validation.compensationRuleId',
        {},
        'Compensation rule ID is invalid',
      );
    delete object.supersedesId;
    const parsed = compensationRuleInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.replacementCompensationRule',
        {},
        'Invalid replacement compensation rule',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.supersedeCompensationRule(context.principal, supersedesId, {
        ...parsed.data,
        projectId: parsed.data.projectId || undefined,
        effectiveTo: parsed.data.effectiveTo || undefined,
      });
      return actionSuccess(
        'action.finance.compensationRuleSuperseded',
        {},
        'Compensation rule superseded',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deactivateCompensationRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const ruleId = parseRuleId(formData.get('ruleId'));
    if (!ruleId)
      return actionFail(
        400,
        'action.validation.compensationRuleId',
        {},
        'Compensation rule ID is invalid',
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.deactivateCompensationRule(context.principal, ruleId);
      return actionSuccess(
        'action.finance.compensationRuleDeactivated',
        {},
        'Compensation rule deactivated',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  settleCompensation: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = compensationSettlementInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.settlementPeriod', {}, 'Invalid settlement period');
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.settleCompensation(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.compensationSettled',
        { count: result.length },
        `Settled ${result.length} compensation rule(s)`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  recordReimbursement: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.amountMinor = object.amountMinor ? String(object.amountMinor) : undefined;
    const parsed = reimbursementInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.reimbursement', {}, 'Invalid reimbursement');
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.recordReimbursement(context.principal, {
        expenseId: parsed.data.expenseId,
        amountMinor: parsed.data.amountMinor ? BigInt(parsed.data.amountMinor) : undefined,
        reference: parsed.data.reference,
      });
      return actionSuccess(
        'action.finance.reimbursementRecorded',
        { amountMinor: String(result.amountMinor) },
        `Reimbursement recorded: ${result.amountMinor}`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createClientLaborRate: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.eligibleForPercentage = object.eligibleForPercentage === 'on';
    const parsed = clientLaborRateInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.clientLaborRate', {}, 'Invalid client rate', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.v3.createClientLaborRate(context.principal, {
        ...parsed.data,
        workerId: parsed.data.workerId || undefined,
        category: parsed.data.category || undefined,
        effectiveTo: parsed.data.effectiveTo || undefined,
      });
      return actionSuccess('action.finance.clientLaborRateSaved', {}, 'Client labor rate saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  supersedeClientLaborRate: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const supersedesId = parseRuleId(object.supersedesId as FormDataEntryValue | null);
    if (!supersedesId)
      return actionFail(
        400,
        'action.validation.clientLaborRateId',
        {},
        'Client labor rate ID is invalid',
      );
    delete object.supersedesId;
    if (Object.prototype.hasOwnProperty.call(object, 'eligibleForPercentage'))
      object.eligibleForPercentage = ['on', 'true', '1'].includes(
        String(object.eligibleForPercentage).toLowerCase(),
      );
    const parsed = clientLaborRateInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.replacementClientLaborRate',
        {},
        'Invalid replacement client rate',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.supersedeClientLaborRate(context.principal, supersedesId, {
        ...parsed.data,
        workerId: parsed.data.workerId || undefined,
        category: parsed.data.category || undefined,
        effectiveTo: parsed.data.effectiveTo || undefined,
      });
      return actionSuccess(
        'action.finance.clientLaborRateSuperseded',
        {},
        'Client labor rate superseded',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deactivateClientLaborRate: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const ruleId = parseRuleId(formData.get('ruleId'));
    if (!ruleId)
      return actionFail(
        400,
        'action.validation.clientLaborRateId',
        {},
        'Client labor rate ID is invalid',
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.deactivateClientLaborRate(context.principal, ruleId);
      return actionSuccess(
        'action.finance.clientLaborRateDeactivated',
        {},
        'Client labor rate deactivated',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createInternalCostRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = internalCostRuleInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.internalCostRule',
        {},
        'Invalid internal cost rule',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.createInternalCostRule(context.principal, parsed.data);
      return actionSuccess('action.finance.internalCostRuleSaved', {}, 'Internal cost rule saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  supersedeInternalCostRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const supersedesId = parseRuleId(object.supersedesId as FormDataEntryValue | null);
    if (!supersedesId)
      return actionFail(
        400,
        'action.validation.internalCostRuleId',
        {},
        'Internal cost rule ID is invalid',
      );
    delete object.supersedesId;
    const parsed = internalCostRuleInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.replacementInternalCostRule',
        {},
        'Invalid replacement internal cost rule',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.supersedeInternalCostRule(context.principal, supersedesId, {
        ...parsed.data,
        projectId: parsed.data.projectId || undefined,
        effectiveTo: parsed.data.effectiveTo || undefined,
      });
      return actionSuccess(
        'action.finance.internalCostRuleSuperseded',
        {},
        'Internal cost rule superseded',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deactivateInternalCostRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const ruleId = parseRuleId(formData.get('ruleId'));
    if (!ruleId)
      return actionFail(
        400,
        'action.validation.internalCostRuleId',
        {},
        'Internal cost rule ID is invalid',
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.deactivateInternalCostRule(context.principal, ruleId);
      return actionSuccess(
        'action.finance.internalCostRuleDeactivated',
        {},
        'Internal cost rule deactivated',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createAssignmentRateOverride: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = assignmentRateOverrideInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.assignmentOverride',
        {},
        'Invalid assignment override',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      context.v3.createAssignmentRateOverride(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.assignmentRateOverrideSaved',
        {},
        'Assignment rate override saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
