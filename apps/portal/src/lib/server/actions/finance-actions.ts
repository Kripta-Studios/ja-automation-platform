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
  unusedProjectIssuingAuthorityReplacementInputSchema,
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

type PolicyAssignmentCurrent = Readonly<{
  projectId: string;
  workerName: string;
  startsOn: string;
  endsOn: string | null;
  status: string;
}>;

const commercialAssignmentLockedMessage =
  'Assignment commercial terms cannot change after time has been recorded; use a date-effective rule';
const commercialAssignmentRuleUnavailableMessage =
  'Commercial rule is unavailable for the full assignment scope and dates';
const commercialAssignmentVersionChangedMessage =
  'Project assignment changed before commercial update';

function commercialAssignmentProjectId(
  context: ReturnType<typeof openPortalRepository>,
  projectMemberId: string,
  error: unknown,
): string | undefined {
  if (
    !(
      (error instanceof V3ConflictError &&
        [commercialAssignmentLockedMessage, commercialAssignmentVersionChangedMessage].includes(
          error.message,
        )) ||
      (error instanceof V3ValidationError &&
        error.message === commercialAssignmentRuleUnavailableMessage)
    )
  )
    return undefined;
  try {
    const row = context.sqlite
      .prepare('SELECT project_id FROM project_member WHERE id=?')
      .get(projectMemberId) as { project_id: string } | undefined;
    return row?.project_id;
  } catch {
    return undefined;
  }
}

function policyAssignmentCurrent(
  context: ReturnType<typeof openPortalRepository>,
  projectMemberId: string,
): PolicyAssignmentCurrent | undefined {
  try {
    const row = context.repository
      .listAssignments(context.principal)
      .find((assignment) => String(assignment.id) === projectMemberId);
    return row
      ? {
          projectId: String(row.project_id),
          workerName: String(row.worker_name),
          startsOn: String(row.starts_on),
          endsOn: row.ends_on ? String(row.ends_on) : null,
          status: String(row.status),
        }
      : undefined;
  } catch {
    // The original policy failure remains useful without disclosing an inaccessible assignment.
    return undefined;
  }
}

