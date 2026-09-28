/** Editable starting values for new invoices from the J&A USD issuer. */
export function issuerPaymentDefaults(
  issuerCode: unknown,
  currency: unknown,
): Record<string, string> {
  if (issuerCode !== 'JA-USA' || currency !== 'USD') return {};
  return {
    bankSwiftNumber: 'WFBIUS6S',
    bankAccountNumber: '8769915615',
    bankName: 'Wells Fargo Bank',
    beneficiary: 'J&A Automation LLC',
  };
}
