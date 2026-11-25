import { describe, expect, it } from 'vitest';
import { issuerPaymentDefaults } from '../../packages/database/src/domains/billing/issuer-payment-defaults.ts';

describe('J&A USD invoice payment defaults', () => {
  it('uses the supplied bank details only for the J&A USD issuer', () => {
    expect(issuerPaymentDefaults('JA-USA', 'USD')).toEqual({
      bankSwiftNumber: 'BOFAUS3N',
      bankAccountNumber: '488117823145',
      bankName: 'Bank of America',
      beneficiary: 'J&A Automation LLC',
    });
    expect(issuerPaymentDefaults('CUSTOMER', 'USD')).toEqual({});
    expect(issuerPaymentDefaults('JA-USA', 'EUR')).toEqual({});
  });
});
