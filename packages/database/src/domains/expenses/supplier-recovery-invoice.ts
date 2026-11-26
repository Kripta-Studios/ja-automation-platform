import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { ValidationError } from '../../repository.ts';

/**
 * Owner request 2026-11-26 (follows D4): what J&A paid for a supplier's technician and could
 * not deduct from the supplier's settlement is "still to recover from the supplier". Owner or
 * Finance invoice it to the supplier: an ordinary invoice (draft → approve → issue, CP
 * numbering, PDF, payments) on a client record that stands for the supplier, one line per
 * expense. Each expense is on at most one live invoice and never both invoiced and deducted
 * (enforced by migration 0098 triggers as well). A void invoice releases its expenses.
 */
export const SUPPLIER_RECOVERY_STREAM = 'supplier_recharge';
export const SUPPLIER_RECOVERY_SOURCE = 'supplier_recharge';

const tableCache = new WeakMap<DatabaseSync, boolean>();

/** True once migration 0098 is applied (older schemas: nothing can be invoiced to a supplier). */
export function hasSupplierRecovery(sqlite: DatabaseSync): boolean {
  const cached = tableCache.get(sqlite);
  if (cached !== undefined) return cached;
  const present = Boolean(
    sqlite
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='supplier_expense_recovery'",
      )
      .get(),
  );
  // Cache only a positive answer: a schema being upgraded gains the table later.
  if (present) tableCache.set(sqlite, true);
  return present;
}

/** Invoice states in which an expense put on it is still "invoiced to the supplier". */
export const LIVE_RECOVERY_INVOICE_SQL = "i.state NOT IN ('void','cancelled','superseded')";

/**
 * SQL for the live recovery invoice of expense `alias.id` (one row at most), or a query that
 * yields nothing on an older schema. Columns: invoice_id, invoice_number, invoice_state.
 */
export function liveRecoveryJoinSql(sqlite: DatabaseSync, alias = 'e'): string {
  if (!hasSupplierRecovery(sqlite))
    return `LEFT JOIN (SELECT NULL expense_id,NULL invoice_id,NULL invoice_number,NULL invoice_state WHERE 0) rec ON rec.expense_id=${alias}.id`;
  return `LEFT JOIN (
      SELECT r.expense_id,r.invoice_id,i.invoice_number,i.state invoice_state
        FROM supplier_expense_recovery r JOIN invoice i ON i.id=r.invoice_id
       WHERE ${LIVE_RECOVERY_INVOICE_SQL}
    ) rec ON rec.expense_id=${alias}.id`;
}

export type SupplierBillingInput = Readonly<{
  legalName: string;
  billingAddress: string;
  billingEmail?: string;
  taxId?: string;
  /** Short code for invoice numbers (CP-<code>-001); blank uses the client number. */
  clientCode?: string;
}>;

export type SupplierBillingAccount = Readonly<{
  supplierId: string;
  clientId: string;
  clientNumber: string;
  clientCode: string | null;
  legalName: string;
  billingAddress: string | null;
  billingEmail: string | null;
}>;

/** The client record J&A invoices this supplier through, or null when not set up yet. */
export function supplierBillingAccount(
  sqlite: DatabaseSync,
  supplierId: string,
): SupplierBillingAccount | null {
  if (!hasSupplierRecovery(sqlite)) return null;
  const row = sqlite
    .prepare(
      `SELECT a.supplier_id,c.id client_id,c.client_number,c.client_code,c.legal_name,
              c.billing_address,c.billing_email
         FROM supplier_billing_account a JOIN client c ON c.id=a.client_id
        WHERE a.supplier_id=?`,
    )
    .get(supplierId) as
    | {
        supplier_id: string;
        client_id: string;
        client_number: string;
        client_code: string | null;
        legal_name: string;
        billing_address: string | null;
        billing_email: string | null;
      }
    | undefined;
  return row
    ? {
        supplierId: row.supplier_id,
        clientId: row.client_id,
        clientNumber: row.client_number,
        clientCode: row.client_code,
        legalName: row.legal_name,
        billingAddress: row.billing_address,
        billingEmail: row.billing_email,
      }
    : null;
}

