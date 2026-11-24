import { afterEach, describe, expect, it } from 'vitest';
import { renderInvoiceDocument } from '@ja/reporting';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
import { withNetOutstanding } from '../../apps/portal/src/lib/server/invoice-balance.ts';
import { formatDocumentNumber } from '../../packages/database/src/domains/billing/invoice-number-preview.ts';

// T12 (audit 2026-11-22, decision D15): a credit note is its own document type with its own
// number series, names the invoice it credits, has no due date, and reduces what the client
// still owes on that invoice on every balance screen.
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});

const stamp = '2026-11-10T10:00:00.000Z';
function fixture() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const principal = stepUpB5Principal(f.sqlite, f.finance, 'credit');
  const entity = f.repository.createLegalEntity(f.owner, {
    code: 'CRN',
    legalName: 'Credit Fixture Entity',
    currency: 'EUR',
    billingAddress: 'Fixture address',
    companyIdentifiers: 'CRN',
  });
  const tax = f.repository.createTaxProfile(f.finance, {
    name: 'Fixture no tax',
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'No tax', basisPoints: 0 }],
  });
  const rule = f.repository.createBillingRule(f.finance, {
    projectId: f.project.id,
    legalEntityId: entity.id,
    streamType: 'labor',
    cadenceType: 'custom',
    taxProfileId: tax.id,
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
  });
  const insert = f.sqlite.prepare(
    `INSERT INTO invoice(id,project_id,billing_rule_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,snapshot_json,issued_at,due_at,created_at,updated_at)
     VALUES(?,?,?,?,?,'issued','EUR',?,0,?,'{}',?,'2099-12-31',?,?)`,
  );
  insert.run(
    'original',
    f.project.id,
    rule.id,
    'CRN-2026-0001',
    'labor',
    299000,
    299000,
    stamp,
    stamp,
    stamp,
  );
  insert.run(
    'credit',
    f.project.id,
    rule.id,
    'CN-CRN-2026-0001',
    'adjustment',
    -10000,
    -10000,
    stamp,
    stamp,
    stamp,
  );
  f.sqlite
    .prepare(
      `INSERT INTO invoice_adjustment(id,original_invoice_id,adjustment_invoice_id,adjustment_type,reason,created_by,created_at)
       VALUES('adj','original','credit','credit','Goodwill',?,?)`,
    )
    .run(f.finance.userId, stamp);
  return { ...f, principal };
}

describe('credit notes (T12)', () => {
  it('nets the credit note against the original invoice on the ledger', () => {
    const f = fixture();
    const ledger = withNetOutstanding(f.v3.masterLedger(f.principal));
    const original = ledger.find((row) => row.invoiceId === 'original');
    const credit = ledger.find((row) => row.invoiceId === 'credit');
    expect(original).toMatchObject({
      outstandingMinor: '289000',
      documentOutstandingMinor: '299000',
      appliedCreditMinor: '10000',
    });
    expect(credit).toMatchObject({ outstandingMinor: '0', creditNoteOfInvoiceId: 'original' });
    const open = ledger.reduce((sum, row) => sum + BigInt(row.outstandingMinor), 0n);
    expect(open).toBe(289000n);
  });

  it('numbers credit notes in their own CN series', () => {
    expect(formatDocumentNumber('credit_note', '123', 2026, 1, 6)).toBe('CN-123-2026-000001');
    expect(formatDocumentNumber('invoice', '123', 2026, 3, 6)).toBe('123-2026-000003');
  });

  it('prints a credit note as a credit note that names the credited invoice, without due date', () => {
    const { bodyHtml } = renderInvoiceDocument({
      state: 'issued',
      number: 'CN-123-2026-000001',
      documentType: 'credit_note',
      creditNoteFor: '123-2026-000002',
      template: { id: 'credit-adjustment', version: 1 },
      locale: 'en',
      dueAt: '2026-12-22T00:00:00.000Z',
      paymentTermsDays: 30,
      calculation: {
        currency: 'USD',
        subtotalMinor: '-10000',
        taxMinor: '0',
        totalMinor: '-10000',
      },
      lines: [],
    });
    expect(bodyHtml).toContain('CREDIT NOTE');
    expect(bodyHtml).toContain('CREDITS INVOICE');
    expect(bodyHtml).toContain('123-2026-000002');
    expect(bodyHtml).not.toContain('DUE DATE');
    expect(bodyHtml).not.toContain('Payment terms');
    expect(bodyHtml).not.toContain('Not provided');
  });
});
