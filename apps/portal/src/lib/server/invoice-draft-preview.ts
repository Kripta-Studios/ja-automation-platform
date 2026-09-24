import type { InvoiceTemplateSnapshot } from '@ja/reporting';

type Row = Readonly<Record<string, unknown>>;
type Preview = Readonly<{ invoice: Row; lines: readonly Row[] }>;

function minor(value: unknown): bigint {
  const raw = String(value ?? '');
  if (!/^-?\d+$/.test(raw)) throw new Error('Invoice preview amount is invalid');
  return BigInt(raw);
}

/** A read-only PDF projection of the same mutable lines shown on the draft page. */
export function draftInvoiceTemplateSnapshot(
  preview: Preview,
  locale: 'en' | 'es' | 'pt',
): InvoiceTemplateSnapshot {
  const { invoice, lines } = preview;
  if (!['draft', 'approved'].includes(String(invoice.state)) || lines.length === 0)
    throw new Error('Invoice draft preview is unavailable');
  const subtotal = minor(invoice.subtotal_minor);
  const lineSubtotal = lines.reduce((sum, line) => sum + minor(line.subtotal_minor), 0n);
  if (lineSubtotal !== subtotal) throw new Error('Invoice draft lines do not match the subtotal');
  if (!invoice.resolved_legal_entity_revision_id || !invoice.canonical_issuer_name)
    throw new Error('A canonical issuing legal-entity revision is required for draft PDF preview');
  if (invoice.canonical_assignment_matches !== 1)
    throw new Error('The canonical issuing revision is not effective for this project and period');
  if (invoice.canonical_currency !== invoice.currency)
    throw new Error('The canonical issuing currency does not match this invoice');
  const address = [
    invoice.canonical_address_line1,
    invoice.canonical_address_line2,
    [invoice.canonical_postal_code, invoice.canonical_locality].filter(Boolean).join(' '),
    invoice.canonical_region,
    invoice.canonical_country_code,
  ]
    .filter(Boolean)
    .join('\n');
  const identifiers = [invoice.canonical_tax_identifier, invoice.canonical_registration_identifier]
    .filter(Boolean)
    .join(' · ');

  return {
    number: 'DRAFT PREVIEW',
    invoiceNumber: 'DRAFT PREVIEW',
    locale,
    template: String(invoice.invoice_template_id ?? 'default'),
    legalEntity: {
      legalName: invoice.canonical_issuer_name,
      billingAddress: address,
      companyIdentifiers: identifiers,
    },
    client: {
      legalName: invoice.client_legal_name ?? invoice.client_name,
      billingAddress: invoice.client_billing_address,
      number: invoice.client_number,
    },
    project: {
      number: invoice.project_number,
      name: invoice.project_name,
      poNumber: invoice.project_po_number,
    },
    purchaseNo: invoice.purchase_no,
    termsAndInstructions: invoice.terms_and_instructions,
    companyInfo: invoice.company_info,
    discountMinor: String(invoice.discount_minor ?? '0'),
    issueDate: invoice.created_at,
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
    commercial: { streamType: invoice.stream_type },
    calculation: {
      currency: invoice.currency,
      subtotalMinor: subtotal.toString(),
      taxMinor: minor(invoice.tax_minor).toString(),
      totalMinor: minor(invoice.total_minor).toString(),
    },
    lines,
  };
}
