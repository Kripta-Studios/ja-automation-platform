import type { InvoiceTemplateSnapshot } from '@ja/reporting';

type Row = Readonly<Record<string, unknown>>;
type Preview = Readonly<{ invoice: Row; lines: readonly Row[]; taxes?: readonly Row[] }>;

function minor(value: unknown): bigint {
  const raw = String(value ?? '');
  if (!/^-?\d+$/.test(raw)) throw new Error('Invoice preview amount is invalid');
  return BigInt(raw);
}

/** A read-only PDF projection of the same mutable lines shown on the draft page. */
export function draftInvoiceTemplateSnapshot(
  preview: Preview,
  locale: 'en' | 'es' | 'pt',
  validateForDownload = true,
): InvoiceTemplateSnapshot {
  const { invoice, lines } = preview;
  if (
    !(validateForDownload ? ['draft', 'approved'] : ['draft', 'approved', 'superseded']).includes(
      String(invoice.state),
    ) ||
    lines.length === 0
  )
    throw new Error('Invoice draft preview is unavailable');
  const subtotal = minor(invoice.subtotal_minor);
  const lineSubtotal = lines.reduce((sum, line) => sum + minor(line.subtotal_minor), 0n);
  if (lineSubtotal !== subtotal) throw new Error('Invoice draft lines do not match the subtotal');
  if (
    validateForDownload &&
    (!invoice.resolved_legal_entity_revision_id || !invoice.canonical_issuer_name)
  )
    throw new Error('A canonical issuing legal-entity revision is required for draft PDF preview');
  if (validateForDownload && invoice.canonical_assignment_matches !== 1)
    throw new Error('The canonical issuing revision is not effective for this project and period');
  if (validateForDownload && invoice.canonical_currency !== invoice.currency)
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
    state: invoice.state,
    sourceVersion: invoice.source_version ?? invoice.version,
    number: 'DRAFT PREVIEW',
    invoiceNumber: 'DRAFT PREVIEW',
    locale,
    template: String(invoice.invoice_template_id ?? 'default'),
    legalEntity: {
      legalName:
        invoice.canonical_issuer_name ?? invoice.display_issuer_name ?? invoice.issuer_name,
      billingAddress: address || invoice.display_issuer_address || invoice.issuer_address,
      companyIdentifiers: identifiers || invoice.company_identifiers,
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
    issueDate: invoice.invoice_date ?? invoice.created_at,
    invoiceDate: invoice.invoice_date ?? invoice.created_at,
    dueAt: invoice.due_date ?? invoice.due_at,
    dueDateOverride: invoice.due_date_override ?? '',
    paymentTermsDays: invoice.payment_terms_days,
    taxProfile: { name: invoice.tax_profile_name, components: preview.taxes ?? [] },
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
    commercial: { streamType: invoice.stream_type, paymentTermsDays: invoice.payment_terms_days },
    calculation: {
      currency: invoice.currency,
      subtotalMinor: subtotal.toString(),
      taxMinor: minor(invoice.tax_minor).toString(),
      totalMinor: minor(invoice.total_minor).toString(),
    },
    lines,
  };
}

/** Browser preview uses exactly the document projection downloaded as PDF.
 * Finalized invoice documents read their frozen snapshot, never live client or project joins.
 */
export function invoiceDocumentSnapshot(
  preview: Preview,
  locale: 'en' | 'es' | 'pt',
): InvoiceTemplateSnapshot {
  if (['draft', 'approved', 'superseded'].includes(String(preview.invoice.state))) {
    if (!preview.lines.length)
      return {
        state: preview.invoice.state,
        locale,
        lines: [],
        calculation: {
          currency: preview.invoice.currency,
          subtotalMinor: String(preview.invoice.subtotal_minor),
          taxMinor: String(preview.invoice.tax_minor),
          totalMinor: String(preview.invoice.total_minor),
        },
      };
    return draftInvoiceTemplateSnapshot(preview, locale, false);
  }
  let frozen: Record<string, unknown> = {};
  try {
    frozen = JSON.parse(String(preview.invoice.snapshot_json ?? '{}'));
  } catch {
    /* Legacy absence remains explicit. */
  }
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    state: preview.invoice.state,
    number: frozen.number ?? preview.invoice.invoice_number,
    invoiceNumber: frozen.invoiceNumber ?? preview.invoice.invoice_number,
    template: frozen.template as InvoiceTemplateSnapshot['template'],
    locale,
    legalEntity: object(frozen.legalEntity),
    client: object(frozen.client),
    project: object(frozen.project),
    commercial: object(frozen.commercial),
    calculation: object(frozen.calculation),
    lines: Array.isArray(frozen.lines) ? frozen.lines : [],
    issueDate: frozen.issueDate,
    invoiceDate: frozen.invoiceDate ?? frozen.issueDate,
    dueAt: frozen.dueAt,
    dueDateOverride: frozen.dueDateOverride,
    paymentTermsDays: frozen.paymentTermsDays ?? object(frozen.commercial).paymentTermsDays,
    taxProfile: object(frozen.taxProfile),
    servicePeriod: frozen.servicePeriod,
    purchaseNo: frozen.purchaseNo,
    termsAndInstructions: object(frozen.termsAndInstructions),
    companyInfo: object(frozen.companyInfo),
    discountMinor: frozen.discountMinor ?? '0',
  };
}
