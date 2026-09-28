import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const filename = resolve(
  process.cwd(),
  'apps/portal/src/lib/portal/sections/BillingSection.svelte',
);
const source = readFileSync(filename, 'utf8');

describe('billing discard and archive pre-submit guidance', () => {
  it('compiles without state or CSS warnings', () => {
    const result = compile(source, { filename, generate: 'client' });
    expect(
      result.warnings.filter((warning) =>
        ['state_referenced_locally', 'css_unused_selector'].includes(warning.code),
      ),
    ).toEqual([]);
  });

  it('warns before archive and points to the role-safe invoice register', () => {
    expect(source).toContain("messageKey: 'problem.warning.billingArchiveStream'");
    expect(source).toMatch(
      /problem=\{archiveStreamWarning\}[\s\S]*?kind="warning"[\s\S]*?action="\?\/archiveBillingRule"/,
    );
    expect(source).toMatch(
      /review_invoice: \{[\s\S]*?href: `\$\{base\}\/app\/billing\?view=invoices`/,
    );
  });

  it('shows draft and approved consequences before their respective discard forms', () => {
    expect(source).toContain("messageKey: 'problem.warning.billingDiscardDraft'");
    expect(source).toContain("messageKey: 'problem.warning.billingDiscardApproved'");
    expect(source).toMatch(
      /invoiceStateValue === 'draft'[\s\S]*?problem=\{discardDraftWarning\}[\s\S]*?action="\?\/deleteInvoice"/,
    );
    expect(source).toMatch(
      /invoiceStateValue === 'approved'[\s\S]*?data\.user\.role === 'owner_admin'[\s\S]*?problem=\{discardApprovedWarning\}[\s\S]*?action="\?\/deleteInvoice"/,
    );
  });

  it('shows a Finance blocker only when explicit source or line counts are positive', () => {
    expect(source).toContain("messageKey: 'problem.warning.billingDiscardSourceLinkedFinance'");
    expect(source).toContain("'invoice_source_count'");
    expect(source).toContain("'invoice_line_count'");
    expect(source).toMatch(
      /data\.user\.role === 'finance_admin' && financeDraftHasKnownLinkedLines\(invoice\)[\s\S]*?problem=\{discardLinkedFinanceProblem\}[\s\S]*?action="\?\/deleteInvoice"/,
    );
    expect(source).toMatch(/typeof count === 'number'[\s\S]*?count > 0/);
    expect(source).toMatch(/typeof count === 'string' && \/\^\[1-9\]/);
    expect(source).toMatch(
      /disabled=\{data\.user\.role === 'finance_admin' &&\s+financeDraftHasKnownLinkedLines\(invoice\)\}/u,
    );
    expect(source).toMatch(
      /problem=\{discardLinkedFinanceProblem\}[\s\S]*?\{:else\}[\s\S]*?problem=\{discardDraftWarning\}/u,
    );
  });

  it('explains both invoice lines and linked sources in every supported language', () => {
    const key = 'problem.warning.billingDiscardSourceLinkedFinance';
    expect(portalText('en', key)).toMatch(/invoice lines or linked source records/u);
    expect(portalText('es', key)).toMatch(/líneas de factura o registros de origen vinculados/u);
    expect(portalText('pt', key)).toMatch(/linhas de fatura ou registros de origem vinculados/u);
  });
});
