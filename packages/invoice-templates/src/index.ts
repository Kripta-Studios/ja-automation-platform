/**
 * Controlled, versioned invoice presentation contracts.
 *
 * This package deliberately owns presentation only. It never calculates an
 * invoice, reads the database, or mutates an issued snapshot. The caller
 * supplies the already-frozen values and this module only selects a registered
 * layout and escapes them into HTML.
 */

export type InvoiceLocale = 'en' | 'es' | 'pt' | 'en-US' | 'es-ES' | 'pt-BR' | string;

export type InvoiceTemplateId =
  | 'labor-detailed'
  | 'labor-summary'
  | 'expenses-detailed'
  | 'fixed-milestone'
  | 'credit-adjustment';

export type InvoiceTemplateVersion = 1;

export type InvoiceTemplateDefinition = Readonly<{
  id: InvoiceTemplateId;
  family:
    | 'Labor Detailed'
    | 'Labor Summary'
    | 'Expenses Detailed'
    | 'Fixed/Milestone'
    | 'Credit/Adjustment';
  version: InvoiceTemplateVersion;
  /** Stable identity persisted with the rendered artifact metadata. */
  versionId: `${InvoiceTemplateId}-v${InvoiceTemplateVersion}`;
  status: 'active';
  aliases: readonly string[];
}>;

export type InvoiceTemplateSelector =
  | string
  | Readonly<{ id?: unknown; version?: unknown }>
  | null
  | undefined;

export type InvoiceTemplateSnapshot = Readonly<{
  number?: unknown;
  invoiceNumber?: unknown;
  locale?: InvoiceLocale | string;
  template?: InvoiceTemplateSelector;
  legalEntity?: Readonly<Record<string, unknown>>;
  client?: Readonly<Record<string, unknown>>;
  project?: Readonly<Record<string, unknown>>;
  commercial?: Readonly<Record<string, unknown>>;
  calculation?: Readonly<Record<string, unknown>>;
  lines?: readonly Readonly<Record<string, unknown>>[];
  [key: string]: unknown;
}>;

type InvoiceLanguage = 'en' | 'es' | 'pt';

type InvoiceCopy = Readonly<{
  invoice: string;
  invoiceDetail: string;
  from: string;
  billTo: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  project: string;
  po: string;
  period: string;
  noValue: string;
  noInvoiceLines: string;
  laborDetailedInvoice: string;
  laborSummaryInvoice: string;
  expensesDetailedInvoice: string;
  fixedMilestoneInvoice: string;
  creditAdjustment: string;
  date: string;
  worker: string;
  category: string;
  hours: string;
  rate: string;
  amount: string;
  group: string;
  summaryQuantity: string;
  vendor: string;
  description: string;
  milestone: string;
  service: string;
  reference: string;
  originalInvoice: string;
  reason: string;
  adjustmentAmount: string;
  subtotal: string;
  tax: string;
  total: string;
  qty: string;
  unitPrice: string;
  discount: string;
  subtotalLessDiscount: string;
  balanceDue: string;
  termsInstructions: string;
  bankSwiftNumber: string;
  bankAccountNumber: string;
  bankName: string;
  beneficiary: string;
  pastDueNotice: string;
  purchaseNo: string;
}>;

export type InvoiceTermsAndInstructions = Readonly<{
  bankSwiftNumber: string;
  bankAccountNumber: string;
  bankName: string;
  beneficiary: string;
  pastDueNotice: string;
}>;

export const DEFAULT_INVOICE_TERMS: InvoiceTermsAndInstructions = Object.freeze({
  bankSwiftNumber: 'WFBIUS6S',
  bankAccountNumber: '8769915615',
  bankName: 'Wells Fargo Bank',
  beneficiary: 'J&A Automation LLC',
  pastDueNotice:
    'Past Due account subject to service charge of 1.5% per month and/or maximum permitted by law',
});

export type InvoiceCompanyInfo = Readonly<{
  name: string;
  division: string;
  phone: string;
  address: string;
  email: string;
  website: string;
}>;

export const DEFAULT_INVOICE_COMPANY_INFO: InvoiceCompanyInfo = Object.freeze({
  name: 'J&A Automation LLC',
  division: 'USA division',
  phone: '+1 (864) 208 4684',
  address: '112 Birkshire Dr, Georgetown TX 78626',
  email: 'field.operations@j-aautomation.com',
  website: 'www.j-aautomation.com',
});

