import { describe, expect, it } from 'vitest';
import { renderInvoiceDocument } from '../../packages/reporting/src/invoice-document.js';
import {
  invoiceLineKey,
  withLineDescriptions,
} from '../../packages/database/src/domains/billing/invoice-presentation-edit.js';

const snapshot = (state: string) =>
  ({
    state,
    locale: 'en',
    number: 'DRAFT PREVIEW',
    documentHeaderVersion: 2,
    client: { legalName: 'IMPC Gmbh', billingAddress: 'Line 1\nLine 2', code: 'IMPC' },
    project: { number: 'C-0020-P-001', name: 'BBS Mexico', costCenterCode: '001' },
    calculation: { currency: 'USD', subtotalMinor: '5000', taxMinor: '0', totalMinor: '5000' },
    lines: [
      {
        id: 'line-1',
        line_key: 'time:t1:regular:2026-09-17',
        description: '2026-09-17 · regular · Installation',
        source_type: 'time',
        source_id: 't1',
        quantity_numerator: 60,
        quantity_denominator: 60,
        unit_price_minor: 5000,
        subtotal_minor: 5000,
      },
    ],
  }) as never;

describe('inline invoice document', () => {
  it('marks header texts and lines as editable on a draft only', () => {
    const draft = renderInvoiceDocument(snapshot('draft'), { editable: true }).bodyHtml;
    for (const field of ['client', 'clientAddress', 'projectName', 'costCenter', 'purchaseNo', 'invoiceDate'])
      expect(draft).toContain(`data-invoice-edit="${field}"`);
    expect(draft).toContain('data-invoice-line-id="line-1"');
    expect(draft).toContain('data-invoice-edit="line"');
    const issued = renderInvoiceDocument(snapshot('issued'), { editable: false }).bodyHtml;
    expect(issued).not.toContain('data-invoice-edit');
    expect(issued).toContain('Line 1');
  });

  it('keys lines by source, category and date so descriptions survive a rebuild', () => {
    const line = {
      id: 'a',
      source_type: 'time',
      source_id: 't1',
      snapshot_json: JSON.stringify({ commercialCategory: 'overtime', work_date: '2026-09-17' }),
      description: 'old',
    };
    expect(invoiceLineKey(line)).toBe('time:t1:overtime:2026-09-17');
    expect(invoiceLineKey({ ...line, id: 'b' })).toBe(invoiceLineKey(line));
    expect(withLineDescriptions([line], { 'time:t1:overtime:2026-09-17': 'new' })[0]).toMatchObject({
      description: 'new',
    });
  });
});
