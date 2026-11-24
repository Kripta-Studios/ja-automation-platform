import { describe, expect, it } from 'vitest';
import { ownerCorrectionDraftVersion } from '../../apps/portal/src/lib/portal/time-detail-actions';

const eligible = {
  role: 'owner_admin',
  userId: 'owner',
  correctionActor: 'owner',
  approvalState: 'draft',
  invoiceId: null,
  billingStatus: 'unlocked',
  billingLockId: null,
  lockedAt: null,
  version: 3,
};

describe('Owner correction detail submission affordance', () => {
  it.each(['owner_admin', 'finance_admin', 'project_manager'])(
    'offers the current version for an unlocked correction authored by %s',
    (role) => {
      expect(ownerCorrectionDraftVersion({ ...eligible, role })).toBe(3);
    },
  );

  it.each([
    { role: 'worker' },
    { role: 'auditor_read_only' },
    { correctionActor: null },
    { correctionActor: 'another-user' },
    { approvalState: 'submitted' },
    { approvalState: 'approved' },
    { invoiceId: 'issued-invoice' },
    { billingStatus: 'locked' },
    { billingLockId: 'billing-lock' },
    { lockedAt: '2026-10-05T15:00:00Z' },
  ])('does not offer submission for ineligible state %j', (change) => {
    expect(ownerCorrectionDraftVersion({ ...eligible, ...change })).toBeNull();
  });
});
