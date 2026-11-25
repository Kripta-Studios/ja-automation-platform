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
    'Expected number · not reserved; assigned when issued',
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
    'Número previsto · no reservado; se asigna al emitir',
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
    'Número previsto · não reservado; atribuído na emissão',
  ],
} as const;

/** D15: credit notes print as credit notes, name the invoice they credit and have no due date. */
const creditNoteLabels = {
  en: {
    draft: 'DRAFT CREDIT NOTE',
    title: 'CREDIT NOTE',
    number: 'CREDIT NOTE NUMBER',
    date: 'CREDIT NOTE DATE',
    creditsInvoice: 'CREDITS INVOICE',
  },
  es: {
    draft: 'NOTA DE CRÉDITO BORRADOR',
    title: 'NOTA DE CRÉDITO',
    number: 'N.º DE NOTA DE CRÉDITO',
    date: 'FECHA DE LA NOTA',
    creditsInvoice: 'ABONA LA FACTURA',
  },
  pt: {
    draft: 'NOTA DE CRÉDITO RASCUNHO',
    title: 'NOTA DE CRÉDITO',
    number: 'N.º DA NOTA DE CRÉDITO',
    date: 'DATA DA NOTA',
    creditsInvoice: 'CREDITA A FATURA',
  },
} as const;
const plannedDateLabels = {
  en: 'PLANNED ISSUE DATE',
  es: 'FECHA DE EMISIÓN PREVISTA',
  pt: 'DATA DE EMISSÃO PREVISTA',
} as const;

const identifierLabels = {
  en: { clientNumber: 'Client no.', clientCode: 'Code', project: 'PROJECT', costCenter: 'COST CENTER', taxId: 'Tax ID' },
  es: { clientNumber: 'Cliente n.º', clientCode: 'Código', project: 'PROYECTO', costCenter: 'CENTRO DE COSTE', taxId: 'NIF/CIF' },
  pt: { clientNumber: 'Cliente n.º', clientCode: 'Código', project: 'PROJETO', costCenter: 'CENTRO DE CUSTO', taxId: 'CNPJ/NIF' },
} as const;

/** Invoice lifecycle state in words (never the raw code) under the number. */
const stateLabels = {
  en: {
    draft: 'Draft',
    approved: 'Approved',
    issued: 'Issued',
    sent: 'Sent',
    partially_paid: 'Partially paid',
    paid: 'Paid',
    overdue: 'Overdue',
    void: 'Void',
    cancelled: 'Cancelled',
    superseded: 'Replaced',
    credited: 'Credited',
  },
  es: {
    draft: 'Borrador',
    approved: 'Aprobada',
    issued: 'Emitida',
    sent: 'Enviada',
    partially_paid: 'Pagada parcialmente',
    paid: 'Pagada',
    overdue: 'Vencida',
    void: 'Anulada',
    cancelled: 'Cancelada',
    superseded: 'Sustituida',
    credited: 'Abonada',
  },
  pt: {
    draft: 'Rascunho',
    approved: 'Aprovada',
    issued: 'Emitida',
    sent: 'Enviada',
    partially_paid: 'Parcialmente paga',
    paid: 'Paga',
    overdue: 'Vencida',
    void: 'Anulada',
    cancelled: 'Cancelada',
    superseded: 'Substituída',
    credited: 'Creditada',
  },
} as const satisfies Record<'en' | 'es' | 'pt', Record<string, string>>;

