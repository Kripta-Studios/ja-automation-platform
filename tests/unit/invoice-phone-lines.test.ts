import { describe, expect, it } from 'vitest';
import { renderInvoiceDocument } from '../../packages/reporting/src/invoice-document.js';

// Phone (390 px): invoice lines are shown as labelled cards instead of a squeezed table,
// and a corrected issued invoice says which version it is.
const snapshot = (extra: Record<string, unknown> = {}) =>
  ({
    state: 'issued',
    locale: 'en',
    number: 'CP-022-003',
    documentHeaderVersion: 2,
    client: { legalName: 'IMPC Gmbh' },
    project: { number: 'C-0020-P-001', name: 'BBS Mexico' },
    calculation: { currency: 'USD', subtotalMinor: '5000', taxMinor: '0', totalMinor: '5000' },
    lines: [
      {
        id: 'line-1',
        description: '2026-09-17 · regular · Installation',
        source_type: 'time',
        source_id: 't1',
        quantity_numerator: 60,
        quantity_denominator: 60,
        unit_price_minor: '5000',
        subtotal_minor: '5000',
      },
    ],
    ...extra,
  }) as never;

describe('invoice lines on a phone', () => {
  it('labels every line cell and stacks the lines below 600 px', () => {
    const { bodyHtml, css } = renderInvoiceDocument(snapshot()) as { bodyHtml: string; css?: string };
    const cells = [...bodyHtml.matchAll(/<td[^>]*data-label="([^"]+)"/gu)].map((match) => match[1]);
    expect(cells.length).toBeGreaterThanOrEqual(4);
    const allCss = `${css ?? ''}${JSON.stringify(renderInvoiceDocument(snapshot()))}`;
    expect(allCss).toContain('table.invoice-lines>tbody>tr>td::before{content:attr(data-label)');
  });

  it('shows the version of a corrected issued invoice', () => {
    const { bodyHtml } = renderInvoiceDocument(snapshot({ version: { number: 2 } })) as {
      bodyHtml: string;
    };
    expect(bodyHtml).toContain('data-invoice-version="2"');
    expect(bodyHtml).toContain('Corrected · version 2');
    expect(
      (renderInvoiceDocument(snapshot()) as { bodyHtml: string }).bodyHtml,
    ).not.toContain('data-invoice-version');
  });
});
