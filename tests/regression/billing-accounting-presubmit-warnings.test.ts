import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const billingPath = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/sections/BillingSection.svelte',
);
const accountingPath = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/sections/AccountingSection.svelte',
);

describe('billing and accounting pre-submit warnings', () => {
  it.each([billingPath, accountingPath])('compiles %s without warning regressions', (filename) => {
    const result = compile(readFileSync(filename, 'utf8'), { filename, generate: 'client' });
    expect(
      result.warnings.filter((warning) =>
        ['state_referenced_locally', 'css_unused_selector'].includes(warning.code),
      ),
    ).toEqual([]);
  });

  it('warns before both draft creation paths and before issuing an approved invoice', () => {
    const source = readFileSync(billingPath, 'utf8');
    expect(source).toContain("code: 'WARNING_BILLING_DRAFT_PERIOD_SCOPE'");
    expect(source).toContain("code: 'WARNING_BILLING_ISSUE_LOCKS_DRAFT'");
    expect(source).toMatch(
      /<h3>\{translate\('Save \/ issue'\)\}<\/h3>[\s\S]*?problem=\{draftPeriodWarning\}[\s\S]*?<button\s+type="submit"/,
    );
    expect(source).toMatch(
      /action="\?\/createDraft"\s+class="billing-section__period-form"[\s\S]*?problem=\{draftPeriodWarning\}[\s\S]*?<button type="submit">/,
    );
    expect(source).toMatch(
      /problem=\{issueInvoiceWarning\}[\s\S]*?<form\s+method="POST"\s+action="\?\/issueInvoice"/,
    );
  });

  it('shows uncertain delivery warning only for a visible uncertain delivery', () => {
    const source = readFileSync(billingPath, 'utf8');
    expect(source).toContain("code: 'WARNING_BILLING_DELIVERY_UNCERTAIN'");
    expect(source).toMatch(
      /invoiceEmailDeliveries \?\? \[\]\)\.some\(\(delivery\) =>\s+delivery\.invoiceId === invoiceId && delivery\.status === 'uncertain'\)/,
    );
    expect(source).toMatch(
      /problem=\{uncertainDeliveryWarning\}[\s\S]*?<form\s+method="POST"\s+action="\?\/emailInvoice"/,
    );
    expect(source).toContain('id="invoice-email-deliveries"');
  });

  it('warns that adjustments create a separate audited draft and pack artifacts require review', () => {
    const billing = readFileSync(billingPath, 'utf8');
    const accounting = readFileSync(accountingPath, 'utf8');
    expect(billing).toContain("code: 'WARNING_BILLING_ADJUSTMENT_AUDIT'");
    expect(billing).toMatch(
      /problem=\{adjustmentWarning\}[\s\S]*?<form\s+method="POST"\s+action="\?\/createInvoiceAdjustment"/,
    );
    expect(accounting).toContain("code: 'WARNING_ACCOUNTING_PACK_NEW_VERSION'");
    expect(accounting).toMatch(
      /action="\?\/createAccountingPack"[\s\S]*?problem=\{accountingVersionWarning\}[\s\S]*?<button type="submit">/,
    );
  });
});