/** Defaults for the "billing details" form, from the supplier directory entry. */
export function supplierBillingDefaults(
  sqlite: DatabaseSync,
  supplierId: string,
): { legalName: string; billingAddress: string; billingEmail: string } | null {
  const row = sqlite.prepare('SELECT * FROM supplier WHERE id=?').get(supplierId) as
    | { name: string; address?: string | null; contact_email?: string | null }
    | undefined;
  if (!row) return null;
  return {
    legalName: row.name,
    billingAddress: row.address ?? '',
    billingEmail: row.contact_email ?? '',
  };
}

/** Normalized, validated billing details (plain messages; the form shows them as they are). */
export function normalizeSupplierBilling(
  input: SupplierBillingInput,
): Required<SupplierBillingInput> {
  const legalName = String(input.legalName ?? '').trim();
  const billingAddress = String(input.billingAddress ?? '').trim();
  const billingEmail = String(input.billingEmail ?? '')
    .trim()
    .toLowerCase();
  const taxId = String(input.taxId ?? '').trim();
  const clientCode = String(input.clientCode ?? '').trim();
  if (legalName.length < 2 || legalName.length > 300)
    throw new ValidationError('Enter the supplier’s company name');
  if (billingAddress.length < 5 || billingAddress.length > 2000)
    throw new ValidationError('Enter the supplier’s billing address');
  if (billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(billingEmail))
    throw new ValidationError('The billing email is not valid');
  if (taxId.length > 64) throw new ValidationError('The tax ID is too long');
  if (clientCode && !/^[A-Za-z0-9-]{1,20}$/u.test(clientCode))
    throw new ValidationError('The invoice code may use letters, digits and dashes (max. 20)');
  return { legalName, billingAddress, billingEmail, taxId, clientCode: clientCode.toUpperCase() };
}

export type RecoveryExpense = Readonly<{
  expenseId: string;
  version: number;
  projectId: string;
  projectNumber: string;
  workerId: string;
  workerName: string;
  spentOn: string;
  category: string;
  vendor: string | null;
  description: string | null;
  currency: string;
  amountMinor: bigint;
}>;

/**
 * The expenses that may be put on an invoice to this supplier, re-read from the database
 * (never from the browser): approved, of one of the supplier's technicians, paid by J&A and
 * carried by the supplier on the expense day, with an exact amount in the project currency,
 * not deducted from a settlement and not on a live invoice to the supplier.
 */
