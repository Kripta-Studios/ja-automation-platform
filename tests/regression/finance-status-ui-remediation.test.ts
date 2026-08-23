import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const billingActions = readFileSync(
  resolve(process.cwd(), 'apps/portal/src/lib/server/actions/billing-actions.ts'),
  'utf8',
);
const accountingPackStatus = readFileSync(
  resolve(
    process.cwd(),
    'apps/portal/src/lib/portal/ui/localized-pdf/AccountingPackArtifactStatus.svelte',
  ),
  'utf8',
);

describe('Accounting Pack status UI remediation', () => {
  it('uses the target pack status rather than global processed/failed counters', () => {
    expect(billingActions).toMatch(/context\.v3\s*\.listAccountingPacks\(context\.principal\)/);
    expect(billingActions).toContain('.find((candidate) => candidate.id === pack.id)');
    expect(billingActions).toContain('exportStatuses');
    expect(billingActions).toContain('Accounting Pack ${shortId} queued');
    expect(billingActions).toContain('Accounting Pack ${shortId} processing');
    expect(billingActions).toContain(
      'Accounting Pack ${shortId} failed; one or more artifacts need retry',
    );
    expect(billingActions).not.toContain('generated (${jobs.processed} artifact job(s))');
  });

  it('reports ready only when every target export is ready', () => {
    expect(billingActions).toContain('Accounting Pack ${shortId} ready');
    expect(billingActions).toContain('Accounting Pack ${shortId} queued');
    expect(billingActions).toContain('const accountingPackStatusRank: Record<string, number>');
    expect(billingActions).toMatch(/accountingPackStatusRank\[current\][\s\S]*,\s*''\s*,/);
  });

  it('renders every format through exportStatuses and exposes recorded failures', () => {
    expect(accountingPackStatus).toContain('source.exportStatuses');
    expect(accountingPackStatus).toContain(')._artifactFailures');
    for (const format of ['pdf', 'xlsx', 'invoice_csv', 'expense_csv', 'json'])
      expect(accountingPackStatus).toContain(`key: '${format}'`);
    expect(accountingPackStatus).toContain('accountingPackStatusLabel(status)');
    expect(accountingPackStatus).toMatch(/\{#if error\}[\s\S]*\{error\}[\s\S]*\{\/if\}/);
  });
});
