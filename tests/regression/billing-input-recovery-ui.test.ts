import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const filename = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/sections/BillingSection.svelte',
);
const source = readFileSync(filename, 'utf8');

describe('billing input failure recovery UI', () => {
  it('compiles without capturing the initial form response', () => {
    const result = compile(source, { filename, generate: 'client' });
    expect(
      result.warnings.filter((warning) => warning.code === 'state_referenced_locally'),
    ).toEqual([]);
  });

  it.each([
    'createBillingRule',
    'createLegalEntity',
    'createTaxProfile',
    'createInvoiceNumberPolicy',
    'updateLegalEntity',
    'updateBillingRule',
    'archiveBillingRule',
    'closePeriod',
    'setInvoicePlanningDates',
    'emailInvoice',
    'approveInvoice',
    'deleteInvoice',
    'recalculateApprovedInvoice',
    'issueInvoice',
    'restoreCreditNoteState',
    'createInvoiceAdjustment',
    'sendInvoice',
    'voidInvoice',
  ])('matches %s failures to their owning form', (operation) => {
    expect(source).toContain(`problemFor('${operation}'`);
    expect(source).toMatch(new RegExp(`recoveryOptions\\(\\s*'${operation}'`));
  });

  it('keeps the active workspace, selected invoice, and both scroll containers', () => {
    expect(source).toContain('const billingFailureOperation = $derived(');
    expect(source).toContain('const invoiceFailureId = $derived(');
    expect(source).toContain("workspace = 'setup'");
    expect(source).toContain("workspace = 'streams'");
    expect(source).toContain('drawerScrollTop');
    expect(source).toContain('viewportScrollY');
    expect(source).toContain('data-billing-recovery-summary');
  });

  it('compares checkbox state with submitted presence and captures programmatic submissions', () => {
    expect(source).toContain('control.checked !== submitted.has(name)');
    expect(source).toContain("formElement.addEventListener('formdata', onFormData)");
    expect(source).toContain("data.set('viewportScrollY', scrollInput.value)");
    expect(source).toContain("data.set('drawerScrollTop', drawerScrollInput.value)");
    expect(source).toContain("formElement.removeEventListener('formdata', onFormData)");
  });
});
