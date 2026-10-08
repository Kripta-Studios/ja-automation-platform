import { afterEach, expect, it, vi } from 'vitest';
import { requestFinanceGuidedRecovery } from '../../apps/portal/src/lib/portal/finance-guided-recovery';
import {
  subscribeGuidedRecovery,
  type RecoveryRequest,
} from '../../apps/portal/src/lib/portal/guided-recovery/events';

afterEach(() => vi.unstubAllGlobals());
it('hands indexed person errors and retained values to the shared dialog under the original batch action', () => {
  vi.stubGlobal('window', {});
  let captured: RecoveryRequest | undefined;
  const unsubscribe = subscribeGuidedRecovery((request) => {
    captured = request;
  });
  try {
    const values = { rows: '[{"workerId":"worker-a","customerHourlyRate":"50.00"}]' };
    requestFinanceGuidedRecovery(
      {
        code: 'PROJECT_PERSON_TERMS_INVALID',
        messageKey: 'problem.projectDetail.personTermsInvalid',
        fields: {
          '0.effectiveFrom': ['Enter a valid date.'],
          '0.customerHourlyRate': ['Enter a valid number.'],
        },
        correlationId: 'test-ref',
        values,
      },
      undefined,
      'savePeopleTerms',
      'problem.projectDetail.personTermsInvalid',
    );
    expect(captured?.problem).toMatchObject({
      actionName: 'savePeopleTerms',
      correlationId: 'test-ref',
      values,
      fieldErrors: {
        '0.effectiveFrom': ['Enter a valid date.'],
        '0.customerHourlyRate': ['Enter a valid number.'],
      },
    });
  } finally {
    unsubscribe();
  }
});
