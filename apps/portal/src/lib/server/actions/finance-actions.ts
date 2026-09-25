import {
  assignmentRateOverrideInputSchema,
  clientLaborRateInputSchema,
  compensationPaymentInputSchema,
  compensationPaymentReversalInputSchema,
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
import { randomUUID } from 'node:crypto';
import { AssignmentExpensePolicyRepository, ConflictError } from '@ja/database';
import { z } from 'zod';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { decimalToMinor, formObject, type PortalActionEvent } from '$lib/server/action-utils';

function parseRuleId(value: FormDataEntryValue | null): string | undefined {
  const parsed = uuidSchema.safeParse(value?.toString() ?? '');
  return parsed.success ? parsed.data : undefined;
}

const canonicalLegalEntityRevisionForm = z.object({
  legacyLegalEntityId: z.string().trim().min(1).max(200),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.union([z.literal(''), z.iso.date()]).transform((value) => value || undefined),
  legalName: z.string().trim().min(1).max(300),
  taxIdentifier: z.string().trim().max(100),
  registrationIdentifier: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || undefined),
  addressLine1: z.string().trim().min(1).max(300),
  addressLine2: z
    .string()
    .trim()
    .max(300)
    .transform((value) => value || undefined),
  locality: z.string().trim().min(1).max(160),
  region: z
    .string()
    .trim()
    .max(160)
    .transform((value) => value || undefined),
  postalCode: z.string().trim().min(1).max(80),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/u),
  baseCurrency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/u),
  timezone: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(5).max(2000),
  idempotencyKey: z.string().trim().min(16).max(240),
});

const assignmentCommercialFallbackForm = z.object({
  projectMemberId: z.string().trim().min(1).max(200),
  expectedVersion: z.coerce.number().int().positive(),
  allowGlobalCompensation: z.enum(['yes', 'no']),
  allowGlobalInternalCost: z.enum(['yes', 'no']),
});

const assignmentCommercialReferencesForm = z.object({
  projectMemberId: z.string().trim().min(1).max(200),
  expectedVersion: z.coerce.number().int().positive(),
  clientBillRuleId: z.string().trim().max(200),
  workerCompensationRuleId: z.string().trim().max(200),
  internalCostRuleId: z.string().trim().max(200),
});

const assignmentExpensePolicyForm = z.object({
  projectMemberId: z.string().trim().min(1).max(200),
  payer: z.enum(['worker', 'company_card', 'company_direct', 'client', 'third_party']),
  category: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value || undefined),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.union([z.literal(''), z.iso.date()]).transform((value) => value || undefined),
  workerReimbursement: z.enum(['at_cost', 'none']),
  clientRecovery: z.enum(['at_cost', 'markup', 'included', 'non_billable', 'client_direct']),
  markupBps: z
    .union([z.literal(''), z.coerce.number().int().min(1).max(10_000)])
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  reason: z.string().trim().min(3).max(2000),
});

const reimbursementModeForm = z.enum(['inherit', 'at_cost', 'none']);
const projectReimbursementForm = z.object({
  projectId: z.string().trim().min(1).max(200),
  expectedVersion: z.coerce.number().int().positive(),
  mode: reimbursementModeForm,
  reason: z.string().trim().min(3).max(2000),
});
const workerReimbursementForm = z.object({
  projectMemberId: z.string().trim().min(1).max(200),
  expectedVersion: z.coerce.number().int().positive(),
  mode: reimbursementModeForm,
  reason: z.string().trim().min(3).max(2000),
});

