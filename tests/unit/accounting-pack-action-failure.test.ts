import { describe, expect, it } from 'vitest';
import { AccountingPackRevisionError } from '@ja/database';
import { actionFailure } from '../../apps/portal/src/lib/server/portal-repository';

describe('Accounting Pack portal error boundary', () => {
  it('maps Finance authorization failures to forbidden', () => {
    expect(actionFailure(new AccountingPackRevisionError('Finance role required'))).toMatchObject({
      status: 403,
      data: { success: false },
    });
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
