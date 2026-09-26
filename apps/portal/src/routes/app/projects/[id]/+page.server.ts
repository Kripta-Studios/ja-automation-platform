import { error, isActionFailure, redirect } from '@sveltejs/kit';
import { lastCompletePeriodForCadence, type BillingCadence } from '@ja/billing-engine';
import { invoicePeriodSchema } from '@ja/schemas';
import { newId } from '@ja/domain';
import { z } from 'zod';
import {
  AccessDeniedError,
  ConflictError,
  ProjectBillingSetupRepository,
  ValidationError,
  V3ValidationError,
  V3ConflictError,
  V3AccessDeniedError,
  projectCalendarDate,
} from '@ja/database';
import { actionFail, actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import { createInvoiceDraftResolvingPeriod } from '$lib/server/invoice-draft';
import { defaultLookbackPeriod } from '$lib/server/iso-date';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { PageServerLoad, Actions } from './$types';

function currentPeriod(): { periodStart: string; periodEnd: string } {
  return defaultLookbackPeriod();
}

function cadencePeriod(rule: Readonly<Record<string, unknown>> | undefined): {
  periodStart: string;
  periodEnd: string;
} {
  const fallback = currentPeriod();
  if (!rule) return fallback;
  const cadence = String(rule.cadence_type ?? rule.cadenceType ?? '') as BillingCadence;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const aligned = lastCompletePeriodForCadence(cadence, today, {
      anchorDate: String(rule.anchor_date ?? rule.anchorDate ?? '') || undefined,
      monthlyCutoffDay:
        rule.monthly_cutoff_day == null && rule.monthlyCutoffDay == null
          ? undefined
          : Number(rule.monthly_cutoff_day ?? rule.monthlyCutoffDay),
    });
    if (aligned) return { periodStart: aligned.start, periodEnd: aligned.end };
  } catch {
    // Cadence options that require an anchor fall back to the operational lookback.
  }
  return fallback;
}

function resolvePeriod(url: URL): { periodStart: string; periodEnd: string } {
  const fallback = currentPeriod();
  const periodSchema = invoicePeriodSchema.pick({ periodStart: true, periodEnd: true });
  const parsed = periodSchema.safeParse({
    periodStart: url.searchParams.get('periodStart') ?? fallback.periodStart,
    periodEnd: url.searchParams.get('periodEnd') ?? fallback.periodEnd,
  });
  if (!parsed.success || parsed.data.periodEnd < parsed.data.periodStart)
    error(400, 'Invalid finance period');
  return parsed.data;
}

export const load: PageServerLoad = ({ locals, params, url }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const { periodStart, periodEnd } = resolvePeriod(url);
  const context = openPortalRepository(locals);
  try {
    const overview = context.repository.projectOverview(context.principal, params.id);
    const financeVisible =
      context.principal.role === 'owner_admin' ||
      context.principal.role === 'finance_admin' ||
      context.principal.role === 'auditor_read_only';
    const billingRules = financeVisible
      ? context.repository
          .listBillingRules(context.principal)
          .filter((rule) => String(rule.project_id) === params.id)
      : [];
    const latestLaborRule = [...billingRules]
      .filter((rule) => rule.stream_type === 'labor' && Number(rule.enabled) === 1)
      .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
    const latestExpenseRule = [...billingRules]
      .filter((rule) => rule.stream_type === 'expense' && Number(rule.enabled) === 1)
      .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
    const billingSetup = financeVisible
      ? new ProjectBillingSetupRepository(context.sqlite, context.repository)
      : null;
    const projectRow = overview.project as { client_id?: string };
    const invoiceDraftPeriod = cadencePeriod(
      (latestLaborRule ?? billingRules[0]) as Record<string, unknown> | undefined,
    );
    return {
      user: locals.user,
      periodStart,
      periodEnd,
      invoiceDraftStart: invoiceDraftPeriod.periodStart,
      invoiceDraftEnd: invoiceDraftPeriod.periodEnd,
      workers:
        locals.user.role === 'owner_admin'
          ? context.repository.listAllWorkers(context.principal)
          : [],
      billingRules,
      billingSetup: billingSetup
        ? {
            version: billingSetup.currentVersion(context.principal, params.id),
            rulesFingerprint: billingSetup.rulesFingerprint(context.principal, params.id),
            issuingPrerequisites: latestLaborRule
              ? billingSetup.issuingPrerequisites(
                  context.principal,
                  params.id,
                  String(latestLaborRule.effective_from),
                  String(latestLaborRule.legal_entity_id ?? ''),
                  [
                    String(latestLaborRule.tax_profile_id ?? ''),
                    ...(Number(latestLaborRule.include_expenses) === 1 || !latestExpenseRule
                      ? []
                      : [String(latestExpenseRule.tax_profile_id ?? '')]),
                  ],
                )
              : ['billing_setup_required'],
            requestKey: newId(),
            legalEntities: context.repository.listLegalEntities(context.principal),
            taxProfiles: context.repository.listTaxProfiles(context.principal),
            contacts: projectRow.client_id
              ? context.repository.listClientContacts(context.principal, projectRow.client_id)
              : [],
            templates: billingSetup.listTemplates(
              context.principal,
              String(overview.project.currency) as 'EUR' | 'USD' | 'BRL',
            ),
            people: billingSetup.peopleReview(
              context.principal,
              params.id,
              projectCalendarDate(String(overview.project.timezone)),
            ),
          }
        : null,
      overview: financeVisible
        ? {
            ...overview,
            financial: context.v3.projectFinance(
              context.principal,
              params.id,
              periodStart,
              periodEnd,
            ),
          }
        : overview,
    };
  } catch (caught) {
    if (caught instanceof AccessDeniedError) error(403, 'detail.project.forbidden');
    if (caught instanceof ValidationError && /not found/i.test(caught.message))
      error(404, 'detail.project.notFound');
    error(500, 'detail.project.unavailable');
  } finally {
    context.sqlite.close();
  }
};

const amount = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,2})?$/);
const personTermsSchema = z
  .object({
    projectId: z.uuid(),
    projectMemberId: z.uuid(),
    workerId: z.string().min(1).max(200),
    expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    effectiveFrom: z.iso.date(),
    customerHourlyRate: amount,
    workerPayType: z.enum([
      'Hourly',
      'Daily',
      'FixedPerBillingPeriod',
      'FixedProjectAmount',
      'PercentageOfEligibleClientLabor',
    ]),
    workerPayAmount: amount,
    percentageBasis: z.enum([
      'CLIENT_LABOR_BEFORE_TAX',
      'CLIENT_LABOR_AFTER_APPROVED_DISCOUNT',
      'ISSUED_ELIGIBLE_LABOR',
      'COLLECTED_ELIGIBLE_LABOR',
    ]),
    expensePayer: z.enum(['worker', 'company_card', 'company_direct', 'client', 'third_party']),
    workerReimbursement: z.enum(['at_cost', 'none']),
    clientRecovery: z.enum(['at_cost', 'markup', 'included', 'non_billable', 'client_direct']),
    markupPercent: z.union([z.literal(''), amount]),
  })
  .strict()
  .superRefine((value, issue) => {
    if (value.expensePayer !== 'worker' && value.workerReimbursement !== 'none')
      issue.addIssue({
        code: 'custom',
        path: ['workerReimbursement'],
        message: 'Only worker-paid expenses can reimburse a worker',
      });
    if ((value.expensePayer === 'client') !== (value.clientRecovery === 'client_direct'))
      issue.addIssue({
        code: 'custom',
        path: ['clientRecovery'],
        message: 'Client-paid expenses require client-direct recovery',
      });
    if (
      value.clientRecovery === 'markup' &&
      (!value.markupPercent || Number(value.markupPercent.replace(',', '.')) <= 0)
    )
      issue.addIssue({
        code: 'custom',
        path: ['markupPercent'],
        message: 'A positive markup percentage is required',
      });
    if (
      value.clientRecovery !== 'markup' &&
      value.markupPercent &&
      Number(value.markupPercent.replace(',', '.')) > 0
    )
      issue.addIssue({
        code: 'custom',
        path: ['markupPercent'],
        message: 'Markup is only available with markup recovery',
      });
  });

