export const BILLING_READINESS_MESSAGE_KEYS = {
  no_billable_sources: 'action.billing.readiness.noBillableSources',
  period_cutoff_mismatch: 'action.billing.readiness.periodCutoffMismatch',
  pending_time_approval: 'action.billing.readiness.pendingTimeApproval',
  pending_time_submission: 'action.billing.readiness.pendingTimeSubmission',
  pending_time_finance_review: 'action.billing.readiness.pendingTimeFinanceReview',
  pending_expense_approval: 'action.billing.readiness.pendingExpenseApproval',
  missing_tax_profile: 'action.billing.readiness.missingTaxProfile',
  inactive_tax_profile: 'action.billing.readiness.inactiveTaxProfile',
  missing_legal_entity: 'action.billing.readiness.missingLegalEntity',
  archived_legal_entity: 'action.billing.readiness.archivedLegalEntity',
  legal_entity_currency_mismatch: 'action.billing.readiness.legalEntityCurrencyMismatch',
  tax_profile_currency_mismatch: 'action.billing.readiness.taxProfileCurrencyMismatch',
  tax_profile_legal_entity_mismatch: 'action.billing.readiness.taxProfileLegalEntityMismatch',
  invalid_period: 'action.billing.readiness.invalidPeriod',
  invalid_period_configuration: 'action.billing.readiness.invalidPeriodConfiguration',
  missing_fixed_price: 'action.billing.readiness.missingFixedPrice',
  cap_exhausted: 'action.billing.readiness.capExhausted',
  missing_client_rate: 'action.billing.readiness.missingClientRate',
  ambiguous_client_rate: 'action.billing.readiness.ambiguousClientRate',
  missing_expense_classification: 'action.billing.readiness.missingExpenseClassification',
  missing_internal_cost: 'action.billing.readiness.missingInternalCost',
  missing_compensation_rule: 'action.billing.readiness.missingCompensationRule',
  no_new_client_unit_charges: 'action.billing.readiness.noNewClientUnitCharges',
  hybrid_requires_hourly_client_rates: 'action.billing.readiness.hybridHourlyRequired',
  missing_expense_currency_conversion: 'action.billing.readiness.missingExpenseCurrencyConversion',
  missing_expense_finance_projection: 'action.billing.readiness.missingExpenseFinanceProjection',
  customer_signoff_required: 'action.billing.readiness.customerSignoffRequired',
  canonical_legal_entity_revision_required:
    'action.billing.readiness.canonicalLegalEntityRevisionRequired',
  missing_accountant_approved_number_policy: 'action.billing.readiness.missingInvoiceNumberPolicy',
  inactive_billing_configuration: 'action.billing.readiness.inactiveBillingConfiguration',
  stale_billing_configuration: 'action.billing.readiness.staleBillingConfiguration',
} as const;

export type BillingReadinessMessageKey =
  (typeof BILLING_READINESS_MESSAGE_KEYS)[keyof typeof BILLING_READINESS_MESSAGE_KEYS];

export function billingReadinessMessageKey(code: unknown): string {
  const mapped =
    BILLING_READINESS_MESSAGE_KEYS[String(code) as keyof typeof BILLING_READINESS_MESSAGE_KEYS];
  return mapped ?? 'action.conflict.billingPeriodIncomplete';
}

export function billingReadinessRemedyId(reasonCode: string, role?: string): string {
  if (reasonCode === 'missing_expense_classification') return 'review_billing_setup';
  if (/time|expense|signoff/u.test(reasonCode)) return 'review_pending_records';
  if (role && role !== 'owner_admin' && /number_policy|issuer|legal_entity/u.test(reasonCode))
    return 'contact_owner';
  return 'review_billing_setup';
}

