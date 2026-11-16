import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'apps/portal/src');

const read = (path: string): string => readFileSync(resolve(sourceRoot, path), 'utf8');

describe('worker expense slice', () => {
  it('keeps one primary "Add expense" action above the weekly list', () => {
    const source = read('lib/portal/sections/ExpenseSection.svelte');
    expect(source).toMatch(/data-expense-primary-cta/);
    expect(source.indexOf('data-expense-primary-cta')).toBeLessThan(
      source.indexOf('{#each shownWeeks as week'),
    );
    // The duplicated week table / calendar panel was removed (owner 2026-11-16).
    expect(source).not.toContain('ExpenseWeekPanel');
  });

  it('submits one week per person with exact bigint totals and no worker payer choice', () => {
    const source = read('lib/portal/sections/ExpenseSection.svelte');
    expect(source).toContain('action="?/submitExpenseWeek"');
    expect(source).toContain('data-expense-submit-week');
    expect(source).toContain('BigInt(minor)');
    expect(source).not.toMatch(/parseFloat|Number\(text\(row, 'amount_minor'\)\)/);
    // Payer override exists only inside the finance-only Advanced area.
    const advanced = source.indexOf('{#if canOverridePayer}');
    expect(advanced).toBeGreaterThan(0);
    expect(source.indexOf('name="whoPaid"')).toBeGreaterThan(advanced);
    expect(source).toContain("['owner_admin', 'finance_admin'].includes(role)");
  });

  it('does not expose commercial classification controls or values to workers', () => {
    const source = read('lib/portal/sections/ExpenseSection.svelte');
    for (const forbidden of [
      'Client treatment',
      'Billing treatment',
      'Markup',
      'taxAmountMinor',
      'projectCurrencyAmountMinor',
      'fxRateBps',
      'clientTreatment',
      'billingTreatment',
    ]) {
      expect(source, `forbidden worker expense field: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('uses one accessible contextual surface with a phone sheet treatment', () => {
    const source = read('lib/portal/sections/ExpenseSection.svelte');
    const sheet = read('lib/portal/ui/ResponsiveSheet.svelte');
    const primitives = read('styles/portal/primitives.css');
    const responsive = read('styles/portal/responsive.css');

    expect(source).toMatch(/<ResponsiveSheet/);
    expect(source).toMatch(/data-expense-entry-surface/);
    expect(source).toMatch(/receipt-preview/);
    expect(source).toMatch(/createObjectURL/);
    expect(sheet).toMatch(/role="dialog"/);
    expect(sheet).toMatch(/aria-modal="true"/);
    expect(sheet).toMatch(/aria-describedby|aria-labelledby/);
    expect(sheet).toMatch(/Escape|keydown/);
    expect(sheet).toMatch(/focus|activeElement/i);
    expect(primitives).toMatch(/data-ui='responsive-sheet'/);
    expect(responsive).toMatch(/prefers-reduced-motion/);
    expect(responsive).toMatch(/expense-entry-sheet/);
    expect(responsive).not.toMatch(/transition\s*:\s*all/);
  });
});
