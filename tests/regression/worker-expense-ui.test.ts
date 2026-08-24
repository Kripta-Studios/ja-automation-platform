import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'apps/portal/src');

const read = (path: string): string => readFileSync(resolve(sourceRoot, path), 'utf8');

describe('worker expense slice', () => {
  it('keeps the recent-expense register ahead of the single primary create action', () => {
    const source = read('lib/portal/sections/ExpenseSection.svelte');
    expect(source.indexOf('Recent expenses')).toBeGreaterThanOrEqual(0);
    expect(source.indexOf('Recent expenses')).toBeLessThan(source.indexOf('Record expense'));
    expect(source).toMatch(/data-expense-primary-cta/);
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
