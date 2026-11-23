/**
 * Human field-level view of an audit event's details (QA round 3, Z2).
 *
 * The audit register stores free-form JSON per event. Most events use one of
 * three shapes: `{ before: {...}, after: {...}, reason? }` (an update),
 * `{ fields: {...} }` (the saved state) or a flat object of values. People
 * read "Billing email: field.operations@… → sven.dittrich@…"; the raw machine
 * JSON stays available behind "Technical details". Presentation only: the
 * stored event is never changed.
 */
import type { PortalLocale } from '../portal-i18n';
import { formatPortalMoney } from '../i18n/format';

type Tuple = readonly [string, string, string];
const index = (locale: PortalLocale): 0 | 1 | 2 => (locale === 'es' ? 1 : locale === 'pt' ? 2 : 0);

export type AuditDetailLine = {
  /** Field label in the viewer's language. */
  label: string;
  /** Present for changes (before/after); empty when the event only records values. */
  before?: string;
  value: string;
};

const COPY = {
  technical: ['Technical details', 'Detalles técnicos', 'Detalhes técnicos'],
  noDetails: ['No further details recorded.', 'No hay más detalles registrados.', 'Nenhum outro detalhe registrado.'],
  yes: ['Yes', 'Sí', 'Sim'],
  no: ['No', 'No', 'Não'],
  empty: ['(empty)', '(vacío)', '(vazio)'],
  changes: ['Changes', 'Cambios', 'Alterações'],
  values: ['Recorded values', 'Valores registrados', 'Valores registrados'],
  more: ['+{count} more fields', '+{count} campos más', '+{count} campos a mais'],
} as const satisfies Record<string, Tuple>;

