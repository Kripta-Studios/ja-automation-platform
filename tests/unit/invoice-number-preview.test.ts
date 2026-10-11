import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { previewInvoiceNumber } from '../../packages/database/src/domains/billing/invoice-number-preview.js';
import { nextNumberSequence } from '../../packages/database/src/core/sequence.js';
import {
  draftInvoiceTemplateSnapshot,
  invoiceDocumentSnapshot,
} from '../../apps/portal/src/lib/server/invoice-draft-preview.js';
import { renderInvoiceDocument } from '../../packages/reporting/src/invoice-document.js';

describe('read-only draft invoice numbering', () => {
  function database() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE invoice_number_policy(id TEXT,legal_entity_id TEXT,prefix TEXT,digits INTEGER,effective_from TEXT,effective_to TEXT,accountant_approved_at TEXT);
      CREATE TABLE number_sequence(scope TEXT,scope_id TEXT,next_value INTEGER,version INTEGER);
      INSERT INTO invoice_number_policy VALUES('approved','issuer','JA-',6,'2026-01-01',NULL,'2026-01-01');
      INSERT INTO invoice_number_policy VALUES('future','issuer','FUTURE',4,'2027-01-01',NULL,'2026-01-01');
      INSERT INTO invoice_number_policy VALUES('expired','issuer','OLD',4,'2026-02-01','2026-03-01','2026-01-01');
      INSERT INTO invoice_number_policy VALUES('unapproved','issuer','NO',4,'2026-09-01',NULL,NULL);`);
    return db;
  }
  it('uses the effective approved policy and matches actual allocation without consuming a number', () => {
    const db = database();
    try {
      const before = db.prepare('SELECT * FROM number_sequence').all();
      const preview = previewInvoiceNumber(db, 'issuer', '2026-10-09');
      expect(preview.number).toBe('JA--2026-000001');
      expect(preview.policy?.id).toBe('approved');
      expect(previewInvoiceNumber(db, 'issuer', '2026-10-09')).toEqual(preview);
      expect(db.prepare('SELECT * FROM number_sequence').all()).toEqual(before);
      const allocated = nextNumberSequence(db, 'invoice', 'issuer:2026');
      expect(preview.number).toBe(`JA--2026-${String(allocated).padStart(6, '0')}`);
      expect(previewInvoiceNumber(db, 'issuer', '2026-10-09').number).toBe('JA--2026-000002');
      expect(previewInvoiceNumber(db, 'other', '2026-10-09').number).toBeNull();
      expect(previewInvoiceNumber(db, 'issuer', '2027-01-01').number).toBe('FUTURE-2027-0001');
    } finally {
      db.close();
    }
  });
  it('never changes an existing sequence, even with missing policy or invalid counter', () => {
    const db = database();
    try {
      db.exec(
        "INSERT INTO number_sequence VALUES('invoice','issuer:2026',17,4),('invoice','other:2026',99,2)",
      );
      const before = db.prepare('SELECT * FROM number_sequence').all();
      expect(previewInvoiceNumber(db, 'issuer', '2026-10-09').number).toBe('JA--2026-000017');
      expect(previewInvoiceNumber(db, 'other', '2026-10-09').number).toBeNull();
      expect(db.prepare('SELECT * FROM number_sequence').all()).toEqual(before);
      db.exec("UPDATE number_sequence SET next_value=0 WHERE scope_id='issuer:2026'");
      expect(previewInvoiceNumber(db, 'issuer', '2026-10-09').number).toBeNull();
      expect(
        db.prepare("SELECT next_value FROM number_sequence WHERE scope_id='issuer:2026'").get()
          ?.next_value,
      ).toBe(0);
    } finally {
      db.close();
    }
  });
  it('labels projected numbers in browser and PDF, while finalized documents retain their frozen number', () => {
    const invoice = {
      state: 'draft',
      draft_number_preview: { number: 'JA-2026-000017' },
      subtotal_minor: '100',
      tax_minor: '0',
      total_minor: '100',
      currency: 'EUR',
    };
    const lines = [
      {
        description: 'Test work',
        subtotal_minor: '100',
        unit_price_minor: '100',
        quantity_numerator: 1,
        quantity_denominator: 1,
      },
    ];
    const snapshot = draftInvoiceTemplateSnapshot({ invoice, lines }, 'es', false);
    const doc = renderInvoiceDocument(snapshot, { numberingInteractive: true });
    expect(doc.bodyHtml.match(/Número previsto · no reservado/g)).toHaveLength(2);
    expect(doc.bodyHtml).toContain('JA-2026-000017');
    expect(doc.bodyHtml.match(/data-invoice-edit="invoiceNumber"/g)).toHaveLength(2);
    const numberingLabels = Array.from(
      doc.bodyHtml.matchAll(/data-invoice-edit="invoiceNumber" aria-label="([^"]+)"/g),
      (match) => match[1],
    );
    expect(new Set(numberingLabels).size).toBe(2);
    expect(numberingLabels.every((label) => label.includes('N.º DE FACTURA'))).toBe(true);
    const editableDoc = renderInvoiceDocument(
      { ...snapshot, legalEntity: { legalName: 'Issuer <name>', address: 'Site address' } },
      { editable: true },
    );
    expect(editableDoc.bodyHtml).not.toContain('aria-label="Editar: issuingAuthority');
    expect(editableDoc.bodyHtml).toContain('Editar: Entidad emisora · nombre del emisor');
    expect(editableDoc.bodyHtml).toContain('Editar: Entidad emisora · dirección del emisor');
    expect(editableDoc.bodyHtml).toContain('Issuer &lt;name&gt;');
    const issued = invoiceDocumentSnapshot(
      {
        invoice: {
          ...invoice,
          state: 'issued',
          invoice_number: 'HIST-01',
          snapshot_json: JSON.stringify({
            number: 'FROZEN-01',
            calculation: {
              currency: 'EUR',
              subtotalMinor: '100',
              taxMinor: '0',
              totalMinor: '100',
            },
            lines,
          }),
        },
        lines,
      },
      'es',
    );
    const frozenDoc = renderInvoiceDocument(issued);
    expect(frozenDoc.bodyHtml).toContain('FROZEN-01');
    expect(frozenDoc.bodyHtml).not.toContain('JA-2026-000017');
    expect(frozenDoc.bodyHtml).not.toContain('Número previsto');
    expect(frozenDoc.bodyHtml).not.toContain('data-invoice-edit');
  });
});
