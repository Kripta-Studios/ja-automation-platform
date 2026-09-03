export const BILLING_READINESS_MESSAGE_KEYS = {
  no_billable_sources: 'action.billing.readiness.noBillableSources',
  period_cutoff_mismatch: 'action.billing.readiness.periodCutoffMismatch',
  pending_time_approval: 'action.billing.readiness.pendingTimeApproval',
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
  missing_expense_currency_conversion: 'action.billing.readiness.missingExpenseCurrencyConversion',
  missing_expense_finance_projection: 'action.billing.readiness.missingExpenseFinanceProjection',
  customer_signoff_required: 'action.billing.readiness.customerSignoffRequired',
  canonical_legal_entity_revision_required:
    'action.billing.readiness.canonicalLegalEntityRevisionRequired',
  missing_accountant_approved_number_policy: 'action.billing.readiness.missingInvoiceNumberPolicy',
  inactive_billing_configuration: 'action.billing.readiness.inactiveBillingConfiguration',
} as const;

export type BillingReadinessMessageKey =
  (typeof BILLING_READINESS_MESSAGE_KEYS)[keyof typeof BILLING_READINESS_MESSAGE_KEYS];

const AUTO_RESOLVE_CODES = new Set(['no_billable_sources', 'period_cutoff_mismatch']);

export function billingReadinessMessageKey(code: unknown): string {
  const mapped =
    BILLING_READINESS_MESSAGE_KEYS[String(code) as keyof typeof BILLING_READINESS_MESSAGE_KEYS];
  return mapped ?? 'action.conflict.billingPeriodIncomplete';
}

export function isAutoResolvableBillingReadiness(reasons: readonly { code?: string }[]): boolean {
  return (
    reasons.length > 0 && reasons.every((reason) => AUTO_RESOLVE_CODES.has(String(reason.code)))
  );
}