export function auditDetailText(
  locale: PortalLocale,
  key: keyof typeof COPY,
  params: Record<string, string | number> = {},
): string {
  return COPY[key][index(locale)].replace(/\{(\w+)\}/gu, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/** Labels for the fields that appear most often; other keys are humanized. */
const FIELDS: Record<string, Tuple> = {
  name: ['Name', 'Nombre', 'Nome'],
  email: ['Email', 'Correo', 'E-mail'],
  role: ['Role', 'Rol', 'Função'],
  previousrole: ['Previous role', 'Rol anterior', 'Função anterior'],
  status: ['Status', 'Estado', 'Status'],
  reason: ['Reason', 'Motivo', 'Motivo'],
  note: ['Note', 'Nota', 'Nota'],
  ponumber: ['PO number', 'Número de pedido', 'Número do pedido'],
  poreference: ['PO reference', 'Referencia de pedido', 'Referência do pedido'],
  billingemail: ['Billing email', 'Correo de facturación', 'E-mail de faturamento'],
  description: ['Description', 'Descripción', 'Descrição'],
  sitename: ['Site', 'Sitio', 'Local'],
  sitelocation: ['Site location', 'Ubicación', 'Localização'],
  country: ['Country', 'País', 'País'],
  timezone: ['Time zone', 'Zona horaria', 'Fuso horário'],
  currency: ['Currency', 'Moneda', 'Moeda'],
  amountminor: ['Amount', 'Importe', 'Valor'],
  rateminor: ['Rate', 'Tarifa', 'Tarifa'],
  ratebasis: ['Rate basis', 'Base de la tarifa', 'Base da tarifa'],
  ruletype: ['Rule type', 'Tipo de regla', 'Tipo de regra'],
  hourlyrateminor: ['Hourly rate', 'Tarifa por hora', 'Tarifa por hora'],
  overtimerateminor: ['Overtime rate', 'Tarifa de horas extra', 'Tarifa de hora extra'],
  supplierprofile: ['Supplier profile', 'Perfil de proveedor', 'Perfil de fornecedor'],
  supplierid: ['Supplier', 'Proveedor', 'Fornecedor'],
  existingperson: ['Existing person', 'Persona existente', 'Pessoa existente'],
  mailboxupdated: ['Mailbox updated', 'Buzón actualizado', 'Caixa de e-mail atualizada'],
  revokedcount: ['Sessions signed out', 'Sesiones cerradas', 'Sessões encerradas'],
  startson: ['Starts on', 'Empieza el', 'Começa em'],
  endson: ['Ends on', 'Termina el', 'Termina em'],
  startdate: ['Start date', 'Fecha de inicio', 'Data de início'],
  enddate: ['End date', 'Fecha de fin', 'Data de término'],
  effectivefrom: ['Effective from', 'Vigente desde', 'Vigente desde'],
  effectiveto: ['Effective to', 'Vigente hasta', 'Vigente até'],
  workdate: ['Work date', 'Fecha del trabajo', 'Data do trabalho'],
  minutes: ['Minutes', 'Minutos', 'Minutos'],
  category: ['Category', 'Categoría', 'Categoria'],
  projectid: ['Project', 'Proyecto', 'Projeto'],
  clientid: ['Client', 'Cliente', 'Cliente'],
  workerid: ['Person', 'Persona', 'Pessoa'],
  userid: ['Person', 'Persona', 'Pessoa'],
  projectmanagerid: ['Project manager', 'Jefe de proyecto', 'Gerente de projeto'],
  operation: ['Operation', 'Operación', 'Operação'],
  billingmodel: ['Billing model', 'Modelo de facturación', 'Modelo de faturamento'],
  costcentercode: ['Cost center', 'Centro de coste', 'Centro de custo'],
  projectalias: ['Project alias', 'Alias del proyecto', 'Apelido do projeto'],
  paymenttermsdays: ['Payment terms (days)', 'Plazo de pago (días)', 'Prazo de pagamento (dias)'],
  canreview: ['Can review', 'Puede revisar', 'Pode revisar'],
  previouscanreview: ['Could review before', 'Podía revisar antes', 'Podia revisar antes'],
  sessionsrevoked: ['Signed out', 'Sesiones cerradas', 'Sessões encerradas'],
  version: ['Version', 'Versión', 'Versão'],
};

/**
 * T17: an integer "…Minor" amount next to a currency reads as money
 * ("$1,485.00"), never as raw minor units. Exact: integer strings only.
 */
function moneyText(
  key: string,
  value: unknown,
  currency: unknown,
  locale: PortalLocale,
): string | undefined {
  if (!/minor$/iu.test(key) || typeof currency !== 'string' || !/^[A-Z]{3}$/u.test(currency))
    return undefined;
  const raw = typeof value === 'bigint' ? value.toString() : typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string' || !/^-?\d{1,18}$/u.test(raw)) return undefined;
  try {
    return formatPortalMoney(BigInt(raw), locale, currency);
  } catch {
    return undefined;
  }
}

const BASIS: Record<string, Tuple> = {
  hourly: ['per hour', 'por hora', 'por hora'],
  daily: ['per day', 'por día', 'por dia'],
};

function fieldLabel(key: string, locale: PortalLocale): string {
  const known = FIELDS[key.replace(/[_\s-]/gu, '').toLocaleLowerCase()];
  if (known) return known[index(locale)];
  const words = key
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/[_.-]+/gu, ' ')
    .trim()
    .toLocaleLowerCase();
  return words ? words.charAt(0).toLocaleUpperCase() + words.slice(1) : key;
}

const MAX_VALUE = 240;

function valueText(value: unknown, locale: PortalLocale): string {
  if (value === null || value === undefined || value === '') return auditDetailText(locale, 'empty');
  if (typeof value === 'boolean') return auditDetailText(locale, value ? 'yes' : 'no');
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'string') {
    const text = value.replace(/\s+/gu, ' ').trim();
    // Record ids read as a short reference; the full id stays under "Technical details".
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(text))
      return `…${text.slice(-8)}`;
    return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
  }
  if (Array.isArray(value))
    return value.length === 0
      ? auditDetailText(locale, 'empty')
      : valueText(value.map((item) => valueText(item, locale)).join(', '), locale);
  try {
    return valueText(JSON.stringify(value), locale);
  } catch {
    return String(value);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Bounded, so a huge payload never floods the row. */
export const AUDIT_DETAIL_LIMIT = 30;

/**
 * Field lines for one event: changed fields (old → new) first, then the other
 * recorded values. Returns `kind: 'none'` for empty or unparseable details.
 */
export function auditDetailLines(
  detailsJson: unknown,
  locale: PortalLocale,
): { kind: 'changes' | 'values' | 'none'; lines: AuditDetailLine[]; hidden: number } {
  let parsed: unknown = detailsJson;
  if (typeof detailsJson === 'string') {
    try {
      parsed = JSON.parse(detailsJson);
    } catch {
      return { kind: 'none', lines: [], hidden: 0 };
    }
  }
  if (!isRecord(parsed)) return { kind: 'none', lines: [], hidden: 0 };
  const lines: AuditDetailLine[] = [];
  let kind: 'changes' | 'values' = 'values';
  const rest: Record<string, unknown> = { ...parsed };
  const currencyOf = (...scopes: unknown[]) => {
    for (const scope of scopes)
      if (isRecord(scope) && typeof scope.currency === 'string') return scope.currency;
    return undefined;
  };
  const show = (key: string, value: unknown, currency: unknown): string => {
    const money = moneyText(key, value, currency, locale);
    if (money) return money;
    if (/^ratebasis$/iu.test(key.replace(/[_\s-]/gu, '')) && typeof value === 'string' && BASIS[value])
      return BASIS[value]![index(locale)];
    return valueText(value, locale);
  };
  if (isRecord(parsed.before) || isRecord(parsed.after)) {
    kind = 'changes';
    const before = isRecord(parsed.before) ? parsed.before : {};
    const after = isRecord(parsed.after) ? parsed.after : {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (same(before[key], after[key])) continue;
      const currency = currencyOf(after, before, parsed);
      lines.push({
        label: fieldLabel(key, locale),
        before: show(key, before[key], currencyOf(before, after, parsed)),
        value: show(key, after[key], currency),
      });
    }
    delete rest.before;
    delete rest.after;
  }
  for (const [key, value] of Object.entries(rest)) {
    if (isRecord(value)) {
      for (const [inner, innerValue] of Object.entries(value))
        if (!isRecord(innerValue))
          lines.push({
            label: fieldLabel(inner, locale),
            value: show(inner, innerValue, currencyOf(value, parsed)),
          });
      continue;
    }
    lines.push({ label: fieldLabel(key, locale), value: show(key, value, currencyOf(parsed)) });
  }
  if (!lines.length) return { kind: 'none', lines: [], hidden: 0 };
  return {
    kind,
    lines: lines.slice(0, AUDIT_DETAIL_LIMIT),
    hidden: Math.max(0, lines.length - AUDIT_DETAIL_LIMIT),
  };
}
