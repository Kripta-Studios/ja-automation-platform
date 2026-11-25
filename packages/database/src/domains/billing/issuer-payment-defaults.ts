/** Editable starting values for new invoices from the J&A USD issuer. */
export function issuerPaymentDefaults(
  issuerCode: unknown,
  currency: unknown,
): Record<string, string> {
  if (issuerCode !== 'JA-USA' || currency !== 'USD') return {};
  return {
    bankSwiftNumber: 'BOFAUS3N',
    bankAccountNumber: '488117823145',
    bankName: 'Bank of America',
    beneficiary: 'J&A Automation LLC',
    bankAchRouting: '111000025',
    bankWireRouting: '026009593',
    bankSwiftEur: 'BOFAUS6S',
  };
}
