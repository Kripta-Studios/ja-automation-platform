import { describe, expect, it } from 'vitest';
import { AccountingPackRevisionError } from '@ja/database';
import { actionFailure } from '../../apps/portal/src/lib/server/portal-repository';

describe('Accounting Pack portal error boundary', () => {
  it('maps recent step-up failures to controlled forbidden responses', () => {
    const result = actionFailure(
      new AccountingPackRevisionError('Recent step-up authentication is required'),
    );
    expect(result).toMatchObject({
      status: 403,
      data: {
        success: false,
        stepUpRequired: true,
      },
    });
  });

  it('maps Finance authorization failures to forbidden without a step-up signal', () => {
    expect(actionFailure(new AccountingPackRevisionError('Finance role required'))).toMatchObject({
      status: 403,
      data: { success: false },
    });
    expect(
      actionFailure(new AccountingPackRevisionError('Active finance principal required')).data,
    ).not.toHaveProperty('stepUpRequired');
  });

  it('maps idempotency conflicts and validation failures without returning 500', () => {
    expect(
      actionFailure(new AccountingPackRevisionError('Snapshot hash is not idempotent')),
    ).toMatchObject({ status: 409, data: { success: false } });
    expect(
      actionFailure(new AccountingPackRevisionError('Period start must be an ISO date')),
    ).toMatchObject({ status: 400, data: { success: false } });
  });
});
