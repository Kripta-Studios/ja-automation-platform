import { describe, expect, it } from 'vitest';
import { expensePolicyIssueLabels } from '../../apps/portal/src/lib/portal/expense-policy-issues.ts';
import { portalText } from '../../apps/portal/src/lib/portal-i18n.ts';

describe('expense policy blocker messages', () => {
  it('turns missing policy and FX blockers into localized user instructions', () => {
    const translate = (message: string) => portalText('es', message);
    expect(expensePolicyIssueLabels(['missing_policy', 'fx_required'], translate)).toEqual([
      'Ninguna política de gastos de la persona coincide con el pagador, la categoría y la fecha de este gasto.',
      'Es necesario convertir la moneda del gasto antes de clasificarlo.',
    ]);
  });

  it('never exposes an unknown internal issue code or an empty list', () => {
    const translate = (message: string) => portalText('en', message);
    expect(expensePolicyIssueLabels(['future_private_code'], translate)).toEqual([
      'Expense policy needs review.',
    ]);
    expect(expensePolicyIssueLabels([], translate)).toEqual(['No matching policy']);
  });
});
