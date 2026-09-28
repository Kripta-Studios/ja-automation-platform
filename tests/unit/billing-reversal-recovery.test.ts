import { describe, expect, it } from 'vitest';
import { reversalRecoveryState } from '../../apps/portal/src/lib/portal/billing-reversal-recovery';

describe('reversal recovery after a balance change', () => {
  it('keeps an attempted reversal visible but prevents another submission at zero balance', () => {
    expect(reversalRecoveryState('0', 'payment-a', 'payment-a')).toEqual({
      visible: true,
      canSubmit: false,
    });
    expect(reversalRecoveryState('0', 'payment-a', 'payment-b')).toEqual({
      visible: false,
      canSubmit: false,
    });
  });

  it('allows a payment with a remaining amount to offer reversal', () => {
    expect(reversalRecoveryState('600', undefined, 'payment-a')).toEqual({
      visible: true,
      canSubmit: true,
    });
  });
});