const copy: Readonly<Record<InvoiceLanguage, InvoiceCopy>> = {
  en: {
    invoice: 'Invoice',
    invoiceDetail: 'Invoice detail',
    from: 'From',
    billTo: 'Bill to',
    issueDate: 'Issue date',
    dueDate: 'Due date',
    currency: 'Currency',
    project: 'Project',
    po: 'PO / Contract',
    period: 'Service period',
    noValue: 'Not provided',
    noInvoiceLines: 'No invoice lines.',
    laborDetailedInvoice: 'Labor Detailed Invoice',
    laborSummaryInvoice: 'Labor Summary Invoice',
    expensesDetailedInvoice: 'Expenses Detailed Invoice',
    fixedMilestoneInvoice: 'Fixed / Milestone Invoice',
    creditAdjustment: 'Credit / Adjustment',
    date: 'Date',
    worker: 'Worker',
    category: 'Category',
    hours: 'Hours',
    rate: 'Rate',
    amount: 'Amount',
    group: 'Group',
    summaryQuantity: 'Summary quantity',
    vendor: 'Vendor',
    description: 'Description',
    milestone: 'Milestone',
    service: 'Service',
    reference: 'Reference',
    originalInvoice: 'Original invoice',
    reason: 'Reason',
    adjustmentAmount: 'Adjustment amount',
    subtotal: 'Subtotal',
    tax: 'Tax',
    total: 'Total',
    qty: 'QTY',
    unitPrice: 'UNIT PRICE',
    discount: 'DISCOUNT',
    subtotalLessDiscount: 'SUBTOTAL LESS DISCOUNT',
    balanceDue: 'Balance Due',
    termsInstructions: 'Terms & Instructions',
    bankSwiftNumber: 'Bank Swift Number',
    bankAccountNumber: 'Bank Account Number',
    bankName: 'Bank Name',
    beneficiary: 'Beneficiary',
    pastDueNotice:
      'Past Due account subject to service charge of 1.5% per month and/or maximum permitted by law',
    purchaseNo: 'Purchase No.:',
  },
  es: {
    invoice: 'Factura',
    invoiceDetail: 'Detalle de factura',
    from: 'De',
    billTo: 'Facturar a',
    issueDate: 'Fecha de emisión',
    dueDate: 'Fecha de vencimiento',
    currency: 'Moneda',
    project: 'Proyecto',
    po: 'PO / Contrato',
    period: 'Periodo de servicio',
    noValue: 'No indicado',
    noInvoiceLines: 'No hay líneas de factura.',
    laborDetailedInvoice: 'Factura Detallada de Mano de Obra',
    laborSummaryInvoice: 'Factura Resumida de Mano de Obra',
    expensesDetailedInvoice: 'Factura Detallada de Gastos',
    fixedMilestoneInvoice: 'Factura Fija / por Hito',
    creditAdjustment: 'Crédito / Ajuste',
    date: 'Fecha',
    worker: 'Trabajador',
    category: 'Categoría',
    hours: 'Horas',
    rate: 'Tarifa',
    amount: 'Importe',
    group: 'Grupo',
    summaryQuantity: 'Cantidad resumida',
    vendor: 'Proveedor',
    description: 'Descripción',
    milestone: 'Hito',
    service: 'Servicio',
    reference: 'Referencia',
    originalInvoice: 'Factura original',
    reason: 'Motivo',
    adjustmentAmount: 'Importe del ajuste',
    subtotal: 'Subtotal',
    tax: 'Impuesto',
    total: 'Total',
    qty: 'CANTIDAD',
    unitPrice: 'PRECIO UNITARIO',
    discount: 'DESCUENTO',
    subtotalLessDiscount: 'SUBTOTAL MENOS DESCUENTO',
    balanceDue: 'Saldo pendiente',
    termsInstructions: 'Términos e instrucciones',
    bankSwiftNumber: 'Código SWIFT bancario',
    bankAccountNumber: 'Número de cuenta bancaria',
    bankName: 'Nombre del banco',
    beneficiary: 'Beneficiario',
    pastDueNotice:
      'Cuentas vencidas sujetas a un cargo del 1.5% mensual y/o el máximo permitido por ley',
    purchaseNo: 'Nº de orden / pedido:',
  },
  pt: {
    invoice: 'Fatura',
    invoiceDetail: 'Detalhes da fatura',
    from: 'De',
    billTo: 'Faturar para',
    issueDate: 'Data de emissão',
    dueDate: 'Data de vencimento',
    currency: 'Moeda',
    project: 'Projeto',
    po: 'PO / Contrato',
    period: 'Período de serviço',
    noValue: 'Não informado',
    noInvoiceLines: 'Nenhuma linha de fatura.',
    laborDetailedInvoice: 'Fatura Detallada de Mão de Obra',
    laborSummaryInvoice: 'Fatura Resumida de Mão de Obra',
    expensesDetailedInvoice: 'Fatura Detalhada de Despesas',
    fixedMilestoneInvoice: 'Fatura Fixa / por Marco',
    creditAdjustment: 'Crédito / Ajuste',
    date: 'Data',
    worker: 'Trabalhador',
    category: 'Categoria',
    hours: 'Horas',
    rate: 'Tarifa',
    amount: 'Valor',
    group: 'Grupo',
    summaryQuantity: 'Quantidade resumida',
    vendor: 'Fornecedor',
    description: 'Descrição',
    milestone: 'Marco',
    service: 'Serviço',
    reference: 'Referência',
    originalInvoice: 'Fatura original',
    reason: 'Motivo',
    adjustmentAmount: 'Valor do ajuste',
    subtotal: 'Subtotal',
    tax: 'Imposto',
    total: 'Total',
    qty: 'QTD',
    unitPrice: 'PREÇO UNITÁRIO',
    discount: 'DESCONTO',
    subtotalLessDiscount: 'SUBTOTAL MENOS DESCONTO',
    balanceDue: 'Saldo devedor',
    termsInstructions: 'Termos e instruções',
    bankSwiftNumber: 'Código SWIFT bancário',
    bankAccountNumber: 'Número da conta bancária',
    bankName: 'Nome do banco',
    beneficiary: 'Beneficiário',
    pastDueNotice:
      'Contas vencidas sujeitas a encargo de 1,5% ao mês e/ou máximo permitido por lei',
    purchaseNo: 'Nº do pedido:',
  },
};

const normalizeInvoiceLocale = (value: unknown): InvoiceLanguage => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace('_', '-');
  if (normalized === 'pt' || normalized === 'pt-br') return 'pt';
  if (normalized === 'es' || normalized === 'es-es') return 'es';
  return 'en';
};

const invoiceLocaleTag = (value: unknown): 'en-US' | 'es-ES' | 'pt-BR' => {
  const locale = normalizeInvoiceLocale(value);
  return locale === 'pt' ? 'pt-BR' : locale === 'es' ? 'es-ES' : 'en-US';
};

export const INVOICE_TEMPLATE_ALIASES: Readonly<Record<string, InvoiceTemplateId>> = Object.freeze({
  /** Historical snapshots created before the controlled registry. */
  default: 'labor-detailed',
  /** Historical fixed-stream billing rule identifier. */
  'fixed-fee': 'fixed-milestone',
});

