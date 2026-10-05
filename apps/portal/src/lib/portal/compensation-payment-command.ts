/** Advance a new payment command after an append-only payment or reversal event.
 * Net paid alone can return to an earlier value when a payment is reversed.
 */
export function compensationPaymentCommandKey(
  settlementId: string,
  paidAmountMinor: string,
  paymentEventCount: number,
): string {
  return `compensation-payment:${settlementId}:${paidAmountMinor}:${paymentEventCount}`;
}
