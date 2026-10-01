import { renderInvoiceTemplate, type InvoiceTemplateSnapshot } from '@ja/invoice-templates';
import { documentFontCss } from './document-fonts.ts';

const escape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const text = (value: unknown): string => String(value ?? '').trim();
const record = (value: unknown): Readonly<Record<string, unknown>> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
const date = (value: unknown): string => text(value).slice(0, 10) || '—';
const labels = {
  en: [
    'DRAFT INVOICE',
    'INVOICE',
    'PREVIEW',
    'BILL TO',
    'PURCHASE NO.',
    'INVOICE NUMBER',
    'INVOICE DATE',
    'DUE DATE',
    'Issuing authority not configured',
    'Payment terms',
    'days',
    'Edit',
  ],
  es: [
    'FACTURA BORRADOR',
    'FACTURA',
    'VISTA PREVIA',
    'FACTURAR A',
    'N.º DE COMPRA',
    'N.º DE FACTURA',
    'FECHA DE FACTURA',
    'VENCIMIENTO',
    'Entidad emisora no configurada',
    'Condiciones de pago',
    'días',
    'Editar',
  ],
  pt: [
    'FATURA RASCUNHO',
    'FATURA',
    'PRÉVIA',
    'FATURAR A',
    'N.º DE COMPRA',
    'N.º DA FATURA',
    'DATA DA FATURA',
    'VENCIMENTO',
    'Entidade emissora não configurada',
    'Condições de pagamento',
    'dias',
    'Editar',
  ],
} as const;

/** One browser-safe, escaped presentation contract for the screen and downloaded invoice. */
export function renderInvoiceDocument(
  snapshot: InvoiceTemplateSnapshot,
  options: { editable?: boolean; logoUrl?: string } = {},
) {
  const rendered = renderInvoiceTemplate(snapshot);
  const l = labels[rendered.locale];
  const company = record(snapshot.companyInfo ?? snapshot.company_info);
  const issuer = record(snapshot.legalEntity);
  const client = record(snapshot.client);
  const project = record(snapshot.project);
  const draft =
    ['draft', 'approved', 'superseded'].includes(text(snapshot.state).toLowerCase()) ||
    /^(DRAFT|PREVIEW)/iu.test(text(snapshot.number));
  const number = text(snapshot.number ?? snapshot.invoiceNumber) || l[2];
  const fieldLabels: Record<string, string> = {
    purchaseNo: l[4],
    invoiceNumber: l[5],
    invoiceDate: l[6],
    dueDate: l[7],
    paymentTermsDays: l[9],
  };
  const field = (name: string, value: unknown) =>
    options.editable
      ? `<button type="button" class="invoice-edit-value" data-invoice-edit="${escape(name)}" aria-label="${escape(l[11])}: ${escape(fieldLabels[name] ?? name)}">${escape(text(value) || '—')}</button>`
      : escape(text(value) || '—');
  const issuerName = text(issuer.legalName ?? issuer.legal_name ?? issuer.name) || l[8];
  const issuerAddress = text(issuer.billingAddress ?? issuer.billing_address ?? issuer.address);
  const companyLines = [
    ['companyName', company.name],
    ['companyAddress', company.address],
    ['companyDivision', company.division],
    ['companyPhone', company.phone],
    ['issuingAuthority', issuerAddress],
    ['companyEmail', company.email],
    ['companyWebsite', company.website],
  ]
    .filter(([, value]) => text(value))
    .map(([name, value]) => `<div>${field(String(name), value)}</div>`)
    .join('');
  const partyLines = [
    client.billingContactName ?? client.contactName,
    client.billingAddress ?? client.billing_address,
    client.billingEmail ?? client.email,
  ]
    .filter((v) => text(v))
    .map((v) => `<p>${escape(v)}</p>`)
    .join('');
  const metadata = [
    [l[4], field('purchaseNo', snapshot.purchaseNo ?? snapshot.purchase_no ?? project.poNumber)],
    [l[5], field('invoiceNumber', number)],
    [
      l[6],
      field(
        'invoiceDate',
        date(snapshot.invoiceDate ?? snapshot.issueDate ?? snapshot.issuedAt ?? snapshot.createdAt),
      ),
    ],
    [l[7], field('dueDate', date(snapshot.dueDate ?? snapshot.dueAt))],
  ]
    .map(([label, value]) => `<div><span>${escape(label)}</span><strong>${value}</strong></div>`)
    .join('');
  const terms =
    snapshot.paymentTermsDays !== undefined && snapshot.paymentTermsDays !== null
      ? `<p class="invoice-payment-terms">${escape(l[9])}: ${field('paymentTermsDays', snapshot.paymentTermsDays)} ${escape(l[10])}</p>`
      : '';
  const totals = options.editable
    ? rendered.totalsBody.replace(
        /data-invoice-field="([a-zA-Z]+)"/gu,
        'data-invoice-edit="$1" role="button" tabindex="0"',
      )
    : rendered.totalsBody;
  const lineBody = options.editable
    ? rendered.lineBody.replace(
        /data-invoice-source-type="(time|expense)" data-invoice-source-id="([^"]+)"/gu,
        'data-invoice-source-type="$1" data-invoice-source-id="$2" role="link" tabindex="0"',
      )
    : rendered.lineBody;
  const bodyHtml = `<article id="ja-invoice-document" class="invoice-canonical" data-invoice-template="${escape(rendered.definition.id)}"><header><div class="brand-block"><img src="${escape(options.logoUrl ?? '/j-aautomation/app/logo.png')}" alt="J&amp;A Automation"><div class="company-details"><strong>${field('issuingAuthority', issuerName)}</strong>${companyLines}</div></div><div class="invoice-identity"><span>${escape(draft ? l[0] : l[1])}</span><strong>${escape(number)}</strong><small>${escape(text(snapshot.state))}</small></div></header><section class="invoice-parties"><div><span>${escape(l[3])}</span><strong>${field('client', client.legalName ?? client.legal_name ?? client.name)}</strong>${partyLines}</div></section><section class="invoice-meta">${metadata}</section>${terms}<section class="invoice-line-items">${lineBody}</section>${totals}<footer><span>J&amp;A AUTOMATION · ${escape(l[1])}</span><span>${escape([project.number, project.name].filter((v) => text(v)).join(' / '))}</span></footer></article>`;
  return {
    bodyHtml,
    css: invoiceDocumentCss,
    locale: rendered.locale,
    templateVersion: `${rendered.definition.versionId}-document-v2`,
  };
}

