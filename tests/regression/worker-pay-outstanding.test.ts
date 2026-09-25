import { describe, expect, it } from 'vitest';
import { workerPayOutstanding } from '$lib/server/worker-pay-outstanding';

describe('worker outstanding pay projection', () => {
  it('separates reviewed unpaid amounts from approval estimates and preserves currencies', () => {
    expect(
      workerPayOutstanding(
        [
          { state: 'settled', currency: 'EUR', remainingAmountMinor: '6875' },
          { state: 'settled', currency: 'EUR', remainingAmountMinor: '0' },
          { state: 'settled', currency: 'USD', remainingAmountMinor: '150' },
          { state: 'draft', currency: 'EUR', remainingAmountMinor: '9000' },
        ],
        [
          {
            approvalState: 'approved',
            reimbursementState: 'pending',
            currency: 'EUR',
            reimbursementAmountMinor: '200',
          },
          {
            approvalState: 'approved',
            reimbursementState: 'scheduled',
            currency: 'USD',
            reimbursementAmountMinor: '50',
          },
          {
            approvalState: 'draft',
            reimbursementState: 'pending',
            currency: 'EUR',
            reimbursementAmountMinor: '300',
          },
          {
            approvalState: 'approved',
            reimbursementState: 'reimbursed',
            currency: 'EUR',
            reimbursementAmountMinor: '400',
          },
        ],
      ),
    ).toEqual([
      { currency: 'EUR', settlementMinor: '6875', reimbursementMinor: '200' },
      { currency: 'USD', settlementMinor: '150', reimbursementMinor: '50' },
    ]);
  });
});