const definitions: readonly InvoiceTemplateDefinition[] = [
  {
    id: 'labor-detailed',
    family: 'Labor Detailed',
    version: 1,
    versionId: 'labor-detailed-v1',
    status: 'active',
    aliases: [],
  },
  {
    id: 'labor-summary',
    family: 'Labor Summary',
    version: 1,
    versionId: 'labor-summary-v1',
    status: 'active',
    aliases: [],
  },
  {
    id: 'expenses-detailed',
    family: 'Expenses Detailed',
    version: 1,
    versionId: 'expenses-detailed-v1',
    status: 'active',
    aliases: [],
  },
  {
    id: 'fixed-milestone',
    family: 'Fixed/Milestone',
    version: 1,
    versionId: 'fixed-milestone-v1',
    status: 'active',
    aliases: ['fixed-fee'],
  },
  {
    id: 'credit-adjustment',
    family: 'Credit/Adjustment',
    version: 1,
    versionId: 'credit-adjustment-v1',
    status: 'active',
    aliases: [],
  },
].map((definition) => Object.freeze(definition) as InvoiceTemplateDefinition);

/** The complete active registry. Keep this list explicit and source controlled. */
export const INVOICE_TEMPLATE_REGISTRY: readonly InvoiceTemplateDefinition[] =
  Object.freeze(definitions);

/** Compatibility names for callers that used a lower-case registry export. */
export const invoiceTemplateRegistry = INVOICE_TEMPLATE_REGISTRY;
export const INVOICE_TEMPLATES = INVOICE_TEMPLATE_REGISTRY;

const definitionsById = new Map<InvoiceTemplateId, InvoiceTemplateDefinition>(
  definitions.map((definition) => [definition.id, definition]),
);

const idFromSelector = (selector: InvoiceTemplateSelector): unknown =>
  typeof selector === 'string'
    ? selector
    : selector && typeof selector === 'object'
      ? selector.id
      : undefined;

const versionFromSelector = (selector: InvoiceTemplateSelector): unknown =>
  selector && typeof selector === 'object' && !Array.isArray(selector)
    ? selector.version
    : undefined;

/**
 * Resolve a persisted selector using exact canonical IDs or an enumerated
 * compatibility alias. No case folding, substring matching, or free-text
 * fallback is permitted here.
 */
export function resolveInvoiceTemplate(
  selector: InvoiceTemplateSelector = undefined,
): InvoiceTemplateDefinition {
  const requestedId = idFromSelector(selector);
  const id =
    requestedId === undefined || requestedId === null
      ? 'labor-detailed'
      : typeof requestedId === 'string'
        ? requestedId
        : String(requestedId);
  const canonicalId = definitionsById.has(id as InvoiceTemplateId)
    ? (id as InvoiceTemplateId)
    : Object.prototype.hasOwnProperty.call(INVOICE_TEMPLATE_ALIASES, id)
      ? INVOICE_TEMPLATE_ALIASES[id]!
      : undefined;
  if (!canonicalId) throw new Error(`Unknown invoice template ID: ${id}`);
  const definition = definitionsById.get(canonicalId);
  if (!definition) throw new Error(`Invoice template is not registered: ${canonicalId}`);

  const requestedVersion = versionFromSelector(selector);
  if (requestedVersion !== undefined && requestedVersion !== null) {
    const matches =
      (typeof requestedVersion === 'number' &&
        Number.isInteger(requestedVersion) &&
        requestedVersion === definition.version) ||
      (typeof requestedVersion === 'string' && requestedVersion === String(definition.version));
    if (!matches)
      throw new Error(
        `Unsupported invoice template version for ${definition.id}: ${String(requestedVersion)}`,
      );
  }
  return definition;
}

export const getInvoiceTemplate = resolveInvoiceTemplate;

export function getInvoiceTemplateRegistry(): readonly InvoiceTemplateDefinition[] {
  return INVOICE_TEMPLATE_REGISTRY;
}

/** Explicit validation alias for API/schema adapters. */
export function validateInvoiceTemplate(
  selector: InvoiceTemplateSelector,
): InvoiceTemplateDefinition {
  return resolveInvoiceTemplate(selector);
}

const escape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );

const nonEmptyString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object') return undefined;
  const text = String(value);
  return text.length > 0 ? text : undefined;
};

/** Internal row UUIDs are storage keys, not bill references the client can use. */
const isInternalRecordId = (value: unknown): boolean => {
  const text = nonEmptyString(value)?.trim();
  if (!text) return false;
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(text) ||
    /^01[0-9a-f]{24}$/iu.test(text)
  );
};

const displayText = (value: unknown): string | undefined => {
  const text = nonEmptyString(value);
  return text && !isInternalRecordId(text) ? text : undefined;
};

const periodRangeText = (value: unknown): string | undefined => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Readonly<Record<string, unknown>>;
    const start = nonEmptyString(record.start ?? record.from ?? record.periodStart);
    const end = nonEmptyString(record.end ?? record.to ?? record.periodEnd);
    if (start && end) return `${start} → ${end}`;
    return start ?? end;
  }
  return nonEmptyString(value);
};

const nestedLineSnapshot = (
  line: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const raw = line.snapshot_json ?? line.snapshotJson;
  if (typeof raw !== 'string' || raw.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Readonly<Record<string, unknown>>)
      : {};
  } catch {
    return {};
  }
};

const lineValue = (
  line: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): unknown => {
  const nested = nestedLineSnapshot(line);
  for (const key of keys) {
    const direct = line[key];
    if (direct !== undefined && direct !== null && String(direct) !== '') return direct;
  }
  for (const key of keys) {
    const value = nested[key];
    if (value !== undefined && value !== null && String(value) !== '') return value;
  }
  return undefined;
};

const lineDisplayValue = (
  line: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): unknown => {
  const nested = nestedLineSnapshot(line);
  for (const key of keys) {
    const direct = displayText(line[key]);
    if (direct) return direct;
  }
  for (const key of keys) {
    const value = displayText(nested[key]);
    if (value) return value;
  }
  return undefined;
};

const currencyCode = (value: unknown): string | undefined => {
  const text = nonEmptyString(value);
  return text && /^[A-Za-z]{3}$/.test(text) ? text.toUpperCase() : undefined;
};

/** Parse a persisted exact minor-unit value without passing it through Number. */
const exactMinorUnits = (value: unknown): bigint | undefined => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  // SQLite adapters may expose a safe integer for legacy snapshots. Reject
  // fractions and unsafe numbers rather than silently rounding money.
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  return undefined;
};

