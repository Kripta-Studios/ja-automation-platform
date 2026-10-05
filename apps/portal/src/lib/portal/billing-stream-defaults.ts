import type { PortalRow } from './portal-data';

function text(row: PortalRow | undefined, ...keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '') return String(value);
  }
  return '';
}

function flagged(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

/** Defaults from the selected project's authorized projection, never another stream. */
export function billingStreamDefaults(project: PortalRow | undefined, contacts: PortalRow[]) {
  const clientId = text(project, 'client_id', 'clientId');
  const billingContacts = clientId
    ? contacts.filter(
        (contact) =>
          text(contact, 'client_id', 'clientId') === clientId &&
          flagged(contact.is_billing_contact ?? contact.isBillingContact),
      )
    : [];
  const primaryContacts = billingContacts.filter((contact) =>
    flagged(contact.is_primary ?? contact.isPrimary),
  );
  const contact =
    primaryContacts.length === 1
      ? primaryContacts[0]
      : billingContacts.length === 1
        ? billingContacts[0]
        : undefined;
  const terms = text(project, 'client_payment_terms_days');
  const validTerms = /^\d+$/.test(terms) && Number(terms) <= 365;
  return {
    currency: text(project, 'currency'),
    poNumber: text(project, 'po_number', 'poNumber') || text(project, 'client_po_reference'),
    paymentTermsDays: validTerms ? terms : '30',
    hasClientPaymentTerms: validTerms,
    recipientEmail: text(project, 'client_billing_email') || text(contact, 'email'),
    billingContactId: text(contact, 'id'),
  };
}
