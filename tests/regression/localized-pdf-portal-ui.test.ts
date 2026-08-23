import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const read = (relativePath: string): string => readFileSync(resolve(root, relativePath), 'utf8');

describe('localized PDF portal UI wiring', () => {
  it.each([
    [
      'invoice detail',
      'apps/portal/src/routes/app/billing/invoices/[id]/+page.svelte',
      'ownerType="invoice"',
    ],
    [
      'period report detail',
      'apps/portal/src/routes/app/reports/period/[id]/+page.svelte',
      'ownerType="period_report_revision"',
    ],
    [
      'daily and technical detail',
      'apps/portal/src/routes/app/reports/[id]/+page.svelte',
      "isDaily ? 'daily_report' : 'technical_report'",
    ],
  ])('keeps the shared panel connected to %s', (_name, relativePath, ownerExpression) => {
    const source = read(relativePath);
    expect(source).toContain(
      "LocalizedPdfPanel from '$lib/portal/ui/localized-pdf/LocalizedPdfPanel.svelte'",
    );
    expect(source).toContain(ownerExpression);
    expect(source).toContain('class="no-print');
  });

  it('keeps download and retry actions behind truthful artifact states', () => {
    const source = read('apps/portal/src/lib/portal/ui/localized-pdf/LocalizedPdfPanel.svelte');
    expect(source).toContain("selectedVariant?.status === 'ready'");
    expect(source).toContain('canRetryLocalizedPdf(selectedVariant)');
    expect(source).toContain('localizedPdfDownloadUrl(base, variant.variantId)');
    expect(source).toContain("status === 'queued' || item.status === 'running'");
    expect(source).toContain('aria-busy={loading}');
  });

  it('wires Accounting Pack through an immutable revision-aware surface', () => {
    const shell = read('apps/portal/src/lib/PortalShell.svelte');
    const accounting = read(
      'apps/portal/src/lib/portal/ui/localized-pdf/AccountingPackArtifactStatus.svelte',
    );
    expect(shell).toContain(
      "AccountingPackArtifactStatus from './portal/ui/localized-pdf/AccountingPackArtifactStatus.svelte'",
    );
    expect(shell).toContain('<AccountingPackArtifactStatus');
    expect(accounting).toContain('ownerType="accounting_pack_revision"');
    expect(accounting).toContain('pack.revision_id');
    expect(accounting).toContain('{#if revisionId}');
    expect(accounting).not.toContain('ownerId={String(pack.id)}');
  });

  it('keeps all five localized-PDF owner types represented', () => {
    const invoice = read('apps/portal/src/routes/app/billing/invoices/[id]/+page.svelte');
    const period = read('apps/portal/src/routes/app/reports/period/[id]/+page.svelte');
    const reports = read('apps/portal/src/routes/app/reports/[id]/+page.svelte');
    const accounting = read(
      'apps/portal/src/lib/portal/ui/localized-pdf/AccountingPackArtifactStatus.svelte',
    );
    const combined = `${invoice}\n${period}\n${reports}\n${accounting}`;
    for (const ownerType of [
      'invoice',
      'period_report_revision',
      'daily_report',
      'technical_report',
      'accounting_pack_revision',
    ]) {
      expect(combined).toContain(ownerType);
    }
  });
});