type DetailAction =
  | 'submitMilestone'
  | 'savePeopleTerms'
  | 'savePersonTerms'
  | 'saveBillingSetup'
  | 'createInvoiceDraft'
  | 'updateProject'
  | 'deleteProject';
type DetailValues = Record<string, string>;
type DetailProblemKey = `problem.${string}`;
type DetailRule = readonly [
  source: string,
  code: string,
  key: DetailProblemKey,
  copy: string,
  status: number,
  fields?: readonly string[],
  remedy?: string,
];

function detailValues(form: FormData): DetailValues {
  return Object.fromEntries(
    [...form.entries()].filter(([, value]) => typeof value === 'string') as Array<[string, string]>,
  );
}

function personFieldKey(field: string, message: string): DetailProblemKey {
  if (message === 'Only worker-paid expenses can reimburse a worker')
    return 'problem.projectDetail.personWorkerReimbursementMismatch';
  if (message === 'Client-paid expenses require client-direct recovery')
    return 'problem.projectDetail.personClientRecoveryMismatch';
  if (message === 'A positive markup percentage is required')
    return 'problem.projectDetail.personMarkupRequired';
  if (message === 'Markup is only available with markup recovery')
    return 'problem.projectDetail.personMarkupNotApplicable';
  if (field === 'effectiveFrom') return 'problem.projectDetail.personTermsDateInvalid';
  if (['customerHourlyRate', 'workerPayAmount', 'markupPercent'].includes(field))
    return 'problem.projectDetail.personTermsRateInvalid';
  return 'problem.projectDetail.personTermsInvalid';
}

function billingFieldKey(field: string): DetailProblemKey {
  const keys: Record<string, DetailProblemKey> = {
    projectId: 'problem.projectDetail.billingReferenceInvalid',
    requestKey: 'problem.projectDetail.billingReferenceInvalid',
    expectedVersion: 'problem.projectDetail.billingVersionInvalid',
    expectedRulesFingerprint: 'problem.projectDetail.billingRulesRevisionInvalid',
    mode: 'problem.projectDetail.billingModeInvalid',
    effectiveFrom: 'problem.projectDetail.billingEffectiveDateInvalid',
    legalEntityId: 'problem.projectDetail.billingIssuerRequired',
    laborTaxProfileId: 'problem.projectDetail.billingTaxSelectionInvalid',
    expenseTaxProfileId: 'problem.projectDetail.billingTaxSelectionInvalid',
    cadenceType: 'problem.projectDetail.billingCadenceInvalid',
    expenseCadenceType: 'problem.projectDetail.billingCadenceInvalid',
    anchorDate: 'problem.projectDetail.billingLaborAnchorRequired',
    expenseAnchorDate: 'problem.projectDetail.billingExpenseAnchorRequired',
    invoiceLayout: 'problem.projectDetail.billingLayoutInvalid',
    groupingMode: 'problem.projectDetail.billingGroupingInvalid',
    billingContactId: 'problem.projectDetail.billingContactInvalid',
    recipientEmail: 'problem.projectDetail.billingRecipientInvalid',
    paymentTermsDays: 'problem.projectDetail.billingPaymentTermsInvalid',
    templateName: 'problem.projectDetail.billingTemplateNameInvalid',
  };
  return keys[field] ?? 'problem.projectDetail.billingSetupInvalid';
}

function localizedSchemaFields(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
  kind: 'person' | 'billing',
  batch = false,
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.path.map(String);
    const field = path.at(-1) ?? (batch ? 'rows' : 'form');
    const key = path.length ? path.join('.') : field;
    const messageKey =
      kind === 'person' ? personFieldKey(field, issue.message) : billingFieldKey(field);
    (fields[key] ??= []).push(messageKey);
  }
  return fields;
}

