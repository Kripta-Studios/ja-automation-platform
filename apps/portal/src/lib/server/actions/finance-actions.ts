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
import { isActionFailure } from '@sveltejs/kit';
import {
  AccessDeniedError,
  AssignmentExpensePolicyRepository,
  ConflictError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
  ValidationError,
} from '@ja/database';
import { z } from 'zod';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess, type ActionMessageKey } from './action-message';
import { decimalToMinor, formObject, type PortalActionEvent } from '$lib/server/action-utils';

function parseRuleId(value: FormDataEntryValue | null): string | undefined {
  const parsed = uuidSchema.safeParse(value?.toString() ?? '');
  return parsed.success ? parsed.data : undefined;
}

type FinanceInputProblem = Readonly<{
  code: string;
  key: ActionMessageKey;
  message: string;
}>;

const financeInputProblems: Readonly<Record<string, FinanceInputProblem>> = {
  setProjectReimbursementDefault: {
    code: 'FINANCE_PROJECT_REIMBURSEMENT_FIELDS_INVALID',
    key: 'problem.finance.input.projectReimbursement',
    message: 'Review the project worker reimbursement mode, version, and reason.',
  },
  setWorkerReimbursementOverride: {
    code: 'FINANCE_WORKER_REIMBURSEMENT_FIELDS_INVALID',
    key: 'problem.finance.input.workerReimbursement',
    message: "Review the person's worker reimbursement mode, version, and reason.",
  },
  createAssignmentExpensePolicy: {
    code: 'FINANCE_ASSIGNMENT_EXPENSE_POLICY_FIELDS_INVALID',
    key: 'problem.finance.input.assignmentExpensePolicy',
    message:
      "Review the person expense policy's dates, payer, worker reimbursement, customer recovery, and reason.",
  },
  setAssignmentCommercialFallback: {
    code: 'FINANCE_ASSIGNMENT_COMMERCIAL_FALLBACK_FIELDS_INVALID',
    key: 'problem.finance.input.assignmentCommercialFallback',
    message: "Review the assignment's commercial fallback choices and version.",
  },
  setAssignmentCommercialRuleReferences: {
    code: 'FINANCE_ASSIGNMENT_COMMERCIAL_REFERENCES_FIELDS_INVALID',
    key: 'problem.finance.input.assignmentCommercialReferences',
    message: "Review the assignment's commercial rule references and version.",
  },
  createCanonicalLegalEntityRevision: {
    code: 'FINANCE_LEGAL_ENTITY_REVISION_FIELDS_INVALID',
    key: 'problem.finance.input.legalEntityRevision',
    message: "Review the issuing legal entity's dates, identity, currency, address, and reason.",
  },
  assignProjectLegalEntity: {
    code: 'FINANCE_PROJECT_LEGAL_ENTITY_ASSIGNMENT_FIELDS_INVALID',
    key: 'problem.finance.input.projectLegalEntityAssignment',
    message: 'Review the project issuing authority and effective period.',
  },
  classifyExpenseCommercially: {
    code: 'FINANCE_EXPENSE_CLASSIFICATION_FIELDS_INVALID',
    key: 'problem.finance.input.expenseClassification',
    message: "Review this expense's commercial treatment, tax rate, and version.",
  },
  setExpensePlanningDates: {
    code: 'FINANCE_EXPENSE_PLANNING_DATES_INVALID',
    key: 'problem.finance.input.expensePlanningDates',
    message: "Review the expense's planning dates.",
  },
  setCompensationSettlementExpectedPaymentOn: {
    code: 'FINANCE_SETTLEMENT_PLANNING_FIELDS_INVALID',
    key: 'problem.finance.input.settlementPlanning',
    message: "Review the worker settlement's expected payment date.",
  },
  createProjectCommercialPolicy: {
    code: 'FINANCE_PROJECT_COMMERCIAL_POLICY_FIELDS_INVALID',
    key: 'problem.finance.input.projectCommercialPolicy',
    message: "Review the project's commercial policy fields.",
  },
  createCompensationRule: {
    code: 'FINANCE_COMPENSATION_RULE_FIELDS_INVALID',
    key: 'problem.finance.input.compensationRule',
    message: "Review the worker compensation rule's rate, scope, and effective dates.",
  },
  supersedeCompensationRule: {
    code: 'FINANCE_REPLACEMENT_COMPENSATION_RULE_FIELDS_INVALID',
    key: 'problem.finance.input.compensationRule',
    message: "Review the worker compensation rule's rate, scope, and effective dates.",
  },
  deactivateCompensationRule: {
    code: 'FINANCE_COMPENSATION_RULE_REFERENCE_INVALID',
    key: 'problem.finance.input.compensationRuleReference',
    message: 'Choose a current worker compensation rule before changing it.',
  },
  settleCompensation: {
    code: 'FINANCE_SETTLEMENT_PERIOD_FIELDS_INVALID',
    key: 'problem.finance.input.settlementPeriod',
    message: 'Review the worker compensation settlement period.',
  },
  recordCompensationPayment: {
    code: 'FINANCE_COMPENSATION_PAYMENT_FIELDS_INVALID',
    key: 'problem.finance.input.compensationPayment',
    message: "Review the worker payment's payee, amount, date, and reference.",
  },
  reverseCompensationPayment: {
    code: 'FINANCE_PAYMENT_REVERSAL_FIELDS_INVALID',
    key: 'problem.finance.input.paymentReversal',
    message: 'Review the worker payment reversal reference and reason.',
  },
  recordReimbursement: {
    code: 'FINANCE_REIMBURSEMENT_FIELDS_INVALID',
    key: 'problem.finance.input.reimbursement',
    message: "Review the worker reimbursement's expense, amount, and payment reference.",
  },
  createClientLaborRate: {
    code: 'FINANCE_CLIENT_LABOR_RATE_FIELDS_INVALID',
    key: 'problem.finance.input.clientLaborRate',
    message: "Review the customer labor rate's scope, amount, and effective dates.",
  },
  supersedeClientLaborRate: {
    code: 'FINANCE_REPLACEMENT_CLIENT_LABOR_RATE_FIELDS_INVALID',
    key: 'problem.finance.input.clientLaborRate',
    message: "Review the customer labor rate's scope, amount, and effective dates.",
  },
  deactivateClientLaborRate: {
    code: 'FINANCE_CLIENT_RATE_REFERENCE_INVALID',
    key: 'problem.finance.input.clientRateReference',
    message: 'Choose a current customer labor rate before changing it.',
  },
  createInternalCostRule: {
    code: 'FINANCE_INTERNAL_COST_RULE_FIELDS_INVALID',
    key: 'problem.finance.input.internalCostRule',
    message: "Review the internal cost rule's scope, amount, and effective dates.",
  },
  supersedeInternalCostRule: {
    code: 'FINANCE_REPLACEMENT_INTERNAL_COST_RULE_FIELDS_INVALID',
    key: 'problem.finance.input.internalCostRule',
    message: "Review the internal cost rule's scope, amount, and effective dates.",
  },
  deactivateInternalCostRule: {
    code: 'FINANCE_INTERNAL_COST_REFERENCE_INVALID',
    key: 'problem.finance.input.internalCostReference',
    message: 'Choose a current internal cost rule before changing it.',
  },
  createAssignmentRateOverride: {
    code: 'FINANCE_ASSIGNMENT_OVERRIDE_FIELDS_INVALID',
    key: 'problem.finance.input.assignmentOverride',
    message: "Review the assignment rate override's scope, rate, and effective dates.",
  },
};

