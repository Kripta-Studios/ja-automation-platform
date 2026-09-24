import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Finance expense review guidance', () => {
  it('replaces the blind approval form with a link to the exact expense classification', () => {
    const approvals = readFileSync(
      resolve(process.cwd(), 'apps/portal/src/lib/portal/sections/ApprovalSection.svelte'),
      'utf8',
    );
    const finance = readFileSync(
      resolve(process.cwd(), 'apps/portal/src/lib/portal/sections/FinanceOverviewSection.svelte'),
      'utf8',
    );
    expect(approvals).toContain("value(row, 'commercial_classification_state') !== 'classified'");
    expect(approvals).toContain('data-finance-classification-required');
    expect(approvals).toContain('expenseClassificationHref(row)');
    expect(finance).toContain("$page.url.searchParams.get('expense')");
    expect(finance).toContain('id="expense-classification"');
    expect(finance).toContain("value(expense, 'id') === linkedExpenseId");
  });
});