export function billingReadinessReviewPath(
  reasonCodes: readonly string[],
  projectId = '',
  period?: { start: string; end: string },
  sourceRecord?: string,
): string {
  const project = projectId ? `&project=${encodeURIComponent(projectId)}` : '';
  const dates =
    period && /^\d{4}-\d{2}-\d{2}$/.test(period.start) && /^\d{4}-\d{2}-\d{2}$/.test(period.end)
      ? `&from=${encodeURIComponent(period.start)}&to=${encodeURIComponent(period.end)}`
      : '';
  if (reasonCodes.includes('missing_expense_classification'))
    return `/finance?view=commercial${project}${dates}${sourceRecord ? `&expense=${encodeURIComponent(sourceRecord)}` : ''}#expense-classification`;
  if (reasonCodes.includes('ambiguous_client_rate'))
    return `/finance?view=commercial${project}${dates}&task=Client%20labor%20rates#finance-client-rate`;
  if (reasonCodes.includes('missing_internal_cost'))
    return `/finance?view=commercial${project}${dates}&task=Internal%20loaded%20cost${sourceRecord ? `&sourceRecord=${encodeURIComponent(sourceRecord)}` : ''}#finance-internal-worker`;
  if (reasonCodes.includes('missing_compensation_rule'))
    return `/finance?view=commercial${project}${dates}&task=Worker%20compensation${sourceRecord ? `&sourceRecord=${encodeURIComponent(sourceRecord)}` : ''}#finance-comp-worker`;
  if (reasonCodes.includes('pending_time_submission')) {
    return `/time?status=attention${project}${dates}`;
  }
  if (reasonCodes.includes('pending_time_finance_review'))
    return `/approvals?stage=finance${project}${dates}#finance-review`;
  if (reasonCodes.some((code) => code.includes('time_approval')))
    return `/approvals?queue=time${project}${dates}`;
  if (reasonCodes.some((code) => code.includes('expense')))
    return `/approvals?queue=expenses${project}${dates}`;
  if (reasonCodes.some((code) => code.includes('client_rate')))
    return `/finance?view=commercial${project}${dates}&task=Client%20labor%20rate${sourceRecord ? `&sourceRecord=${encodeURIComponent(sourceRecord)}` : ''}#finance-client-rate`;
  return '/billing';
}

type ReadinessReason = { code?: string; sourceId?: string };
export type ReadinessGuidancePreview = {
  reasons: readonly ReadinessReason[];
  includedSourceCount: number;
  timeReadiness?: {
    recordCount: number;
    groups: readonly { status: string; recordCount: number }[];
  } | null;
};

/** Each blocker keeps its own remedy; queue priority must never redirect a rate remedy. */
export function billingReadinessRecoveryRequest(
  preview: ReadinessGuidancePreview,
  context: { projectId: string; period: { start: string; end: string }; portalPath: string },
  translate: (key: string, params?: Record<string, string | number>) => string,
): RecoveryRequest {
  const codes = [
    ...new Set(preview.reasons.map((reason) => reason.code).filter(Boolean)),
  ] as string[];
  const actionKeys: Record<string, string> = {
    pending_time_finance_review: 'billing.readiness.reviewFinancial',
    pending_time_approval: 'billing.readiness.reviewOperational',
    pending_time_submission: 'billing.readiness.submitTime',
    missing_client_rate: 'billing.readiness.configureSaleRate',
    ambiguous_client_rate: 'billing.readiness.configureSaleRate',
    missing_internal_cost: 'billing.readiness.configureInternalCost',
    missing_compensation_rule: 'billing.readiness.configureCompensation',
  };
  const links = codes.map((code) => ({
    label: translate(actionKeys[code] ?? billingReadinessMessageKey(code)),
    href: `${context.portalPath}${billingReadinessReviewPath(
      [code],
      context.projectId,
      context.period,
      preview.reasons.find((reason) => reason.code === code)?.sourceId,
    )}`,
  }));
  const groups = preview.timeReadiness?.groups ?? [];
  const count = (statuses: readonly string[]) =>
    groups
      .filter((group) => statuses.includes(group.status))
      .reduce((sum, group) => sum + group.recordCount, 0);
  const counts = preview.timeReadiness
    ? translate('billing.readiness.recordCounts', {
        sourceCount: preview.timeReadiness.recordCount,
        approvedCount: count([
          'pending_finance_review',
          'finance_nonbillable',
          'already_billed',
          'reserved_in_draft',
          'reserved_in_approved_invoice',
          'excluded_by_policy',
          'missing_client_rate',
          'eligible',
        ]),
        pendingApprovalCount: count(['pending_submission', 'pending_operational_approval']),
        pendingFinanceCount: count(['pending_finance_review']),
        pendingCorrectionCount: count(['pending_correction']),
        includedCount: preview.includedSourceCount,
      })
    : '';
  return {
    links,
    problem: {
      code: 'BILLING_PERIOD_READINESS_INCOMPLETE',
      messageKey: 'problem.billing.readinessGuidance',
      params: {
        periodStart: context.period.start,
        periodEnd: context.period.end,
        counts,
        blockers: codes.map((code) => translate(billingReadinessMessageKey(code))).join(' '),
      },
      fieldErrors: {},
      remedies: [],
      correlationId: '',
    },
  };
}
import type { RecoveryRequest } from './guided-recovery/events';