const financeInputProblems: Readonly<Record<string, FinanceInputProblem>> = {
  setProjectReimbursementDefault: {
    code: 'FINANCE_PROJECT_REIMBURSEMENT_FIELDS_INVALID',
    key: 'problem.finance.input.projectReimbursement',
    message: 'Review the project worker reimbursement mode, effective date, version, and reason.',
  },
  setWorkerReimbursementOverride: {
    code: 'FINANCE_WORKER_REIMBURSEMENT_FIELDS_INVALID',
    key: 'problem.finance.input.workerReimbursement',
    message: "Review the person's worker reimbursement mode, effective date, version, and reason.",
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
  replaceUnusedProjectIssuingAuthority: {
    code: 'FINANCE_UNUSED_ISSUER_REPLACEMENT_FIELDS_INVALID',
    key: 'problem.finance.input.unusedIssuerReplacement',
    message:
      'Choose a reviewed replacement revision and enter a reason of at least five characters.',
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
    assignmentCurrent?: PolicyAssignmentCurrent;
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
    return actionFailure(error, {
      values: context.values ?? {},
      actionName: context.actionName,
      ...(context.actionName === 'createAssignmentExpensePolicy'
        ? { remedies: [{ id: 'review_expense_policy' }] }
        : {}),
    });
  const message = error.message;
  const review = [
    {
      id: 'review_updated_record',
      ...(context.recordId ? { recordId: context.recordId } : {}),
      ...(context.projectId ? { projectId: context.projectId } : {}),
    },
  ] as const;
  if (
    context.actionName === 'classifyExpenseCommercially' &&
    message === 'Withdrawn or rejected expense cannot be classified'
  )
    return problem(
      409,
      'problem.finance.expenseUnavailableForClassification',
      {},
      'This expense was withdrawn or rejected and cannot be classified. Review active expenses.',
      {
        code: 'FINANCE_EXPENSE_CLASSIFICATION_SOURCE_UNAVAILABLE',
        remedies: [{ id: 'review_finance_expenses' }],
      },
    );
  if (
    context.actionName === 'setExpensePlanningDates' &&
    error instanceof ValidationError &&
    message === 'Expense not found'
  )
    return problem(
      404,
      'problem.finance.expensePlanningRecordUnavailable',
      {},
      'This expense is no longer available. No planning dates were saved. Review the current Finance expense list and choose an available expense.',
      {
        code: 'FINANCE_EXPENSE_PLANNING_RECORD_UNAVAILABLE',
        remedies: [{ id: 'review_finance_expenses' }],
      },
    );
  if (message === 'Sign in required' || message === 'Live authenticated session required')
    return problem(401, 'action.error.unauthenticated', {}, 'Sign in again to continue.', {
      code: 'FINANCE_SIGN_IN_REQUIRED',
      remedies: [{ id: 'sign_in_again' }],
    });
  if (
    (error instanceof AccessDeniedError || error instanceof V3AccessDeniedError) &&
    message === 'Active account required'
  )
    return problem(
      403,
      'problem.finance.accountInactive',
      {},
      'Your account is no longer active. Ask a Finance administrator or owner to review access.',
      {
        code: 'FINANCE_ACCOUNT_INACTIVE',
        remedies: [{ id: 'contact_finance_owner' }],
      },
    );
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
  if (
    error instanceof V3ConflictError &&
    ['setAssignmentCommercialFallback', 'setAssignmentCommercialRuleReferences'].includes(
      context.actionName ?? '',
    ) &&
    message === commercialAssignmentLockedMessage
  )
    return problem(
      409,
      'problem.finance.assignmentCommercialLockedByTime',
      {},
      'Time has been recorded for this person on this assignment. Changing its commercial choices could change how past work is paid, billed, or costed. Configure date-effective worker pay, customer billing, or internal cost rules for future work instead.',
      {
        code: 'FINANCE_ASSIGNMENT_COMMERCIAL_LOCKED_BY_TIME',
        remedies: [
          { id: 'review_compensation_rules', projectId: context.projectId },
          { id: 'review_client_labor_rates', projectId: context.projectId },
          { id: 'review_internal_cost_rules', projectId: context.projectId },
        ],
      },
    );
  if (
    error instanceof V3ConflictError &&
    ['setAssignmentCommercialFallback', 'setAssignmentCommercialRuleReferences'].includes(
      context.actionName ?? '',
    ) &&
    message === commercialAssignmentVersionChangedMessage
  )
    return problem(
      409,
      'problem.finance.assignmentCommercialVersionChanged',
      {},
      "This person's commercial choices changed while the form was open. Your changes were not saved. Review the current saved choices before deciding whether to submit yours.",
      {
        code: 'FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED',
        remedies: [
          {
            id: 'review_updated_record',
            ...(context.recordId ? { recordId: context.recordId } : {}),
            ...(context.projectId ? { projectId: context.projectId } : {}),
          },
        ],
      },
    );
  if (
    error instanceof V3ValidationError &&
    context.actionName === 'setAssignmentCommercialRuleReferences' &&
    message === commercialAssignmentRuleUnavailableMessage
  )
    return problem(
      409,
      'problem.finance.assignmentCommercialRuleUnavailable',
      {},
      'A selected commercial rule no longer covers this person’s full assignment scope and dates. Review current rules and choose an available one.',
      {
        code: 'FINANCE_ASSIGNMENT_COMMERCIAL_RULE_UNAVAILABLE',
        remedies: [
          { id: 'review_client_labor_rates', projectId: context.projectId },
          { id: 'review_compensation_rules', projectId: context.projectId },
          { id: 'review_internal_cost_rules', projectId: context.projectId },
        ],
      },
    );
  const ruleCreation = [
    'createCompensationRule',
    'createInternalCostRule',
    'supersedeCompensationRule',
    'supersedeInternalCostRule',
  ];
  if (
    context.actionName &&
    ruleCreation.includes(context.actionName) &&
    message === 'Active worker or project manager account required'
  )
    return problem(
      409,
      'problem.finance.ruleWorkerUnavailable',
      {},
      'The selected worker or project manager is no longer active. Review the person before creating this rule.',
      {
        code: 'FINANCE_RULE_WORKER_UNAVAILABLE',
        fieldErrors: { workerId: ['problem.finance.ruleWorkerUnavailable'] },
        remedies: [{ id: 'contact_project_owner' }],
      },
    );
  if (
    context.actionName &&
    ruleCreation.includes(context.actionName) &&
    message === 'Worker is not assigned to the project for the effective period'
  )
    return problem(
      409,
      'problem.finance.ruleAssignmentUnavailable',
      {},
      'This worker has no active assignment to the selected project covering the full rule period. Review the assignment dates with the project owner.',
      {
        code: 'FINANCE_RULE_ASSIGNMENT_UNAVAILABLE',
        fieldErrors: { projectId: ['problem.finance.ruleAssignmentUnavailable'] },
        remedies: [{ id: 'contact_project_owner' }],
      },
    );
  const currencyProblems = {
    'Compensation currency must match the project currency': {
      actions: ['createCompensationRule', 'supersedeCompensationRule'],
      code: 'FINANCE_COMPENSATION_RULE_PROJECT_CURRENCY_MISMATCH',
      key: 'problem.finance.compensationRuleCurrencyMismatch',
      message:
        'The worker compensation currency must match the selected project currency. Review the project currency before choosing this rule currency.',
    },
    'Internal cost currency must match the project currency': {
      actions: ['createInternalCostRule', 'supersedeInternalCostRule'],
      code: 'FINANCE_INTERNAL_COST_RULE_PROJECT_CURRENCY_MISMATCH',
      key: 'problem.finance.internalCostRuleCurrencyMismatch',
      message:
        'The internal cost currency must match the selected project currency. Review the project currency before choosing this rule currency.',
    },
    'Client rate currency must match the project currency': {
      actions: ['createClientLaborRate', 'supersedeClientLaborRate'],
      code: 'FINANCE_CLIENT_LABOR_RATE_PROJECT_CURRENCY_MISMATCH',
      key: 'problem.finance.clientLaborRateCurrencyMismatch',
      message:
        'The customer labor rate currency must match the selected project currency. Review the project currency before choosing this rate currency.',
    },
  } as const;
  const currencyProblem = currencyProblems[message as keyof typeof currencyProblems];
  if (
    currencyProblem &&
    context.actionName &&
    currencyProblem.actions.includes(context.actionName as never)
  )
    return problem(409, currencyProblem.key, {}, currencyProblem.message, {
      code: currencyProblem.code,
      fieldErrors: { currency: [currencyProblem.key] },
      remedies: [{ id: 'correct_field' }],
    });
  if (context.actionName === 'createCanonicalLegalEntityRevision') {
    if (message === 'Legacy legal entity not found')
      return problem(
        409,
        'problem.finance.legacyLegalEntityUnavailable',
        {},
        'The selected legal entity is no longer available. Review the current issuing authority before creating a revision.',
        {
          code: 'FINANCE_LEGACY_LEGAL_ENTITY_UNAVAILABLE',
          fieldErrors: { legacyLegalEntityId: ['problem.finance.legacyLegalEntityUnavailable'] },
          remedies: [{ id: 'configure_project_issuer', projectId: context.projectId }],
        },
      );
    if (message === 'Base currency must match the legacy legal entity')
      return problem(
        409,
        'problem.finance.legalEntityBaseCurrencyMismatch',
        {},
        'The revision currency must match the selected legal entity currency. Review that legal entity before choosing a currency.',
        {
          code: 'FINANCE_LEGAL_ENTITY_BASE_CURRENCY_MISMATCH',
          fieldErrors: { baseCurrency: ['problem.finance.legalEntityBaseCurrencyMismatch'] },
          remedies: [{ id: 'correct_field' }],
        },
      );
    if (message === 'Legal-entity revision effective date must follow the current tail')
      return problem(
        409,
        'problem.finance.legalEntityRevisionDateBeforeTail',
        {},
        'The new legal entity revision must start after the current revision starts and outside any recorded end date. Review the current effective dates before saving.',
        {
          code: 'FINANCE_LEGAL_ENTITY_REVISION_DATE_BEFORE_TAIL',
          fieldErrors: { effectiveFrom: ['problem.finance.legalEntityRevisionDateBeforeTail'] },
          remedies: [{ id: 'configure_project_issuer', projectId: context.projectId }],
        },
      );
  }
  if (
    ['assignProjectLegalEntity', 'replaceUnusedProjectIssuingAuthority'].includes(
      context.actionName ?? '',
    )
  ) {
    if (message === 'Legal-entity revision scope mismatch')
      return problem(
        403,
        'problem.finance.projectIssuerRevisionScopeMismatch',
        {},
        'The selected issuing legal entity revision is outside this workspace. Choose a revision available to this project.',
        {
          code: 'FINANCE_PROJECT_ISSUER_REVISION_SCOPE_MISMATCH',
          fieldErrors: {
            legalEntityRevisionId: ['problem.finance.projectIssuerRevisionScopeMismatch'],
          },
          remedies: [{ id: 'configure_project_issuer', projectId: context.projectId }],
        },
      );
    if (message === 'Legal-entity revision not found')
      return problem(
        409,
        'problem.finance.projectIssuerRevisionUnavailable',
        {},
        'The selected issuing legal entity revision is no longer available. Review current revisions before assigning project authority.',
        {
          code: 'FINANCE_PROJECT_ISSUER_REVISION_UNAVAILABLE',
          fieldErrors: {
            legalEntityRevisionId: ['problem.finance.projectIssuerRevisionUnavailable'],
          },
          remedies: [{ id: 'configure_project_issuer', projectId: context.projectId }],
        },
      );
    if (message === 'Assignment starts before the legal-entity revision')
      return problem(
        409,
        'problem.finance.projectIssuerStartsBeforeRevision',
        {},
        'The project issuing authority cannot start before the selected legal entity revision becomes effective. Choose a later start date.',
        {
          code: 'FINANCE_PROJECT_ISSUER_STARTS_BEFORE_REVISION',
          fieldErrors: { effectiveFrom: ['problem.finance.projectIssuerStartsBeforeRevision'] },
          remedies: [{ id: 'configure_project_issuer', projectId: context.projectId }],
        },
      );
    if (message === 'Assignment must end within the legal-entity revision interval')
      return problem(
        409,
        'problem.finance.projectIssuerEndsOutsideRevision',
        {},
        'The project issuing authority must end within the selected legal entity revision period. Enter an end date no later than the revision end.',
        {
          code: 'FINANCE_PROJECT_ISSUER_ENDS_OUTSIDE_REVISION',
          fieldErrors: { effectiveTo: ['problem.finance.projectIssuerEndsOutsideRevision'] },
          remedies: [{ id: 'configure_project_issuer', projectId: context.projectId }],
        },
      );
  }
  if (context.actionName === 'replaceUnusedProjectIssuingAuthority') {
    if (message.includes('is not idempotent') || message.includes('are not idempotent'))
      return problem(
        409,
        'problem.finance.issuerReplacementRetryConflict',
        {},
        'This replacement request was already used with different details. Review the current assignment history.',
        {
          code: 'FINANCE_ISSUER_REPLACEMENT_RETRY_CONFLICT',
          remedies: [{ id: 'configure_project_issuer', projectId: context.projectId }],
        },
      );
    const replacementProblems: Record<string, readonly [string, string, string]> = {
      'Project issuing authority has persisted financial use': [
        'problem.finance.issuerReplacementUsed',
        'FINANCE_ISSUER_REPLACEMENT_USED',
        'This project has persisted financial records. Its issuing authority cannot be replaced. Configure authority for a future interval instead.',
      ],
      'Original issuing authority was already replaced': [
        'problem.finance.issuerReplacementChanged',
        'FINANCE_ISSUER_REPLACEMENT_CHANGED',
        'This issuing authority was already replaced. Review the current assignment history.',
      ],
      'Original issuing authority is unavailable': [
        'problem.finance.issuerReplacementChanged',
        'FINANCE_ISSUER_REPLACEMENT_CHANGED',
        'This issuing authority is unavailable. Review the current assignment history.',
      ],
      'Choose a different issuing authority revision': [
        'problem.finance.issuerReplacementSameRevision',
        'FINANCE_ISSUER_REPLACEMENT_SAME_REVISION',
        'Choose a different reviewed revision to correct this issuing authority.',
      ],
    };
    const replacementProblem = replacementProblems[message];
    if (replacementProblem)
      return problem(409, replacementProblem[0] as `problem.${string}`, {}, replacementProblem[2], {
        code: replacementProblem[1],
        remedies: [{ id: 'configure_project_issuer', projectId: context.projectId }],
      });
  }
  const ruleMutation = {
    supersedeCompensationRule: {
      prefix: 'FINANCE_COMPENSATION_RULE',
      reference: 'Compensation rule',
      scope: [
        'A successor must keep the same worker',
        'A successor must keep the same project scope',
      ],
      successorDate: 'Successor effective date must follow the existing rule',
      closed: 'Compensation rule is already closed for that date',
      changed: 'Compensation rule changed while superseding',
      inactive: '',
      remedy: 'review_compensation_rules',
    },
    deactivateCompensationRule: {
      prefix: 'FINANCE_COMPENSATION_RULE',
      reference: 'Compensation rule',
      scope: [],
      successorDate: '',
      closed: '',
      changed: '',
      inactive: 'Compensation rule is already inactive',
      remedy: 'review_compensation_rules',
    },
    supersedeClientLaborRate: {
      prefix: 'FINANCE_CLIENT_LABOR_RATE',
      reference: 'Client labor rate',
      scope: ['A successor must keep the same client-rate scope'],
      successorDate: 'Successor effective date must follow the existing rate',
      closed: 'Client labor rate is already closed for that date',
      changed: 'Client labor rate changed while superseding',
      inactive: '',
      remedy: 'review_client_labor_rates',
    },
    deactivateClientLaborRate: {
      prefix: 'FINANCE_CLIENT_LABOR_RATE',
      reference: 'Client labor rate',
      scope: [],
      successorDate: '',
      closed: '',
      changed: '',
      inactive: 'Client labor rate is already inactive',
      remedy: 'review_client_labor_rates',
    },
    supersedeInternalCostRule: {
      prefix: 'FINANCE_INTERNAL_COST_RULE',
      reference: 'Internal cost rule',
      scope: ['A successor must keep the same internal-cost scope'],
      successorDate: 'Successor effective date must follow the existing rule',
      closed: 'Internal cost rule is already closed for that date',
      changed: 'Internal cost rule changed while superseding',
      inactive: '',
      remedy: 'review_internal_cost_rules',
    },
    deactivateInternalCostRule: {
      prefix: 'FINANCE_INTERNAL_COST_RULE',
      reference: 'Internal cost rule',
      scope: [],
      successorDate: '',
      closed: '',
      changed: '',
      inactive: 'Internal cost rule is already inactive',
      remedy: 'review_internal_cost_rules',
    },
  } as const;
  const mutation = ruleMutation[context.actionName as keyof typeof ruleMutation];
  if (mutation) {
    const remedy = [{ id: mutation.remedy }];
    if (message === `${mutation.reference} not found`)
      return problem(
        409,
        'problem.finance.ruleReferenceUnavailable',
        {},
        'The selected Finance rule is no longer available. Review current rules before changing it.',
        { code: `${mutation.prefix}_UNAVAILABLE`, remedies: remedy },
      );
    if ((mutation.scope as readonly string[]).includes(message))
      return problem(
        409,
        'problem.finance.ruleSuccessorScopeChanged',
        {},
        'A replacement rule must keep the same worker and project scope. Review the current rule and create a separate rule for a different scope.',
        { code: `${mutation.prefix}_SUCCESSOR_SCOPE_CHANGED`, remedies: remedy },
      );
    if (mutation.successorDate && message === mutation.successorDate)
      return problem(
        409,
        'problem.finance.ruleSuccessorDateInvalid',
        {},
        'The replacement must start after the current rule starts. Review its effective date and choose a later date.',
        {
          code: `${mutation.prefix}_SUCCESSOR_DATE_INVALID`,
          fieldErrors: { effectiveFrom: ['problem.finance.ruleSuccessorDateInvalid'] },
          remedies: remedy,
        },
      );
    if (mutation.closed && message === mutation.closed)
      return problem(
        409,
        'problem.finance.ruleClosedForSuccessorDate',
        {},
        'The current rule already ended before the proposed replacement date. Review the existing effective period before creating a new rule.',
        {
          code: `${mutation.prefix}_CLOSED_FOR_SUCCESSOR_DATE`,
          fieldErrors: { effectiveFrom: ['problem.finance.ruleClosedForSuccessorDate'] },
          remedies: remedy,
        },
      );
    if (mutation.changed && message === mutation.changed)
      return problem(
        409,
        'problem.finance.ruleChangedWhileSuperseding',
        {},
        'This Finance rule changed while the form was open. Review its current terms before saving a replacement.',
        { code: `${mutation.prefix}_CHANGED`, remedies: remedy },
      );
    if (mutation.inactive && message === mutation.inactive)
      return problem(
        409,
        'problem.finance.ruleAlreadyInactive',
        {},
        'This Finance rule has already been deactivated. Review current rules before taking another action.',
        { code: `${mutation.prefix}_ALREADY_INACTIVE`, remedies: remedy },
      );
    if (
      context.actionName?.startsWith('deactivate') &&
      message === 'End date must follow the effective date'
    )
      return problem(
        409,
        'problem.finance.ruleDeactivationBeforeStart',
        {},
        'This rule starts after today and cannot be deactivated with an earlier end date. Review its effective period first.',
        { code: `${mutation.prefix}_DEACTIVATION_BEFORE_START`, remedies: remedy },
      );
  }
  if (
    context.actionName === 'createProjectCommercialPolicy' &&
    message === 'Commercial policy effective date must follow the current policy tail'
  )
    return problem(
      409,
      'problem.finance.commercialPolicyDateBeforeTail',
      {},
      'The new commercial policy must start after the current policy starts. Review the current policy date and choose a later date.',
      {
        code: 'FINANCE_COMMERCIAL_POLICY_DATE_BEFORE_TAIL',
        fieldErrors: { effectiveFrom: ['problem.finance.commercialPolicyDateBeforeTail'] },
        remedies: [{ id: 'review_project_commercial_policy', projectId: context.projectId }],
      },
    );
  if (
    context.actionName === 'createProjectCommercialPolicy' &&
    message === 'Commercial policy changed or overlaps the current tail'
  )
    return problem(
      409,
      'problem.finance.commercialPolicyChanged',
      {},
      'The project commercial policy changed while this form was open. Review its current dates before saving a new version.',
      {
        code: 'FINANCE_COMMERCIAL_POLICY_CHANGED',
        remedies: [{ id: 'review_project_commercial_policy', projectId: context.projectId }],
      },
    );
  if (context.actionName === 'setCompensationSettlementExpectedPaymentOn') {
    if (error instanceof V3ValidationError && message === 'Compensation settlement not found')
      return problem(
        409,
        'problem.finance.settlementPlanningRecordUnavailable',
        {},
        'This worker compensation settlement is no longer available. Review current settlements before changing its expected payment date.',
        {
          code: 'FINANCE_SETTLEMENT_PLANNING_RECORD_UNAVAILABLE',
          recordId: context.recordId,
          remedies: [{ id: 'review_worker_compensation_settlements' }],
        },
      );
    if (
      error instanceof V3ConflictError &&
      message === 'Compensation settlement changed before planning update'
    ) {
      const current = (error as V3ConflictError & { currentExpectedPaymentOn?: unknown })
        .currentExpectedPaymentOn;
      const currentExpectedPaymentOn =
        current === null || (typeof current === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(current))
          ? current
          : undefined;
      return problem(
        409,
        'problem.finance.settlementPlanningChanged',
        currentExpectedPaymentOn === undefined
          ? {}
          : { currentExpectedPaymentOn: currentExpectedPaymentOn ?? '' },
        'This worker compensation settlement changed while its expected payment date was being saved. Review the current settlement before trying again.',
        {
          code: 'FINANCE_SETTLEMENT_PLANNING_CHANGED',
          recordId: context.recordId,
          ...(currentExpectedPaymentOn === undefined ? {} : { currentExpectedPaymentOn }),
          remedies: [{ id: 'review_worker_compensation_settlements' }],
        },
      );
    }
  }
  if (context.actionName === 'settleCompensation') {
    if (error instanceof V3ValidationError && message === 'Period end must follow start')
      return problem(
        400,
        'problem.finance.settlementPeriodOrderInvalid',
        {},
        'The settlement period end must be on or after its start date. Review both dates before settling.',
        {
          code: 'FINANCE_SETTLEMENT_PERIOD_ORDER_INVALID',
          fieldErrors: {
            periodStart: ['problem.finance.settlementPeriodOrderInvalid'],
            periodEnd: ['problem.finance.settlementPeriodOrderInvalid'],
          },
          remedies: [{ id: 'correct_field' }],
        },
      );
    if (
      error instanceof V3ValidationError &&
      message === 'Active worker or project manager account required'
    )
      return problem(
        409,
        'problem.finance.settlementWorkerUnavailable',
        {},
        'The selected worker or project manager is no longer active. Ask the project owner to review the person before settling.',
        {
          code: 'FINANCE_SETTLEMENT_WORKER_UNAVAILABLE',
          fieldErrors: { workerId: ['problem.finance.settlementWorkerUnavailable'] },
          remedies: [{ id: 'contact_project_owner' }],
        },
      );
    if (
      error instanceof V3ValidationError &&
      message === 'Worker is not assigned to the project for the effective period'
    )
      return problem(
        409,
        'problem.finance.settlementAssignmentUnavailable',
        {},
        'The worker has no active assignment covering this project and settlement period. Ask the project owner to review the assignment dates.',
        {
          code: 'FINANCE_SETTLEMENT_ASSIGNMENT_UNAVAILABLE',
          fieldErrors: { workerId: ['problem.finance.settlementAssignmentUnavailable'] },
          remedies: [{ id: 'contact_project_owner' }],
        },
      );
    if (error instanceof V3ConflictError) {
      const configuration = message.match(/^Commercial terms require configuration: ([a-z_]+)$/u);
      const code = configuration?.[1];
      if (code === 'ambiguous_assignment')
        return problem(
          409,
          'problem.finance.settlementAssignmentTermsBlocked',
          {},
          'The project assignment has conflicting commercial terms. Ask the project owner to review its active assignments before settling.',
          {
            code: 'FINANCE_SETTLEMENT_ASSIGNMENT_TERMS_BLOCKED',
            remedies: [{ id: 'contact_project_owner' }],
          },
        );
      if (
        code &&
        [
          'ambiguous_compensation_rule',
          'unavailable_compensation_override',
          'unavailable_assignment_compensation_rule',
        ].includes(code)
      )
        return problem(
          409,
          'problem.finance.settlementCompensationTermsBlocked',
          {},
          'The worker compensation configuration is ambiguous or unavailable for approved time. Review the effective compensation rules and assignment references before settling.',
          {
            code: 'FINANCE_SETTLEMENT_COMPENSATION_TERMS_BLOCKED',
            remedies: [{ id: 'review_compensation_rules' }],
          },
        );
      if (
        code &&
        [
          'ambiguous_client_rate',
          'unavailable_client_override',
          'unavailable_assignment_client_rule',
        ].includes(code)
      )
        return problem(
          409,
          'problem.finance.settlementClientTermsBlocked',
          {},
          'The customer labor rate configuration is ambiguous or unavailable for approved time. Review effective customer rates and assignment references before settling.',
          {
            code: 'FINANCE_SETTLEMENT_CLIENT_TERMS_BLOCKED',
            remedies: [{ id: 'review_client_labor_rates' }],
          },
        );
    }
    if (/^Active time correction [^\s]+ blocks compensation settlement$/u.test(message))
      return problem(
        409,
        'problem.finance.settlementTimeCorrectionOpen',
        {},
        'A time correction is still open for this period. Review the corrected time before settling worker compensation.',
        {
          code: 'FINANCE_SETTLEMENT_TIME_CORRECTION_OPEN',
          remedies: [{ id: 'review_approved_time' }],
        },
      );
    if (/^Missing compensation rule for [^\s]+$/u.test(message))
      return problem(
        409,
        'problem.finance.settlementCompensationRuleMissing',
        {},
        'Approved time in this period has no effective worker compensation rule. Configure the worker pay rule before settling.',
        {
          code: 'FINANCE_SETTLEMENT_COMPENSATION_RULE_MISSING',
          remedies: [{ id: 'review_compensation_rules' }],
        },
      );
    if (/^Compensation currency mismatch for [^\s]+$/u.test(message))
      return problem(
        409,
        'problem.finance.settlementCompensationCurrencyMismatch',
        {},
        'A worker compensation rule has a different currency from this project. Review the effective pay rule before settling.',
        {
          code: 'FINANCE_SETTLEMENT_COMPENSATION_CURRENCY_MISMATCH',
          remedies: [{ id: 'review_compensation_rules' }],
        },
      );
    if (
      /^Client labor rate is required before percentage compensation can settle for [^\s]+$/u.test(
        message,
      )
    )
      return problem(
        409,
        'problem.finance.settlementClientRateMissing',
        {},
        'Percentage-based worker compensation needs an effective customer labor rate for approved billable time. Review customer rates before settling worker pay.',
        {
          code: 'FINANCE_SETTLEMENT_CLIENT_RATE_MISSING',
          remedies: [{ id: 'review_client_labor_rates' }],
        },
      );
    if (message === 'No approved time is available to settle')
      return problem(
        409,
        'problem.finance.settlementNoApprovedTime',
        {},
        'No approved time is available for this worker, project, and period. Review time approvals and the selected dates before settling.',
        {
          code: 'FINANCE_SETTLEMENT_NO_APPROVED_TIME',
          remedies: [{ id: 'review_approved_time' }],
        },
      );
    if (/^Settlement [^\s]+ is already settled with different final truth$/u.test(message))
      return problem(
        409,
        'problem.finance.settlementFinalTruthChanged',
        {},
        'This worker compensation settlement was already finalized with different source amounts or terms. Review the recorded settlement before taking corrective action.',
        {
          code: 'FINANCE_SETTLEMENT_FINAL_TRUTH_CHANGED',
          remedies: [{ id: 'review_worker_compensation_settlements' }],
        },
      );
  }
  if (context.actionName === 'recordCompensationPayment') {
    if (message === 'Compensation settlement not found')
      return problem(
        409,
        'problem.finance.paymentSettlementUnavailable',
        {},
        'This worker compensation settlement is no longer available. Review current settlements before recording a payment.',
        {
          code: 'FINANCE_PAYMENT_SETTLEMENT_UNAVAILABLE',
          remedies: [{ id: 'review_worker_compensation_settlements' }],
        },
      );
    if (message === 'Person payee must be the settlement worker')
      return problem(
        400,
        'problem.finance.paymentPersonPayeeMismatch',
        {},
        'The person payee must be the worker named on this compensation settlement. Review the settlement and choose its worker.',
        {
          code: 'FINANCE_PAYMENT_PERSON_PAYEE_MISMATCH',
          fieldErrors: { payeeSelection: ['problem.finance.paymentPersonPayeeMismatch'] },
          remedies: [{ id: 'review_worker_compensation_settlements' }],
        },
      );
    if (message === 'Supplier payee must be linked to the settlement worker')
      return problem(
        400,
        'problem.finance.paymentSupplierPayeeMismatch',
        {},
        'The supplier payee is not linked to the worker named on this compensation settlement. Review the worker and choose a linked supplier.',
        {
          code: 'FINANCE_PAYMENT_SUPPLIER_PAYEE_MISMATCH',
          fieldErrors: { payeeSelection: ['problem.finance.paymentSupplierPayeeMismatch'] },
          remedies: [{ id: 'review_worker_compensation_settlements' }],
        },
      );
  }
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
        ...(context.assignmentCurrent ? { assignmentCurrent: context.assignmentCurrent } : {}),
        remedies: [
          {
            id: 'review_assignment_policy',
            recordId: context.recordId,
            projectId: context.assignmentCurrent?.projectId ?? context.projectId,
          },
        ],
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
        ...(context.assignmentCurrent ? { assignmentCurrent: context.assignmentCurrent } : {}),
        remedies: [
          {
            id: 'review_assignment_policy',
            recordId: context.recordId,
            projectId: context.assignmentCurrent?.projectId ?? context.projectId,
          },
        ],
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
        ...(context.assignmentCurrent ? { assignmentCurrent: context.assignmentCurrent } : {}),
        remedies: [
          {
            id: 'review_assignment_policy',
            recordId: context.recordId,
            projectId: context.assignmentCurrent?.projectId ?? context.projectId,
          },
        ],
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
  if (message.startsWith('Reimbursement effective date must be'))
    return problem(
      400,
      'problem.finance.reimbursementDateInvalid',
      {},
      'Choose a valid reimbursement effective date.',
      {
        code: 'REIMBURSEMENT_EFFECTIVE_DATE_INVALID',
        fieldErrors: { effectiveFrom: ['problem.finance.reimbursementDateInvalid'] },
      },
    );
  if (message === 'Reimbursement date must fall within the assignment')
    return problem(
      400,
      'problem.finance.reimbursementOutsideAssignment',
      {},
      'Choose a reimbursement effective date within this assignment.',
      {
        code: 'REIMBURSEMENT_DATE_OUTSIDE_ASSIGNMENT',
        fieldErrors: { effectiveFrom: ['problem.finance.reimbursementOutsideAssignment'] },
      },
    );
  if (
    message ===
    'A reimbursement preference already starts on this date. Choose another effective date.'
  )
    return problem(
      409,
      'problem.finance.reimbursementDateExists',
      {},
      'A reimbursement preference already starts on this date. Choose another effective date.',
      {
        code: 'REIMBURSEMENT_DATE_EXISTS',
        fieldErrors: { effectiveFrom: ['problem.finance.reimbursementDateExists'] },
        remedies: review,
      },
    );
  if (
    message ===
    'Reimbursement date overlaps invoice, finalized settlement, or paid expense history. Choose a later effective date.'
  )
    return problem(
      409,
      'problem.finance.reimbursementHistoryLocked',
      {},
      'This date overlaps invoice, finalized settlement, or paid expense history. Choose a later effective date.',
      {
        code: 'REIMBURSEMENT_HISTORY_LOCKED',
        fieldErrors: { effectiveFrom: ['problem.finance.reimbursementHistoryLocked'] },
        remedies: review,
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
      {
        code: 'WORKER_REIMBURSEMENT_POLICY_CHANGED',
        remedies:
          context.actionName === 'setWorkerReimbursementOverride' && !context.projectId
            ? [{ id: 'contact_finance_owner' }]
            : review,
      },
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
    if (
      ['assignProjectLegalEntity', 'replaceUnusedProjectIssuingAuthority'].includes(
        context.actionName ?? '',
      )
    )
      return problem(
        409,
        'problem.finance.projectIssuerCurrencyMismatch',
        {},
        'Choose an issuing authority revision whose currency matches the project currency.',
        {
          code: 'PROJECT_ISSUING_CURRENCY_MISMATCH',
          fieldErrors: { legalEntityRevisionId: ['problem.finance.projectIssuerCurrencyMismatch'] },
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
  if (message === 'Payment reversal idempotency key was already used')
    return problem(
      409,
      'problem.finance.paymentReversalRetryConflict',
      {},
      'This reversal request was already used for a different payment, date, or reason. Review worker payments before trying again.',
      {
        code: 'WORKER_PAYMENT_REVERSAL_RETRY_CONFLICT',
        remedies: [{ id: 'review_worker_payments' }],
      },
    );
  if (message === 'Compensation payment is already reversed')
    return problem(
      409,
      'problem.finance.paymentAlreadyReversed',
      {},
      'This worker payment was already reversed. Review worker payments before taking another action.',
      { code: 'WORKER_PAYMENT_ALREADY_REVERSED', remedies: [{ id: 'review_worker_payments' }] },
    );
  if (message === 'Original compensation payment not found')
    return problem(
      404,
      'problem.finance.paymentReversalOriginalMissing',
      {},
      'The original worker payment is no longer available. Review the current worker payments.',
      {
        code: 'WORKER_PAYMENT_REVERSAL_ORIGINAL_MISSING',
        remedies: [{ id: 'review_worker_payments' }],
      },
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
  effectiveFrom: z.iso.date(),
  reason: z.string().trim().min(3).max(2000),
});
const workerReimbursementForm = z.object({
  projectMemberId: z.string().trim().min(1).max(200),
  expectedVersion: z.coerce.number().int().positive(),
  mode: reimbursementModeForm,
  effectiveFrom: z.iso.date(),
  reason: z.string().trim().min(3).max(2000),
});

const rawFinanceActions = {
  setProjectReimbursementDefault: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = await formObject(request);
    const parsed = projectReimbursementForm.safeParse(values);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.projectReimbursement',
        {},
        'Check project reimbursement fields',
        {
          fields: {
            ...parsed.error.flatten().fieldErrors,
            ...(parsed.error.flatten().fieldErrors.effectiveFrom
              ? {
                  effectiveFrom: ['problem.finance.reimbursementDateInvalid'],
                }
              : {}),
          },
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
      return financeFailure(error, {
        projectId: parsed.data.projectId,
        values,
        actionName: 'setProjectReimbursementDefault',
      });
    } finally {
      context.sqlite.close();
    }
  },
  setWorkerReimbursementOverride: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = await formObject(request);
    const parsed = workerReimbursementForm.safeParse(values);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.workerReimbursement',
        {},
        'Check worker reimbursement fields',
        {
          fields: {
            ...parsed.error.flatten().fieldErrors,
            ...(parsed.error.flatten().fieldErrors.effectiveFrom
              ? {
                  effectiveFrom: ['problem.finance.reimbursementDateInvalid'],
                }
              : {}),
          },
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
      // A stale assignment may no longer appear in the active person list.
      // Resolve its owning project from the record itself before offering a link.
      const assignmentProject =
        error instanceof ConflictError || error instanceof ValidationError
          ? (context.sqlite
              .prepare('SELECT project_id FROM project_member WHERE id=?')
              .get(parsed.data.projectMemberId) as { project_id: string } | undefined)
          : undefined;
      return financeFailure(error, {
        recordId: parsed.data.projectMemberId,
        projectId: assignmentProject?.project_id,
        values,
        actionName: 'setWorkerReimbursementOverride',
      });
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
      const assignmentCurrent =
        error instanceof Error &&
        [
          'Active project assignment required',
          'Policy dates must fall within the assignment',
          'Bounded assignment requires a policy end date',
        ].includes(error.message)
          ? policyAssignmentCurrent(context, parsed.data.projectMemberId)
          : undefined;
      return financeFailure(error, {
        recordId: parsed.data.projectMemberId,
        projectId: assignmentCurrent?.projectId,
        assignmentCurrent,
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
    const values = safeFinanceValues(await formObject(request));
    const parsed = assignmentCommercialFallbackForm.safeParse(values);
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
      return financeFailure(error, {
        recordId: parsed.data.projectMemberId,
        projectId: commercialAssignmentProjectId(context, parsed.data.projectMemberId, error),
        values,
        actionName: 'setAssignmentCommercialFallback',
      });
    } finally {
      context.sqlite.close();
    }
  },
  setAssignmentCommercialRuleReferences: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = safeFinanceValues(await formObject(request));
    const parsed = assignmentCommercialReferencesForm.safeParse(values);
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
      return financeFailure(error, {
        recordId: parsed.data.projectMemberId,
        projectId: commercialAssignmentProjectId(context, parsed.data.projectMemberId, error),
        values,
        actionName: 'setAssignmentCommercialRuleReferences',
      });
    } finally {
      context.sqlite.close();
    }
  },
  createCanonicalLegalEntityRevision: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = safeFinanceValues(await formObject(request));
    const parsed = canonicalLegalEntityRevisionForm.safeParse(values);
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
      return financeFailure(error, {
        values,
        actionName: 'createCanonicalLegalEntityRevision',
      });
    } finally {
      context.sqlite.close();
    }
  },
  assignProjectLegalEntity: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const context = openPortalRepository(locals);
    let values: Record<string, string> = {};
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
      values = safeFinanceValues(await formObject(request));
      const parsed = projectLegalEntityAssignmentInputSchema.safeParse(values);
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
      return financeFailure(error, {
        projectId: values.projectId,
        values,
        actionName: 'assignProjectLegalEntity',
      });
    } finally {
      context.sqlite.close();
    }
  },
  replaceUnusedProjectIssuingAuthority: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const context = openPortalRepository(locals);
    let values: Record<string, string> = {};
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
      values = safeFinanceValues(await formObject(request));
      const parsed = unusedProjectIssuingAuthorityReplacementInputSchema.safeParse(values);
      if (!parsed.success)
        return actionFail(
          400,
          'action.validation.unusedIssuerReplacement',
          {},
          'Invalid issuing authority replacement',
          {
            fields: parsed.error.flatten().fieldErrors,
          },
        );
      const result = context.v3.replaceUnusedProjectIssuingAuthority(
        context.principal,
        parsed.data,
      );
      return actionSuccess(
        'action.finance.unusedIssuerReplaced',
        { idempotent: result.idempotent },
        'Unused issuing authority replaced',
      );
    } catch (error) {
      return financeFailure(error, { values, actionName: 'replaceUnusedProjectIssuingAuthority' });
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
      let projectId: string | undefined;
      try {
        const expense = context.sqlite
          .prepare('SELECT project_id FROM expense WHERE id=?')
          .get(parsed.data.expenseId) as { project_id: string } | undefined;
        projectId = expense?.project_id;
      } catch (lookupError) {
        console.error('Finance classification problem context lookup failed', lookupError);
      }
      return financeFailure(error, {
        recordId: parsed.data.expenseId,
        projectId,
        values: parsed.data,
        actionName: 'classifyExpenseCommercially',
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
      return financeFailure(error, {
        recordId: parsed.data.expenseId,
        values: parsed.data,
        actionName: 'setExpensePlanningDates',
      });
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
    const values = safeFinanceValues(await formObject(request));
    const parsed = compensationSettlementPlanningInputSchema.safeParse(values);
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.compensationSettlementPlanning',
        {},
        'Invalid compensation settlement planning date',
        { fields: parsed.error.flatten().fieldErrors },
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      context.v3.setCompensationSettlementExpectedPaymentOn(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.compensationExpectedPaymentSaved',
        {},
        'Expected worker payment date saved',
      );
    } catch (error) {
      return financeFailure(error, {
        recordId: parsed.data.settlementId,
        values,
        actionName: 'setCompensationSettlementExpectedPaymentOn',
      });
    } finally {
      context?.sqlite.close();
    }
  },
  createProjectCommercialPolicy: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = safeFinanceValues(await formObject(request));
    const parsed = projectCommercialPolicyInputSchema.safeParse(values);
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
      return financeFailure(error, {
        projectId: parsed.data.projectId,
        values,
        actionName: 'createProjectCommercialPolicy',
      });
    } finally {
      context.sqlite.close();
    }
  },
  createCompensationRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = safeFinanceValues(await formObject(request));
    const parsed = compensationRuleInputSchema.safeParse(values);
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
      return financeFailure(error, {
        projectId: parsed.data.projectId,
        values,
        actionName: 'createCompensationRule',
      });
    } finally {
      context.sqlite.close();
    }
  },
  supersedeCompensationRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeFinanceValues(object);
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
      return financeFailure(error, {
        projectId: parsed.data.projectId,
        values,
        actionName: 'supersedeCompensationRule',
      });
    } finally {
      context.sqlite.close();
    }
  },
  deactivateCompensationRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const values = safeFinanceValues(Object.fromEntries(formData));
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
      return financeFailure(error, { values, actionName: 'deactivateCompensationRule' });
    } finally {
      context.sqlite.close();
    }
  },
  settleCompensation: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = safeFinanceValues(await formObject(request));
    const parsed = compensationSettlementInputSchema.safeParse(values);
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
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      const result = context.v3.settleCompensation(context.principal, parsed.data);
      return actionSuccess(
        'action.finance.compensationSettled',
        { count: result.length },
        `Settled ${result.length} compensation rule(s)`,
      );
    } catch (error) {
      return financeFailure(error, {
        projectId: parsed.data.projectId,
        values,
        actionName: 'settleCompensation',
      });
    } finally {
      context?.sqlite.close();
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
    let context: ReturnType<typeof openPortalRepository>;
    try {
      context = openPortalRepository(locals);
    } catch (error) {
      return financeFailure(error, { actionName: 'reverseCompensationPayment' });
    }
    let values: Record<string, unknown> = {};
    try {
      // Authenticate against the current account and live session before a
      // malformed direct POST can receive field-level Finance information.
      context.v3.assertCompensationPaymentReversalAccess(context.principal);
      const object = await formObject(request);
      values = { ...object };
      object.idempotencyKey = String(object.idempotencyKey || randomUUID());
      const parsed = compensationPaymentReversalInputSchema.safeParse(object);
      if (!parsed.success)
        return actionFail(
          400,
          'action.validation.compensationPaymentReversal',
          {},
          'Check the payment reversal fields',
          {
            fields: parsed.error.flatten().fieldErrors,
            values,
            actionName: 'reverseCompensationPayment',
          },
        );
      const result = context.v3.reverseCompensationPayment(context.principal, parsed.data);
      return actionSuccess(
        result.idempotent
          ? 'action.finance.compensationPaymentReversalAlreadyRecorded'
          : 'action.finance.compensationPaymentReversed',
        { id: result.id, idempotent: result.idempotent },
        result.idempotent
          ? 'This worker payment reversal was already recorded. Review worker payments to confirm it.'
          : 'Compensation payment reversed with an audit event',
      );
    } catch (error) {
      return financeFailure(error, {
        values,
        actionName: 'reverseCompensationPayment',
      });
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
    const values = safeFinanceValues(object);
    values.eligibleForPercentage = object.eligibleForPercentage === 'on' ? 'on' : 'off';
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
      return financeFailure(error, {
        projectId: parsed.data.projectId,
        values,
        actionName: 'createClientLaborRate',
      });
    } finally {
      context.sqlite.close();
    }
  },
  supersedeClientLaborRate: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeFinanceValues(object);
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
      return financeFailure(error, {
        projectId: parsed.data.projectId,
        values,
        actionName: 'supersedeClientLaborRate',
      });
    } finally {
      context.sqlite.close();
    }
  },
  deactivateClientLaborRate: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const values = safeFinanceValues(Object.fromEntries(formData));
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
      return financeFailure(error, { values, actionName: 'deactivateClientLaborRate' });
    } finally {
      context.sqlite.close();
    }
  },
  createInternalCostRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const values = safeFinanceValues(await formObject(request));
    const parsed = internalCostRuleInputSchema.safeParse(values);
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
      return financeFailure(error, {
        projectId: parsed.data.projectId,
        values,
        actionName: 'createInternalCostRule',
      });
    } finally {
      context.sqlite.close();
    }
  },
  supersedeInternalCostRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    const values = safeFinanceValues(object);
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
      return financeFailure(error, {
        projectId: parsed.data.projectId,
        values,
        actionName: 'supersedeInternalCostRule',
      });
    } finally {
      context.sqlite.close();
    }
  },
  deactivateInternalCostRule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'finance')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const values = safeFinanceValues(Object.fromEntries(formData));
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
      return financeFailure(error, { values, actionName: 'deactivateInternalCostRule' });
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
      // The reversal action checks current Finance authority before reading
      // its request body. It supplies retained values once that check passes.
      const values =
        actionName === 'reverseCompensationPayment'
          ? {}
          : safeFinanceValues(await formObject(event.request.clone()));
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
