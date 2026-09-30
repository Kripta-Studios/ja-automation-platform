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
  it.each(['project-cp020-bbs-mexico', '00000000-0000-4000-8000-000000000001', 'p'.repeat(200)])(
    'accepts a stable project identifier %s without changing operational values',
    (projectId) => {
      const parsed = expenseInputSchema.parse({ ...operationalExpense, projectId });
      expect(parsed.projectId).toBe(projectId);
      expect(parsed.amountMinor).toBe(12345n);
    },
  );

  it.each([
    '',
    ' ',
    '../project',
    'project/other',
    'project?scope=all',
    "project';--",
    'project-ñ',
    'x'.repeat(201),
  ])('rejects a malformed or unbounded project identifier %#', (projectId) => {
    const parsed = expenseInputSchema.safeParse({ ...operationalExpense, projectId });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.flatten().fieldErrors.projectId).toBeDefined();
  });

  it('retains UUID validation for an optional linked time entry on a legacy project', () => {
    const parsed = expenseInputSchema.safeParse({
      ...operationalExpense,
      projectId: 'project-cp020-bbs-mexico',
      timeEntryId: 'time-legacy',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.flatten().fieldErrors.timeEntryId).toBeDefined();
  });

  it('accepts operational truth without commercial interpretation', () => {
    const result = expenseInputSchema.safeParse(operationalExpense);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amountMinor).toBe(12345n);
  });

  it('accepts optional local occurrence time and linked shift, and rejects impossible clock times', () => {
    expect(
      expenseInputSchema.safeParse({ ...operationalExpense, occurredTimeLocal: '09:35' }).success,
    ).toBe(true);
    expect(
      expenseInputSchema.safeParse({
        ...operationalExpense,
        occurredTimeLocal: '',
        timeEntryId: '',
      }).success,
    ).toBe(true);
    expect(
      expenseInputSchema.safeParse({ ...operationalExpense, occurredTimeLocal: '24:00' }).success,
    ).toBe(false);
    expect(
      expenseInputSchema.safeParse({ ...operationalExpense, occurredTimeLocal: '09:75' }).success,
    ).toBe(false);
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