const formatMinorUnits = (
  currency: unknown,
  minor: unknown,
  locale: InvoiceLanguage,
): string | undefined => {
  const code = currencyCode(currency);
  const amount = exactMinorUnits(minor);
  if (!code || amount === undefined) return undefined;
  let fractionDigits = 2;
  try {
    fractionDigits =
      new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    return undefined;
  }
  const absolute = amount < 0n ? -amount : amount;
  const scale = 10n ** BigInt(fractionDigits);
  const probe = new Intl.NumberFormat(invoiceLocaleTag(locale), {
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(1234567.89);
  const group = probe.find((part) => part.type === 'group')?.value ?? ',';
  const decimal = probe.find((part) => part.type === 'decimal')?.value ?? '.';
  const integer = (absolute / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const fraction =
    fractionDigits > 0
      ? `${decimal}${(absolute % scale).toString().padStart(fractionDigits, '0')}`
      : '';
  const parts = new Intl.NumberFormat(invoiceLocaleTag(locale), {
    style: 'currency',
    currency: code,
  }).formatToParts(0);
  const firstNumeric = parts.findIndex((part) => part.type === 'integer');
  const lastNumeric = [...parts]
    .reverse()
    .findIndex((part) => ['integer', 'group', 'decimal', 'fraction'].includes(part.type));
  const end = parts.length - lastNumeric;
  const prefix = parts
    .slice(0, firstNumeric)
    .map((part) => part.value)
    .join('');
  const suffix = parts
    .slice(end)
    .map((part) => part.value)
    .join('');
  return `${amount < 0n ? '-' : ''}${prefix}${integer}${fraction}${suffix}`;
};

const valueOrDash = (value: unknown, localized?: InvoiceCopy): string =>
  escape(nonEmptyString(value) ?? localized?.noValue ?? '—');

const moneyOrDash = (
  currency: unknown,
  value: unknown,
  locale: InvoiceLanguage,
  localized: InvoiceCopy,
): string => escape(formatMinorUnits(currency, value, locale) ?? localized.noValue);

const row = (label: string, value: string): string =>
  `<div class="invoice-field"><span class="label">${escape(label)}</span><strong class="value">${value}</strong></div>`;

const party = (
  heading: string,
  entity: Readonly<Record<string, unknown>> | undefined,
  localized: InvoiceCopy,
  client = false,
): string => {
  const name = entity && (entity.legalName ?? entity.legal_name ?? entity.name);
  const address = entity && (entity.billingAddress ?? entity.billing_address ?? entity.address);
  const email = entity && (entity.billingEmail ?? entity.billing_email ?? entity.email);
  const fields = [name, address, client ? email : undefined]
    .map(nonEmptyString)
    .filter((value): value is string => Boolean(value))
    .map((value) => `<div>${escape(value)}</div>`)
    .join('');
  return `<section class="invoice-party"><span class="invoice-party-label">${escape(heading)}</span>${fields || `<div class="muted">${escape(localized.noValue)}</div>`}</section>`;
};

const calculationCurrency = (snapshot: InvoiceTemplateSnapshot): unknown =>
  snapshot.calculation?.currency ?? snapshot.currency;

const resolveTerms = (snapshot: InvoiceTemplateSnapshot): InvoiceTermsAndInstructions => {
  const custom = (snapshot.termsAndInstructions ?? snapshot.terms_and_instructions) as
    | Partial<InvoiceTermsAndInstructions>
    | string
    | undefined;
  if (typeof custom === 'string' && custom.trim()) {
    return {
      bankSwiftNumber: DEFAULT_INVOICE_TERMS.bankSwiftNumber,
      bankAccountNumber: DEFAULT_INVOICE_TERMS.bankAccountNumber,
      bankName: DEFAULT_INVOICE_TERMS.bankName,
      beneficiary: DEFAULT_INVOICE_TERMS.beneficiary,
      pastDueNotice: custom.trim(),
    };
  }
  if (typeof custom === 'object' && custom !== null) {
    return {
      bankSwiftNumber: custom.bankSwiftNumber || DEFAULT_INVOICE_TERMS.bankSwiftNumber,
      bankAccountNumber: custom.bankAccountNumber || DEFAULT_INVOICE_TERMS.bankAccountNumber,
      bankName: custom.bankName || DEFAULT_INVOICE_TERMS.bankName,
      beneficiary: custom.beneficiary || DEFAULT_INVOICE_TERMS.beneficiary,
      pastDueNotice: custom.pastDueNotice || DEFAULT_INVOICE_TERMS.pastDueNotice,
    };
  }
  return DEFAULT_INVOICE_TERMS;
};

const formatInvoiceDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const str = String(value).trim();
  if (!str) return undefined;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) return str;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match && match[1] && match[2] && match[3]) {
    return `${parseInt(match[2], 10)}/${parseInt(match[3], 10)}/${match[1]}`;
  }
  return str;
};

const getLineQuantity = (line: Readonly<Record<string, unknown>>): number => {
  const nested = nestedLineSnapshot(line);
  const qNum = line.quantity_numerator ?? nested.quantity_numerator;
  const qDen = line.quantity_denominator ?? nested.quantity_denominator;
  if (qNum !== undefined && qDen !== undefined) {
    const num = Number(qNum);
    const den = Number(qDen);
    if (den > 0 && Number.isFinite(num)) return num / den;
  }
  const raw =
    line.qty ??
    line.quantity ??
    line.hours ??
    line.hour_quantity ??
    line.hourQuantity ??
    line.quantity_display ??
    nested.qty ??
    nested.quantity ??
    nested.hours ??
    nested.hour_quantity ??
    nested.hourQuantity ??
    nested.quantity_display;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
  }
  return 1;
};

const formatQuantity = (qty: number): string => {
  return qty.toFixed(2);
};

