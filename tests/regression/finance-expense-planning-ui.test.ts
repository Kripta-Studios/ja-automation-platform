import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/sections/FinanceOverviewSection.svelte',
);
const loaderPath = resolve(process.cwd(), 'apps/portal/src/routes/app/[section]/section-load.ts');

const source = (): string => readFileSync(componentPath, 'utf8');
const loader = (): string => readFileSync(loaderPath, 'utf8');

describe('Finance expense classification and planning UI', () => {
  it('loads a selected-project finance expense projection at the server boundary', () => {
    const route = loader();

    expect(route).toContain('financeExpenses: selected');
    expect(route).toContain('context.repository.listExpensesForScope(context.principal)');
    expect(route).toContain("String(expense.project_id ?? expense.projectId ?? '')");
  });

  it('uses one valid Essential preset and maps it to the canonical treatment pair', () => {
    const component = source();

    expect(component).toContain('reimbursable_at_cost:');
    expect(component).toContain("clientTreatment: 'reimbursable'");
    expect(component).toContain("billingTreatment: 'reimbursable_at_cost'");
    expect(component).toContain(
      "all_in: { clientTreatment: 'all_in', billingTreatment: 'all_in' }",
    );
    expect(component).toContain(
      "non_billable: { clientTreatment: 'non_billable', billingTreatment: 'internal_non_billable' }",
    );
    expect(component).toContain('syncExpensePreset');
    expect(component).toContain('name="clientTreatment"');
    expect(component).toContain('name="billingTreatment"');
    expect(component).toContain('name="markupBps" value="0"');
    expect(component).not.toContain("translate('Markup')");
  });

  it('keeps finance write actions behind the Finance/Admin role gate and supports zero tax', () => {
    const component = source();

    expect(component).toContain("const financeWriteRoles = ['owner_admin', 'finance_admin']");
    expect(component).toContain('const canWriteFinance = $derived(');
    expect(component).toContain(
      '{#if canWriteFinance && !locked && selectedExpenseId === expenseId}',
    );
    expect(component).toContain('name="taxBps"');
    expect(component).toContain('value="0"');
    expect(component).toContain('0% allowed');
    expect(component).toContain('name="reason"');
    expect(component).toContain('name="idempotencyKey"');
    expect(component).toContain('action="?/classifyExpenseCommercially"');
    expect(component).toContain('action="?/setExpensePlanningDates"');
    expect(component).toContain('action="?/setCompensationSettlementExpectedPaymentOn"');
  });

  it('labels expected and actual reimbursement, recovery, and settlement states separately', () => {
    const component = source();

    expect(component).toContain('Expected reimbursement');
    expect(component).toContain('Actual reimbursement');
    expect(component).toContain('Expected client recovery');
    expect(component).toContain('Actual client recovery state');
    expect(component).toContain('Expected worker payment planning');
    expect(component).toContain('Actual settled');
    expect(component).toContain('data-finance-expense-planning');
    expect(component).toContain('data-settlement-planning-form');
    expect(component).not.toContain('name="clientRate"');
    expect(component).not.toContain('name="internalCost"');
  });
});
