import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (): string =>
  readFileSync(
    resolve(process.cwd(), 'apps/portal/src/lib/portal/sections/BillingSection.svelte'),
    'utf8',
  );

describe('Billing invoice planning surface', () => {
  it('posts the established planning contract with optimistic concurrency fields', () => {
    const value = source();

    expect(value).toContain('action="?/setInvoicePlanningDates"');
    for (const field of [
      'name="invoiceId"',
      'name="expectedVersion"',
      'name="plannedIssueOn"',
      'name="expectedCollectionOn"',
    ]) {
      expect(value).toContain(field);
    }
    expect(value).toContain('Save planning dates');
  });

  it('limits planning edits to finance/owner mutable pre-issue states', () => {
    const value = source();

    expect(value).toContain('const canManageBilling = $derived(');
    expect(value).toContain("['owner_admin', 'finance_admin']");
    expect(value).toContain(
      "canManageBilling && ['draft', 'approved'].includes(invoiceStateValue)",
    );
    expect(value).toContain('Issued history is immutable');
    expect(value).not.toMatch(/invoice[^\n]*(?:Edit|edit invoice)/);
  });

  it('separates planned/expected dates from actual lifecycle and payment evidence', () => {
    const value = source();

    for (const label of [
      'Planned issue',
      'Actual issue',
      'Expected collection',
      'Actual collection',
      'Only append-only payment events count as collected',
    ]) {
      expect(value).toContain(label);
    }
    expect(value).toContain('issued_at');
    expect(value).toContain('paidAt');
    expect(value).toContain('lastPaymentDate');
    expect(value).not.toContain('Run due jobs');
    expect(value).not.toContain('runJobs');
  });

  it('keeps the planning form labeled, touch-sized, responsive, and reduced-motion safe', () => {
    const value = source();

    expect(value).toContain("aria-label={translate('Plan invoice dates')}");
    expect(value).toContain('<fieldset>');
    expect(value).toContain("<legend>{translate('Planned and expected dates')}</legend>");
    expect(value).toContain('min-height: 2.75rem');
    expect(value).toContain('@media (max-width: 760px)');
    expect(value).toContain('@media (prefers-reduced-motion: reduce)');
    expect(value).toContain(':focus-visible');
    expect(value).not.toContain('transition: all');
  });
});