const formatLaborDescription = (
  line: Readonly<Record<string, unknown>>,
  localized: InvoiceCopy,
): string => {
  const desc = lineDisplayValue(line, 'description', 'detail');
  if (nonEmptyString(desc)) return String(desc);
  const worker = lineDisplayValue(line, 'worker_name', 'workerName', 'worker', 'employee_name');
  const date = lineDisplayValue(line, 'work_date', 'workDate', 'service_date', 'date');
  if (worker && date) return `${worker} Hours · ${date}`;
  if (worker) return `${worker} Hours`;
  return localized.noValue;
};

const renderCommon = (snapshot: InvoiceTemplateSnapshot, localized: InvoiceCopy): string => {
  const legalEntity = snapshot.legalEntity;
  const client = snapshot.client;
  const project = snapshot.project;
  const calculation = snapshot.calculation;
  const issueDate = formatInvoiceDate(
    snapshot.issueDate ?? snapshot.issue_date ?? snapshot.issuedAt ?? snapshot.issued_at,
  );
  const dueDate = formatInvoiceDate(
    snapshot.dueDate ?? snapshot.due_date ?? snapshot.dueAt ?? snapshot.due_at,
  );
  const periodParts = [
    snapshot.periodStart ?? snapshot.period_start,
    snapshot.periodEnd ?? snapshot.period_end,
  ]
    .map((value) => periodRangeText(value) ?? nonEmptyString(value))
    .filter((value): value is string => Boolean(value));
  const servicePeriod =
    periodRangeText(snapshot.servicePeriod ?? snapshot.service_period) ??
    (periodParts.length ? periodParts.join(' → ') : undefined);
  const projectValue = project
    ? [project.number ?? project.projectNumber, project.name]
        .filter((value) => nonEmptyString(value))
        .join(' · ')
    : (snapshot.projectNumber ?? snapshot.projectName);
  const poValue =
    project?.poNumber ?? project?.po_number ?? snapshot.poNumber ?? snapshot.po_number;
  const purchaseNo = snapshot.purchaseNo ?? snapshot.purchase_no ?? poValue;
  const invoiceNumber = snapshot.number ?? snapshot.invoiceNumber;

  const metadata = [
    row(localized.issueDate, valueOrDash(issueDate, localized)),
    row(localized.dueDate, valueOrDash(dueDate, localized)),
    ...(nonEmptyString(purchaseNo)
      ? [row(localized.purchaseNo, valueOrDash(purchaseNo, localized))]
      : nonEmptyString(poValue)
        ? [row(localized.po, valueOrDash(poValue, localized))]
        : []),
    ...(nonEmptyString(invoiceNumber)
      ? [row(localized.invoice, valueOrDash(invoiceNumber, localized))]
      : []),
    row(localized.currency, valueOrDash(calculation?.currency ?? snapshot.currency, localized)),
    ...(nonEmptyString(projectValue)
      ? [row(localized.project, valueOrDash(projectValue, localized))]
      : []),
    ...(nonEmptyString(servicePeriod)
      ? [row(localized.period, valueOrDash(servicePeriod, localized))]
      : []),
  ].join('');

  return `<section class="invoice-parties">${party(localized.from, legalEntity, localized)}${party(localized.billTo, client, localized, true)}</section><div class="invoice-meta">${metadata}</div>`;
};

type InvoiceColumn = Readonly<{
  label: string;
  numeric?: boolean;
  render: (line: Readonly<Record<string, unknown>>) => string;
}>;

const table = (
  columns: readonly InvoiceColumn[],
  lines: readonly Readonly<Record<string, unknown>>[],
  localized: InvoiceCopy,
  totalQtyText?: string,
  totalAmountText?: string,
): string => {
  const cell = (column: InvoiceColumn, content: string, tag: 'th' | 'td'): string =>
    `<${tag}${column.numeric ? ' class="amount"' : ''}>${content}</${tag}>`;
  const headers = columns.map((column) => cell(column, escape(column.label), 'th')).join('');
  const body = lines.length
    ? lines
        .map(
          (line) =>
            `<tr>${columns.map((column) => cell(column, column.render(line), 'td')).join('')}</tr>`,
        )
        .join('')
    : `<tr><td colspan="${columns.length}" class="muted">${escape(localized.noInvoiceLines)}</td></tr>`;
  const footer =
    totalQtyText || totalAmountText
      ? `<tfoot><tr class="qty-total-row"><td><strong>${escape(localized.total)}</strong></td><td class="amount qty-total-cell"><strong>${escape(totalQtyText ?? '—')}</strong></td><td></td><td class="amount total-amount-cell"><strong>${escape(totalAmountText ?? '')}</strong></td></tr></tfoot>`
      : '';
  return `<table class="invoice-lines"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody>${footer}</table>`;
};

const textColumn = (label: string, ...keys: readonly string[]): InvoiceColumn => ({
  label,
  render: (line) => valueOrDash(lineDisplayValue(line, ...keys)),
});

const moneyColumn = (
  label: string,
  currency: unknown,
  locale: InvoiceLanguage,
  localized: InvoiceCopy,
  ...keys: readonly string[]
): InvoiceColumn => ({
  label,
  numeric: true,
  render: (line) => moneyOrDash(currency, lineValue(line, ...keys), locale, localized),
});

const quantityColumn = (label: string, ..._keys: readonly string[]): InvoiceColumn => ({
  label,
  numeric: true,
  render: (line) => {
    const qty = getLineQuantity(line);
    return escape(formatQuantity(qty));
  },
});

const descriptionBlock = (
  lines: readonly Readonly<Record<string, unknown>>[],
  localized: InvoiceCopy,
): string => {
  const descriptions = lines
    .map((line) => nonEmptyString(lineValue(line, 'description', 'detail')))
    .filter((value): value is string => Boolean(value));
  return descriptions.length
    ? `<p class="invoice-description-block"><strong>${escape(localized.description)}:</strong> ${descriptions.map(escape).join(' · ')}</p>`
    : '';
};

