import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '@ja/database';
import { billingActionFailure } from '../../apps/portal/src/lib/server/actions/billing-actions';

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
    expect(value).toMatch(
      /\{@const planningEditable =\s*canManageBilling &&\s*\['draft', 'approved'\]\.includes\(invoiceStateValue\) &&\s*!historicalIssueMarkers\}/u,
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
    expect(value).toContain('<fieldset disabled={!planningEditable}>');
    expect(value).toContain("<legend>{translate('Planned and expected dates')}</legend>");
    expect(value).toContain('min-height: 2.75rem');
    expect(value).toContain('@media (max-width: 760px)');
    expect(value).toContain('@media (prefers-reduced-motion: reduce)');
    expect(value).toContain(':focus-visible');
    expect(value).not.toContain('transition: all');
  });

  it('shows attempted dates in a disabled recovery form when an invoice became issued', () => {
    const value = source();
    const drawer = value.slice(
      value.indexOf('{@const planningEditable ='),
      value.indexOf('<h3 id="invoice-collections"'),
    );
    const recovery = value.slice(
      value.indexOf('function recoverBillingForm('),
      value.indexOf('function recoverBillingForm(') + 9000,
    );
    const values = {
      invoiceId: 'invoice-123',
      plannedIssueOn: '2026-10-12',
      expectedCollectionOn: '2026-11-12',
      expectedVersion: '4',
    };
    const failure = billingActionFailure(
      new ConflictError('Issued invoice planning is immutable'),
      'setInvoicePlanningDates',
      'finance_admin',
      values,
    );

    expect(failure.data).toMatchObject({
      code: 'BILLING_PLANNING_INVOICE_LOCKED',
      billingOperation: 'setInvoicePlanningDates',
      values,
    });
    expect(drawer).toContain("billingProblem?.code === 'BILLING_PLANNING_INVOICE_LOCKED'");
    expect(drawer).toContain("problemFor('setInvoicePlanningDates', 'invoiceId', invoiceId)");
    expect(drawer).toContain('{#if planningEditable || planningLockedFailure}');
    expect(drawer).toContain("translate('problem.billing.planningAttemptNotSaved')");
    expect(drawer).toMatch(
      /<form[\s\S]*?action="\?\/setInvoicePlanningDates"[\s\S]*?use:recoverBillingForm=\{recoveryOptions\(\s*'setInvoicePlanningDates',\s*'invoiceId',\s*invoiceId,/u,
    );
    expect(drawer).toContain('<fieldset disabled={!planningEditable}>');
    expect(drawer).toContain(
      '{#if planningEditable}\n                          <button type="submit"',
    );
    expect(recovery).toContain('for (const [name, value] of Object.entries(values))');
    expect(recovery).toContain('else control.value = value;');
  });
});
