import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'apps/portal/src/lib/portal');
const billingPath = resolve(root, 'sections/BillingSection.svelte');
const accountingPath = resolve(root, 'sections/AccountingSection.svelte');
const artifactPath = resolve(root, 'ui/localized-pdf/AccountingPackArtifactStatus.svelte');

describe('billing and accounting failure recovery UI', () => {
  it.each([billingPath, accountingPath, artifactPath])(
    'compiles %s without stale-state warnings',
    (filename) => {
      const result = compile(readFileSync(filename, 'utf8'), { filename, generate: 'client' });
      expect(
        result.warnings.filter((warning) => warning.code === 'state_referenced_locally'),
      ).toEqual([]);
    },
  );

  it('reopens the affected payment history and retains reversal fields', () => {
    const source = readFileSync(billingPath, 'utf8');
    expect(source).toContain("form.billingOperation !== 'reversePayment'");
    expect(source).toContain(
      'open={Boolean(reversalDraft?.paymentId) && reversalInvoiceId === invoiceId}',
    );
    expect(source).toContain('reversalDraft.effectiveOn');
    expect(source).toContain('reversalDraft.reasonCode');
    expect(source).toContain('reversalDraft.reason');
    expect(source).toContain('data-ui="validation-summary"');
  });

  it('uses the action response for accounting dates and report language', () => {
    const source = readFileSync(accountingPath, 'utf8');
    expect(source).toContain('expanded={Boolean(createPackProblem)}');
    expect(source).toContain('packValues.periodStart');
    expect(source).toContain('packValues.periodEnd');
    expect(source).toContain('packValues.reportLocale');
    expect(source).toContain('data-accounting-pack-summary');
  });

  it('captures and restores native form scroll for payment reversal and accounting packs', () => {
    const billing = readFileSync(billingPath, 'utf8');
    const accounting = readFileSync(accountingPath, 'utf8');
    expect(billing).toContain('use:rememberReversalScroll');
    expect(billing).toContain('name="drawerScrollTop"');
    expect(billing).toContain('reversalDraft.viewportScrollY');
    expect(billing).toContain('reversalDraft.drawerScrollTop');
    expect(accounting).toContain('use:rememberPackScroll');
    expect(accounting).toContain('name="viewportScrollY"');
    expect(accounting).toContain('packValues.viewportScrollY');
  });
});
