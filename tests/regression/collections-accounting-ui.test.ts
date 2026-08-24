import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const ledger = (): string =>
  read('apps/portal/src/lib/portal/sections/CollectionsLedgerSection.svelte');

const accounting = (): string =>
  read('apps/portal/src/lib/portal/sections/AccountingSection.svelte');

describe('Collections / Ledger and Accounting sections', () => {
  it('renders canonical reconciliation columns and payment/reversal timeline data', () => {
    const source = ledger();

    for (const label of [
      'Gross',
      'Reversals',
      'Net collected',
      'Outstanding',
      'Direct cost',
      'Contribution',
      'Sources',
      'Payment',
      'Reversal',
      'View timeline',
    ]) {
      expect(source).toContain(`translate('${label}')`);
    }
    expect(source).toContain('row.payments');
    expect(source).toContain('row.paymentReversals');
    expect(source).toContain('paymentMoney(');
    expect(source).toContain('data-ledger-row');
    expect(source).toContain('data-timeline-event');
  });

  it('uses semantic authorized ledger export routes', () => {
    const source = ledger();

    expect(source).toContain('/app/api/invoice-collection-ledger/${format}');
    expect(source).toContain("exportHref(format: 'csv' | 'xlsx')");
    expect(source).toContain('periodStart');
    expect(source).toContain('periodEnd');
    expect(source).toContain('Export CSV');
    expect(source).toContain('Export XLSX');
  });

  it('keeps exact money display canonical and does not recalculate finance in the UI', () => {
    const source = ledger();

    expect(source).not.toMatch(/Number\s*\(|parseFloat\s*\(/);
    expect(source).not.toContain('contributionMinor =');
    expect(source).not.toContain('outstandingMinor =');
    expect(source).toContain("import { paymentMoney } from '../payment-money';");
    expect(source).toContain('directCostComplete');
  });

  it('keeps Accounting Pack creation separate from truthful artifact status rendering', () => {
    const source = accounting();

    expect(source).toContain('action="?/createAccountingPack"');
    expect(source).toContain('AccountingPackArtifactStatus');
    expect(source).toContain('Queued');
    expect(source).toContain('Failed');
    expect(source).toContain('Automatic artifact processing pending');
    expect(source).not.toContain('runJobs');
    expect(source).not.toContain('Run due jobs');
    expect(source).not.toContain('Process durable finance jobs');
  });

  it('provides deliberate mobile and keyboard-safe controls without global motion overrides', () => {
    const source = `${ledger()}\n${accounting()}`;

    expect(source).toContain('mobileMode="cards"');
    expect(source).toContain('min-height: 2.75rem');
    expect(source).toContain(':focus-visible');
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).not.toContain('transition: all');
  });
});