const lineSubtotalMinorSum = (
  lines: readonly Readonly<Record<string, unknown>>[],
  snapshot: InvoiceTemplateSnapshot,
): bigint => {
  const sum = lines.reduce((acc, line) => {
    const raw = lineValue(
      line,
      'subtotal_minor',
      'subtotalMinor',
      'amount_minor',
      'amountMinor',
      'adjustment_amount_minor',
      'adjustmentAmountMinor',
      'total_minor',
      'totalMinor',
    );
    return acc + (raw !== undefined && raw !== null && raw !== '' ? BigInt(String(raw)) : 0n);
  }, 0n);
  if (sum !== 0n) return sum;
  const snapMinor = snapshot.calculation?.subtotalMinor ?? snapshot.calculation?.totalMinor;
  return snapMinor ? BigInt(String(snapMinor)) : 0n;
};

const renderLaborDetailed = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const currency = calculationCurrency(snapshot);
  const lines = snapshot.lines ?? [];
  const totalQty = lines.reduce((sum, line) => sum + getLineQuantity(line), 0);
  const totalQtyText = totalQty > 0 ? formatQuantity(totalQty) : undefined;
  const totalAmountMinor = lineSubtotalMinorSum(lines, snapshot);
  const totalAmountText =
    totalAmountMinor !== 0n ? formatMinorUnits(currency, totalAmountMinor, locale) : undefined;
  return `<h2>${escape(localized.invoiceDetail)} · ${escape(localized.worker)}</h2>${descriptionBlock(lines, localized)}${table(
    [
      {
        label: `${localized.description} / ${localized.worker}`,
        render: (line) => escape(formatLaborDescription(line, localized)),
      },
      quantityColumn(
        localized.qty,
        'hours',
        'hour_quantity',
        'hourQuantity',
        'quantity_display',
        'quantity',
      ),
      moneyColumn(
        localized.unitPrice,
        currency,
        locale,
        localized,
        'unit_price_minor',
        'unitPriceMinor',
        'rate_minor',
        'rateMinor',
        'unit_amount_minor',
      ),
      moneyColumn(
        `${localized.total} / ${localized.amount}`,
        currency,
        locale,
        localized,
        'subtotal_minor',
        'subtotalMinor',
        'amount_minor',
        'amountMinor',
        'gross_amount_minor',
      ),
    ],
    lines,
    localized,
    totalQtyText,
    totalAmountText,
  )}`;
};

const renderLaborSummary = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const currency = calculationCurrency(snapshot);
  const lines = snapshot.lines ?? [];
  const totalQty = lines.reduce((sum, line) => sum + getLineQuantity(line), 0);
  const totalQtyText = totalQty > 0 ? formatQuantity(totalQty) : undefined;
  const totalAmountMinor = lineSubtotalMinorSum(lines, snapshot);
  const totalAmountText =
    totalAmountMinor !== 0n ? formatMinorUnits(currency, totalAmountMinor, locale) : undefined;
  return `<h2>${escape(localized.invoiceDetail)} · ${escape(localized.summaryQuantity)}</h2>${descriptionBlock(lines, localized)}${table(
    [
      textColumn(localized.description, 'grouping_key', 'groupingKey', 'category', 'description'),
      quantityColumn(
        `${localized.qty} / ${localized.summaryQuantity}`,
        'hours',
        'hour_quantity',
        'hourQuantity',
        'quantity_display',
        'quantity',
      ),
      moneyColumn(
        localized.unitPrice,
        currency,
        locale,
        localized,
        'unit_price_minor',
        'unitPriceMinor',
        'rate_minor',
        'rateMinor',
        'unit_amount_minor',
      ),
      moneyColumn(
        `${localized.total} / ${localized.amount}`,
        currency,
        locale,
        localized,
        'subtotal_minor',
        'subtotalMinor',
        'amount_minor',
        'amountMinor',
      ),
    ],
    lines,
    localized,
    totalQtyText,
    totalAmountText,
  )}`;
};

const renderExpensesDetailed = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const currency = calculationCurrency(snapshot);
  const lines = snapshot.lines ?? [];
  const totalQty = lines.reduce((sum, line) => sum + getLineQuantity(line), 0);
  const totalQtyText = totalQty > 0 ? formatQuantity(totalQty) : undefined;
  const totalAmountMinor = lineSubtotalMinorSum(lines, snapshot);
  const totalAmountText =
    totalAmountMinor !== 0n ? formatMinorUnits(currency, totalAmountMinor, locale) : undefined;
  return `<h2>${escape(localized.invoiceDetail)} · ${escape(localized.vendor)}</h2>${descriptionBlock(lines, localized)}${table(
    [
      {
        label: `${localized.description} / ${localized.vendor}`,
        render: (line) => {
          const desc = lineDisplayValue(line, 'description', 'detail');
          const vendor = lineDisplayValue(line, 'vendor', 'merchant', 'supplier');
          if (desc && vendor && !String(desc).includes(String(vendor))) {
            return `${escape(String(desc))} <span class="sub-muted">(${escape(String(vendor))})</span>`;
          }
          return escape(String(desc || vendor || localized.noValue));
        },
      },
      quantityColumn(localized.qty, 'quantity', 'quantity_display', 'qty'),
      moneyColumn(
        localized.unitPrice,
        currency,
        locale,
        localized,
        'unit_price_minor',
        'unitPriceMinor',
        'rate_minor',
        'rateMinor',
        'subtotal_minor',
      ),
      moneyColumn(
        `${localized.total} / ${localized.amount}`,
        currency,
        locale,
        localized,
        'subtotal_minor',
        'subtotalMinor',
        'amount_minor',
        'amountMinor',
      ),
    ],
    lines,
    localized,
    totalQtyText,
    totalAmountText,
  )}`;
};