const financeReferenceProblems: Readonly<Record<string, FinanceInputProblem>> = {
  supersedeCompensationRule: financeInputProblems.deactivateCompensationRule!,
  supersedeClientLaborRate: financeInputProblems.deactivateClientLaborRate!,
  supersedeInternalCostRule: financeInputProblems.deactivateInternalCostRule!,
};

function safeFinanceValues(object: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(object).filter(
      (entry): entry is [string, string] =>
        /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(entry[0]) &&
        !/(?:password|secret|sessionToken|authorization|cookie)/i.test(entry[0]) &&
        typeof entry[1] === 'string' &&
        entry[1].length <= 10_000,
    ),
  );
}

function financeRemediesWithContext(remedies: unknown, values: Record<string, string>): unknown {
  if (!Array.isArray(remedies)) return remedies;
  return remedies.map((remedy) => {
    if (!remedy || typeof remedy !== 'object' || typeof remedy.id !== 'string') return remedy;
    const recordId =
      remedy.id === 'review_assignment_policy'
        ? values.projectMemberId
        : remedy.id === 'review_expense_classification'
          ? values.expenseId
          : remedy.id === 'review_updated_record'
            ? (values.expenseId ??
              values.settlementId ??
              values.projectMemberId ??
              values.ruleId ??
              values.supersedesId)
            : undefined;
    const projectId = ['configure_project_issuer', 'review_expense_policy'].includes(remedy.id)
      ? values.projectId
      : undefined;
    return {
      ...remedy,
      ...(recordId && !remedy.recordId ? { recordId } : {}),
      ...(projectId && !remedy.projectId ? { projectId } : {}),
    };
  });
}

