import { describe, expect, it } from 'vitest';
import { renderInvoiceTemplate } from '../../packages/invoice-templates/src/index.js';
import { draftInvoiceTemplateSnapshot } from '../../apps/portal/src/lib/server/invoice-draft-preview.js';

const preview = {
  invoice: {
    state: 'draft',
    invoice_template_id: 'labor-detailed',
    currency: 'EUR',
    subtotal_minor: 41250,
    tax_minor: 0,
    total_minor: 41250,
    issuer_name: 'MUTABLE LEGACY ENTITY',
    legal_entity_revision_id: 'canonical-qa-revision',
    resolved_legal_entity_revision_id: 'canonical-qa-revision',
    canonical_assignment_matches: 1,
    canonical_issuer_name: 'TEST ONLY CANONICAL ISSUER',
    canonical_tax_identifier: 'QA-TAX',
    canonical_registration_identifier: null,
    canonical_address_line1: '1 QA Street',
    canonical_address_line2: null,
    canonical_locality: 'Test City',
    canonical_region: null,
    canonical_postal_code: '00000',
    canonical_country_code: 'US',
    canonical_currency: 'EUR',
    client_legal_name: 'QA client',
    project_number: 'QA-P-1',
    project_name: 'QA project',
    period_start: '2026-09-23',
    period_end: '2026-09-23',
  },
  lines: [
    {
      description: 'QA installation work',
      quantity_numerator: 450,
      quantity_denominator: 60,
      unit_price_minor: 5500,
      subtotal_minor: 41250,
    },
  ],
} as const;

describe('invoice draft PDF projection', () => {
  it('renders the actual line and reconciles it to the draft total', () => {
    const snapshot = draftInvoiceTemplateSnapshot(preview, 'en');
    const body = renderInvoiceTemplate(snapshot).body;
    expect(body).toContain('QA installation work');
    expect(body).toContain('7.50');
    expect(body).toContain('€55.00');
    expect(body).toContain('€412.50');
    expect(body).toContain('TEST ONLY CANONICAL ISSUER');
    expect(body).not.toContain('MUTABLE LEGACY ENTITY');
    expect(body).not.toContain('No invoice lines.');
  });

  it('rejects a misleading total if invoice lines are absent or stale', () => {
    expect(() => draftInvoiceTemplateSnapshot({ ...preview, lines: [] }, 'en')).toThrow();
    expect(() =>
      draftInvoiceTemplateSnapshot(
        { ...preview, lines: [{ ...preview.lines[0], subtotal_minor: 40000 }] },
        'en',
      ),
    ).toThrow('do not match');
  });

  it('blocks a draft PDF without a canonical issuer or with a currency mismatch', () => {
    expect(() =>
      draftInvoiceTemplateSnapshot(
        { ...preview, invoice: { ...preview.invoice, resolved_legal_entity_revision_id: null } },
        'en',
      ),
    ).toThrow('canonical issuing');
    expect(() =>
      draftInvoiceTemplateSnapshot(
        { ...preview, invoice: { ...preview.invoice, canonical_currency: 'USD' } },
        'en',
      ),
    ).toThrow('canonical issuing currency');
    expect(() =>
      draftInvoiceTemplateSnapshot(
        { ...preview, invoice: { ...preview.invoice, canonical_assignment_matches: 0 } },
        'en',
      ),
    ).toThrow('not effective');
  });
});
