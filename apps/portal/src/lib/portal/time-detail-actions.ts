/** The detail submit shortcut mirrors the existing Owner correction command.
 * It never grants ordinary other-worker draft editing or deletion. */
export function ownerCorrectionDraftVersion(input: {
  role: string;
  userId: string;
  correctionActor: string | null;
  approvalState: string;
  invoiceId: string | null;
  billingStatus: string;
  billingLockId: string | null;
  lockedAt: string | null;
  version: number;
}): number | null {
  // The reviewer who authored a correction sends it on (T09, pm-8): otherwise a
  // correction of a worker who never logs in stays an unsubmitted draft forever.
  return (input.role === 'owner_admin' ||
    input.role === 'finance_admin' ||
    input.role === 'project_manager') &&
    input.correctionActor === input.userId &&
    input.approvalState === 'draft' &&
    input.invoiceId === null &&
    input.billingStatus === 'unlocked' &&
    input.billingLockId === null &&
    input.lockedAt === null
    ? input.version
    : null;
}
