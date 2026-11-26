import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal } from '@ja/domain';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { currentInvoiceVersion, invoiceVersions } from './invoice-current-version.ts';
import { invoiceNumberUsed } from './invoice-number-format.ts';
import { purchaseReferenceOrNull } from './issuer-document-settings.ts';

type Row = Record<string, unknown>;
type ErrorConstructor = new (message: string) => Error;
export type InvoiceRevisionErrors = {
  access: ErrorConstructor;
  conflict: ErrorConstructor;
  validation: ErrorConstructor;
};

/**
 * Correct an ISSUED invoice (owner decision 2026-11-25): same invoice number, new version.
 * The owner clicks a value on the issued invoice; saving adds version 2 (3, ...) with the
 * previous version's document as the starting point. The issued row, its PDF, sources and
 * hash stay exactly as they were (version 1); every version is kept and downloadable. Totals,
 * balance and payments follow the current version. No credit note is created.
 */
export const REVISION_TEXT_FIELDS = {
  client: { path: ['client', 'legalName'], max: 300, required: true },
  clientAddress: { path: ['client', 'billingAddress'], max: 2000, required: false },
  projectName: { path: ['project', 'name'], max: 300, required: true },
  costCenter: { path: ['project', 'costCenterCode'], max: 120, required: false },
  purchaseNo: { path: ['purchaseNo'], max: 200, required: false },
  pastDueNotice: { path: ['termsAndInstructions', 'pastDueNotice'], max: 2000, required: false },
  bankSwiftNumber: { path: ['termsAndInstructions', 'bankSwiftNumber'], max: 200, required: false },
  bankAccountNumber: { path: ['termsAndInstructions', 'bankAccountNumber'], max: 200, required: false },
  bankName: { path: ['termsAndInstructions', 'bankName'], max: 200, required: false },
  beneficiary: { path: ['termsAndInstructions', 'beneficiary'], max: 300, required: false },
  bankAchRouting: { path: ['termsAndInstructions', 'bankAchRouting'], max: 200, required: false },
  bankWireRouting: { path: ['termsAndInstructions', 'bankWireRouting'], max: 200, required: false },
  bankSwiftEur: { path: ['termsAndInstructions', 'bankSwiftEur'], max: 200, required: false },
} as const;
export type RevisionTextField = keyof typeof REVISION_TEXT_FIELDS;
export const REVISION_FIELDS = [
  ...Object.keys(REVISION_TEXT_FIELDS),
  'invoiceDate',
  'dueDate',
  'paymentTermsDays',
  'invoiceNumber',
  'line',
] as const;
export type RevisionField = (typeof REVISION_FIELDS)[number];

export type InvoiceRevisionInput = Readonly<{
  /** The version the owner was looking at (1 = the issued invoice). */
  expectedRevision: number;
  field: RevisionField;
  value?: string;
  /** Line edits: the line id on the shown version. */
  lineId?: string;
  description?: string;
  /** New quantity as shown on the invoice (hours for an hours line), e.g. "7.5". */
  quantity?: string;
  unitPriceMinor?: bigint;
  amountMinor?: bigint;
  reason?: string;
}>;

const INVOICE_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/u;
const COLLECTIBLE = ['issued', 'sent', 'partially_paid', 'paid', 'overdue'];

const object = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};

const minor = (value: unknown): bigint | null => {
  const text = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  return /^-?\d+$/u.test(text) ? BigInt(text) : null;
};

/** Half away from zero, exact. */
export function divideRoundHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function setPath(target: Row, path: readonly string[], value: unknown): void {
  let cursor = target;
  for (const key of path.slice(0, -1)) {
    cursor[key] = { ...object(cursor[key]) };
    cursor = cursor[key] as Row;
  }
  cursor[path[path.length - 1]!] = value;
}

function getPath(target: Row, path: readonly string[]): unknown {
  let cursor: unknown = target;
  for (const key of path) cursor = object(cursor)[key];
  return cursor;
}

function netCollected(sqlite: DatabaseSync, invoiceId: string): bigint {
  const payments = BigInt(
    String(
      (
        sqlite
          .prepare('SELECT CAST(COALESCE(SUM(amount_minor),0) AS TEXT) n FROM payment WHERE invoice_id=?')
          .get(invoiceId) as { n: string }
      ).n,
    ),
  );
  const reversals = BigInt(
    String(
      (
        sqlite
          .prepare(
            'SELECT CAST(COALESCE(SUM(amount_minor),0) AS TEXT) n FROM invoice_payment_reversal_event WHERE invoice_id=?',
          )
          .get(invoiceId) as { n: string }
      ).n,
    ),
  );
  return payments - reversals;
}

