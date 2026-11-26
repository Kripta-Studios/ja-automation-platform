import { describe, expect, it } from 'vitest';
import { renderInvoiceDocument } from '../../packages/reporting/src/invoice-document.js';
import {
  expenseInvoiceSummary,
  expenseInvoiceText,
} from '../../apps/portal/src/lib/portal/expense-invoice-copy.ts';

/** Expenses on a separate invoice (owner request 2026-11-26): it reads as an expense invoice. */
const snapshot = (overrides: Record<string, unknown>) =>
  ({
    state: 'draft',
    locale: 'en',
    number: 'DRAFT PREVIEW',
    documentHeaderVersion: 2,
    client: { legalName: 'IMPC Gmbh' },
    project: { number: 'C-0020-P-004', name: 'Junkers OHIO' },
    servicePeriod: { start: '2026-09-01', end: '2026-09-30' },
    commercial: { streamType: 'expense' },
    calculation: { currency: 'USD', subtotalMinor: '4800', taxMinor: '0', totalMinor: '4800' },
    lines: [],
    ...overrides,
  }) as never;

describe('expense invoice document', () => {
  it('a draft of an expense stream is titled as an expense invoice with project and period', () => {
    const html = renderInvoiceDocument(snapshot({})).bodyHtml;
    expect(html).toContain('DRAFT EXPENSE INVOICE');
    expect(html).toContain('Expenses — Junkers OHIO — 2026-09-01 – 2026-09-30');
  });

  it('issued: only invoices issued as expense invoices; older issued ones keep their header', () => {
    const issued = renderInvoiceDocument(
      snapshot({ state: 'issued', number: 'CP-IMPC-004', documentKind: 'expenses' }),
    ).bodyHtml;
    expect(issued).toContain('>EXPENSE INVOICE<');
    const older = renderInvoiceDocument(snapshot({ state: 'issued', number: 'CP-IMPC-003' })).bodyHtml;
    expect(older).not.toContain('EXPENSE INVOICE');
    expect(older).not.toContain('data-invoice-document-title');
  });

  it('labor invoices are unchanged; Spanish and Portuguese titles', () => {
    expect(renderInvoiceDocument(snapshot({ commercial: { streamType: 'labor' } })).bodyHtml).not.toContain(
      'data-invoice-document-title',
    );
    expect(renderInvoiceDocument(snapshot({ locale: 'es' })).bodyHtml).toContain('Gastos — Junkers OHIO');
    expect(renderInvoiceDocument(snapshot({ locale: 'pt' })).bodyHtml).toContain('FATURA DE DESPESAS RASCUNHO');
  });

  it('the setting reads in plain words in every language', () => {
    expect(expenseInvoiceSummary('en', 'separate', 'client')).toBe('On a separate invoice (client default)');
    expect(expenseInvoiceSummary('es', 'same', 'project')).toBe('En la misma factura (este proyecto)');
    expect(expenseInvoiceSummary('pt', 'same', 'default')).toBe('Não definido (na mesma fatura)');
    expect(expenseInvoiceText('pt', 'choiceSaved', { date: '1 set 2026' })).toContain('1 set 2026');
  });
});