const renderFixedMilestone = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const currency = calculationCurrency(snapshot);
  const lines = snapshot.lines ?? [];
  const totalQty = lines.reduce((sum, line) => sum + getLineQuantity(line), 0);
  const totalQtyText = totalQty > 0 ? formatQuantity(totalQty) : undefined;
  const totalAmountMinor = lineSubtotalMinorSum(lines, snapshot);
  const totalAmountText =
    totalAmountMinor !== 0n ? formatMinorUnits(currency, totalAmountMinor, locale) : undefined;
  return `<h2>${escape(localized.invoiceDetail)} · ${escape(localized.milestone)}</h2>${descriptionBlock(lines, localized)}${table(
    [
      {
        label: `${localized.description} / ${localized.milestone}`,
        render: (line) => {
          const milestone = lineDisplayValue(line, 'milestone', 'milestone_name', 'milestoneName');
          const desc = lineDisplayValue(line, 'description', 'service', 'detail');
          if (milestone && desc && !String(desc).includes(String(milestone))) {
            return `${escape(String(desc))} <span class="sub-muted">(${escape(String(milestone))})</span>`;
          }
          return escape(String(desc || milestone || localized.noValue));
        },
      },
      quantityColumn(localized.qty, 'quantity', 'quantity_display'),
      moneyColumn(
        localized.unitPrice,
        currency,
        locale,
        localized,
        'unit_price_minor',
        'unitPriceMinor',
        'subtotal_minor',
        'subtotalMinor',
      ),
      moneyColumn(
        `${localized.total} / ${localized.amount}`,
        currency,
        locale,
        localized,
        'subtotal_minor',
        'subtotalMinor',
        'amount_minor',
        'amountMinor',
      ),
    ],
    lines,
    localized,
    totalQtyText,
    totalAmountText,
  )}`;
};

const renderCreditAdjustment = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const currency = calculationCurrency(snapshot);
  const lines = snapshot.lines ?? [];
  const totalQty = lines.reduce((sum, line) => sum + getLineQuantity(line), 0);
  const totalQtyText = totalQty > 0 ? formatQuantity(totalQty) : undefined;
  const totalAmountMinor = lineSubtotalMinorSum(lines, snapshot);
  const totalAmountText =
    totalAmountMinor !== 0n ? formatMinorUnits(currency, totalAmountMinor, locale) : undefined;
  return `<h2>${escape(localized.invoiceDetail)} · ${escape(localized.originalInvoice)}</h2>${descriptionBlock(lines, localized)}${table(
    [
      {
        label: `${localized.description} / ${localized.originalInvoice}`,
        render: (line) => {
          const original = lineDisplayValue(
            line,
            'original_invoice_number',
            'originalInvoiceNumber',
            'original_invoice',
            'originalInvoice',
          );
          const reason = lineDisplayValue(line, 'reason', 'adjustment_reason', 'adjustmentReason');
          const desc = lineDisplayValue(line, 'description', 'detail');
          const parts = [
            desc,
            original ? `${localized.originalInvoice}: ${original}` : undefined,
            reason,
          ]
            .filter(nonEmptyString)
            .map(String);
          return escape(parts.join(' · ') || localized.noValue);
        },
      },
      quantityColumn(localized.qty, 'quantity', 'quantity_display'),
      moneyColumn(
        localized.unitPrice,
        currency,
        locale,
        localized,
        'adjustment_amount_minor',
        'adjustmentAmountMinor',
        'subtotal_minor',
        'subtotalMinor',
      ),
      moneyColumn(
        `${localized.total} / ${localized.amount}`,
        currency,
        locale,
        localized,
        'adjustment_amount_minor',
        'adjustmentAmountMinor',
        'amount_minor',
        'amountMinor',
        'subtotal_minor',
        'subtotalMinor',
      ),
    ],
    lines,
    localized,
    totalQtyText,
    totalAmountText,
  )}`;
};

const renderers: Readonly<
  Record<
    InvoiceTemplateId,
    (snapshot: InvoiceTemplateSnapshot, localized: InvoiceCopy, locale: InvoiceLanguage) => string
  >
> = {
  'labor-detailed': renderLaborDetailed,
  'labor-summary': renderLaborSummary,
  'expenses-detailed': renderExpensesDetailed,
  'fixed-milestone': renderFixedMilestone,
  'credit-adjustment': renderCreditAdjustment,
};

const titleFor = (id: InvoiceTemplateId, localized: InvoiceCopy): string => {
  switch (id) {
    case 'labor-detailed':
      return localized.laborDetailedInvoice;
    case 'labor-summary':
      return localized.laborSummaryInvoice;
    case 'expenses-detailed':
      return localized.expensesDetailedInvoice;
    case 'fixed-milestone':
      return localized.fixedMilestoneInvoice;
    case 'credit-adjustment':
      return localized.creditAdjustment;
  }
};

const renderTotals = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const calculation = snapshot.calculation;
  const currency = calculationCurrency(snapshot);
  const subtotalMinor = calculation?.subtotalMinor ?? calculation?.subtotal_minor;
  const discountMinor =
    snapshot.discountMinor ?? snapshot.discount_minor ?? snapshot.discount ?? '0';
  const subtotalBig = exactMinorUnits(subtotalMinor);
  const discountBig = exactMinorUnits(discountMinor);
  const subtotalLessDiscountMinor =
    subtotalBig !== undefined && discountBig !== undefined
      ? (subtotalBig - discountBig).toString()
      : subtotalMinor;
  const totalMinor =
    calculation?.totalMinor ?? calculation?.total_minor ?? subtotalLessDiscountMinor;
  const terms = resolveTerms(snapshot);

  return `<div class="invoice-bottom-grid">
  <div class="invoice-terms-card">
    <div class="terms-heading">${escape(localized.termsInstructions)}</div>
    <div class="terms-field"><strong>${escape(localized.bankSwiftNumber)}:</strong> ${escape(terms.bankSwiftNumber)}</div>
    <div class="terms-field"><strong>${escape(localized.bankAccountNumber)}:</strong> ${escape(terms.bankAccountNumber)}</div>
    <div class="terms-field"><strong>${escape(localized.bankName)}:</strong> ${escape(terms.bankName)}</div>
    <div class="terms-field"><strong>${escape(localized.beneficiary)}:</strong> ${escape(terms.beneficiary)}</div>
    <div class="terms-notice">${escape(terms.pastDueNotice)}</div>
  </div>
  <div class="invoice-total">
    <div class="total-row"><span>${escape(localized.subtotal)}</span><span>${moneyOrDash(currency, subtotalMinor, locale, localized)}</span></div>
    <div class="total-row"><span>${escape(localized.discount)}</span><span>${moneyOrDash(currency, discountMinor, locale, localized)}</span></div>
    <div class="total-row"><span>${escape(localized.subtotalLessDiscount)}</span><span>${moneyOrDash(currency, subtotalLessDiscountMinor, locale, localized)}</span></div>
    ${calculation?.taxMinor || calculation?.tax_minor ? `<div class="total-row"><span>${escape(localized.tax)}</span><span>${moneyOrDash(currency, calculation.taxMinor ?? calculation.tax_minor, locale, localized)}</span></div>` : ''}
    <div class="total-row grand-total"><strong>${escape(localized.total)}</strong><strong>${moneyOrDash(currency, totalMinor, locale, localized)}</strong></div>
  </div>
</div>`;
};