/** Keep Finance's known domain failures out of the generic conflict path. */
export function financeFailure(
  error: unknown,
  context: {
    recordId?: string;
    projectId?: string;
    values?: Record<string, unknown>;
    actionName?: string;
  } = {},
) {
  const problem = (...args: Parameters<typeof actionFail>) =>
    actionFail(args[0], args[1], args[2], args[3], {
      ...args[4],
      values: context.values ?? {},
      actionName: context.actionName,
    });
  if (
    !(error instanceof AccessDeniedError) &&
    !(error instanceof V3AccessDeniedError) &&
    !(error instanceof ConflictError) &&
    !(error instanceof V3ConflictError) &&
    !(error instanceof ValidationError) &&
    !(error instanceof V3ValidationError)
  )
    return actionFailure(error, { values: context.values ?? {}, actionName: context.actionName });
  const message = error.message;
  const review = [{ id: 'review_updated_record', ...context }] as const;
  if (message === 'Finance role required' || message === 'Active finance principal required')
    return problem(
      403,
      'problem.finance.roleRequired',
      {},
      'Finance access is required for this change.',
      {
        code: 'FINANCE_ROLE_REQUIRED',
        remedies: [{ id: 'contact_finance_owner' }],
      },
    );
  if (message === 'Policy end must follow start')
    return problem(
      400,
      'problem.finance.policyEndBeforeStart',
      {},
      'The policy end date must be on or after its start date.',
      {
        code: 'FINANCE_POLICY_END_BEFORE_START',
        fieldErrors: { effectiveTo: ['Policy end must follow start'] },
      },
    );
  if (message === 'Active project assignment required')
    return problem(
      409,
      'problem.finance.policyAssignmentUnavailable',
      {},
      'This person no longer has an active project assignment. Review the assignment before creating a policy.',
      {
        code: 'FINANCE_POLICY_ASSIGNMENT_UNAVAILABLE',
        remedies: [{ id: 'review_assignment_policy', recordId: context.recordId }],
      },
    );
  if (message === 'Policy dates must fall within the assignment')
    return problem(
      409,
      'problem.finance.policyOutsideAssignment',
      {},
      "The policy dates must stay within this person's project assignment.",
      {
        code: 'FINANCE_POLICY_OUTSIDE_ASSIGNMENT',
        fieldErrors: {
          effectiveFrom: ['Policy dates must fall within the assignment'],
          effectiveTo: ['Policy dates must fall within the assignment'],
        },
        remedies: [{ id: 'review_assignment_policy', recordId: context.recordId }],
      },
    );
  if (message === 'Bounded assignment requires a policy end date')
    return problem(
      400,
      'problem.finance.policyEndRequired',
      {},
      'This assignment has an end date. Enter a policy end date within it.',
      {
        code: 'FINANCE_POLICY_END_REQUIRED',
        fieldErrors: { effectiveTo: ['Policy end date required'] },
      },
    );
  if (message === 'Markup requires a positive rate and no other treatment permits one')
    return problem(
      400,
      'problem.finance.policyMarkupMismatch',
      {},
      'A markup requires a positive rate; other client treatments cannot include markup.',
      {
        code: 'FINANCE_POLICY_MARKUP_MISMATCH',
        fieldErrors: { markupBps: ['Enter a positive markup only for markup treatment'] },
      },
    );
  if (
    message === 'Project changed. Reload its reimbursement policy' ||
    message === 'Assignment changed. Reload its reimbursement policy'
  )
    return problem(
      409,
      'problem.finance.reimbursementConflict',
      {},
      'The worker reimbursement policy changed. Review the current policy before saving again; customer billing is separate.',
      { code: 'WORKER_REIMBURSEMENT_POLICY_CHANGED', remedies: review },
    );
  if (message === 'No canonical legal-entity assignment is effective on this date')
    return problem(
      409,
      'problem.finance.projectIssuingAuthorityRequired',
      {},
      'Set a project issuing authority effective on this expense date before classifying it.',
      {
        code: 'PROJECT_ISSUING_AUTHORITY_REQUIRED',
        remedies: [{ id: 'configure_project_issuer', projectId: context.projectId }],
      },
    );
  if (message === 'Canonical legal-entity currency does not match project currency')
    return problem(
      409,
      'problem.finance.issuingCurrencyMismatch',
      {},
      'The project currency and issuing legal entity currency differ. Review the issuing authority before classifying this expense.',
      {
        code: 'PROJECT_ISSUING_CURRENCY_MISMATCH',
        remedies: [{ id: 'configure_project_issuer', projectId: context.projectId }],
      },
    );
  if (message === 'Configured worker reimbursement is required')
    return problem(
      409,
      'problem.finance.workerReimbursementRequired',
      {},
      'Classify the expense and set its worker reimbursement before recording payment. Customer recovery is a separate decision.',
      {
        code: 'WORKER_REIMBURSEMENT_REQUIRED',
        remedies: [{ id: 'review_expense_classification', recordId: context.recordId }],
      },
    );
  if (message === 'Reimbursement amount is outside the expense balance')
    return problem(
      400,
      'problem.finance.reimbursementAmountInvalid',
      {},
      'The reimbursement amount must be positive and cannot exceed the approved worker reimbursement.',
      {
        code: 'WORKER_REIMBURSEMENT_AMOUNT_INVALID',
        fieldErrors: { amountMinor: ['Amount exceeds approved worker reimbursement'] },
      },
    );
  if (message === 'Partial reimbursement is not supported; record the full expense reimbursement')
    return problem(
      400,
      'problem.finance.partialReimbursementUnsupported',
      {},
      'Record the full approved worker reimbursement amount; partial reimbursement is not supported here.',
      {
        code: 'WORKER_PARTIAL_REIMBURSEMENT_UNSUPPORTED',
        fieldErrors: { amountMinor: ['Enter the full approved reimbursement amount'] },
      },
    );
  if (message === 'Reimbursement is already finalized with different final truth')
    return problem(
      409,
      'problem.finance.reimbursementFinalized',
      {},
      'This worker reimbursement was already finalized with different details. Review the recorded payment before making a correction.',
      { code: 'WORKER_REIMBURSEMENT_ALREADY_FINALIZED', remedies: review },
    );
  if (message === 'Approved worker-paid expense required')
    return problem(
      409,
      'problem.finance.reimbursementUnavailable',
      {},
      'Only an approved worker-paid expense can be reimbursed. Review the expense status and payer.',
      { code: 'WORKER_REIMBURSEMENT_UNAVAILABLE', remedies: review },
    );
  if (
    message === 'Only a worker-paid expense can reimburse a worker' ||
    message === 'Client-paid expenses require client-direct treatment'
  )
    return problem(
      400,
      'problem.finance.expensePayerTreatmentMismatch',
      {},
      'The payer and treatment conflict. Worker reimbursement applies only when the worker paid; customer-paid expenses need client-direct recovery.',
      { code: 'EXPENSE_PAYER_TREATMENT_MISMATCH', remedies: [{ id: 'review_expense_policy' }] },
    );
  if (message === 'Expense policy already starts on this date')
    return problem(
      409,
      'problem.finance.policyDuplicateStart',
      {},
      'A person expense policy already starts on this date. Review that policy before adding another.',
      {
        code: 'FINANCE_POLICY_DUPLICATE_START',
        fieldErrors: { effectiveFrom: ['A policy already starts on this date'] },
        remedies: [{ id: 'review_assignment_policy', recordId: context.recordId }],
      },
    );
  if (message === 'Expense policy dates overlap an existing finite window')
    return problem(
      409,
      'problem.finance.policyPeriodOverlap',
      {},
      'This policy period overlaps an existing policy for the same person, payer, and category. Review the current periods.',
      {
        code: 'FINANCE_POLICY_PERIOD_OVERLAP',
        fieldErrors: {
          effectiveFrom: ['Policy period overlaps an existing one'],
          effectiveTo: ['Policy period overlaps an existing one'],
        },
        remedies: [{ id: 'review_assignment_policy', recordId: context.recordId }],
      },
    );
  if (message === 'Project legal-entity assignment overlaps an existing interval')
    return problem(
      409,
      'problem.finance.policyConflict',
      {},
      'This effective period overlaps an existing policy or assignment. Review the current periods before saving.',
      { code: 'FINANCE_EFFECTIVE_PERIOD_OVERLAP', remedies: review },
    );
  if (message === 'Compensation must be reviewed and finalized before payment')
    return problem(
      409,
      'problem.finance.compensationNotFinalized',
      {},
      'Finalize the worker compensation settlement before recording its payment.',
      { code: 'WORKER_COMPENSATION_NOT_FINALIZED', remedies: review },
    );
  if (message === 'Payment idempotency key was already used')
    return problem(
      409,
      'problem.finance.paymentRetryConflict',
      {},
      'This payment request was already used with different details. Review recorded worker payments before trying again.',
      { code: 'WORKER_PAYMENT_RETRY_CONFLICT', remedies: review },
    );
  if (message === 'Payment amount exceeds the remaining compensation balance')
    return problem(
      400,
      'problem.finance.paymentExceedsBalance',
      {},
      'The payment exceeds the remaining worker compensation balance. Review the settlement before recording it.',
      {
        code: 'WORKER_PAYMENT_EXCEEDS_BALANCE',
        fieldErrors: { amount: ['Amount exceeds remaining balance'] },
        remedies: review,
      },
    );
  if (message === 'Payment currency must match the compensation settlement')
    return problem(
      400,
      'problem.finance.paymentCurrencyMismatch',
      {},
      'The payment currency must match the worker compensation settlement.',
      {
        code: 'WORKER_PAYMENT_CURRENCY_MISMATCH',
        fieldErrors: { currency: ['Currency must match settlement'] },
        remedies: review,
      },
    );
  if (
    [
      'Expense version is stale',
      'Expense changed or became locked during classification',
      'Expense classification authority changed concurrently',
      'Expense classification change conflicted',
      'Expense changed before planning update',
      'Assignment commercial references changed',
      'Assignment commercial fallback changed',
      'Compensation rule changed while superseding',
      'Client labor rate changed while superseding',
      'Internal cost rule changed while superseding',
    ].includes(message)
  )
    return problem(
      409,
      'problem.finance.recordChanged',
      {},
      'This Finance record changed while the form was open. Review the updated record before saving again.',
      { code: 'FINANCE_RECORD_CHANGED', remedies: review },
    );
  if (
    message === 'Superseded expense is immutable' ||
    message === 'Invoiced expense is immutable' ||
    message === 'Expense is locked for billing' ||
    message === 'Expense is locked by an invoice source' ||
    message === 'Billed or locked expense planning cannot be changed' ||
    message === 'Reimbursed expense planning cannot be changed'
  )
    return problem(
      409,
      'problem.finance.expenseImmutable',
      {},
      'This expense has already entered billing or worker payment history. Review the record and use its correction path.',
      { code: 'FINANCE_EXPENSE_IMMUTABLE', remedies: review },
    );
  return actionFailure(error, { values: context.values ?? {}, actionName: context.actionName });
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

const rawFinanceActions = {
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
      return financeFailure(error);
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
      return financeFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createAssignmentExpensePolicy: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = await formObject(request);
    const parsed = assignmentExpensePolicyForm.safeParse(values);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.assignmentExpensePolicy',
        {},
        'Check expense policy fields',
        {
          fields: parsed.error.flatten().fieldErrors,
          values,
          actionName: 'createAssignmentExpensePolicy',
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
      return financeFailure(error, {
        recordId: parsed.data.projectMemberId,
        values,
        actionName: 'createAssignmentExpensePolicy',
      });
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
      return financeFailure(error);
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
      return financeFailure(error);
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
        return actionFail(
          403,
          'problem.finance.roleRequired',
          {},
          'Finance access is required for this change.',
          {
            code: 'FINANCE_ROLE_REQUIRED',
            remedies: [{ id: 'contact_finance_owner' }],
          },
        );
      const result = context.v3.createCanonicalLegalEntityRevision(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.canonicalLegalEntityRevisionCreated',
        { revisionId: result.revisionId, idempotent: result.idempotent },
        'Issuing legal entity revision saved',
      );
    } catch (error) {
      return financeFailure(error);
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
        return actionFail(
          403,
          'problem.finance.roleRequired',
          {},
          'Finance access is required for this change.',
          {
            code: 'FINANCE_ROLE_REQUIRED',
            remedies: [{ id: 'contact_finance_owner' }],
          },
        );
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
      return financeFailure(error);
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
        return actionFail(
          403,
          'problem.finance.roleRequired',
          {},
          'Finance access is required for this change.',
          {
            code: 'FINANCE_ROLE_REQUIRED',
            remedies: [{ id: 'contact_finance_owner' }],
          },
        );
      const result = context.repository.classifyExpenseCommercially(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.expenseClassified',
        { version: result.version },
        'Expense commercial classification saved',
      );
    } catch (error) {
      const expense = context.sqlite
        .prepare('SELECT project_id FROM expense WHERE id=?')
        .get(parsed.data.expenseId) as { project_id: string } | undefined;
      return financeFailure(error, {
        recordId: parsed.data.expenseId,
        projectId: expense?.project_id,
      });
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
      return financeFailure(error);
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
      return financeFailure(error);
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
        return actionFail(
          403,
          'problem.finance.roleRequired',
          {},
          'Finance access is required for this change.',
          {
            code: 'FINANCE_ROLE_REQUIRED',
            remedies: [{ id: 'contact_finance_owner' }],
          },
        );
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
      return financeFailure(error);
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
      return financeFailure(error);
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
      return financeFailure(error);
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
      return financeFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  settleCompensation: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = compensationSettlementInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.settlementPeriod',
        {},
        'Check settlement period fields',
        {
          fields: parsed.error.flatten().fieldErrors,
        },
      );
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.settleCompensation(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.compensationSettled',
        { count: result.length },
        `Settled ${result.length} compensation rule(s)`,
      );
    } catch (error) {
      return financeFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  recordCompensationPayment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = { ...object };
    const payeeSelection = String(object.payeeSelection ?? '');
    const separator = payeeSelection.indexOf(':');
    object.payeeKind = separator > 0 ? payeeSelection.slice(0, separator) : '';
    object.payeeId = separator > 0 ? payeeSelection.slice(separator + 1) : '';
    object.amountMinor = decimalToMinor(object.amount);
    object.idempotencyKey = String(object.idempotencyKey || randomUUID());
    delete object.payeeSelection;
    delete object.amount;
    const parsed = compensationPaymentInputSchema.safeParse(object);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      return actionFail(
        400,
        'action.validation.compensationPayment',
        {},
        'Check the actual payment fields',
        {
          fields: {
            ...fields,
            ...(fields.amountMinor ? { amount: fields.amountMinor } : {}),
            ...(fields.payeeKind || fields.payeeId
              ? { payeeSelection: fields.payeeKind ?? fields.payeeId }
              : {}),
          },
          values,
          actionName: 'recordCompensationPayment',
        },
      );
    }
    const context = openPortalRepository(locals);
    try {
      const result = context.v3.recordCompensationPayment(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.compensationPaymentRecorded',
        { id: result.id, idempotent: result.idempotent },
        'Actual compensation payment recorded',
      );
    } catch (error) {
      return financeFailure(error, {
        recordId: parsed.data.settlementId,
        values,
        actionName: 'recordCompensationPayment',
      });
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
      return financeFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  recordReimbursement: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = { ...object };
    object.amountMinor = object.amountMinor ? String(object.amountMinor) : undefined;
    const parsed = reimbursementInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.reimbursement', {}, 'Check reimbursement fields', {
        fields: parsed.error.flatten().fieldErrors,
        values,
        actionName: 'recordReimbursement',
      });
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
      return financeFailure(error, {
        recordId: parsed.data.expenseId,
        values,
        actionName: 'recordReimbursement',
      });
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
      return financeFailure(error);
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
      return financeFailure(error);
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
      return financeFailure(error);
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
      return financeFailure(error);
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
      return financeFailure(error);
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
      return financeFailure(error);
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
      return financeFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};