export function invoiceDocumentStateLabel(state: unknown, locale: 'en' | 'es' | 'pt'): string {
  const code = text(state).toLowerCase();
  if (!code) return '';
  const known = (stateLabels[locale] as Record<string, string>)[code];
  if (known) return known;
  const words = code.replace(/[_-]+/gu, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One browser-safe, escaped presentation contract for the screen and downloaded invoice. */
export function renderInvoiceDocument(
  snapshot: InvoiceTemplateSnapshot,
  options: { editable?: boolean; numberingInteractive?: boolean; logoUrl?: string } = {},
) {
  const rendered = renderInvoiceTemplate(snapshot);
  const l = labels[rendered.locale];
  const creditNote = snapshot.documentType === 'credit_note';
  const cn = creditNoteLabels[rendered.locale];
  const company = record(snapshot.companyInfo ?? snapshot.company_info);
  const issuer = record(snapshot.legalEntity);
  const client = record(snapshot.client);
  const project = record(snapshot.project);
  const draft =
    ['draft', 'approved', 'superseded'].includes(text(snapshot.state).toLowerCase()) ||
    /^(DRAFT|PREVIEW)/iu.test(text(snapshot.number));
  const number = text(snapshot.number ?? snapshot.invoiceNumber) || l[2];
  // A corrected issued invoice (same number, new version) says which version it is.
  const versionNumber = Number(record(snapshot.version).number ?? 1);
  const versionLabel = { en: 'Corrected · version', es: 'Corregida · versión', pt: 'Corrigida · versão' }[
    rendered.locale
  ];
  const numberNotice =
    draft && snapshot.numberProvisional === true
      ? `<small class="invoice-number-notice">${escape(l[12])}</small>`
      : !draft && Number.isSafeInteger(versionNumber) && versionNumber > 1
        ? `<small class="invoice-number-notice" data-invoice-version="${versionNumber}">${escape(versionLabel)} ${versionNumber}</small>`
        : '';
  const fieldLabels: Record<string, string> = {
    purchaseNo: l[4],
    invoiceNumber: l[5],
    invoiceDate: l[6],
    dueDate: l[7],
    paymentTermsDays: l[9],
    ...{
      en: {
        issuingAuthority: 'Issuing authority',
        client: 'Client',
        companyName: 'Company name',
        companyAddress: 'Company address',
        companyDivision: 'Division',
        companyPhone: 'Phone',
        companyEmail: 'Email',
        companyWebsite: 'Website',
        clientAddress: 'Client address',
        projectName: 'Project',
        costCenter: 'Cost center',
      },
      es: {
        issuingAuthority: 'Entidad emisora',
        client: 'Cliente',
        companyName: 'Nombre de empresa',
        companyAddress: 'Dirección de empresa',
        companyDivision: 'División',
        companyPhone: 'Teléfono',
        companyEmail: 'Correo electrónico',
        companyWebsite: 'Sitio web',
        clientAddress: 'Dirección del cliente',
        projectName: 'Proyecto',
        costCenter: 'Centro de coste',
      },
      pt: {
        issuingAuthority: 'Entidade emissora',
        client: 'Cliente',
        companyName: 'Nome da empresa',
        companyAddress: 'Endereço da empresa',
        companyDivision: 'Divisão',
        companyPhone: 'Telefone',
        companyEmail: 'E-mail',
        companyWebsite: 'Site',
        clientAddress: 'Endereço do cliente',
        projectName: 'Projeto',
        costCenter: 'Centro de custo',
      },
    }[rendered.locale],
  };
  const fieldContext = {
    en: {
      heading: 'heading',
      details: 'invoice details',
      name: 'issuer name',
      address: 'issuer address',
    },
    es: {
      heading: 'encabezado',
      details: 'datos de factura',
      name: 'nombre del emisor',
      address: 'dirección del emisor',
    },
    pt: {
      heading: 'cabeçalho',
      details: 'dados da fatura',
      name: 'nome do emissor',
      address: 'endereço do emissor',
    },
  }[rendered.locale];
  const field = (name: string, value: unknown, context = '') =>
    options.editable || (name === 'invoiceNumber' && options.numberingInteractive)
      ? `<button type="button" class="invoice-edit-value" data-invoice-edit="${escape(name)}" aria-label="${escape(l[11])}: ${escape(fieldLabels[name] ?? name)}${context ? ` · ${escape(context)}` : ''}">${escape(text(value) || '—')}</button>`
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
    .map(
      ([name, value]) =>
        `<div>${field(String(name), value, name === 'issuingAuthority' ? fieldContext.address : '')}</div>`,
    )
    .join('');
  // Client tax ID: drafts read it live; issued invoices print what their snapshot froze.
  const clientTaxId = text(client.taxId ?? client.tax_id);
  const clientAddress = client.billingAddress ?? client.billing_address;
  const partyLines = [
    client.billingContactName ?? client.contactName,
    clientTaxId ? `${identifierLabels[rendered.locale].taxId} ${clientTaxId}` : '',
    client.billingEmail ?? client.email,
  ]
    .filter((v) => text(v))
    .map((v) => `<p>${escape(v)}</p>`);
  // The billing address is editable inline on a draft (an empty one shows a "—" target).
  if (text(clientAddress) || options.editable)
    partyLines.splice(1, 0, `<p class="invoice-client-address">${field('clientAddress', clientAddress)}</p>`);
  // Client number/code, project and cost center: shown on drafts and on invoices issued with
  // header version 2. Older issued invoices keep exactly the header their PDF was frozen with.
  const showIdentifiers = draft || Number(snapshot.documentHeaderVersion ?? 0) >= 2;
  const id = identifierLabels[rendered.locale];
  const clientNumber = text(client.number ?? client.clientNumber);
  const clientCode = text(client.code ?? client.clientCode);
  const clientIdentity = showIdentifiers
    ? [
        clientNumber ? `${id.clientNumber} ${clientNumber}` : '',
        clientCode && clientCode !== clientNumber ? `${id.clientCode} ${clientCode}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const projectReference = text(
    [project.number, project.name].filter((v) => text(v)).join(' · '),
  );
  const costCenter = text(project.costCenterCode ?? project.cost_center_code);
  const identifierMeta = showIdentifiers
    ? `<section class="invoice-references">${(
        [
          [id.project, projectReference, 'projectName'],
          [id.costCenter, costCenter, 'costCenter'],
        ] as const
      )
        .filter(([, value]) => text(value) || options.editable)
        .map(
          ([label, value, name]) =>
            `<div data-invoice-reference><span>${escape(label)}</span><strong>${
              options.editable
                ? field(name, name === 'projectName' ? project.name : value)
                : escape(value)
            }</strong></div>`,
        )
        .join('')}</section>`
    : '';
  const metadata = [
    [l[4], field('purchaseNo', snapshot.purchaseNo ?? snapshot.purchase_no ?? project.poNumber)],
    [creditNote ? cn.number : l[5], field('invoiceNumber', number, fieldContext.details) + numberNotice],
    [
      creditNote
        ? cn.date
        : draft && snapshot.invoiceDatePlanned === true
          ? plannedDateLabels[rendered.locale]
          : l[6],
      field(
        'invoiceDate',
        date(snapshot.invoiceDate ?? snapshot.issueDate ?? snapshot.issuedAt ?? snapshot.createdAt),
      ),
    ],
    creditNote
      ? [cn.creditsInvoice, escape(text(snapshot.creditNoteFor) || '—')]
      : [l[7], field('dueDate', date(snapshot.dueDate ?? snapshot.dueAt))],
  ]
    .map(([label, value]) => `<div><span>${escape(label)}</span><strong>${value}</strong></div>`)
    .join('');
  const terms =
    !creditNote &&
    snapshot.paymentTermsDays !== undefined &&
    snapshot.paymentTermsDays !== null
      ? `<p class="invoice-payment-terms">${escape(l[9])}: ${field('paymentTermsDays', snapshot.paymentTermsDays)} ${escape(l[10])}</p>`
      : '';
  const totals = options.editable
    ? rendered.totalsBody.replace(
        /data-invoice-field="([a-zA-Z]+)"/gu,
        'data-invoice-edit="$1" role="button" tabindex="0"',
      )
    : rendered.totalsBody;
  // Draft lines open the inline line editor (description; rate and hours of hours lines).
  const lineBody = options.editable
    ? rendered.lineBody.replace(
        /<tr data-invoice-source-type="([a-z]*)" data-invoice-source-id="([^"]*)" data-invoice-line-id="([^"]+)" data-invoice-line-key="([^"]*)">/gu,
        '<tr data-invoice-source-type="$1" data-invoice-source-id="$2" data-invoice-line-id="$3" data-invoice-line-key="$4" data-invoice-edit="line" role="button" tabindex="0" class="invoice-edit-line">',
      )
    : rendered.lineBody;
  const bodyHtml = `<article id="ja-invoice-document" class="invoice-canonical" data-invoice-template="${escape(rendered.definition.id)}"><header><div class="brand-block"><img src="${escape(options.logoUrl ?? '/j-aautomation/app/logo.png')}" alt="J&amp;A Automation"><div class="company-details"><strong>${field('issuingAuthority', issuerName, fieldContext.name)}</strong>${companyLines}</div></div><div class="invoice-identity"><span>${escape(creditNote ? (draft ? cn.draft : cn.title) : draft ? l[0] : l[1])}</span><strong>${field('invoiceNumber', number, fieldContext.heading)}</strong>${numberNotice}<small data-invoice-document-state="${escape(text(snapshot.state))}">${escape(invoiceDocumentStateLabel(snapshot.state, rendered.locale))}</small></div></header><section class="invoice-parties"><div><span>${escape(l[3])}</span><strong>${field('client', client.legalName ?? client.legal_name ?? client.name)}</strong>${clientIdentity ? `<p class="invoice-client-identity" data-invoice-client-identity>${escape(clientIdentity)}</p>` : ''}${partyLines.join('')}</div></section><section class="invoice-meta">${metadata}</section>${identifierMeta === '<section class="invoice-references"></section>' ? '' : identifierMeta}${terms}<section class="invoice-line-items">${lineBody}</section>${totals}<footer><span>J&amp;A AUTOMATION · ${escape(creditNote ? cn.title : l[1])}</span><span>${escape([project.number, project.name].filter((v) => text(v)).join(' / '))}</span></footer></article>`;
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
.invoice-canonical#ja-invoice-document .invoice-number-notice{display:block;font:400 11px 'Geist',Arial,sans-serif;max-width:24em;color:#575650}
.invoice-canonical#ja-invoice-document .invoice-identity>small{display:block;margin:0;font:400 12px 'Geist',Arial,sans-serif}
.invoice-canonical#ja-invoice-document .invoice-identity>span,.invoice-canonical#ja-invoice-document .invoice-meta span,.invoice-canonical#ja-invoice-document .invoice-parties span{color:#67675f;font:700 10px 'Geist Mono',Consolas,monospace;letter-spacing:.06em}
.invoice-canonical#ja-invoice-document .invoice-parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:28px 0}
.invoice-canonical#ja-invoice-document .invoice-parties>div,.invoice-canonical#ja-invoice-document .invoice-meta>div{display:grid;gap:7px;min-width:0}
.invoice-canonical#ja-invoice-document .invoice-parties p{margin:0;white-space:pre-line}
.invoice-canonical#ja-invoice-document .invoice-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;padding:22px 0;border-block:1px solid #e8e8e6;break-inside:avoid}
.invoice-canonical#ja-invoice-document .invoice-meta strong{font-size:13px}
.invoice-canonical#ja-invoice-document .invoice-client-identity{margin:0;font-size:12px;color:#575650}
.invoice-canonical#ja-invoice-document .invoice-references{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;padding:14px 0;border-bottom:1px solid #e8e8e6;break-inside:avoid}
.invoice-canonical#ja-invoice-document .invoice-references>div{display:grid;gap:7px;min-width:0}
.invoice-canonical#ja-invoice-document .invoice-references span{color:#67675f;font:700 10px 'Geist Mono',Consolas,monospace;letter-spacing:.06em}
.invoice-canonical#ja-invoice-document .invoice-references strong{font-size:13px}
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
.invoice-canonical#ja-invoice-document .invoice-client-address{white-space:pre-line}
.invoice-canonical#ja-invoice-document tr.invoice-edit-line{cursor:pointer}
.invoice-canonical#ja-invoice-document tr.invoice-edit-line:hover td,.invoice-canonical#ja-invoice-document tr.invoice-edit-line:focus-visible td{background:#fff7d6}
.invoice-canonical#ja-invoice-document .invoice-edit-value[data-invoice-edit="invoiceNumber"]{display:inline-flex;align-items:center;min-height:44px;min-width:44px}
.invoice-canonical#ja-invoice-document [data-invoice-source-id][role="link"]{cursor:pointer}
.invoice-canonical#ja-invoice-document [data-invoice-source-id][role="link"]:hover{background:#f4f1e8}
.invoice-canonical#ja-invoice-document [data-invoice-source-id][role="link"]:focus-visible{outline:2px solid #8a5a18;outline-offset:2px}
.invoice-canonical#ja-invoice-document [data-invoice-edit]:hover{background:#f4f1e8}
.invoice-canonical#ja-invoice-document [data-invoice-edit]:focus-visible{outline:2px solid #8a5a18;outline-offset:4px}
@media screen{.invoice-canonical#ja-invoice-document [data-invoice-edit]{display:inline-flex;align-items:center;min-height:44px;min-width:44px;padding-block:4px}}
@media screen and (max-width:600px){.invoice-canonical#ja-invoice-document>header{flex-wrap:wrap}.invoice-canonical#ja-invoice-document .invoice-identity{text-align:left}.invoice-canonical#ja-invoice-document .invoice-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.invoice-canonical#ja-invoice-document .invoice-bottom-grid{grid-template-columns:1fr}.invoice-canonical#ja-invoice-document .invoice-parties{grid-template-columns:1fr}.invoice-canonical#ja-invoice-document table{font-size:12px}.invoice-canonical#ja-invoice-document th,.invoice-canonical#ja-invoice-document td{padding:8px 4px}.invoice-canonical#ja-invoice-document footer{flex-wrap:wrap}}
/* Phone: every invoice line is a labelled card (description on top, then qty, rate, amount). */
@media screen and (max-width:600px){.invoice-canonical#ja-invoice-document table.invoice-lines,.invoice-canonical#ja-invoice-document table.invoice-lines>tbody,.invoice-canonical#ja-invoice-document table.invoice-lines>tfoot,.invoice-canonical#ja-invoice-document table.invoice-lines tr,.invoice-canonical#ja-invoice-document table.invoice-lines td{display:block;width:100%;box-sizing:border-box}.invoice-canonical#ja-invoice-document table.invoice-lines>thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.invoice-canonical#ja-invoice-document table.invoice-lines>tbody>tr{border:1px solid #e8e8e6;border-radius:6px;padding:6px 10px;margin:0 0 8px}.invoice-canonical#ja-invoice-document table.invoice-lines>tbody>tr>td{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:3px 0;border:0;text-align:right;overflow-wrap:anywhere}.invoice-canonical#ja-invoice-document table.invoice-lines>tbody>tr>td::before{content:attr(data-label);flex:0 0 42%;text-align:left;font-weight:600;color:#67675f;font-size:11px}.invoice-canonical#ja-invoice-document table.invoice-lines>tbody>tr>td:first-child{display:block;text-align:left;font-weight:600;padding-bottom:6px;border-bottom:1px solid #f0efe9;margin-bottom:4px}.invoice-canonical#ja-invoice-document table.invoice-lines>tbody>tr>td:first-child::before{content:none}.invoice-canonical#ja-invoice-document table.invoice-lines>tbody>tr>td.muted{text-align:left}.invoice-canonical#ja-invoice-document table.invoice-lines>tbody>tr>td.muted::before{content:none}.invoice-canonical#ja-invoice-document table.invoice-lines>tfoot>tr{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:6px 0}.invoice-canonical#ja-invoice-document table.invoice-lines>tfoot>tr>td{width:auto;padding:4px 6px}.invoice-canonical#ja-invoice-document table.invoice-lines>tfoot>tr>td:empty{display:none}}
@media print{body{margin:0}.invoice-canonical#ja-invoice-document [data-invoice-edit]{text-decoration:none!important;background:transparent!important}}
`;

export type { InvoiceTemplateSnapshot } from '@ja/invoice-templates';
