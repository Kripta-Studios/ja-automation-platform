import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (): string =>
  readFileSync(
    resolve(process.cwd(), 'apps/portal/src/lib/portal/sections/BillingSection.svelte'),
    'utf8',
  );

describe('Billing section lifecycle surface', () => {
  it('uses a context, stage summaries, filters and a list-first invoice register', () => {
    const value = source();

    expect(value).toContain('Finance operations');
    expect(value).toContain('Billing stage summary');
    expect(value).toContain('WIP / Ready');
    expect(value).toContain('Drafts');
    expect(value).toContain('Outstanding');
    expect(value).toContain('Overdue');
    expect(value).toContain('Filter billing');
    expect(value).toContain('data-billing-invoice-list');
    expect(value).toContain('Configure billing');
    expect(value.indexOf('billing-section__filters')).toBeLessThan(
      value.indexOf('data-billing-invoice-list'),
    );
  });

  it('preserves invoice lifecycle actions and keeps issued history immutable', () => {
    const value = source();

    for (const action of [
      'approveInvoice',
      'issueInvoice',
      'sendInvoice',
      'recordPayment',
      'reversePayment',
      'voidInvoice',
      'createInvoiceAdjustment',
      'createDraft',
      'closePeriod',
    ]) {
      expect(value).toContain(`action="?/${action}"`);
    }

    expect(value).toContain('Issued history is immutable');
    expect(value).toContain("['issued', 'sent', 'partially_paid', 'overdue']");
    expect(value).toContain('idempotencyKey');
    expect(value).not.toContain('Run due jobs');
    expect(value).not.toMatch(/invoice[^\n]*(?:Edit|edit invoice)/);
  });

  it('renders planned versus actual dates, structured sign-off blockers and exact money through a prop', () => {
    const value = source();

    expect(value).toContain('Planned issue');
    expect(value).toContain('Actual issue');
    expect(value).toContain('Expected collection');
    expect(value).toContain('Actual collection');
    expect(value).toContain('customer_signoff_required');
    expect(value).toContain('data-issue-blocker');
    expect(value).toContain('Open sign-off');
    expect(value).toContain('formatMoney:');
    expect(value).toContain('formatMoney(');
    expect(value).not.toContain('parseFloat(');
    expect(value).not.toMatch(/\bNumber\s*\(/);
  });

  it('has deliberate mobile cards, accessible status/action states and reduced-motion support', () => {
    const value = source();

    expect(value).toContain('data-invoice-row');
    expect(value).toContain("aria-label={translate('Invoice timeline')}");
    expect(value).toContain('role="alert"');
    expect(value).toContain('min-height: 2.75rem');
    expect(value).toContain('@media (max-width: 760px)');
    expect(value).toContain('@media (prefers-reduced-motion: reduce)');
    expect(value).toContain(':focus-visible');
    expect(value).not.toMatch(/transition\s*:\s*all/);
  });
});
