import type { DatabaseSync } from 'node:sqlite';
import {
  divideDecimals,
  formatMinorPlain,
  impliedRate,
  isCurrency,
  money,
  parseRate,
  type Currency,
} from '@ja/money';
import { currentCurrencyConversion } from '../fx/currency-conversion.ts';

/**
 * Who and which PO stand behind an invoice line (owner decisions 2026-11-17):
 * - every labor line names the worker, so a client reading a multi-person invoice knows whose
 *   hours each line is;
 * - a PO can be set per assignment (person × project). When the assignments of a project carry
 *   POs, lines also show the PO, and an invoice whose people all share one assignment PO prints
 *   that PO (the project/stream PO stays the fallback).
 * Only new drafts use this; issued invoices keep the lines and PO frozen in their snapshot.
 */

/** Presentation name: "gabriel.lamoglia" → "Gabriel Lamoglia"; real names unchanged. */
export function invoicePersonName(name: unknown): string {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (!raw) return '';
  const local = raw.includes('@') && !/\s/u.test(raw) ? raw.split('@')[0]! : raw;
  if (/\s/u.test(local)) return local;
  if (!/^[\p{L}\p{N}]+(?:[._-][\p{L}\p{N}]+)*$/u.test(local)) return local;
  if (local !== local.toLocaleLowerCase() && !/[._]/u.test(local)) return local;
  const parts = local.split(/[._-]+/u).filter((part) => part && !/^\d+$/u.test(part));
  return parts.length
    ? parts.map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1).toLocaleLowerCase()).join(' ')
    : local;
}

/**
 * Imported/legacy expenses carry placeholder vendors such as "None" or "N/A" (audit T11): they
 * are blank, so the line falls back to the expense description instead of printing "None".
 */
const PLACEHOLDER_TEXT = new Set(['none', 'null', 'n/a', 'na', '-', '—', 'undefined', 'not provided']);
export function meaningfulText(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return PLACEHOLDER_TEXT.has(text.toLocaleLowerCase()) ? '' : text;
}

/** Client-facing names of the canonical expense categories (printed on invoice lines). */
const EXPENSE_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  hotel: 'Hotel',
  accommodation: 'Accommodation',
  rental_car: 'Rental car',
  fuel: 'Fuel',
  tolls: 'Tolls',
  parking: 'Parking',
  airfare: 'Airfare',
  ground_transport: 'Ground transport',
  meals: 'Meals',
  per_diem: 'Per diem',
  materials: 'Project materials',
  project_materials: 'Project materials',
  tools: 'Tools / consumables',
  shipping: 'Shipping',
  phone_data: 'Phone / data',
  visa_permit: 'Visa / permit',
  other: 'Other',
};

