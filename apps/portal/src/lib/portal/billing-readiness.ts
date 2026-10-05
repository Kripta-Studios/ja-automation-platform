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
  if (/time|expense|signoff/u.test(reasonCode)) return 'review_pending_records';
  if (role && role !== 'owner_admin' && /number_policy|issuer|legal_entity/u.test(reasonCode))
    return 'contact_owner';
  return 'review_billing_setup';
}

export function billingReadinessReviewPath(
  reasonCodes: readonly string[],
  projectId = '',
  period?: { start: string; end: string },
): string {
  const project = projectId ? `&project=${encodeURIComponent(projectId)}` : '';
  if (reasonCodes.includes('pending_time_submission')) {
    const dates =
      period && /^\d{4}-\d{2}-\d{2}$/.test(period.start) && /^\d{4}-\d{2}-\d{2}$/.test(period.end)
        ? `&from=${encodeURIComponent(period.start)}&to=${encodeURIComponent(period.end)}`
        : '';
    return `/time?status=attention${project}${dates}`;
  }
  if (reasonCodes.includes('pending_time_finance_review'))
    return `/approvals?stage=finance${project}#finance-review`;
  if (reasonCodes.some((code) => code.includes('time_approval')))
    return `/approvals?queue=time${project}`;
  if (reasonCodes.some((code) => code.includes('expense')))
    return `/approvals?queue=expenses${project}`;
  if (reasonCodes.some((code) => code.includes('client_rate')))
    return `/finance?view=commercial${project}`;
  return '/billing';
}
