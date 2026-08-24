import { describe, expect, it } from 'vitest';
import { expenseInputSchema } from '@ja/schemas';

const operationalExpense = {
  projectId: '4d533fd6-ef5b-48e5-8fe9-4aa12ad52dac',
  spentOn: '2026-08-24',
  vendor: 'Hotel Industrial',
  category: 'hotel' as const,
  description: 'Accommodation during commissioning',
  currency: 'EUR' as const,
  amountMinor: '12345',
  whoPaid: 'worker' as const,
  paymentMethod: 'personal card',
  receiptRequired: true,
};

describe('Worker expense operational input', () => {
  it('accepts operational truth without commercial interpretation', () => {
    const result = expenseInputSchema.safeParse(operationalExpense);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amountMinor).toBe(12345n);
  });

  it.each([
    ['clientTreatment', 'reimbursable'],
    ['billingTreatment', 'reimbursable_at_cost'],
    ['markupBps', 1_000],
    ['taxAmountMinor', '2100'],
    ['projectCurrencyAmountMinor', '12345'],
    ['fxRateBps', 10_000],
  ])('rejects forged Finance-only %s', (field, value) => {
    const result = expenseInputSchema.safeParse({ ...operationalExpense, [field]: value });
    expect(result.success).toBe(false);
  });
});
