import { describe, expect, it } from 'vitest';
import { parseExpenseUpdateForm } from '../../apps/portal/src/lib/server/actions/expense-actions';

const baseForm = {
  id: '00000000-0000-4000-8000-000000000001',
  version: '7',
  spentOn: '2026-08-23',
  vendor: 'Travel supplier',
  category: 'hotel',
  description: 'One night near the project site',
  amount: '12.34',
  projectCurrencyAmount: '12.34',
  fxRateBps: '',
  paymentMethod: 'Company card',
  receiptDocumentId: '',
};

describe('expense edit action input', () => {
  it('converts decimal amounts to exact minor units and preserves the version', () => {
    const result = parseExpenseUpdateForm(baseForm);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.id).toBe(baseForm.id);
    expect(result.data.version).toBe(7);
    expect(result.data.amountMinor).toBe(1234n);
    expect(result.data.projectCurrencyAmountMinor).toBe(1234n);
    expect(result.data.fxRateBps).toBeUndefined();
    expect(result.data).not.toHaveProperty('receiptDocumentId');
  });

  it('rejects malformed decimal input before reaching the repository', () => {
    const result = parseExpenseUpdateForm({ ...baseForm, amount: '12.345' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.amountMinor).toBeDefined();
  });

  it('requires the optimistic-lock identity fields', () => {
    const result = parseExpenseUpdateForm({ ...baseForm, id: '', version: '' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.id).toBeDefined();
    expect(result.error.flatten().fieldErrors.version).toBeDefined();
  });

  it('allows edits from the list when the legacy list row omits description', () => {
    const result = parseExpenseUpdateForm({ ...baseForm, description: '' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.description).toBeUndefined();
  });
});