export const financeActions = {
  setProjectReimbursementDefault: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = projectReimbursementForm.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.projectReimbursement',
        {},
        'Check project reimbursement fields',
        {
          fields: parsed.error.flatten().fieldErrors,
        },
      );
    const context = openPortalRepository(locals);
    try {
      new AssignmentExpensePolicyRepository(context.sqlite).setProjectReimbursementDefault(
        context.principal,
        { ...parsed.data, mode: parsed.data.mode === 'inherit' ? null : parsed.data.mode },
      );
      return actionSuccess(
        'action.finance.projectReimbursementSaved',
        {},
        'Project reimbursement default saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setWorkerReimbursementOverride: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = workerReimbursementForm.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.workerReimbursement',
        {},
        'Check worker reimbursement fields',
        {
          fields: parsed.error.flatten().fieldErrors,
        },
      );
    const context = openPortalRepository(locals);
    try {
      new AssignmentExpensePolicyRepository(context.sqlite).setWorkerReimbursementOverride(
        context.principal,
        { ...parsed.data, mode: parsed.data.mode === 'inherit' ? null : parsed.data.mode },
      );
      return actionSuccess(
        'action.finance.workerReimbursementSaved',
        {},
        'Worker reimbursement override saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createAssignmentExpensePolicy: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = assignmentExpensePolicyForm.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.assignmentExpensePolicy',
        {},
        'Check expense policy fields',
        {
          fields: parsed.error.flatten().fieldErrors,
        },
      );
    const context = openPortalRepository(locals);
    try {
      const result = new AssignmentExpensePolicyRepository(context.sqlite).create(
        context.principal,
        parsed.data,
      );
      return actionSuccess(
        'action.finance.assignmentExpensePolicyCreated',
        result,
        'Person expense policy saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setAssignmentCommercialFallback: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = assignmentCommercialFallbackForm.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.assignmentCommercialFallback',
        {},
        'Check assignment options',
        {
          fields: parsed.error.flatten().fieldErrors,
        },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.setAssignmentCommercialFallback(context.principal, {
        projectMemberId: parsed.data.projectMemberId,
        expectedVersion: parsed.data.expectedVersion,
        allowGlobalCompensation: parsed.data.allowGlobalCompensation === 'yes',
        allowGlobalInternalCost: parsed.data.allowGlobalInternalCost === 'yes',
      });
      return actionSuccess(
        'action.finance.assignmentCommercialFallbackSaved',
        result,
        'Assignment fallback options saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  setAssignmentCommercialRuleReferences: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = assignmentCommercialReferencesForm.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.assignmentCommercialReferences',
        {},
        'Check assignment rules',
        {
          fields: parsed.error.flatten().fieldErrors,
        },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.setAssignmentCommercialRuleReferences(context.principal, {
        projectMemberId: parsed.data.projectMemberId,
        expectedVersion: parsed.data.expectedVersion,
        clientBillRuleId: parsed.data.clientBillRuleId || null,
        workerCompensationRuleId: parsed.data.workerCompensationRuleId || null,
        internalCostRuleId: parsed.data.internalCostRuleId || null,
      });
      return actionSuccess(
        'action.finance.assignmentCommercialReferencesSaved',
        result,
        'Assignment rules saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createCanonicalLegalEntityRevision: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = canonicalLegalEntityRevisionForm.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.canonicalLegalEntityRevision',
        {},
        'Check legal-entity revision fields',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
        return actionFail(403, 'action.error.forbidden', {}, 'Finance role required');
      const result = context.v3.createCanonicalLegalEntityRevision(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.canonicalLegalEntityRevisionCreated',
        { revisionId: result.revisionId, idempotent: result.idempotent },
        'Issuing legal entity revision saved',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
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
    delete form.expenseOverridePreset;
    delete form.expenseOverrideMarkup;
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
      if (
        error instanceof ConflictError &&
        error.message === 'No canonical legal-entity assignment is effective on this date'
      )
        return actionFail(
          409,
          'action.finance.projectIssuingAuthorityRequired',
          {},
          'Set a project issuing authority effective on this expense date before classifying it.',
        );
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
  recordCompensationPayment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const payeeSelection = String(object.payeeSelection ?? '');
    const separator = payeeSelection.indexOf(':');
    object.payeeKind = separator > 0 ? payeeSelection.slice(0, separator) : '';
    object.payeeId = separator > 0 ? payeeSelection.slice(separator + 1) : '';
    object.amountMinor = decimalToMinor(object.amount);
    object.idempotencyKey = String(object.idempotencyKey || randomUUID());
    delete object.payeeSelection;
    delete object.amount;
    const parsed = compensationPaymentInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.compensationPayment',
        {},
        'Check the actual payment fields',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.recordCompensationPayment(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.compensationPaymentRecorded',
        { id: result.id, idempotent: result.idempotent },
        'Actual compensation payment recorded',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  reverseCompensationPayment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.idempotencyKey = String(object.idempotencyKey || randomUUID());
    const parsed = compensationPaymentReversalInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.compensationPaymentReversal',
        {},
        'Check the payment reversal fields',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.reverseCompensationPayment(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.compensationPaymentReversed',
        { id: result.id, idempotent: result.idempotent },
        'Compensation payment reversed with an audit event',
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