/** Lifecycle state after a correction, from the current version's total and due date. */
export function correctedInvoiceState(
  total: bigint,
  collected: bigint,
  dueDate: string | null,
  sent: boolean,
  today = new Date().toISOString().slice(0, 10),
): string {
  const overdue = Boolean(dueDate) && String(dueDate).slice(0, 10) < today;
  if (total > 0n && collected >= total) return 'paid';
  if (collected > 0n) return overdue ? 'overdue' : 'partially_paid';
  return overdue ? 'overdue' : sent ? 'sent' : 'issued';
}

type LineChange = { before: Row; after: Row; deltaNet: bigint; deltaTax: bigint };

function correctLine(
  line: Row,
  input: InvoiceRevisionInput,
  errors: InvoiceRevisionErrors,
  invoiceTaxIsZero: boolean,
): LineChange | null {
  const after: Row = { ...line };
  const description = input.description?.trim();
  if (description !== undefined && description !== String(line.description ?? '').trim()) {
    if (!description) throw new errors.validation('The line description cannot be empty.');
    if (description.length > 500) throw new errors.validation('Use at most 500 characters.');
    after.description = description;
  }
  const oldNet = minor(line.subtotal_minor ?? line.net_amount_minor) ?? 0n;
  let newNet = oldNet;
  const numerator = Number(line.quantity_numerator);
  const denominator = Number(line.quantity_denominator ?? 1);
  const priced =
    Number.isSafeInteger(numerator) &&
    Number.isSafeInteger(denominator) &&
    denominator > 0 &&
    minor(line.unit_price_minor) !== null;
  if (input.quantity !== undefined || input.unitPriceMinor !== undefined) {
    if (!priced) throw new errors.validation('Change the amount of this line instead.');
    let quantity = numerator;
    if (input.quantity !== undefined) {
      const match = /^(\d{1,9})(?:[.,](\d{1,4}))?$/u.exec(input.quantity.trim());
      if (!match) throw new errors.validation('Enter a quantity, for example 7.5.');
      const scale = 10n ** BigInt(match[2]?.length ?? 0);
      const units = BigInt(`${match[1]}${match[2] ?? ''}`);
      quantity = Number(divideRoundHalfAway(units * BigInt(denominator), scale));
    }
    const price = input.unitPriceMinor ?? (minor(line.unit_price_minor) as bigint);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 100_000_000)
      throw new errors.validation('Enter a quantity, for example 7.5.');
    if (price < 0n || price > 10n ** 13n) throw new errors.validation('Enter a rate, for example 85.00.');
    after.quantity_numerator = quantity;
    after.unit_price_minor = price.toString();
    newNet = divideRoundHalfAway(BigInt(quantity) * price, BigInt(denominator));
  } else if (input.amountMinor !== undefined) {
    if (input.amountMinor < -(10n ** 13n) || input.amountMinor > 10n ** 13n)
      throw new errors.validation('Enter an amount, for example 1200.00.');
    newNet = input.amountMinor;
    if (priced && numerator === denominator) after.unit_price_minor = newNet.toString();
  }
  const oldTax = minor(line.tax_amount_minor ?? line.tax_minor) ?? 0n;
  let newTax = oldTax;
  if (newNet !== oldNet) {
    const bps = Number(line.tax_bps);
    newTax = Number.isSafeInteger(bps)
      ? divideRoundHalfAway(newNet * BigInt(bps), 10_000n)
      : invoiceTaxIsZero || oldNet === 0n
        ? 0n
        : divideRoundHalfAway(oldTax * newNet, oldNet);
    after.subtotal_minor = newNet.toString();
    if (line.net_amount_minor != null) after.net_amount_minor = newNet.toString();
    if (line.tax_minor != null) after.tax_minor = newTax.toString();
    if (line.tax_amount_minor != null) after.tax_amount_minor = newTax.toString();
    if (line.gross_amount_minor != null) after.gross_amount_minor = (newNet + newTax).toString();
    if (line.unit_amount_minor != null && priced) after.unit_amount_minor = after.unit_price_minor;
  }
  if (JSON.stringify(after) === JSON.stringify(line)) return null;
  return { before: line, after, deltaNet: newNet - oldNet, deltaTax: newTax - oldTax };
}

