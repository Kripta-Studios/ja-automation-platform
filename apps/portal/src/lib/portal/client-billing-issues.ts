/**
 * Billing-data checks shared by the project hub ("What needs you"), the client page
 * and the invoice screen (owner PDF review 2026-11-17, item 11). Pure and
 * browser-safe: callers pass the client / project fields they already read under
 * their own authorization; nothing here reads data.
 *
 * - Says exactly which client billing fields are missing (not just "Missing client
 *   details"). The required set matches the invoice screen: billing address,
 *   billing email and tax ID.
 * - Warns when the client billing email is on J&A's own domain (an invoice would be
 *   sent to ourselves).
 * - Warns when the project PO equals the project name (a name typed into the PO
 *   field, so the client cannot match the invoice to a purchase order).
 */

/** J&A's own mail domains: a client billing email here is almost always a mistake. */
export const OWN_EMAIL_DOMAINS: readonly string[] = ['j-aautomation.com'];

export type ClientBillingField = 'legalName' | 'billingAddress' | 'billingEmail' | 'taxId';

export type ClientBillingIssue =
  | { code: 'missing_fields'; fields: ClientBillingField[] }
  | { code: 'own_domain_email'; email: string }
  | { code: 'po_equals_project_name'; po: string };

type Fields = Readonly<Record<string, unknown>> | null | undefined;

const text = (row: Fields, ...keys: string[]): string => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
};

/** Case-, accent-, punctuation- and space-insensitive comparison key. */
const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, '');

export function isOwnDomainEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return OWN_EMAIL_DOMAINS.some((own) => domain === own || domain.endsWith(`.${own}`));
}

/**
 * Issues for one client, optionally in the context of one project. Accepts both the
 * DB row shape (snake_case: billing_address, billing_email, tax_id, legal_name,
 * po_number, name) and the camelCase shape used by the invoice screen.
 * `requireLegalName` is off by default because the invoice screen falls back to the
 * display name.
 */
export function clientBillingIssues(
  client: Fields,
  project?: Fields,
  options: Readonly<{ requireLegalName?: boolean }> = {},
): ClientBillingIssue[] {
  const issues: ClientBillingIssue[] = [];
  if (client) {
    const missing: ClientBillingField[] = [];
    if (options.requireLegalName && !text(client, 'legal_name', 'legalName'))
      missing.push('legalName');
    if (!text(client, 'billing_address', 'billingAddress')) missing.push('billingAddress');
    if (!text(client, 'billing_email', 'billingEmail')) missing.push('billingEmail');
    if (!text(client, 'tax_id', 'taxId')) missing.push('taxId');
    if (missing.length) issues.push({ code: 'missing_fields', fields: missing });
    const email = text(client, 'billing_email', 'billingEmail');
    if (email && isOwnDomainEmail(email)) issues.push({ code: 'own_domain_email', email });
  }
  if (project) {
    const po = text(project, 'po_number', 'poNumber');
    const name = text(project, 'name', 'projectName');
    if (po && name && fold(po) === fold(name)) issues.push({ code: 'po_equals_project_name', po });
  }
  return issues;
}

const copy = {
  en: {
    fields: {
      legalName: 'legal name',
      billingAddress: 'billing address',
      billingEmail: 'billing email',
      taxId: 'tax ID',
    },
    missing: 'Client details missing: {fields}',
    ownDomain: 'The client billing email {email} is a J&A address. Invoices would be sent to us.',
    poName: 'The PO number "{po}" is the project name. Enter the client’s purchase order number.',
    and: ' and ',
  },
  es: {
    fields: {
      legalName: 'razón social',
      billingAddress: 'dirección de facturación',
      billingEmail: 'email de facturación',
      taxId: 'NIF / ID fiscal',
    },
    missing: 'Faltan datos del cliente: {fields}',
    ownDomain:
      'El email de facturación del cliente {email} es de J&A. Las facturas nos llegarían a nosotros.',
    poName: 'El número de PO "{po}" es el nombre del proyecto. Pon el número de pedido del cliente.',
    and: ' y ',
  },
  pt: {
    fields: {
      legalName: 'razão social',
      billingAddress: 'endereço de faturamento',
      billingEmail: 'email de faturamento',
      taxId: 'ID fiscal',
    },
    missing: 'Faltam dados do cliente: {fields}',
    ownDomain:
      'O email de faturamento do cliente {email} é da J&A. As faturas chegariam para nós.',
    poName: 'O número de PO "{po}" é o nome do projeto. Informe o número do pedido do cliente.',
    and: ' e ',
  },
} as const;

function listText(items: string[], and: string): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')}${and}${items.at(-1)}`;
}

/** One plain sentence per issue, in en / es / pt (locale prefixes like "es-ES" work). */
export function clientBillingIssueText(locale: string | undefined, issue: ClientBillingIssue): string {
  const c = locale?.startsWith('es') ? copy.es : locale?.startsWith('pt') ? copy.pt : copy.en;
  if (issue.code === 'missing_fields')
    return c.missing.replace(
      '{fields}',
      listText(
        issue.fields.map((field) => c.fields[field]),
        c.and,
      ),
    );
  if (issue.code === 'own_domain_email') return c.ownDomain.replace('{email}', issue.email);
  return c.poName.replace('{po}', issue.po);
}
