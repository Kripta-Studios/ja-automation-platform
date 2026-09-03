import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INVOICE_TEMPLATE_REGISTRY,
  renderInvoiceTemplate,
  resolveInvoiceTemplate,
} from '../packages/invoice-templates/src/index.ts';
import { invoicePdf } from '@ja/reporting';

const pdfText = (bytes: Uint8Array): string => {
  const directory = mkdtempSync(join(tmpdir(), 'ja-invoice-template-registry-'));
  const file = join(directory, 'invoice.pdf');
  try {
    writeFileSync(file, bytes);
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
      .replace(/\s+/g, ' ')
      .trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const pdfLayout = (bytes: Uint8Array): string => {
  const directory = mkdtempSync(join(tmpdir(), 'ja-invoice-template-layout-'));
  const file = join(directory, 'invoice.pdf');
  try {
    writeFileSync(file, bytes);
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const baseSnapshot = (id: string) => ({
  number: `JA-${id}`,
  locale: 'en',
  template: { id, version: 1 },
  legalEntity: { legalName: 'J&A Automation', billingAddress: 'Configured address' },
  client: { legalName: 'Northline Mobility', billingEmail: 'ap@example.com' },
  project: { number: 'P-001', name: 'Commissioning', poNumber: 'PO-9' },
  calculation: {
    currency: 'EUR',
    subtotalMinor: '123456',
    taxMinor: '24691',
    totalMinor: '148147',
  },
  lines: [{ description: 'Startup support & customer handover', subtotal_minor: '123456' }],
});

describe('controlled invoice template registry', () => {
  it('contains exactly the five active families with stable version identities', () => {
    expect(INVOICE_TEMPLATE_REGISTRY).toHaveLength(5);
    expect(INVOICE_TEMPLATE_REGISTRY.map((template) => template.id)).toEqual([
      'labor-detailed',
      'labor-summary',
      'expenses-detailed',
      'fixed-milestone',
      'credit-adjustment',
    ]);
    expect(INVOICE_TEMPLATE_REGISTRY.every((template) => template.status === 'active')).toBe(true);
    expect(INVOICE_TEMPLATE_REGISTRY.map((template) => template.versionId)).toEqual([
      'labor-detailed-v1',
      'labor-summary-v1',
      'expenses-detailed-v1',
      'fixed-milestone-v1',
      'credit-adjustment-v1',
    ]);
  });

  it('renders all five materially distinct PDF contracts', () => {
    const expectedBlocks: Readonly<Record<string, string>> = {
      'labor-detailed': 'Worker',
      'labor-summary': 'Summary quantity',
      'expenses-detailed': 'Vendor',
      'fixed-milestone': 'Milestone',
      'credit-adjustment': 'Original invoice',
    };
    const texts = INVOICE_TEMPLATE_REGISTRY.map((template) => {
      const snapshot = baseSnapshot(template.id);
      const rendered = renderInvoiceTemplate(snapshot);
      expect(rendered.definition.id).toBe(template.id);
      const bytes = invoicePdf(snapshot);
      expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
      const text = pdfText(bytes);
      expect(text.replace(/\s/g, '').toLowerCase()).toContain(
        expectedBlocks[template.id]!.replace(/\s/g, '').toLowerCase(),
      );
      return text;
    });
    expect(new Set(texts).size).toBe(5);
  });

  it('accepts only explicit compatibility aliases and rejects substring/free-text IDs', () => {
    expect(resolveInvoiceTemplate('default').id).toBe('labor-detailed');
    expect(resolveInvoiceTemplate('fixed-fee').id).toBe('fixed-milestone');
    expect(() => resolveInvoiceTemplate('credit-adjustment-custom')).toThrow(
      'Unknown invoice template ID',
    );
    expect(() => resolveInvoiceTemplate('labor-detailed-v2')).toThrow(
      'Unknown invoice template ID',
    );
    expect(() => resolveInvoiceTemplate({ id: 'labor-detailed', version: 2 })).toThrow(
      'Unsupported invoice template version',
    );
  });

  it('escapes optional line content and leaves absent optional data explicit', () => {
    const rendered = renderInvoiceTemplate({
      ...baseSnapshot('labor-detailed'),
      lines: [{ description: '<unsafe & text>', subtotal_minor: '1' }],
      legalEntity: undefined,
    });
    expect(rendered.body).toContain('&lt;unsafe &amp; text&gt;');
    expect(rendered.body).toContain('Not provided');
  });

  it('emits structured party, metadata and total blocks for the PDF stylesheet', () => {
    const rendered = renderInvoiceTemplate(baseSnapshot('labor-detailed'));
    expect(rendered.body).toContain('class="invoice-parties"');
    expect(rendered.body).toContain('class="invoice-party-label"');
    expect(rendered.body).toContain('class="invoice-meta"');
    expect(rendered.body).toContain('class="invoice-field"');
    expect(rendered.body).toContain('class="invoice-lines"');
    expect(rendered.body).toContain('class="invoice-total"');
    expect(rendered.body).not.toContain('<dl class="invoice-meta">');

    const layout = pdfLayout(invoicePdf(baseSnapshot('labor-detailed')));
    expect(layout.split(/\r?\n/).some((line) => /From/i.test(line) && /Bill to/i.test(line))).toBe(
      true,
    );
    expect(
      layout.split(/\r?\n/).some((line) => /Issue date/i.test(line) && /Due date/i.test(line)),
    ).toBe(true);
  });

  it('formats object service periods instead of leaking [object Object]', () => {
    const rendered = renderInvoiceTemplate({
      ...baseSnapshot('labor-detailed'),
      servicePeriod: { start: '2026-08-10', end: '2026-08-16' },
    });
    expect(rendered.body).toContain('2026-08-10 → 2026-08-16');
    expect(rendered.body).not.toContain('[object Object]');
  });

  it('does not print internal source ids as bill references or overflow the amount column', () => {
    const sourceId = '01a05861-aaad-7441-9d2c-6640dc8449ae';
    const snapshot = {
      ...baseSnapshot('fixed-milestone'),
      lines: [
        {
          description: 'Commissioning milestone',
          milestone: 'FAT complete',
          source_id: sourceId,
          sourceId: sourceId,
          subtotal_minor: '123456',
        },
      ],
    };
    const rendered = renderInvoiceTemplate(snapshot);
    expect(rendered.body).not.toContain(sourceId);
    expect(rendered.body).toContain('class="amount"');
    expect(rendered.body).not.toContain('nth-child(n+3)');

    const layout = pdfLayout(invoicePdf(snapshot));
    expect(layout).not.toContain(sourceId);
    expect(layout.replace(/\s+/g, ' ')).toMatch(/Amount/i);
    const amountLine = layout.split(/\r?\n/).find((line) => /1[.,]234[.,]56/.test(line));
    expect(amountLine).toBeDefined();
    expect(amountLine).not.toContain(sourceId);
  });
});