export function correctIssuedInvoice(
  sqlite: DatabaseSync,
  principal: Principal,
  invoiceId: string,
  input: InvoiceRevisionInput,
  errors: InvoiceRevisionErrors,
) {
  assertActiveAccount(sqlite, principal, errors.access);
  assertLiveSession(sqlite, principal, errors.access);
  if (principal.role !== 'owner_admin') throw new errors.access('Owner role required');
  if (!(REVISION_FIELDS as readonly string[]).includes(input.field))
    throw new errors.validation('This part of the invoice cannot be corrected here.');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)
    throw new errors.validation('Reload the invoice and try again.');
  const reason = input.reason?.trim().slice(0, 1000) || null;
  return runImmediateTransaction(sqlite, 'invoice-revision', () => {
    const role = (sqlite.prepare('SELECT role FROM user WHERE id=?').get(principal.userId) as
      | { role: string }
      | undefined)?.role;
    if (role !== 'owner_admin') throw new errors.access('Owner role required');
    const invoice = sqlite
      .prepare('SELECT id,project_id,state,sent_at,voided_at,invoice_number FROM invoice WHERE id=?')
      .get(invoiceId) as Row | undefined;
    if (!invoice) throw new errors.validation('Invoice not found');
    if (!COLLECTIBLE.includes(String(invoice.state)) || invoice.voided_at)
      throw new errors.conflict('Only an issued invoice that is not void or credited can be corrected.');
    const current = currentInvoiceVersion(sqlite, invoiceId);
    if (!current) throw new errors.conflict('Only an issued invoice can be corrected.');
    if (current.revisionNumber !== input.expectedRevision)
      throw new errors.conflict(
        `This invoice is now at version ${current.revisionNumber}. Refresh the page before saving again.`,
      );
    const before = JSON.parse(current.snapshotJson) as Row;
    if (before.documentType === 'credit_note')
      throw new errors.conflict('A credit note cannot be corrected here.');
    const after: Row = structuredClone(before);
    const changes: Row[] = [];
    let invoiceNumber = current.invoiceNumber;
    let deltaNet = 0n;
    let deltaTax = 0n;
    const value = String(input.value ?? '').trim();
    if (input.field in REVISION_TEXT_FIELDS) {
      const spec = REVISION_TEXT_FIELDS[input.field as RevisionTextField];
      if (value.length > spec.max) throw new errors.validation(`Use at most ${spec.max} characters.`);
      if (spec.required && !value) throw new errors.validation('This field cannot be empty.');
      const previous = getPath(before, spec.path);
      if (String(previous ?? '') !== value) {
        setPath(after, spec.path, value || null);
        changes.push({ field: input.field, before: previous ?? null, after: value || null });
      }
    } else if (input.field === 'invoiceDate') {
      if (!validDate(value)) throw new errors.validation('Enter a date such as 2026-11-25.');
      if (String(before.invoiceDate ?? before.issueDate ?? '').slice(0, 10) !== value) {
        after.invoiceDate = value;
        after.issueDate = value;
        changes.push({ field: 'invoiceDate', before: before.invoiceDate ?? before.issueDate ?? null, after: value });
      }
    } else if (input.field === 'dueDate') {
      if (!validDate(value)) throw new errors.validation('Enter a date such as 2026-12-25.');
      const invoiceDate = String(after.invoiceDate ?? after.issueDate ?? '').slice(0, 10);
      if (invoiceDate && value < invoiceDate)
        throw new errors.validation('The due date cannot be before the invoice date.');
      if (String(before.dueAt ?? '').slice(0, 10) !== value) {
        after.dueAt = `${value}T00:00:00.000Z`;
        after.dueDateOverride = value;
        changes.push({ field: 'dueDate', before: before.dueAt ?? null, after: after.dueAt });
      }
    } else if (input.field === 'paymentTermsDays') {
      const days = Number(value);
      if (!/^\d{1,3}$/u.test(value) || days > 365)
        throw new errors.validation('Enter payment terms from 0 to 365 days.');
      if (Number(before.paymentTermsDays ?? object(before.commercial).paymentTermsDays) !== days) {
        after.paymentTermsDays = days;
        after.commercial = { ...object(before.commercial), paymentTermsDays: days };
        changes.push({
          field: 'paymentTermsDays',
          before: before.paymentTermsDays ?? object(before.commercial).paymentTermsDays ?? null,
          after: days,
        });
      }
    } else if (input.field === 'invoiceNumber') {
      if (!INVOICE_NUMBER_PATTERN.test(value))
        throw new errors.validation(
          'Use letters, digits, dots, dashes or slashes (at most 120 characters).',
        );
      if (value !== current.invoiceNumber) {
        if (invoiceNumberUsed(sqlite, value))
          throw new errors.conflict(
            `${value} is already used by an invoice or an earlier version. Numbers are never reused.`,
          );
        invoiceNumber = value;
        after.number = value;
        after.invoiceNumber = value;
        changes.push({ field: 'invoiceNumber', before: current.invoiceNumber, after: value });
      }
    } else if (input.field === 'line') {
      const lines = Array.isArray(before.lines) ? (before.lines as Row[]) : [];
      const index = lines.findIndex((line) => String(line.id ?? '') === String(input.lineId ?? ''));
      if (index < 0) throw new errors.validation('This invoice line is not on the current version.');
      const change = correctLine(lines[index]!, input, errors, current.taxMinor === 0n);
      if (change) {
        after.lines = lines.map((line, position) => (position === index ? change.after : line));
        deltaNet = change.deltaNet;
        deltaTax = change.deltaTax;
        changes.push({
          field: 'line',
          lineId: input.lineId,
          before: {
            description: change.before.description ?? null,
            quantityNumerator: change.before.quantity_numerator ?? null,
            unitPriceMinor: change.before.unit_price_minor ?? null,
            subtotalMinor: change.before.subtotal_minor ?? null,
          },
          after: {
            description: change.after.description ?? null,
            quantityNumerator: change.after.quantity_numerator ?? null,
            unitPriceMinor: change.after.unit_price_minor ?? null,
            subtotalMinor: change.after.subtotal_minor ?? null,
          },
        });
      }
    }
    if (!changes.length) throw new errors.validation('Nothing changed. The invoice was not saved again.');
    // Audit T11: a new version never prints a project name or number as the purchase order
    // (the composer shows "No PO number" for it). Earlier versions keep what they printed.
    const identity = {
      name: object(after.project).name,
      number: object(after.project).number,
      alias: object(before.project).name,
    };
    for (const path of [['purchaseNo'], ['project', 'poNumber']] as const) {
      const shown = getPath(after, path);
      if (typeof shown !== 'string' || !shown.trim() || shown.trim() === '—') continue;
      if (purchaseReferenceOrNull(shown, identity)) continue;
      setPath(after, path, null);
      if (path[0] !== 'purchaseNo') continue;
      const typed = changes.find((change) => change.field === 'purchaseNo');
      if (typed) typed.after = null;
      else changes.push({ field: 'purchaseNo', before: shown, after: null });
    }
    const subtotal = current.subtotalMinor + deltaNet;
    const tax = current.taxMinor + deltaTax;
    const total = current.totalMinor + deltaNet + deltaTax;
    const collected = netCollected(sqlite, invoiceId);
    if (total < collected)
      throw new errors.conflict(
        'Payments already received are more than the corrected total. Reverse a payment first.',
      );
    if (total < 0n) throw new errors.validation('The corrected total cannot be negative.');
    const revisionNumber = current.revisionNumber + 1;
    const createdAt = new Date().toISOString();
    after.calculation = {
      ...object(before.calculation),
      subtotalMinor: subtotal.toString(),
      taxMinor: tax.toString(),
      totalMinor: total.toString(),
    };
    after.version = {
      number: revisionNumber,
      replacesCalculationHash: current.calculationHash,
      correctedAt: createdAt,
    };
    after.generatedAt = createdAt;
    const snapshotJson = JSON.stringify(after);
    const calculationHash = createHash('sha256').update(snapshotJson).digest('hex');
    const id = newId();
    sqlite
      .prepare(
        `INSERT INTO invoice_revision(id,invoice_id,revision_number,invoice_number,previous_invoice_number,
           snapshot_json,calculation_hash,previous_calculation_hash,currency,subtotal_minor,tax_minor,
           total_minor,changed_fields_json,reason,created_by,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        invoiceId,
        revisionNumber,
        invoiceNumber,
        current.invoiceNumber,
        snapshotJson,
        calculationHash,
        current.calculationHash,
        current.currency,
        subtotal,
        tax,
        total,
        JSON.stringify(changes),
        reason,
        principal.userId,
        createdAt,
      );
    const state = correctedInvoiceState(
      total,
      collected,
      typeof after.dueAt === 'string' ? after.dueAt : null,
      Boolean(invoice.sent_at),
    );
    if (state !== invoice.state)
      sqlite
        .prepare('UPDATE invoice SET state=?,updated_at=?,version=version+1 WHERE id=? AND state=?')
        .run(state, createdAt, invoiceId, String(invoice.state));
    recordAuditEvent(sqlite, principal, 'invoice.revision_create', 'invoice', invoiceId, {
      projectId: invoice.project_id,
      revisionNumber,
      invoiceNumber,
      previousInvoiceNumber: current.invoiceNumber,
      calculationHash,
      previousCalculationHash: current.calculationHash,
      before: { totalMinor: current.totalMinor.toString(), state: invoice.state },
      after: { totalMinor: total.toString(), state },
      changes,
      ...(reason ? { reason } : {}),
    });
    return {
      revisionId: id,
      revisionNumber,
      invoiceNumber,
      previousInvoiceNumber: current.invoiceNumber,
      totalMinor: total.toString(),
      state,
      snapshot: after,
    };
  });
}

/** Store the PDF rendered for one invoice version (write-once). */
export function recordInvoiceRevisionPdf(
  sqlite: DatabaseSync,
  principal: Principal,
  invoiceId: string,
  revisionNumber: number,
  pdf: Readonly<{ storageKey: string; sha256: string; byteLength: number }>,
  errors: InvoiceRevisionErrors,
) {
  assertActiveAccount(sqlite, principal, errors.access);
  if (!['owner_admin', 'finance_admin'].includes(principal.role))
    throw new errors.access('Finance role required');
  if (!/^[a-f0-9]{64}$/u.test(pdf.sha256) || !Number.isSafeInteger(pdf.byteLength) || pdf.byteLength <= 0)
    throw new errors.validation('Invoice PDF metadata is invalid');
  if (!/^invoices\/[A-Za-z0-9_-]+\/versions\/[A-Za-z0-9._-]+\.pdf$/u.test(pdf.storageKey))
    throw new errors.validation('Unsafe storage key');
  return runImmediateTransaction(sqlite, 'invoice-revision-pdf', () => {
    const revision = sqlite
      .prepare('SELECT id FROM invoice_revision WHERE invoice_id=? AND revision_number=?')
      .get(invoiceId, revisionNumber) as { id: string } | undefined;
    if (!revision) throw new errors.validation('Invoice version not found');
    const existing = sqlite
      .prepare('SELECT sha256 FROM invoice_revision_pdf WHERE revision_id=?')
      .get(revision.id) as { sha256: string } | undefined;
    if (existing) {
      if (existing.sha256 !== pdf.sha256)
        throw new errors.conflict('This version already has its PDF.');
      return { created: false };
    }
    sqlite
      .prepare(
        'INSERT INTO invoice_revision_pdf(revision_id,storage_key,sha256,byte_length,generated_at) VALUES(?,?,?,?,?)',
      )
      .run(revision.id, pdf.storageKey, pdf.sha256, pdf.byteLength, new Date().toISOString());
    recordAuditEvent(sqlite, principal, 'invoice.revision_pdf_ready', 'invoice', invoiceId, {
      revisionNumber,
      storageKey: pdf.storageKey,
      sha256: pdf.sha256,
      byteLength: pdf.byteLength,
    });
    return { created: true };
  });
}

/** Version history shown on the invoice page ("Version 1 – replaced on ..."). */
export function invoiceVersionHistory(sqlite: DatabaseSync, invoiceId: string) {
  const versions = invoiceVersions(sqlite, invoiceId);
  const names = new Map<string, string>();
  const nameOf = (userId: string | null) => {
    if (!userId) return null;
    if (!names.has(userId))
      names.set(
        userId,
        String(
          (sqlite.prepare('SELECT name FROM user WHERE id=?').get(userId) as { name?: string } | undefined)
            ?.name ?? '',
        ),
      );
    return names.get(userId) || null;
  };
  return versions.map((version, index) => ({
    revisionNumber: version.revisionNumber,
    invoiceNumber: version.invoiceNumber,
    createdAt: version.createdAt,
    createdBy: nameOf(version.createdBy),
    replacedAt: versions[index + 1]?.createdAt ?? null,
    current: index === versions.length - 1,
    totalMinor: version.totalMinor.toString(),
    currency: version.currency,
    pdfReady: Boolean(version.pdf),
    changedFields: version.changedFields
      .map((change) => String(object(change).field ?? ''))
      .filter(Boolean),
    reason: version.reason,
  }));
}
