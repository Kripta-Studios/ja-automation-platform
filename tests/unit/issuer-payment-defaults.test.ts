import { describe, expect, it } from 'vitest';
import { issuerPaymentDefaults } from '../../packages/database/src/domains/billing/issuer-payment-defaults.ts';

describe('J&A USD invoice payment defaults', () => {
  it('uses the supplied bank details only for the J&A USD issuer', () => {
    expect(issuerPaymentDefaults('JA-USA', 'USD')).toEqual({
      bankSwiftNumber: 'WFBIUS6S',
      bankAccountNumber: '8769915615',
      bankName: 'Wells Fargo Bank',
      beneficiary: 'J&A Automation LLC',
    });
    expect(issuerPaymentDefaults('CUSTOMER', 'USD')).toEqual({});
    expect(issuerPaymentDefaults('JA-USA', 'EUR')).toEqual({});
  });
});