export function recoverableSupplierExpenses(
  sqlite: DatabaseSync,
  supplierId: string,
  expenseIds: readonly string[],
  carries: (expense: {
    projectId: string;
    workerId: string;
    spentOn: string;
    whoPaid: string;
  }) => boolean,
): RecoveryExpense[] {
  const ids = [...new Set(expenseIds)].slice(0, 500);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = sqlite
    .prepare(
      `SELECT e.id,e.version,e.project_id,p.project_number,e.worker_id,u.name worker_name,u.email worker_email,
              e.spent_on,e.category,e.vendor,e.description,e.who_paid,e.currency source_currency,
              p.currency,CAST(e.amount_minor AS TEXT) amount_minor,
              CAST(e.project_currency_amount_minor AS TEXT) project_amount_minor
         FROM expense e JOIN project p ON p.id=e.project_id JOIN user u ON u.id=e.worker_id
         JOIN supplier_user_profile sup ON sup.user_id=e.worker_id AND sup.supplier_id=?
        WHERE e.id IN (${placeholders})
          AND e.approval_state IN ('approved','locked')
          AND NOT EXISTS (SELECT 1 FROM supplier_expense_recharge d WHERE d.expense_id=e.id)
          AND NOT EXISTS (SELECT 1 FROM supplier_expense_recovery r JOIN invoice i ON i.id=r.invoice_id
                           WHERE r.expense_id=e.id AND ${LIVE_RECOVERY_INVOICE_SQL})
          AND NOT EXISTS (
            SELECT 1 FROM record_correction_link rcl
            JOIN expense correction ON correction.id=rcl.correction_id
            WHERE rcl.record_type='expense'
              AND ((rcl.original_id=e.id AND correction.approval_state='approved')
                OR (rcl.correction_id=e.id AND correction.approval_state<>'approved'))
          )
        ORDER BY e.project_id,e.spent_on,e.id`,
    )
    .all(supplierId, ...ids) as Array<{
    id: string;
    version: number;
    project_id: string;
    project_number: string;
    worker_id: string;
    worker_name: string;
    worker_email: string | null;
    spent_on: string;
    category: string;
    vendor: string | null;
    description: string | null;
    who_paid: string;
    source_currency: string;
    currency: string;
    amount_minor: string;
    project_amount_minor: string | null;
  }>;
  const result: RecoveryExpense[] = [];
  for (const row of rows) {
    if (
      !carries({
        projectId: row.project_id,
        workerId: row.worker_id,
        spentOn: row.spent_on,
        whoPaid: row.who_paid,
      })
    )
      continue;
    const amount =
      row.source_currency === row.currency ? row.amount_minor : row.project_amount_minor;
    if (amount === null || !/^\d+$/u.test(amount) || BigInt(amount) <= 0n) continue;
    result.push({
      expenseId: row.id,
      version: Number(row.version),
      projectId: row.project_id,
      projectNumber: row.project_number,
      workerId: row.worker_id,
      workerName: row.worker_name,
      spentOn: row.spent_on,
      category: row.category,
      vendor: row.vendor,
      description: row.description,
      currency: row.currency,
      amountMinor: BigInt(amount),
    });
  }
  return result;
}

const CATEGORY_WORDS: Record<string, string> = {
  hotel: 'Hotel',
  lodging: 'Lodging',
  airfare: 'Flight',
  flight: 'Flight',
  ground_transport: 'Ground transport',
  car_rental: 'Car rental',
  fuel: 'Fuel',
  mileage: 'Mileage',
  meals: 'Meals',
  per_diem: 'Per diem',
  tools: 'Tools',
  materials: 'Materials',
  parking: 'Parking',
  tolls: 'Tolls',
  other: 'Other',
};

/** One plain invoice line per expense: day, technician, what, where it was bought. */
export function recoveryLineDescription(expense: RecoveryExpense, technician: string): string {
  const what =
    CATEGORY_WORDS[expense.category] ??
    expense.category.replace(/_/gu, ' ').replace(/^\w/u, (c) => c.toUpperCase());
  const vendor = expense.vendor?.trim();
  return [
    `${expense.spentOn} · ${technician} · ${what}${vendor ? ` (${vendor})` : ''}`,
    `Expense paid by J&A for your technician on project ${expense.projectNumber}`,
  ]
    .join(' — ')
    .slice(0, 500);
}

export type RecoveryInvoiceResult = Readonly<{
  id: string;
  projectId: string;
  currency: string;
  totalMinor: string;
  expenseCount: number;
}>;

export type SupplierRecoveryPrincipal = Principal;

const BILLING_DETAILS_REQUIRED = 'SUPPLIER_BILLING_DETAILS_REQUIRED';

/** Raised when the supplier has no billing details yet; the page then asks for them. */
export function supplierBillingDetailsRequired(): ValidationError {
  return Object.assign(
    new ValidationError('Enter the supplier’s billing details first (name and address).'),
    { code: BILLING_DETAILS_REQUIRED },
  );
}

export function isSupplierBillingDetailsRequired(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === BILLING_DETAILS_REQUIRED
  );
}
