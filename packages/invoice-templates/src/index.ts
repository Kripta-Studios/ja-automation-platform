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
}>;

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
    laborDetailedInvoice: 'Fatura Detalhada de Mão de Obra',
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
  const text = String(value);
  return text.length > 0 ? text : undefined;
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
  `<div class="invoice-field"><dt>${escape(label)}</dt><dd>${value}</dd></div>`;

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
  return `<section class="invoice-party"><h2>${escape(heading)}</h2>${fields || `<div class="muted">${escape(localized.noValue)}</div>`}</section>`;
};

const calculationCurrency = (snapshot: InvoiceTemplateSnapshot): unknown =>
  snapshot.calculation?.currency ?? snapshot.currency;

const renderCommon = (snapshot: InvoiceTemplateSnapshot, localized: InvoiceCopy): string => {
  const legalEntity = snapshot.legalEntity;
  const client = snapshot.client;
  const project = snapshot.project;
  const calculation = snapshot.calculation;
  const issueDate =
    snapshot.issueDate ?? snapshot.issue_date ?? snapshot.issuedAt ?? snapshot.issued_at;
  const dueDate = snapshot.dueDate ?? snapshot.due_date ?? snapshot.dueAt ?? snapshot.due_at;
  const periodParts = [
    snapshot.periodStart ?? snapshot.period_start,
    snapshot.periodEnd ?? snapshot.period_end,
  ].filter((value) => nonEmptyString(value));
  const servicePeriod =
    snapshot.servicePeriod ??
    snapshot.service_period ??
    (periodParts.length ? periodParts.join(' → ') : undefined);
  const projectValue = project
    ? [project.number ?? project.projectNumber, project.name]
        .filter((value) => nonEmptyString(value))
        .join(' · ')
    : (snapshot.projectNumber ?? snapshot.projectName);
  const poValue =
    project?.poNumber ?? project?.po_number ?? snapshot.poNumber ?? snapshot.po_number;
  const metadata = [
    row(localized.issueDate, valueOrDash(issueDate, localized)),
    row(localized.dueDate, valueOrDash(dueDate, localized)),
    row(localized.currency, valueOrDash(calculation?.currency ?? snapshot.currency, localized)),
    ...(nonEmptyString(projectValue)
      ? [row(localized.project, valueOrDash(projectValue, localized))]
      : []),
    ...(nonEmptyString(poValue) ? [row(localized.po, valueOrDash(poValue, localized))] : []),
    ...(nonEmptyString(servicePeriod)
      ? [row(localized.period, valueOrDash(servicePeriod, localized))]
      : []),
  ].join('');
  return `<section class="invoice-parties">${party(localized.from, legalEntity, localized)}${party(localized.billTo, client, localized, true)}</section><dl class="invoice-meta">${metadata}</dl>`;
};

type InvoiceColumn = Readonly<{
  label: string;
  render: (line: Readonly<Record<string, unknown>>) => string;
}>;

const table = (
  columns: readonly InvoiceColumn[],
  lines: readonly Readonly<Record<string, unknown>>[],
  localized: InvoiceCopy,
): string => {
  const headers = columns.map((column) => `<th>${escape(column.label)}</th>`).join('');
  const body = lines.length
    ? lines
        .map(
          (line) =>
            `<tr>${columns.map((column) => `<td>${column.render(line)}</td>`).join('')}</tr>`,
        )
        .join('')
    : `<tr><td colspan="${columns.length}" class="muted">${escape(localized.noInvoiceLines)}</td></tr>`;
  return `<table class="invoice-lines"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`;
};

const textColumn = (label: string, ...keys: readonly string[]): InvoiceColumn => ({
  label,
  render: (line) => valueOrDash(lineValue(line, ...keys)),
});

const moneyColumn = (
  label: string,
  currency: unknown,
  locale: InvoiceLanguage,
  localized: InvoiceCopy,
  ...keys: readonly string[]
): InvoiceColumn => ({
  label,
  render: (line) => moneyOrDash(currency, lineValue(line, ...keys), locale, localized),
});

const quantityColumn = (label: string, ...keys: readonly string[]): InvoiceColumn => ({
  label,
  render: (line) => valueOrDash(lineValue(line, ...keys)),
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

const renderLaborDetailed = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const currency = calculationCurrency(snapshot);
  const lines = snapshot.lines ?? [];
  return `<h2>${escape(localized.invoiceDetail)}</h2>${descriptionBlock(lines, localized)}${table(
    [
      textColumn(localized.description, 'description', 'detail'),
      textColumn(localized.date, 'work_date', 'workDate', 'service_date', 'serviceDate', 'date'),
      textColumn(localized.worker, 'worker_name', 'workerName', 'worker', 'employee_name'),
      textColumn(localized.category, 'category', 'line_kind', 'lineKind'),
      quantityColumn(localized.hours, 'hours', 'hour_quantity', 'hourQuantity', 'quantity_display'),
      moneyColumn(
        localized.rate,
        currency,
        locale,
        localized,
        'unit_price_minor',
        'unitPriceMinor',
        'rate_minor',
        'rateMinor',
      ),
      moneyColumn(
        localized.amount,
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
  )}`;
};

const renderLaborSummary = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const currency = calculationCurrency(snapshot);
  const lines = snapshot.lines ?? [];
  return `<h2>${escape(localized.invoiceDetail)}</h2>${descriptionBlock(lines, localized)}${table(
    [
      textColumn(localized.group, 'grouping_key', 'groupingKey', 'category', 'description'),
      quantityColumn(
        localized.summaryQuantity,
        'hours',
        'hour_quantity',
        'hourQuantity',
        'quantity_display',
        'quantity',
      ),
      moneyColumn(
        localized.amount,
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
  )}`;
};