const detailRules: readonly DetailRule[] = [
  [
    'Milestone changed or not found',
    'PROJECT_MILESTONE_CHANGED',
    'problem.milestone.changed',
    'This milestone changed or was removed. Review the current milestone before submitting it.',
    409,
    [],
    'review_updated_record',
  ],
  [
    'Milestone cannot be submitted',
    'PROJECT_MILESTONE_NOT_SUBMITTABLE',
    'problem.milestone.notSubmittable',
    'Only a draft or rejected milestone can be submitted. Review its current state.',
    409,
    [],
    'review_updated_record',
  ],
  [
    'Person commercial terms changed. Reload before saving.',
    'PROJECT_PERSON_TERMS_CHANGED',
    'problem.projectDetail.personTermsChanged',
    'This person’s commercial terms changed while you were editing. Review the current terms before saving.',
    409,
    [],
    'review_person_terms',
  ],
  [
    'Choose an effective date within this active project assignment',
    'PROJECT_PERSON_TERMS_OUTSIDE_ASSIGNMENT',
    'problem.projectDetail.personTermsOutsideAssignment',
    'The effective date must be within an active project assignment. Review the assignment dates.',
    400,
    ['effectiveFrom'],
    'review_person_terms',
  ],
  [
    'Invoice or finalized worker settlement history overlaps these terms. Choose a later effective date.',
    'PROJECT_PERSON_TERMS_HISTORY_LOCKED',
    'problem.projectDetail.personTermsHistoryLocked',
    'An invoice or finalized worker settlement overlaps these terms. Choose a later effective date; existing pay and customer billing remain separate.',
    409,
    ['effectiveFrom'],
    'review_person_terms',
  ],
  [
    'Assignment needs review before commercial terms can be edited',
    'PROJECT_PERSON_TERMS_ASSIGNMENT_REVIEW',
    'problem.projectDetail.personTermsAssignmentReview',
    'This assignment needs review before its commercial terms can change.',
    409,
    [],
    'review_person_terms',
  ],
  [
    'An assignment rate already starts on this date. Choose a later effective date.',
    'PROJECT_PERSON_TERMS_RATE_DATE_USED',
    'problem.projectDetail.personTermsRateDateUsed',
    'An assignment rate already starts on this date. Choose a later effective date.',
    409,
    ['effectiveFrom'],
    'review_person_terms',
  ],
  [
    'A more specific assignment override controls this person. Review advanced commercial terms.',
    'PROJECT_PERSON_TERMS_OVERRIDE_CONTROLS',
    'problem.projectDetail.personTermsOverrideControls',
    'A more specific assignment override controls this person. Review those terms before changing this form.',
    409,
    [],
    'review_person_terms',
  ],
  [
    'An expense policy already starts on this date. Choose a later effective date.',
    'PROJECT_PERSON_TERMS_POLICY_DATE_USED',
    'problem.projectDetail.personTermsPolicyDateUsed',
    'An expense policy already starts on this date. Choose a later effective date.',
    409,
    ['effectiveFrom'],
    'review_person_terms',
  ],
  [
    'Select between one and fifty people',
    'PROJECT_PEOPLE_TERMS_COUNT_INVALID',
    'problem.projectDetail.peopleTermsCountInvalid',
    'Select between one and fifty people before saving their terms.',
    400,
    ['rows'],
    'correct_field',
  ],
  [
    'A person may appear only once in a batch',
    'PROJECT_PEOPLE_TERMS_DUPLICATE_PERSON',
    'problem.projectDetail.peopleTermsDuplicatePerson',
    'A person appears more than once. Keep one entry for each person.',
    400,
    ['rows'],
    'correct_field',
  ],
  [
    'All people must belong to the same project',
    'PROJECT_PEOPLE_TERMS_PROJECT_MISMATCH',
    'problem.projectDetail.peopleTermsProjectMismatch',
    'Every selected person must belong to this project. Review the selection.',
    400,
    ['rows'],
    'review_person_terms',
  ],
  [
    'Worker compensation percentage cannot exceed 100%',
    'PROJECT_PERSON_PAY_PERCENT_INVALID',
    'problem.projectDetail.personPayPercentInvalid',
    'Worker compensation cannot exceed 100%. Correct the worker pay percentage.',
    400,
    ['workerPayAmount'],
    'correct_field',
  ],
  [
    'Expense markup cannot exceed 100%',
    'PROJECT_PERSON_MARKUP_INVALID',
    'problem.projectDetail.personMarkupInvalid',
    'Expense markup cannot exceed 100%. Correct the customer recovery markup.',
    400,
    ['markupPercent'],
    'correct_field',
  ],
  [
    'Project or request reference is invalid',
    'PROJECT_BILLING_REFERENCE_INVALID',
    'problem.projectDetail.billingReferenceInvalid',
    'The billing setup reference is invalid. Review the current setup before saving.',
    400,
    [],
    'review_billing_setup',
  ],
  [
    'Billing setup version is invalid',
    'PROJECT_BILLING_VERSION_INVALID',
    'problem.projectDetail.billingVersionInvalid',
    'The billing setup version is invalid. Review the current setup before saving.',
    400,
    ['expectedVersion'],
    'review_billing_setup',
  ],
  [
    'Billing rules revision is invalid',
    'PROJECT_BILLING_RULES_REVISION_INVALID',
    'problem.projectDetail.billingRulesRevisionInvalid',
    'The billing rules revision is invalid. Review the current setup before saving.',
    400,
    ['expectedRulesFingerprint'],
    'review_billing_setup',
  ],
  [
    'Choose one or two invoices',
    'PROJECT_BILLING_MODE_INVALID',
    'problem.projectDetail.billingModeInvalid',
    'Choose one combined invoice or separate labor and expense invoices.',
    400,
    ['mode'],
    'correct_field',
  ],
  [
    'Effective date is invalid',
    'PROJECT_BILLING_EFFECTIVE_DATE_INVALID',
    'problem.projectDetail.billingEffectiveDateInvalid',
    'Enter a valid billing setup effective date.',
    400,
    ['effectiveFrom'],
    'correct_field',
  ],
  [
    'Select an invoice issuer',
    'PROJECT_BILLING_ISSUER_REQUIRED',
    'problem.projectDetail.billingIssuerRequired',
    'Select an active invoice issuer before saving billing setup.',
    400,
    ['legalEntityId'],
    'review_billing_setup',
  ],
  [
    'Tax profile selection is invalid',
    'PROJECT_BILLING_TAX_SELECTION_INVALID',
    'problem.projectDetail.billingTaxSelectionInvalid',
    'Choose a valid tax profile for the selected invoice issuer.',
    400,
    ['laborTaxProfileId', 'expenseTaxProfileId'],
    'review_billing_setup',
  ],
  [
    'Unsupported billing cadence',
    'PROJECT_BILLING_CADENCE_INVALID',
    'problem.projectDetail.billingCadenceInvalid',
    'Choose a supported billing cadence.',
    400,
    ['cadenceType', 'expenseCadenceType'],
    'correct_field',
  ],
  [
    'Labor cadence needs an anchor date',
    'PROJECT_BILLING_LABOR_ANCHOR_REQUIRED',
    'problem.projectDetail.billingLaborAnchorRequired',
    'Choose an anchor date for the labor billing cadence.',
    400,
    ['anchorDate'],
    'correct_field',
  ],
  [
    'Expense cadence needs an anchor date',
    'PROJECT_BILLING_EXPENSE_ANCHOR_REQUIRED',
    'problem.projectDetail.billingExpenseAnchorRequired',
    'Choose an anchor date for the expense billing cadence.',
    400,
    ['expenseAnchorDate'],
    'correct_field',
  ],
  [
    'Unsupported invoice layout',
    'PROJECT_BILLING_LAYOUT_INVALID',
    'problem.projectDetail.billingLayoutInvalid',
    'Choose a supported invoice layout.',
    400,
    ['invoiceLayout'],
    'correct_field',
  ],
  [
    'Unsupported invoice grouping',
    'PROJECT_BILLING_GROUPING_INVALID',
    'problem.projectDetail.billingGroupingInvalid',
    'Choose a supported invoice grouping.',
    400,
    ['groupingMode'],
    'correct_field',
  ],
  [
    'Billing contact is invalid',
    'PROJECT_BILLING_CONTACT_INVALID',
    'problem.projectDetail.billingContactInvalid',
    'Choose a valid billing contact for this client.',
    400,
    ['billingContactId'],
    'correct_field',
  ],
  [
    'Recipient email is invalid',
    'PROJECT_BILLING_RECIPIENT_INVALID',
    'problem.projectDetail.billingRecipientInvalid',
    'Enter a valid invoice recipient email address.',
    400,
    ['recipientEmail'],
    'correct_field',
  ],
  [
    'Payment terms must be between 0 and 365 days',
    'PROJECT_BILLING_PAYMENT_TERMS_INVALID',
    'problem.projectDetail.billingPaymentTermsInvalid',
    'Payment terms must be between 0 and 365 days.',
    400,
    ['paymentTermsDays'],
    'correct_field',
  ],
  [
    'Template name must be between 2 and 100 characters',
    'PROJECT_BILLING_TEMPLATE_NAME_INVALID',
    'problem.projectDetail.billingTemplateNameInvalid',
    'Use 2 to 100 characters for the billing template name.',
    400,
    ['templateName'],
    'correct_field',
  ],
  [
    'Billing setup request key was already used for different settings',
    'PROJECT_BILLING_SETUP_REQUEST_REUSED',
    'problem.projectDetail.billingSetupRequestReused',
    'This billing setup request was already used for different settings. Review the saved setup before submitting again.',
    409,
    [],
    'review_billing_setup',
  ],
  [
    'Billing setup changed. Reload before saving.',
    'PROJECT_BILLING_SETUP_CHANGED',
    'problem.projectDetail.billingSetupChanged',
    'Billing setup changed while you were editing. Review the current settings before saving.',
    409,
    [],
    'review_billing_setup',
  ],
  [
    'Billing rules changed outside this setup. Reload and review before saving.',
    'PROJECT_BILLING_RULES_CHANGED',
    'problem.projectDetail.billingRulesChanged',
    'The project billing rules changed while this form was open. Review them before saving.',
    409,
    [],
    'review_billing_setup',
  ],
  [
    'Existing billing setup changes must start today or later.',
    'PROJECT_BILLING_SETUP_BACKDATE_BLOCKED',
    'problem.projectDetail.billingSetupBackdateBlocked',
    'Changes to an existing billing setup must start today or later. Choose a later effective date.',
    409,
    ['effectiveFrom'],
    'review_billing_setup',
  ],
  [
    'Existing invoice or billing period history overlaps the backdated setup.',
    'PROJECT_BILLING_SETUP_HISTORY_OVERLAP',
    'problem.projectDetail.billingSetupHistoryOverlap',
    'An invoice or billing period overlaps this backdated setup. Choose a later effective date.',
    409,
    ['effectiveFrom'],
    'review_billing_setup',
  ],
  [
    'Saved template no longer exists for this currency',
    'PROJECT_BILLING_TEMPLATE_UNAVAILABLE',
    'problem.projectDetail.billingTemplateUnavailable',
    'The selected billing template is unavailable for this currency. Choose a current template.',
    400,
    ['selectedTemplateId'],
    'review_billing_setup',
  ],
  [
    'Billing contact does not belong to this client',
    'PROJECT_BILLING_CONTACT_MISMATCH',
    'problem.projectDetail.billingContactMismatch',
    'The selected billing contact does not belong to this client. Choose one of the client’s contacts.',
    400,
    ['billingContactId'],
    'review_billing_setup',
  ],
  [
    'The client and issuing entity must be active and use the project currency',
    'PROJECT_BILLING_ISSUER_INVALID',
    'problem.projectDetail.billingIssuerInvalid',
    'The client and invoice issuer must be active and use the project currency. Review the issuer before saving.',
    409,
    ['legalEntityId'],
    'review_billing_setup',
  ],
  [
    'Choose active tax profiles for the issuing entity and project currency',
    'PROJECT_BILLING_TAX_INVALID',
    'problem.projectDetail.billingTaxInvalid',
    'Choose active tax profiles for the invoice issuer and project currency.',
    400,
    ['laborTaxProfileId', 'expenseTaxProfileId'],
    'review_billing_setup',
  ],
  [
    'Overlapping billing rules need Finance review before saving this setup',
    'PROJECT_BILLING_RULES_OVERLAP',
    'problem.projectDetail.billingRulesOverlap',
    'Billing rules overlap. Finance must review them before this setup can be saved.',
    409,
    [],
    'review_billing_setup',
  ],
  [
    'This billing rule has invoice or period history. Choose a later effective date.',
    'PROJECT_BILLING_RULE_HISTORY_LOCKED',
    'problem.projectDetail.billingRuleHistoryLocked',
    'This billing rule has invoice or period history. Choose a later effective date.',
    409,
    ['effectiveFrom'],
    'review_billing_setup',
  ],
  [
    'Expense rule already has billing history. Choose a later effective date.',
    'PROJECT_EXPENSE_RULE_HISTORY_LOCKED',
    'problem.projectDetail.expenseRuleHistoryLocked',
    'The expense rule already has billing history. Choose a later effective date.',
    409,
    ['effectiveFrom'],
    'review_billing_setup',
  ],
  [
    'Existing invoice or billing period history overlaps this effective date. Choose a later date.',
    'PROJECT_BILLING_EFFECTIVE_DATE_OVERLAP',
    'problem.projectDetail.billingEffectiveDateOverlap',
    'An existing invoice or billing period overlaps this effective date. Choose a later date.',
    409,
    ['effectiveFrom'],
    'review_billing_setup',
  ],
  [
    'Billing period end must follow start',
    'PROJECT_INVOICE_PERIOD_REVERSED',
    'problem.projectDetail.invoicePeriodReversed',
    'The billing period end must follow its start. Correct the period dates.',
    400,
    ['periodStart', 'periodEnd'],
    'correct_field',
  ],
  [
    'Replacement draft changed before refresh',
    'PROJECT_INVOICE_DRAFT_CHANGED',
    'problem.projectDetail.invoiceDraftChanged',
    'The invoice draft changed while it was being refreshed. Review the current draft before trying again.',
    409,
    [],
    'review_billing_setup',
  ],
  [
    'Project changed before update',
    'PROJECT_DETAIL_CHANGED',
    'problem.project.stale',
    'This project changed while you were editing. Review its current status before saving again.',
    409,
    [],
    'review_updated_record',
  ],
  [
    'Project status must be changed through transitionProject',
    'PROJECT_DETAIL_STATUS_PROTECTED',
    'problem.projectDetail.statusProtected',
    'Project status changes require the lifecycle controls. Review the current status.',
    409,
    [],
    'review_project_status',
  ],
  [
    'Project close date must be changed through transitionProject',
    'PROJECT_DETAIL_CLOSE_DATE_PROTECTED',
    'problem.projectDetail.closeDateProtected',
    'The close date changes through the project lifecycle controls. Review the current status.',
    409,
    [],
    'review_project_status',
  ],
  [
    'Invalid commercial model',
    'PROJECT_DETAIL_COMMERCIAL_MODEL_INVALID',
    'problem.projectDetail.commercialModelInvalid',
    'Choose a valid commercial model for this project.',
    400,
    ['billingModel'],
    'correct_field',
  ],
  [
    'Planned end date must follow the start date',
    'PROJECT_DETAIL_DATES_INVALID',
    'problem.projectDetail.datesInvalid',
    'The planned end date must be after the start date. Correct the project dates.',
    400,
    ['startDate', 'plannedEndDate'],
    'correct_field',
  ],
  [
    'Active project manager not found',
    'PROJECT_DETAIL_MANAGER_UNAVAILABLE',
    'problem.project.managerUnavailable',
    'The selected project manager is no longer active. Choose an available manager.',
    409,
    ['projectManagerId'],
    'correct_field',
  ],
  [
    'Project client not found',
    'PROJECT_DETAIL_CLIENT_UNAVAILABLE',
    'problem.projectDetail.clientUnavailable',
    'The project client is no longer available. Review the project before changing its settings.',
    409,
    [],
    'review_updated_record',
  ],
  [
    'Cost center code must end in digits for the project number',
    'PROJECT_DETAIL_COST_CENTER_INVALID',
    'problem.projectDetail.costCenterInvalid',
    'The cost center code must end in digits to form a project number. Correct the code.',
    400,
    ['costCenterCode'],
    'correct_field',
  ],
  [
    'Project number cannot change after an invoice was created',
    'PROJECT_DETAIL_NUMBER_LOCKED',
    'problem.projectDetail.numberLocked',
    'An invoice already uses this project number. Keep the current cost center code or review billing history.',
    409,
    ['costCenterCode'],
    'review_billing_setup',
  ],
  [
    'Cost center code is already used by another project for this client',
    'PROJECT_DETAIL_COST_CENTER_DUPLICATE',
    'problem.projectDetail.costCenterDuplicate',
    'Another project for this client uses that cost center code. Choose a different code.',
    409,
    ['costCenterCode'],
    'correct_field',
  ],
  [
    'Project manager assignment history is inconsistent',
    'PROJECT_DETAIL_MANAGER_HISTORY_INVALID',
    'problem.projectDetail.managerHistoryInvalid',
    'Project manager assignment history needs review before replacing the manager.',
    409,
    ['projectManagerId'],
    'review_updated_record',
  ],
  [
    'Project manager assignment changed before replacement',
    'PROJECT_DETAIL_MANAGER_CHANGED',
    'problem.projectDetail.managerChanged',
    'The project manager assignment changed. Review the updated project before replacing the manager.',
    409,
    ['projectManagerId'],
    'review_updated_record',
  ],
  [
    'Project manager assignment changed before activation',
    'PROJECT_DETAIL_MANAGER_CHANGED',
    'problem.projectDetail.managerChanged',
    'The project manager assignment changed. Review the updated project before replacing the manager.',
    409,
    ['projectManagerId'],
    'review_updated_record',
  ],
  [
    'Project has recorded time entries and cannot be deleted. Please archive the project instead.',
    'PROJECT_DELETE_HAS_TIME',
    'problem.project.deleteHasTime',
    'This project has time entries and cannot be deleted. Archive the project instead.',
    409,
    [],
    'review_project_status',
  ],
  [
    'Project has recorded expenses and cannot be deleted. Please archive the project instead.',
    'PROJECT_DELETE_HAS_EXPENSES',
    'problem.project.deleteHasExpenses',
    'This project has expenses and cannot be deleted. Archive the project instead.',
    409,
    [],
    'review_project_status',
  ],
  [
    'Project has generated invoices and cannot be deleted. Please archive the project instead.',
    'PROJECT_DELETE_HAS_INVOICES',
    'problem.project.deleteHasInvoices',
    'This project has invoices and cannot be deleted. Archive the project instead.',
    409,
    [],
    'review_project_status',
  ],
  [
    'Project has recorded daily field reports and cannot be deleted. Please archive the project instead.',
    'PROJECT_DELETE_HAS_DAILY_REPORTS',
    'problem.project.deleteHasDailyReports',
    'This project has daily field reports and cannot be deleted. Archive the project instead.',
    409,
    [],
    'review_project_status',
  ],
  [
    'Project has recorded technical reports and cannot be deleted. Please archive the project instead.',
    'PROJECT_DELETE_HAS_TECHNICAL_REPORTS',
    'problem.project.deleteHasTechnicalReports',
    'This project has technical reports and cannot be deleted. Archive the project instead.',
    409,
    [],
    'review_project_status',
  ],
];