/** "ground_transport" → "Ground transport"; unknown codes are humanized, never printed raw. */
export function expenseCategoryLabel(category: unknown): string {
  const code = typeof category === 'string' ? category.trim() : '';
  if (!code) return '';
  const known = EXPENSE_CATEGORY_LABELS[code] ?? EXPENSE_CATEGORY_LABELS[code.toLowerCase()];
  if (known) return known;
  const words = code.replace(/[_-]+/gu, ' ').trim();
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

/** "125050" MXN → "1,250.50"; JPY "1500" → "1,500". */
function groupedMinor(minor: bigint | number | string, currency: string): string {
  const [whole, fraction] = formatMinorPlain(minor, currency).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Display form of an exact rate: 5 decimals below 1 ("0.05390"), else 4 ("18.5534"). */
function displayRate(rate: string): string | null {
  const parsed = parseRate(rate);
  if (!parsed) return null;
  const digits = parsed.units < 10n ** BigInt(parsed.scale) ? 5 : 4;
  const rounded = divideDecimals(parsed, { units: 1n, scale: 0 }, digits);
  const scale = 10n ** BigInt(rounded.scale);
  const whole = rounded.units / scale;
  const fraction = rounded.scale ? (rounded.units % scale).toString().padStart(rounded.scale, '0') : '';
  return `${whole}.${fraction.padEnd(digits, '0')}`;
}

const hasPoColumn = (sqlite: DatabaseSync): boolean =>
  Boolean(sqlite.prepare("SELECT 1 FROM pragma_table_info('project_member') WHERE name='po_number'").get());

export class InvoiceLineLabels {
  private readonly names = new Map<string, string>();
  private readonly pos = new Map<string, string | null>();
  readonly assignmentPos: boolean;
  private readonly poColumn: boolean;

  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly projectId: string,
  ) {
    this.poColumn = hasPoColumn(sqlite);
    this.assignmentPos =
      this.poColumn &&
      Boolean(
        sqlite
          .prepare('SELECT 1 FROM project_member WHERE project_id=? AND po_number IS NOT NULL LIMIT 1')
          .get(projectId),
      );
  }

  name(workerId: string): string {
    let name = this.names.get(workerId);
    if (name === undefined) {
      const row = this.sqlite.prepare('SELECT name FROM user WHERE id=?').get(workerId) as
        | { name: string | null }
        | undefined;
      name = invoicePersonName(row?.name);
      this.names.set(workerId, name);
    }
    return name;
  }

  /** The PO of the person's assignment covering `date` (active assignments first). */
  po(workerId: string, date: string): string | null {
    if (!this.assignmentPos) return null;
    const key = `${workerId}:${date}`;
    if (!this.pos.has(key)) {
      const row = this.sqlite
        .prepare(
          `SELECT po_number FROM project_member WHERE project_id=? AND user_id=?
              AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)
            ORDER BY (status='active') DESC,starts_on DESC,id LIMIT 1`,
        )
        .get(this.projectId, workerId, date, date) as { po_number: string | null } | undefined;
      this.pos.set(key, row?.po_number ?? null);
    }
    return this.pos.get(key) ?? null;
  }

  /** "2026-11-02 · Maico Lubawski · PO 1722812 · regular · Commissioning" */
  laborDescription(input: {
    workerId: string;
    workDate: string;
    category: string;
    summary: string | null | undefined;
  }): string {
    const po = this.po(input.workerId, input.workDate);
    return [
      input.workDate,
      this.name(input.workerId) || null,
      po ? `PO ${po}` : null,
      input.category,
      input.summary?.trim() || null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
  }

  /**
   * "2026-11-04 · Taxi · Ground transport · MXN 1,250.50 @ 0.05390": what was bought, the
   * category in words (never the stored code) and, for an expense recorded in another currency,
   * the original amount and the exact conversion rate behind the billed amount.
   */
  expenseDescription(
    input: {
      id: string;
      spent_on: string;
      vendor: string | null;
      description: string | null;
      category: string;
      currency: string;
      amount_minor: number | bigint | string;
      project_currency_amount_minor: number | bigint | string | null;
    },
    invoiceCurrency: string,
  ): string {
    const what = meaningfulText(input.vendor) || meaningfulText(input.description);
    const category = expenseCategoryLabel(input.category);
    let original: string | null = null;
    if (input.currency !== invoiceCurrency) {
      const conversion = currentCurrencyConversion(this.sqlite, 'expense', input.id, invoiceCurrency);
      let rate =
        conversion && conversion.sourceAmountMinor === String(input.amount_minor) ? conversion.rate : null;
      if (
        !rate &&
        input.project_currency_amount_minor !== null &&
        isCurrency(input.currency) &&
        isCurrency(invoiceCurrency) &&
        BigInt(input.amount_minor) > 0n
      )
        try {
          rate = impliedRate(
            money(input.currency as Currency, BigInt(input.amount_minor)),
            money(invoiceCurrency as Currency, BigInt(input.project_currency_amount_minor)),
          );
        } catch {
          rate = null;
        }
      const shown = rate ? displayRate(rate) : null;
      original = `${input.currency} ${groupedMinor(input.amount_minor, input.currency)}${shown ? ` @ ${shown}` : ''}`;
    }
    return [input.spent_on, what && what !== category ? what : null, category || null, original]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
  }

  /**
   * One PO shared by every person on the invoice (from their assignments), else null and the
   * project/stream PO applies. Lines without a person (fees) do not change the answer.
   */
  sharedPurchaseOrder(invoiceId: string): string | null {
    if (!this.assignmentPos) return null;
    const people = this.sqlite
      .prepare(
        `SELECT DISTINCT t.worker_id workerId,t.work_date workDate FROM invoice_line l
           JOIN time_entry t ON t.id=l.source_id WHERE l.invoice_id=? AND l.source_type='time'
         UNION
         SELECT DISTINCT e.worker_id workerId,e.spent_on workDate FROM invoice_line l
           JOIN expense e ON e.id=l.source_id WHERE l.invoice_id=? AND l.source_type='expense'`,
      )
      .all(invoiceId, invoiceId) as Array<{ workerId: string | null; workDate: string }>;
    if (!people.length) return null;
    const found = new Set(people.map((row) => (row.workerId ? this.po(row.workerId, row.workDate) : null)));
    if (found.size !== 1) return null;
    return [...found][0] ?? null;
  }
}