/** Keep native and enhanced Finance failures tied to the submitted form. */
export const financeActions = Object.fromEntries(
  Object.entries(rawFinanceActions).map(([actionName, action]) => [
    actionName,
    async (event: PortalActionEvent) => {
      const values = safeFinanceValues(await formObject(event.request.clone()));
      const result = await action(event);
      if (isActionFailure(result) && result.data && typeof result.data === 'object') {
        const data = result.data as Record<string, unknown>;
        const existing =
          data.values && typeof data.values === 'object'
            ? safeFinanceValues(data.values as Record<string, unknown>)
            : {};
        const retainedValues = { ...values, ...existing };
        if (typeof data.messageKey === 'string' && /^action\.validation\./u.test(data.messageKey)) {
          const reference = /(?:compensationRuleId|clientLaborRateId|internalCostRuleId)$/.test(
            data.messageKey,
          );
          const problem =
            (reference ? financeReferenceProblems[actionName] : undefined) ??
            financeInputProblems[actionName];
          if (problem) {
            const fieldErrors =
              data.fieldErrors &&
              typeof data.fieldErrors === 'object' &&
              !Array.isArray(data.fieldErrors)
                ? (data.fieldErrors as Record<string, string[]>)
                : {};
            const referenceField = actionName.startsWith('deactivate') ? 'ruleId' : 'supersedesId';
            return actionFail(result.status, problem.key, {}, problem.message, {
              code: problem.code,
              actionName,
              values: retainedValues,
              fieldErrors: Object.keys(fieldErrors).length
                ? fieldErrors
                : reference
                  ? { [referenceField]: [problem.key] }
                  : {},
              remedies: [{ id: 'correct_field' }],
              correlationId:
                typeof data.correlationId === 'string' ? data.correlationId : undefined,
            });
          }
        }
        data.values = retainedValues;
        data.actionName = actionName;
        data.remedies = financeRemediesWithContext(data.remedies, retainedValues);
      }
      return result;
    },
  ]),
) as typeof rawFinanceActions;