export function invoiceDocumentHtml(
  snapshot: InvoiceTemplateSnapshot,
  options: { logoUrl?: string } = {},
): string {
  const doc = renderInvoiceDocument(snapshot, options);
  return `<!doctype html><html lang="${doc.locale === 'pt' ? 'pt-BR' : doc.locale}"><head><meta charset="utf-8"><meta name="invoice-template-version" content="${escape(doc.templateVersion)}"><style>${doc.css}</style></head><body>${doc.bodyHtml}</body></html>`;
}

/** Absolute typography, spacing and colours prevent application styles altering export appearance. */
export const invoiceDocumentCss = `${documentFontCss}
@page{size:A4;margin:14mm 14mm 18mm}
.invoice-canonical#ja-invoice-document{box-sizing:border-box;position:relative;width:100%;max-width:100%;margin:0;background:#fff;color:#2a2926;font:14px 'Geist',Arial,sans-serif;line-height:1.45;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.invoice-canonical#ja-invoice-document *{box-sizing:border-box;font-family:inherit;line-height:inherit}
.invoice-canonical#ja-invoice-document span{font-size:inherit;font-weight:inherit;color:inherit;letter-spacing:normal}
.invoice-canonical#ja-invoice-document>header{display:flex;justify-content:space-between;gap:24px;padding-bottom:28px;border-bottom:3px solid #373632;break-inside:avoid}
.invoice-canonical#ja-invoice-document .brand-block{display:flex;flex-direction:column;gap:8px;min-width:0}
.invoice-canonical#ja-invoice-document header img{width:150px;height:auto;object-fit:contain;object-position:left}
.invoice-canonical#ja-invoice-document .company-details{font-size:12px;color:#575650;white-space:pre-line}
.invoice-canonical#ja-invoice-document .company-details strong{font-size:14px;color:#2a2926}
.invoice-canonical#ja-invoice-document .invoice-identity{display:flex;flex-direction:column;gap:8px;text-align:right;min-width:0}
.invoice-canonical#ja-invoice-document .invoice-identity>strong{font-size:24px;line-height:1.2}
.invoice-canonical#ja-invoice-document .invoice-identity>small{display:block;margin:0;font:400 12px 'Geist',Arial,sans-serif}
.invoice-canonical#ja-invoice-document .invoice-identity>span,.invoice-canonical#ja-invoice-document .invoice-meta span,.invoice-canonical#ja-invoice-document .invoice-parties span{color:#67675f;font:700 10px 'Geist Mono',Consolas,monospace;letter-spacing:.06em}
.invoice-canonical#ja-invoice-document .invoice-parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:28px 0}
.invoice-canonical#ja-invoice-document .invoice-parties>div,.invoice-canonical#ja-invoice-document .invoice-meta>div{display:grid;gap:7px;min-width:0}
.invoice-canonical#ja-invoice-document .invoice-parties p{margin:0;white-space:pre-line}
.invoice-canonical#ja-invoice-document .invoice-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;padding:22px 0;border-block:1px solid #e8e8e6;break-inside:avoid}
.invoice-canonical#ja-invoice-document .invoice-meta strong{font-size:13px}
.invoice-canonical#ja-invoice-document .invoice-payment-terms{font-size:12px;margin:12px 0}
.invoice-canonical#ja-invoice-document h2{font-size:14px;margin:24px 0 8px;break-after:avoid}
.invoice-canonical#ja-invoice-document table{width:100%;table-layout:fixed;margin:14px 0 24px;border-collapse:collapse}
.invoice-canonical#ja-invoice-document th,.invoice-canonical#ja-invoice-document td{padding:12px 7px;border-bottom:1px solid #e8e8e6;text-align:left;vertical-align:top;overflow-wrap:anywhere}
.invoice-canonical#ja-invoice-document th{color:#67675f;background:transparent;font:700 10px 'Geist Mono',Consolas,monospace;letter-spacing:.03em}
.invoice-canonical#ja-invoice-document th:first-child,.invoice-canonical#ja-invoice-document td:first-child{width:46%}
.invoice-canonical#ja-invoice-document .amount{text-align:right;white-space:normal}
.invoice-canonical#ja-invoice-document thead{display:table-header-group}
.invoice-canonical#ja-invoice-document tfoot{display:table-row-group}
.invoice-canonical#ja-invoice-document tr{break-inside:avoid}
.invoice-canonical#ja-invoice-document .qty-total-cell,.invoice-canonical#ja-invoice-document .total-amount-cell{border:2px solid #373632!important;font-weight:700;padding:7px}
.invoice-canonical#ja-invoice-document .invoice-section-subtotal{text-align:right;font-size:12px;margin-bottom:12px}
.invoice-canonical#ja-invoice-document .invoice-bottom-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:28px;padding-top:22px;border-top:1px solid #e8e8e6;align-items:start;break-inside:avoid}
.invoice-canonical#ja-invoice-document .invoice-terms-card{font-size:12px;line-height:1.5}
.invoice-canonical#ja-invoice-document .terms-heading{font-size:14px;font-weight:700;text-decoration:underline;margin-bottom:9px}
.invoice-canonical#ja-invoice-document .terms-field{margin:4px 0}
.invoice-canonical#ja-invoice-document .terms-notice{margin-top:12px;font-style:italic;color:#67675f;white-space:pre-line}
.invoice-canonical#ja-invoice-document .invoice-total{display:block;margin:0;padding:0;border:0;width:100%}
.invoice-canonical#ja-invoice-document .invoice-total>div{background:transparent}
.invoice-canonical#ja-invoice-document .total-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:6px 0;font-size:12px}
.invoice-canonical#ja-invoice-document .total-row>:last-child{text-align:right}
.invoice-canonical#ja-invoice-document .grand-total{margin-top:8px;padding-top:12px;border-top:2px solid #373632;font-size:17px}
.invoice-canonical#ja-invoice-document footer{position:static;inset:auto;background:none;width:auto;height:auto;box-shadow:none;display:flex;justify-content:space-between;gap:20px;margin-top:40px;padding-top:12px;border-top:1px solid #e8e8e6;font:700 9px 'Geist Mono',Consolas,monospace}
.invoice-canonical#ja-invoice-document .invoice-edit-value{border:0;border-radius:3px;background:transparent;padding:0;color:inherit;font:inherit;box-shadow:none;min-height:0;min-width:0;height:auto;display:inline;appearance:none;text-align:inherit;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:4px;cursor:pointer;max-width:100%;overflow-wrap:anywhere}
.invoice-canonical#ja-invoice-document [data-invoice-source-id][role="link"]{cursor:pointer}
.invoice-canonical#ja-invoice-document [data-invoice-source-id][role="link"]:hover{background:#f4f1e8}
.invoice-canonical#ja-invoice-document [data-invoice-source-id][role="link"]:focus-visible{outline:2px solid #8a5a18;outline-offset:2px}
.invoice-canonical#ja-invoice-document [data-invoice-edit]:hover{background:#f4f1e8}
.invoice-canonical#ja-invoice-document [data-invoice-edit]:focus-visible{outline:2px solid #8a5a18;outline-offset:4px}
@media screen and (max-width:600px){.invoice-canonical#ja-invoice-document>header{flex-wrap:wrap}.invoice-canonical#ja-invoice-document .invoice-identity{text-align:left}.invoice-canonical#ja-invoice-document .invoice-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.invoice-canonical#ja-invoice-document .invoice-bottom-grid{grid-template-columns:1fr}.invoice-canonical#ja-invoice-document .invoice-parties{grid-template-columns:1fr}.invoice-canonical#ja-invoice-document table{font-size:12px}.invoice-canonical#ja-invoice-document th,.invoice-canonical#ja-invoice-document td{padding:8px 4px}.invoice-canonical#ja-invoice-document footer{flex-wrap:wrap}}
@media print{body{margin:0}.invoice-canonical#ja-invoice-document [data-invoice-edit]{text-decoration:none!important;background:transparent!important}}
`;

export type { InvoiceTemplateSnapshot } from '@ja/invoice-templates';