function detailFailure(
  cause: unknown,
  action: DetailAction,
  values: DetailValues,
  projectId: string,
) {
  const extras = { action, actionName: action, values };
  const make = (
    status: number,
    code: string,
    key: DetailProblemKey,
    copy: string,
    fields: readonly string[] = [],
    remedy = 'review_updated_record',
  ) => {
    const fieldErrors = Object.fromEntries(fields.filter(Boolean).map((field) => [field, [key]]));
    return actionFail(status, key, {}, copy, {
      ...extras,
      code,
      fields: fieldErrors,
      fieldErrors,
      remedies: [{ id: remedy, projectId, recordId: values.id || undefined }],
    });
  };
  if (cause instanceof AccessDeniedError || cause instanceof V3AccessDeniedError) {
    if (cause.message === 'Active account required')
      return make(
        403,
        'PROJECT_DETAIL_ACCOUNT_INACTIVE',
        'problem.projectDetail.accountUnavailable',
        'Your account is no longer active. Contact an owner before changing this project.',
        [],
        'contact_owner',
      );
    if (cause.message === 'Live authenticated session required')
      return make(
        401,
        'PROJECT_DETAIL_SESSION_EXPIRED',
        'problem.projectDetail.sessionExpired',
        'Your session expired. Sign in again before continuing.',
        [],
        'sign_in_again',
      );
    if (cause.message === 'Project milestone administration required')
      return make(
        403,
        'PROJECT_MILESTONE_ROLE_REQUIRED',
        'problem.milestone.roleRequired',
        'You cannot submit this milestone. Contact the project owner or an authorized manager.',
        [],
        'contact_owner',
      );
    if (cause.message === 'Project administration required')
      return make(
        403,
        'PROJECT_DETAIL_OWNER_REQUIRED',
        'problem.projectDetail.ownerRequired',
        'Only an authorized project owner can change or delete this project.',
        [],
        'contact_owner',
      );
    if (cause.message === 'Finance role required')
      return make(
        403,
        'PROJECT_DETAIL_FINANCE_REQUIRED',
        'problem.finance.roleRequired',
        'Finance access is required for this change.',
        [],
        'contact_owner',
      );
    if (cause.message === 'Authenticated role changed; sign in again')
      return make(
        403,
        'PROJECT_DETAIL_ROLE_CHANGED',
        'problem.projectDetail.roleChanged',
        'Your access changed while this form was open. Sign in again before continuing.',
        [],
        'sign_in_again',
      );
  }
  if (
    !(cause instanceof ConflictError) &&
    !(cause instanceof ValidationError) &&
    !(cause instanceof V3ConflictError) &&
    !(cause instanceof V3ValidationError)
  )
    return actionFailure(cause, extras);
  const matched = detailRules.find(([message]) => message === cause.message);
  if (matched) return make(matched[4], matched[1], matched[2], matched[3], matched[5], matched[6]);
  if (cause.message === 'Project not found')
    return make(
      404,
      'PROJECT_DETAIL_NOT_FOUND',
      'problem.projectDetail.notFound',
      'This project is no longer available. Review the project list.',
      [],
      'review_projects',
    );
  if (cause.message === 'Person terms reference is invalid')
    return make(
      400,
      'PROJECT_PERSON_TERMS_REFERENCE_INVALID',
      'problem.projectDetail.personTermsReferenceInvalid',
      'This person’s commercial terms reference is invalid. Review the person and assignment before saving.',
      [],
      'review_person_terms',
    );
  if (cause.message === 'Person terms effective date is invalid')
    return make(
      400,
      'PROJECT_PERSON_TERMS_DATE_INVALID',
      'problem.projectDetail.personTermsDateInvalid',
      'Enter a valid effective date for this person’s terms.',
      ['effectiveFrom'],
      'correct_field',
    );
  if (cause.message === 'Money exceeds safe SQLite integer range')
    return make(
      400,
      'PROJECT_DETAIL_MONEY_TOO_LARGE',
      'problem.projectDetail.moneyTooLarge',
      'An amount is too large to save. Enter a smaller exact amount.',
      [],
      'correct_field',
    );
  const rateField =
    /^(Customer hourly rate|Worker compensation|Expense markup) must be a non-negative amount with at most two decimals$/u.exec(
      cause.message,
    )?.[1];
  if (rateField) {
    const field =
      rateField === 'Customer hourly rate'
        ? 'customerHourlyRate'
        : rateField === 'Worker compensation'
          ? 'workerPayAmount'
          : 'markupPercent';
    return make(
      400,
      'PROJECT_PERSON_TERMS_RATE_INVALID',
      'problem.projectDetail.personTermsRateInvalid',
      'Enter a non-negative amount with at most two decimals for the highlighted commercial term.',
      [field],
      'correct_field',
    );
  }
  const invalidField =
    /^(Project name|PO \/ reference|Timezone|Cost center code|Project alias|Site name|Country|Description|Contract number|Budget type|Notes|Start date|Planned end date|Expected hours per day|Expected minutes per day|Client daily minimum hours|Client daily minimum|Labor budget minutes|Planned minutes|Legacy project budget|Revenue budget|PO cap|Fixed price|Travel budget|Expense budget|Other cost budget) (?:is invalid|is required|must be an ISO date|cannot be negative)$/u.exec(
      cause.message,
    )?.[1];
  if (invalidField) {
    const fieldNames: Record<string, string> = {
      'Project name': 'name',
      'PO / reference': 'poNumber',
      Timezone: 'timezone',
      'Cost center code': 'costCenterCode',
      'Project alias': 'projectAlias',
      'Site name': 'siteName',
      Country: 'country',
      Description: 'description',
      'Contract number': 'contractNumber',
      'Budget type': 'budgetType',
      Notes: 'notes',
      'Start date': 'startDate',
      'Planned end date': 'plannedEndDate',
      'Expected hours per day': 'expectedHoursPerDay',
      'Expected minutes per day': 'expectedMinutesPerDay',
      'Client daily minimum hours': 'clientDailyMinimumHours',
      'Client daily minimum': 'clientDailyMinimumHours',
      'Labor budget minutes': 'laborBudgetMinutes',
      'Planned minutes': 'plannedMinutes',
      'Legacy project budget': 'budgetMinor',
      'Revenue budget': 'revenueBudgetMinor',
      'PO cap': 'poCapMinor',
      'Fixed price': 'fixedPriceMinor',
      'Travel budget': 'travelBudgetMinor',
      'Expense budget': 'expenseBudgetMinor',
      'Other cost budget': 'otherCostBudgetMinor',
    };
    return make(
      400,
      'PROJECT_DETAIL_FIELD_INVALID',
      'problem.projectDetail.fieldInvalid',
      'A project field is missing or invalid. Correct the highlighted field before saving.',
      [fieldNames[invalidField] ?? ''],
      'correct_field',
    );
  }
  return actionFailure(cause, extras);
}
export const actions: Actions = {
  submitMilestone: async ({ request, locals, params }) => {
    const raw = detailValues(await request.formData());
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        code: 'PROJECT_DETAIL_SIGN_IN_REQUIRED',
        action: 'submitMilestone',
        actionName: 'submitMilestone',
        values: raw,
        remedies: [{ id: 'sign_in_again' }],
      });
    const parsed = z
      .object({ id: z.string().uuid(), version: z.coerce.number().int().positive() })
      .safeParse(raw);
    if (!parsed.success)
      return actionFail(
        400,
        'problem.milestone.invalid',
        {},
        'This milestone reference is invalid. Review the current milestone.',
        {
          code: 'PROJECT_MILESTONE_INVALID',
          action: 'submitMilestone',
          actionName: 'submitMilestone',
          values: raw,
          fieldErrors: parsed.error.flatten().fieldErrors,
          remedies: [{ id: 'review_updated_record', projectId: params.id }],
        },
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      const milestone = context.sqlite
        .prepare('SELECT project_id FROM project_milestone WHERE id=?')
        .get(parsed.data.id) as { project_id: string } | undefined;
      if (!milestone || milestone.project_id !== params.id)
        return actionFail(
          404,
          'problem.milestone.notFound',
          {},
          'This milestone is no longer available on this project. Review the milestone list.',
          {
            code: 'PROJECT_MILESTONE_NOT_FOUND',
            action: 'submitMilestone',
            actionName: 'submitMilestone',
            values: raw,
            remedies: [{ id: 'review_updated_record', projectId: params.id }],
          },
        );
      context.repository.submitProjectMilestone(
        context.principal,
        parsed.data.id,
        parsed.data.version,
      );
      return actionSuccess(
        'action.projects.milestoneSubmitted',
        {},
        'Milestone submitted for review',
      );
    } catch (caught) {
      return detailFailure(caught, 'submitMilestone', raw, params.id ?? '');
    } finally {
      context?.sqlite.close();
    }
  },
  savePeopleTerms: async ({ request, locals, params }) => {
    const raw = detailValues(await request.formData());
    const values = { rows: String(raw.rows ?? '') };
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        code: 'PROJECT_DETAIL_SIGN_IN_REQUIRED',
        action: 'savePeopleTerms',
        actionName: 'savePeopleTerms',
        values,
        remedies: [{ id: 'sign_in_again' }],
      });
    if (locals.user.role !== 'owner_admin' && locals.user.role !== 'finance_admin')
      return detailFailure(
        new AccessDeniedError('Finance role required'),
        'savePeopleTerms',
        values,
        params.id ?? '',
      );
    let candidate: unknown;
    try {
      candidate = JSON.parse(String(raw.rows ?? ''));
    } catch {
      return actionFail(
        400,
        'problem.projectDetail.peopleTermsInvalid',
        {},
        'The selected people terms are invalid. Review the selection and try again.',
        {
          code: 'PROJECT_PEOPLE_TERMS_INVALID',
          action: 'savePeopleTerms',
          actionName: 'savePeopleTerms',
          values,
          fieldErrors: { rows: ['problem.projectDetail.peopleTermsInvalid'] },
          remedies: [{ id: 'review_person_terms', projectId: params.id }],
        },
      );
    }
    const parsed = z.array(personTermsSchema).min(1).max(50).safeParse(candidate);
    if (!parsed.success)
      return actionFail(
        400,
        'problem.projectDetail.peopleTermsInvalid',
        {},
        'The selected people terms are invalid. Review the highlighted fields.',
        {
          code: 'PROJECT_PEOPLE_TERMS_INVALID',
          action: 'savePeopleTerms',
          actionName: 'savePeopleTerms',
          values,
          fields: localizedSchemaFields(parsed.error.issues, 'person', true),
          remedies: [{ id: 'review_person_terms', projectId: params.id }],
        },
      );
    if (parsed.data.some((row) => row.projectId !== params.id))
      return actionFail(
        403,
        'problem.projectDetail.personProjectMismatch',
        {},
        'A selected person does not belong to this project. Review the selection.',
        {
          code: 'PROJECT_PEOPLE_TERMS_PROJECT_MISMATCH',
          action: 'savePeopleTerms',
          actionName: 'savePeopleTerms',
          values,
          remedies: [{ id: 'review_person_terms', projectId: params.id }],
        },
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      const result = new ProjectBillingSetupRepository(
        context.sqlite,
        context.repository,
      ).savePeopleTerms(context.principal, parsed.data);
      return {
        ...actionSuccess(
          'action.finance.assignmentCommercialReferencesSaved',
          result,
          'Selected people terms saved',
        ),
        action: 'savePeopleTerms',
      };
    } catch (caught) {
      return detailFailure(caught, 'savePeopleTerms', values, params.id ?? '');
    } finally {
      context?.sqlite.close();
    }
  },
  savePersonTerms: async ({ request, locals, params }) => {
    const raw = detailValues(await request.formData());
    const values = raw;
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        code: 'PROJECT_DETAIL_SIGN_IN_REQUIRED',
        action: 'savePersonTerms',
        actionName: 'savePersonTerms',
        values,
        remedies: [{ id: 'sign_in_again' }],
      });
    if (locals.user.role !== 'owner_admin' && locals.user.role !== 'finance_admin')
      return detailFailure(
        new AccessDeniedError('Finance role required'),
        'savePersonTerms',
        values,
        params.id ?? '',
      );
    const parsed = personTermsSchema.safeParse(raw);
    if (!parsed.success)
      return actionFail(
        400,
        'problem.projectDetail.personTermsInvalid',
        {},
        'The person’s commercial terms contain invalid fields. Correct the highlighted fields.',
        {
          code: 'PROJECT_PERSON_TERMS_INVALID',
          action: 'savePersonTerms',
          actionName: 'savePersonTerms',
          values,
          fields: localizedSchemaFields(parsed.error.issues, 'person'),
          remedies: [{ id: 'correct_field', projectId: params.id }],
        },
      );
    if (parsed.data.projectId !== params.id)
      return actionFail(
        403,
        'problem.projectDetail.personProjectMismatch',
        {},
        'The selected person belongs to another project. Review the assignment.',
        {
          code: 'PROJECT_PERSON_TERMS_PROJECT_MISMATCH',
          action: 'savePersonTerms',
          actionName: 'savePersonTerms',
          values,
          remedies: [{ id: 'review_person_terms', projectId: params.id }],
        },
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      const result = new ProjectBillingSetupRepository(
        context.sqlite,
        context.repository,
      ).savePersonTerms(context.principal, parsed.data);
      return {
        ...actionSuccess(
          'action.finance.assignmentCommercialReferencesSaved',
          result,
          'Person commercial terms saved',
        ),
        action: 'savePersonTerms',
        workerId: parsed.data.workerId,
      };
    } catch (caught) {
      return detailFailure(caught, 'savePersonTerms', values, params.id ?? '');
    } finally {
      context?.sqlite.close();
    }
  },
  saveBillingSetup: async ({ request, locals, params }) => {
    const raw = detailValues(await request.formData());
    const values = raw;
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        code: 'PROJECT_DETAIL_SIGN_IN_REQUIRED',
        action: 'saveBillingSetup',
        actionName: 'saveBillingSetup',
        values,
        remedies: [{ id: 'sign_in_again' }],
      });
    if (locals.user.role !== 'owner_admin' && locals.user.role !== 'finance_admin')
      return detailFailure(
        new AccessDeniedError('Finance role required'),
        'saveBillingSetup',
        values,
        params.id ?? '',
      );
    const schema = z
      .object({
        projectId: z.uuid(),
        expectedVersion: z.coerce.number().int().nonnegative(),
        expectedRulesFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
        requestKey: z.uuid(),
        selectedTemplateId: z.union([z.literal(''), z.uuid()]).optional(),
        mode: z.enum(['combined', 'separate']),
        effectiveFrom: z.iso.date(),
        legalEntityId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/),
        laborTaxProfileId: z.union([
          z.literal(''),
          z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/),
        ]),
        expenseTaxProfileId: z.union([
          z.literal(''),
          z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/),
        ]),
        cadenceType: z.enum(['weekly', 'every_14_days', 'semi_monthly', 'monthly', 'manual']),
        expenseCadenceType: z.enum([
          'weekly',
          'every_14_days',
          'semi_monthly',
          'monthly',
          'manual',
        ]),
        anchorDate: z.union([z.literal(''), z.iso.date()]).optional(),
        expenseAnchorDate: z.union([z.literal(''), z.iso.date()]).optional(),
        invoiceLayout: z.enum(['default', 'labor-detailed', 'labor-summary']),
        groupingMode: z.enum(['detail', 'summary', 'by_worker', 'by_day', 'by_category']),
        billingContactId: z.union([z.literal(''), z.uuid()]).optional(),
        recipientEmail: z.union([z.literal(''), z.email().max(254)]).optional(),
        paymentTermsDays: z.coerce.number().int().min(0).max(365),
        autoGenerateDraft: z.enum(['true', 'false']).transform((value) => value === 'true'),
        saveAsTemplate: z.enum(['true', 'false']).transform((value) => value === 'true'),
        templateName: z.string().trim().max(100).optional(),
      })
      .strict()
      .superRefine((value, issue) => {
        if (value.cadenceType === 'every_14_days' && !value.anchorDate)
          issue.addIssue({
            code: 'custom',
            path: ['anchorDate'],
            message: 'Choose a labor cadence anchor date',
          });
        if (
          value.mode === 'separate' &&
          value.expenseCadenceType === 'every_14_days' &&
          !value.expenseAnchorDate
        )
          issue.addIssue({
            code: 'custom',
            path: ['expenseAnchorDate'],
            message: 'Choose an expense cadence anchor date',
          });
        if (value.saveAsTemplate && (value.templateName?.length ?? 0) < 2)
          issue.addIssue({
            code: 'custom',
            path: ['templateName'],
            message: 'Use at least two characters for the template name',
          });
      })
      .safeParse(raw);
    if (!schema.success)
      return actionFail(
        400,
        'problem.projectDetail.billingSetupInvalid',
        {},
        'Billing setup has invalid fields. Correct the highlighted settings.',
        {
          code: 'PROJECT_BILLING_SETUP_INVALID',
          action: 'saveBillingSetup',
          actionName: 'saveBillingSetup',
          values,
          fields: localizedSchemaFields(schema.error.issues, 'billing'),
          remedies: [{ id: 'review_billing_setup', projectId: params.id }],
        },
      );
    if (schema.data.projectId !== params.id)
      return actionFail(
        403,
        'problem.projectDetail.billingProjectMismatch',
        {},
        'This billing setup belongs to another project. Review the selected project.',
        {
          code: 'PROJECT_BILLING_SETUP_PROJECT_MISMATCH',
          action: 'saveBillingSetup',
          actionName: 'saveBillingSetup',
          values,
          remedies: [{ id: 'review_billing_setup', projectId: params.id }],
        },
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      const setup = new ProjectBillingSetupRepository(context.sqlite, context.repository);
      const result = setup.save(context.principal, {
        ...schema.data,
        selectedTemplateId: schema.data.selectedTemplateId || undefined,
        anchorDate: schema.data.anchorDate || undefined,
        expenseAnchorDate: schema.data.expenseAnchorDate || undefined,
        billingContactId: schema.data.billingContactId || undefined,
        recipientEmail: schema.data.recipientEmail || undefined,
      });
      return actionSuccess(
        'action.billing.streamSaved',
        { version: result.version },
        'Project billing setup saved',
      );
    } catch (caught) {
      return detailFailure(caught, 'saveBillingSetup', values, params.id ?? '');
    } finally {
      context?.sqlite.close();
    }
  },
  createInvoiceDraft: async ({ request, locals, params }) => {
    const object = detailValues(await request.formData());
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        code: 'PROJECT_DETAIL_SIGN_IN_REQUIRED',
        action: 'createInvoiceDraft',
        actionName: 'createInvoiceDraft',
        values: object,
        remedies: [{ id: 'sign_in_again' }],
      });
    if (locals.user.role !== 'owner_admin' && locals.user.role !== 'finance_admin')
      return detailFailure(
        new AccessDeniedError('Finance role required'),
        'createInvoiceDraft',
        object,
        params.id ?? '',
      );
    const parsed = invoicePeriodSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(
        400,
        'problem.projectDetail.invoicePeriodInvalid',
        {},
        'Choose a valid billing stream and period before creating a draft.',
        {
          code: 'PROJECT_INVOICE_PERIOD_INVALID',
          action: 'createInvoiceDraft',
          actionName: 'createInvoiceDraft',
          values: object,
          fieldErrors: parsed.error.flatten().fieldErrors,
          remedies: [{ id: 'correct_field', projectId: params.id }],
        },
      );
    if (!params.id)
      return actionFail(
        400,
        'problem.projectDetail.notFound',
        {},
        'This project is no longer available. Review the project list.',
        {
          code: 'PROJECT_DETAIL_NOT_FOUND',
          action: 'createInvoiceDraft',
          actionName: 'createInvoiceDraft',
          values: object,
          remedies: [{ id: 'review_projects' }],
        },
      );

    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      const projectRules = context.repository
        .listBillingRules(context.principal)
        .filter((rule) => String(rule.project_id) === params.id);
      if (!projectRules.some((rule) => String(rule.id) === parsed.data.billingRuleId))
        return actionFail(
          409,
          'problem.projectDetail.invoiceRuleUnavailable',
          {},
          'The selected billing stream is no longer available on this project. Review the current streams.',
          {
            code: 'PROJECT_INVOICE_RULE_UNAVAILABLE',
            action: 'createInvoiceDraft',
            actionName: 'createInvoiceDraft',
            values: object,
            remedies: [{ id: 'review_billing_setup', projectId: params.id }],
          },
        );
      const result = createInvoiceDraftResolvingPeriod(context, parsed.data);
      if (isActionFailure(result)) {
        const failure = result.data as Record<string, unknown> | undefined;
        if (!failure || typeof failure.messageKey !== 'string')
          return actionFailure(new Error('Invoice draft failure missing problem data'), {
            action: 'createInvoiceDraft',
            actionName: 'createInvoiceDraft',
            values: object,
          });
        return actionFail(
          result.status,
          failure.messageKey as `problem.${string}` | `action.${string}`,
          (failure.params ?? {}) as Record<string, string | number | boolean | null>,
          String(failure.message ?? ''),
          {
            ...failure,
            action: 'createInvoiceDraft',
            actionName: 'createInvoiceDraft',
            values: object,
          },
        );
      }
      return result;
    } catch (e) {
      return detailFailure(e, 'createInvoiceDraft', object, params.id ?? '');
    } finally {
      context?.sqlite.close();
    }
  },
  updateProject: async ({ request, locals, params }) => {
    const data = await request.formData();
    const values = detailValues(data);
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        code: 'PROJECT_DETAIL_SIGN_IN_REQUIRED',
        action: 'updateProject',
        actionName: 'updateProject',
        values,
        remedies: [{ id: 'sign_in_again' }],
      });
    const projectId = data.get('projectId')?.toString();
    if (!projectId || projectId !== params.id)
      return actionFail(
        400,
        'problem.projectDetail.notFound',
        {},
        'This project is no longer available. Review the project list.',
        {
          code: 'PROJECT_DETAIL_NOT_FOUND',
          action: 'updateProject',
          actionName: 'updateProject',
          values,
          remedies: [{ id: 'review_projects' }],
        },
      );
    const versionValue = data.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return actionFail(
        400,
        'problem.projectDetail.versionInvalid',
        {},
        'The project version is missing or invalid. Review the current project before saving.',
        {
          code: 'PROJECT_DETAIL_VERSION_INVALID',
          action: 'updateProject',
          actionName: 'updateProject',
          values,
          fieldErrors: { version: ['problem.projectDetail.versionInvalid'] },
          remedies: [{ id: 'review_updated_record', projectId }],
        },
      );
    let invalidField: string | null = null;

    const text = (name: string): string | undefined => {
      const value = data.get(name);
      return value === null ? undefined : value.toString();
    };
    const integer = (name: string, nullable = false): number | null | undefined => {
      const value = text(name);
      if (value === undefined) return undefined;
      if (value.trim() === '') return nullable ? null : undefined;
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        invalidField = name;
        return undefined;
      }
      return parsed;
    };
    const moneyMinor = (name: string): bigint | null | undefined => {
      const value = text(name);
      if (value === undefined) return undefined;
      if (value.trim() === '') return null;
      try {
        return BigInt(value);
      } catch {
        invalidField = name;
        return undefined;
      }
    };
    const hoursToMinutes = (
      hoursName: string,
      minutesName: string,
      nullable = false,
    ): number | null | undefined => {
      const hoursVal = text(hoursName);
      if (hoursVal !== undefined) {
        if (hoursVal.trim() === '') return nullable ? null : undefined;
        const parsed = Number(hoursVal);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
          invalidField = hoursName;
          return undefined;
        }
        return Math.round(parsed * 60);
      }
      return integer(minutesName, nullable);
    };

    const update = {
      projectId,
      version,
      costCenterCode: text('costCenterCode'),
      name: text('name') ?? undefined,
      poNumber: text('poNumber'),
      description: text('description'),
      projectAlias: text('projectAlias'),
      timezone: text('timezone') ?? undefined,
      billingModel: text('billingModel') ?? undefined,
      siteName: text('siteName'),
      country: text('country'),
      projectManagerId: text('projectManagerId') || null,
      expectedMinutesPerDay:
        hoursToMinutes('expectedHoursPerDay', 'expectedMinutesPerDay') ?? undefined,
      clientDailyMinimumMinutes: hoursToMinutes(
        'clientDailyMinimumHours',
        'clientDailyMinimumMinutes',
        true,
      ),
      budgetMinor: moneyMinor('budgetMinor'),
      revenueBudgetMinor: moneyMinor('revenueBudgetMinor'),
      poCapMinor: moneyMinor('poCapMinor'),
      fixedPriceMinor: moneyMinor('fixedPriceMinor'),
      laborBudgetMinutes: integer('laborBudgetMinutes', true),
      travelBudgetMinor: moneyMinor('travelBudgetMinor'),
      expenseBudgetMinor: moneyMinor('expenseBudgetMinor'),
      otherCostBudgetMinor: moneyMinor('otherCostBudgetMinor'),
      plannedMinutes: integer('plannedMinutes', true),
      contractNumber: text('contractNumber'),
      startDate: text('startDate'),
      plannedEndDate: text('plannedEndDate'),
      budgetType: text('budgetType') ?? undefined,
      weeklyCloseEnabled: data.get('weeklyCloseEnabled') === 'on',
      dailyReportRequired: data.get('dailyReportRequired') === 'on',
      technicalReportingRequired: data.get('technicalReportingRequired') === 'on',
      notes: text('notes'),
    };
    if (invalidField)
      return actionFail(
        400,
        'problem.projectDetail.fieldInvalid',
        {},
        'A project field is missing or invalid. Correct the highlighted field before saving.',
        {
          code: 'PROJECT_DETAIL_FIELD_INVALID',
          action: 'updateProject',
          actionName: 'updateProject',
          values,
          fieldErrors: { [invalidField]: ['problem.projectDetail.fieldInvalid'] },
          remedies: [{ id: 'correct_field', projectId }],
        },
      );

    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      context.repository.updateProject(context.principal, update);
      return actionSuccess('action.projects.projectUpdated', {}, 'Project updated');
    } catch (e) {
      return detailFailure(e, 'updateProject', values, projectId);
    } finally {
      context?.sqlite.close();
    }
  },
  deleteProject: async ({ request, locals, params }) => {
    const data = await request.formData();
    const values = detailValues(data);
    if (!locals.user)
      return actionFail(401, 'action.error.unauthenticated', {}, undefined, {
        code: 'PROJECT_DETAIL_SIGN_IN_REQUIRED',
        action: 'deleteProject',
        actionName: 'deleteProject',
        values,
        remedies: [{ id: 'sign_in_again' }],
      });
    const projectId = data.get('projectId')?.toString();
    if (!projectId || projectId !== params.id)
      return actionFail(
        400,
        'problem.projectDetail.notFound',
        {},
        'This project is no longer available. Review the project list.',
        {
          code: 'PROJECT_DETAIL_NOT_FOUND',
          action: 'deleteProject',
          actionName: 'deleteProject',
          values,
          remedies: [{ id: 'review_projects' }],
        },
      );
    let context: ReturnType<typeof openPortalRepository> | undefined;
    try {
      context = openPortalRepository(locals);
      context.repository.deleteProject(context.principal, projectId);
    } catch (e) {
      return detailFailure(e, 'deleteProject', values, projectId);
    } finally {
      context?.sqlite.close();
    }
    redirect(303, '/j-aautomation/app/projects');
  },
};
