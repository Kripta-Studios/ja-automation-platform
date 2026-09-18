import { describe, expect, it } from 'vitest';
import {
  expenseReceiptState,
  expenseSearchMatches,
} from '../apps/portal/src/lib/portal/expense-evidence';

describe('Expense receipt evidence', () => {
  it('shares category, currency, names and accent-insensitive search across screen and export', () => {
    const expense = {
      vendor: 'Café Madrid',
      currency: 'USD',
      category: 'meals',
      project_name: 'Línea Norte',
    };
    for (const query of ['cafe', 'USD', ' meals ', 'linea norte', ''])
      expect(expenseSearchMatches(expense, query)).toBe(true);
    expect(expenseSearchMatches(expense, 'EUR')).toBe(false);
    expect(expenseSearchMatches(expense, 'USD meals')).toBe(false);
  });
  it('distinguishes a missing mandatory receipt from a permitted absence', () => {
    for (const receipt_required of [true, 1, '1'])
      expect(expenseReceiptState({ receipt_required, receipt_document_id: null })).toBe('missing');
    for (const receipt_required of [false, 0, '0', null])
      expect(expenseReceiptState({ receipt_required, receipt_document_id: null })).toBe(
        'not_required',
      );
    expect(expenseReceiptState({ receipt_required: true, receipt_document_id: '  ' })).toBe(
      'missing',
    );
  });
  it('shows evidence independently of whether it was required', () => {
    expect(expenseReceiptState({ receipt_required: false, receipt_document_id: 'document' })).toBe(
      'attached',
    );
    expect(expenseReceiptState({ receipt_required: true, receipt_document_id: 'document' })).toBe(
      'attached',
    );
  });
});