export type RenderedInvoiceTemplate = Readonly<{
  definition: InvoiceTemplateDefinition;
  locale: InvoiceLanguage;
  title: string;
  subtitle: string;
  body: string;
}>;

/** Render the selected registry contract without recalculating source values. */
export function renderInvoiceTemplate(snapshot: InvoiceTemplateSnapshot): RenderedInvoiceTemplate {
  const definition = resolveInvoiceTemplate(snapshot.template);
  const locale = normalizeInvoiceLocale(snapshot.locale);
  const localized = copy[locale];
  const legalName = snapshot.legalEntity?.legalName ?? snapshot.legalEntity?.legal_name;
  const clientName = snapshot.client?.legalName ?? snapshot.client?.legal_name;
  const subtitle = [legalName, clientName]
    .map(nonEmptyString)
    .filter((value): value is string => Boolean(value))
    .join(' → ');
  return {
    definition,
    locale,
    title: titleFor(definition.id, localized),
    subtitle,
    body: `${renderCommon(snapshot, localized)}${renderers[definition.id](snapshot, localized, locale)}${renderTotals(snapshot, localized, locale)}`,
  };
}

type LegacyInvoiceHtmlSnapshot = Readonly<{
  number: string;
  legalEntity: string;
  client: string;
  total: Readonly<{ currency: string; minorUnits: string }>;
  locale?: InvoiceLocale | string;
}>;

const invoiceStandaloneCss = `
body{font:13px Arial,sans-serif;color:#1e293b;margin:28px}
h1{border-bottom:2px solid #0f2d3d;padding-bottom:12px;color:#0f2d3d}
.invoice-parties{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;padding:16px 0}
.invoice-party{display:grid;gap:5px;font-size:12px}
.invoice-party-label{color:#64748b;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.invoice-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:12px 0;border-block:1px solid #d9e1e7}
.invoice-field{display:grid;gap:3px}
.invoice-field .label{color:#64748b;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.invoice-field .value{margin:0;font-size:12px}
.invoice-lines{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;margin-top:20px}
.invoice-lines th{background:#dbebf7;color:#0d3b66;text-align:left;padding:8px 10px;font-size:11px;font-weight:700;letter-spacing:.04em;border-top:1px solid #b8d5ec;border-bottom:1px solid #b8d5ec}
.invoice-lines td{border-bottom:1px solid #e2e8f0;padding:8px 10px;vertical-align:top;font-size:12px}
.invoice-lines th.amount,.invoice-lines td.amount{text-align:right;white-space:nowrap}
.qty-total-cell,.total-amount-cell{border:1.5px solid #0d3b66!important;background:#fff;font-weight:700;text-align:right}
.invoice-bottom-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:24px;margin-top:24px;align-items:start}
.invoice-terms-card{font-size:11.5px;color:#1e293b;line-height:1.5}
.terms-heading{font-size:13px;font-weight:700;color:#0f2d3d;text-decoration:underline;margin-bottom:8px}
.terms-field{margin:2px 0}
.terms-notice{margin-top:10px;font-style:italic;color:#64748b;font-size:11px}
.invoice-total{border-top:2px solid #cbd5e1;padding-top:8px}
.total-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:3px 0;font-size:12px}
.total-row span:last-child,.total-row strong:last-child{text-align:right}
.muted{color:#64748b}
.sub-muted{color:#64748b;font-size:11px}
`;

/**
 * Standalone HTML renderer retained for callers that do not use @ja/reporting.
 * The same registry contract is used as the PDF renderer. The legacy overload
 * is intentionally kept for pre-registry preview callers; it does not invent
 * subtotal or tax values when the old shape did not provide them.
 */
export function invoiceHtml(snapshot: InvoiceTemplateSnapshot & { number: string }): string;
export function invoiceHtml(snapshot: LegacyInvoiceHtmlSnapshot): string;
export function invoiceHtml(
  snapshot: (InvoiceTemplateSnapshot & { number: string }) | LegacyInvoiceHtmlSnapshot,
): string {
  let normalized: InvoiceTemplateSnapshot & { number: string };
  if (typeof snapshot.legalEntity === 'string') {
    const legacy = snapshot as LegacyInvoiceHtmlSnapshot;
    normalized = {
      number: legacy.number,
      locale: legacy.locale,
      legalEntity: { legalName: legacy.legalEntity },
      client: { legalName: legacy.client },
      calculation: {
        currency: legacy.total.currency,
        totalMinor: legacy.total.minorUnits,
      },
    };
  } else {
    normalized = snapshot as InvoiceTemplateSnapshot & { number: string };
  }
  const rendered = renderInvoiceTemplate(normalized);
  const number =
    nonEmptyString(normalized.number ?? normalized.invoiceNumber) ?? rendered.definition.id;
  return `<!doctype html><html lang="${invoiceLocaleTag(rendered.locale)}"><head><meta charset="utf-8"><meta name="invoice-template-id" content="${escape(rendered.definition.id)}"><meta name="invoice-template-version" content="${escape(rendered.definition.versionId)}"><style>${invoiceStandaloneCss}</style></head><body><h1>${escape(rendered.title)} ${escape(number)}</h1><p class="muted">${escape(rendered.subtitle)}</p>${rendered.body}</body></html>`;
}
