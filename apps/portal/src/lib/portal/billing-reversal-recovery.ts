/** A failed reversal stays visible for review even when another action used its full balance. */
export function reversalRecoveryState(
  remainingMinor: unknown,
  attemptedPaymentId: string | undefined,
  paymentId: string,
): { visible: boolean; canSubmit: boolean } {
  const raw = String(remainingMinor ?? '').trim();
  const canSubmit = /^\d+$/.test(raw) && /[1-9]/.test(raw);
  return { visible: canSubmit || attemptedPaymentId === paymentId, canSubmit };
}