const renderExpensesDetailed = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const currency = calculationCurrency(snapshot);
  const lines = snapshot.lines ?? [];
  return `<h2>${escape(localized.invoiceDetail)}</h2>${descriptionBlock(lines, localized)}${table(
    [
      textColumn(localized.date, 'expense_date', 'expenseDate', 'date'),
      textColumn(localized.category, 'category', 'expense_category', 'expenseCategory'),
      textColumn(localized.vendor, 'vendor', 'merchant', 'supplier'),
      textColumn(localized.description, 'description', 'detail'),
      moneyColumn(
        localized.amount,
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
  )}`;
};

const renderFixedMilestone = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const currency = calculationCurrency(snapshot);
  const lines = snapshot.lines ?? [];
  return `<h2>${escape(localized.invoiceDetail)}</h2>${descriptionBlock(lines, localized)}${table(
    [
      textColumn(localized.milestone, 'milestone', 'milestone_name', 'milestoneName'),
      textColumn(localized.service, 'service', 'description', 'detail'),
      textColumn(localized.period, 'service_period', 'servicePeriod', 'period'),
      textColumn(
        localized.reference,
        'reference',
        'po_number',
        'poNumber',
        'source_id',
        'sourceId',
      ),
      moneyColumn(
        localized.amount,
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
  )}`;
};

const renderCreditAdjustment = (
  snapshot: InvoiceTemplateSnapshot,
  localized: InvoiceCopy,
  locale: InvoiceLanguage,
): string => {
  const currency = calculationCurrency(snapshot);
  const lines = snapshot.lines ?? [];
  return `<h2>${escape(localized.invoiceDetail)}</h2>${descriptionBlock(lines, localized)}${table(
    [
      textColumn(
        localized.originalInvoice,
        'original_invoice_number',
        'originalInvoiceNumber',
        'original_invoice',
        'originalInvoice',
      ),
      textColumn(localized.reference, 'reference', 'adjustment_reference', 'adjustmentReference'),
      textColumn(localized.reason, 'reason', 'adjustment_reason', 'adjustmentReason'),
      moneyColumn(
        localized.adjustmentAmount,
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
  return `<div class="invoice-total"><div><span>${escape(localized.subtotal)}</span><span>${moneyOrDash(currency, calculation?.subtotalMinor ?? calculation?.subtotal_minor, locale, localized)}</span></div><div><span>${escape(localized.tax)}</span><span>${moneyOrDash(currency, calculation?.taxMinor ?? calculation?.tax_minor, locale, localized)}</span></div><div><strong>${escape(localized.total)}</strong><strong>${moneyOrDash(currency, calculation?.totalMinor ?? calculation?.total_minor, locale, localized)}</strong></div></div>`;
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
  return `<!doctype html><html lang="${invoiceLocaleTag(rendered.locale)}"><head><meta charset="utf-8"><meta name="invoice-template-id" content="${escape(rendered.definition.id)}"><meta name="invoice-template-version" content="${escape(rendered.definition.versionId)}"><style>body{font:14px Arial,sans-serif;color:#17212b;margin:32px}h1{border-bottom:4px solid #e23d2d;padding-bottom:16px;color:#0f2d3d}.invoice-parties{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.invoice-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 24px}.invoice-field{display:grid;grid-template-columns:minmax(120px,1fr) minmax(0,2fr);gap:8px}.invoice-field dt{color:#64748b}.invoice-field dd{margin:0}.invoice-lines{width:100%;border-collapse:collapse;margin-top:24px}.invoice-lines th{background:#0f2d3d;color:#fff;text-align:left;padding:8px}.invoice-lines td{border-bottom:1px solid #d9e1e7;padding:8px;vertical-align:top}.invoice-total{margin:24px 0 0 auto;max-width:360px;border-top:3px solid #e23d2d;padding-top:12px}.invoice-total div{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:4px 0}.invoice-total span:last-child,.invoice-total strong:last-child{text-align:right;overflow-wrap:anywhere}.muted{color:#64748b}</style></head><body><h1>${escape(rendered.title)} ${escape(number)}</h1><p class="muted">${escape(rendered.subtitle)}</p>${rendered.body}</body></html>`;
}
