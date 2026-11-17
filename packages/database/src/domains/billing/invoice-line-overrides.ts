import type { DatabaseSync } from 'node:sqlite';
import { newId } from '@ja/domain';

/**
 * Invoice-only overrides ("change for this invoice only"): a client rate and/or billed hours
 * per person (optionally per commercial category), and the tax profile / purchase order of
 * one invoice. They never touch rates, time entries or the billing stream.
 *
 * The draft engine applies them while it prices the invoice, so the dry run, the stored draft,
 * its calculation fingerprint and the issued snapshot all carry the same exact amounts. Rows
 * live in the append-only `invoice_line_override` table (migration 0079): a change supersedes
 * the active row, and triggers reject any write once the invoice is no longer an unissued draft.
 */
export type InvoiceOverrideInput = Readonly<{
  people?: ReadonlyArray<
    Readonly<{
      workerId: string;
      category?: string | null;
      rateMinor?: string | null;
      billedMinutes?: number | null;
      reason?: string | null;
    }>
  >;
  tax?: Readonly<{ mode: 'profile'; taxProfileId: string }> | Readonly<{ mode: 'exempt' }> | null;
  purchaseNo?: string | null;
}>;

export type ResolvedPersonOverride = Readonly<{
  workerId: string;
  category: string | null;
  rateMinor: bigint | null;
  billedMinutes: number | null;
  reason: string | null;
  createdBy?: string;
}>;

export type ResolvedInvoiceOverrides = Readonly<{
  people: readonly ResolvedPersonOverride[];
  tax: Readonly<{ mode: 'profile'; taxProfileId: string }> | Readonly<{ mode: 'exempt' }> | null;
  purchaseNo: string | null;
  invoiceCreatedBy?: string;
}>;

export const MAX_OVERRIDE_RATE_MINOR = 100_000_000n; // 1,000,000.00 per unit
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/u;
const categoryPattern = /^[a-z][a-z0-9_]{0,63}$/u;

export class InvoiceOverrideValidationError extends Error {}

export function hasInvoiceOverrides(value: ResolvedInvoiceOverrides | null | undefined): boolean {
  return Boolean(value && (value.people.length || value.tax || value.purchaseNo));
}

/** Validates the shape of a request's overrides (scope checks happen in the engine). */
export function resolveInvoiceOverrides(
  input: InvoiceOverrideInput | null | undefined,
): ResolvedInvoiceOverrides | null {
  if (!input) return null;
  const seen = new Set<string>();
  const people: ResolvedPersonOverride[] = [];
  for (const person of input.people ?? []) {
    if (!person || typeof person.workerId !== 'string' || !idPattern.test(person.workerId))
      throw new InvoiceOverrideValidationError('Invoice override person is invalid');
    const category =
      person.category === undefined || person.category === null || person.category === ''
        ? null
        : String(person.category);
    if (category !== null && !categoryPattern.test(category))
      throw new InvoiceOverrideValidationError('Invoice override category is invalid');
    const key = `${person.workerId}\u0000${category ?? ''}`;
    if (seen.has(key)) throw new InvoiceOverrideValidationError('Duplicate invoice override');
    seen.add(key);
    let rateMinor: bigint | null = null;
    if (person.rateMinor !== undefined && person.rateMinor !== null) {
      if (!/^\d{1,12}$/u.test(String(person.rateMinor)))
        throw new InvoiceOverrideValidationError('Invoice override rate is invalid');
      rateMinor = BigInt(person.rateMinor);
      if (rateMinor > MAX_OVERRIDE_RATE_MINOR)
        throw new InvoiceOverrideValidationError('Invoice override rate is too high');
    }
    let billedMinutes: number | null = null;
    if (person.billedMinutes !== undefined && person.billedMinutes !== null) {
      if (!Number.isSafeInteger(person.billedMinutes) || person.billedMinutes < 0)
        throw new InvoiceOverrideValidationError('Billed hours must be zero or more');
      billedMinutes = person.billedMinutes;
    }
    if (rateMinor === null && billedMinutes === null) continue;
    const reason = typeof person.reason === 'string' ? person.reason.trim().slice(0, 2000) || null : null;
    people.push({ workerId: person.workerId, category, rateMinor, billedMinutes, reason });
  }
  let tax: ResolvedInvoiceOverrides['tax'] = null;
  if (input.tax) {
    if (input.tax.mode === 'exempt') tax = { mode: 'exempt' };
    else if (input.tax.mode === 'profile' && idPattern.test(String(input.tax.taxProfileId)))
      tax = { mode: 'profile', taxProfileId: String(input.tax.taxProfileId) };
    else throw new InvoiceOverrideValidationError('Invoice tax override is invalid');
  }
  const purchaseNo =
    typeof input.purchaseNo === 'string' && input.purchaseNo.trim()
      ? input.purchaseNo.trim().slice(0, 200)
      : null;
  people.sort((a, b) => a.workerId.localeCompare(b.workerId) || (a.category ?? '').localeCompare(b.category ?? ''));
  return { people, tax, purchaseNo };
}

type OverrideRow = {
  id: string;
  target_kind: 'person' | 'invoice';
  worker_id: string | null;
  category: string | null;
  rate_minor: number | bigint | null;
  billed_minutes: number | null;
  worked_minutes: number | null;
  tax_mode: 'profile' | 'exempt' | null;
  tax_profile_id: string | null;
  purchase_no: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
};

function activeRows(sqlite: DatabaseSync, invoiceId: string): OverrideRow[] {
  const exists = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='invoice_line_override'")
    .get();
  if (!exists) return [];
  return sqlite
    .prepare(
      `SELECT id,target_kind,worker_id,category,CAST(rate_minor AS TEXT) rate_minor,billed_minutes,worked_minutes,
              tax_mode,tax_profile_id,purchase_no,reason,created_by,created_at
         FROM invoice_line_override WHERE invoice_id=? AND superseded_at IS NULL
        ORDER BY target_kind,worker_id,category,id`,
    )
    .all(invoiceId) as OverrideRow[];
}

/** The overrides currently recorded on an invoice (draft or frozen), or null when none. */
export function loadInvoiceOverrides(
  sqlite: DatabaseSync,
  invoiceId: string,
): ResolvedInvoiceOverrides | null {
  const rows = activeRows(sqlite, invoiceId);
  if (!rows.length) return null;
  const invoiceRow = rows.find((row) => row.target_kind === 'invoice');
  return {
    people: rows
      .filter((row) => row.target_kind === 'person')
      .map((row) => ({
        workerId: String(row.worker_id),
        category: row.category,
        rateMinor: row.rate_minor === null ? null : BigInt(row.rate_minor),
        billedMinutes: row.billed_minutes,
        reason: row.reason,
        createdBy: row.created_by,
      })),
    tax: invoiceRow?.tax_mode
      ? invoiceRow.tax_mode === 'exempt'
        ? { mode: 'exempt' }
        : { mode: 'profile', taxProfileId: String(invoiceRow.tax_profile_id) }
      : null,
    purchaseNo: invoiceRow?.purchase_no ?? null,
    ...(invoiceRow ? { invoiceCreatedBy: invoiceRow.created_by } : {}),
  };
}

/** Stable, JSON-safe description (fingerprints, snapshots, audit). */
export function describeInvoiceOverrides(value: ResolvedInvoiceOverrides) {
  return {
    people: value.people.map((person) => ({
      workerId: person.workerId,
      category: person.category,
      rateMinor: person.rateMinor === null ? null : person.rateMinor.toString(),
      billedMinutes: person.billedMinutes,
    })),
    tax: value.tax,
    purchaseNo: value.purchaseNo,
  };
}

/** Rate for one priced slice: an exact category match wins over the person's general override. */
export function overrideRateFor(
  value: ResolvedInvoiceOverrides | null,
  workerId: string,
  category: string,
): bigint | null {
  if (!value) return null;
  const exact = value.people.find(
    (person) => person.workerId === workerId && person.category === category && person.rateMinor !== null,
  );
  if (exact) return exact.rateMinor;
  return (
    value.people.find(
      (person) => person.workerId === workerId && person.category === null && person.rateMinor !== null,
    )?.rateMinor ?? null
  );
}

export type BilledMinutesSlice = Readonly<{ key: string; workerId: string; category: string; minutes: number }>;

/**
 * Billed hours per person (× category): the person's priced slices keep their order and are
 * filled up to the billed total, so a write-down trims the latest work and a write-up (at most
 * 1.5 × worked) is added to the last slice. Returns slice key → billed minutes, plus the worked
 * total per override for the audit trail. Slices without an override are not in the map.
 */
export function planBilledMinutes(
  value: ResolvedInvoiceOverrides | null,
  slices: readonly BilledMinutesSlice[],
): { minutes: Map<string, number>; worked: Map<string, number> } {
  const minutes = new Map<string, number>();
  const worked = new Map<string, number>();
  if (!value) return { minutes, worked };
  const targets = value.people.filter((person) => person.billedMinutes !== null);
  // Exact category overrides first; a general one covers the person's remaining categories.
  const ordered = [...targets].sort((a, b) => Number(a.category === null) - Number(b.category === null));
  const claimed = new Set<string>();
  for (const target of ordered) {
    const mine = slices.filter(
      (slice) =>
        slice.workerId === target.workerId &&
        !claimed.has(slice.key) &&
        (target.category === null || slice.category === target.category),
    );
    const total = mine.reduce((sum, slice) => sum + slice.minutes, 0);
    const key = `${target.workerId}\u0000${target.category ?? ''}`;
    worked.set(key, total);
    if (!mine.length) continue;
    const billed = target.billedMinutes ?? total;
    if (billed > Math.ceil(total * 1.5))
      throw new InvoiceOverrideValidationError(
        'Billed hours can be at most 1.5 × the hours worked; add a manual line for more',
      );
    let remaining = billed;
    mine.forEach((slice, index) => {
      claimed.add(slice.key);
      const last = index === mine.length - 1;
      const take = last ? remaining : Math.min(slice.minutes, remaining);
      minutes.set(slice.key, Math.max(0, take));
      remaining -= Math.max(0, take);
    });
  }
  return { minutes, worked };
}

function personKey(row: { worker_id: string | null; category: string | null }): string {
  return `${row.worker_id ?? ''}\u0000${row.category ?? ''}`;
}

/**
 * Make the invoice's active overrides equal to `desired`: changed or removed rows are
 * superseded, new values are appended. Returns what changed for the audit trail.
 */
export function persistInvoiceOverrides(
  sqlite: DatabaseSync,
  input: Readonly<{
    invoiceId: string;
    desired: ResolvedInvoiceOverrides;
    actorUserId: string;
    worked: ReadonlyMap<string, number>;
    timestamp: string;
  }>,
): { created: Record<string, unknown>[]; superseded: Record<string, unknown>[] } {
  const current = activeRows(sqlite, input.invoiceId);
  const created: Record<string, unknown>[] = [];
  const superseded: Record<string, unknown>[] = [];
  const supersede = sqlite.prepare(
    'UPDATE invoice_line_override SET superseded_at=? WHERE id=? AND superseded_at IS NULL',
  );
  const insert = sqlite.prepare(
    `INSERT INTO invoice_line_override(id,invoice_id,target_kind,worker_id,category,rate_minor,billed_minutes,
       worked_minutes,tax_mode,tax_profile_id,purchase_no,reason,created_by,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const desiredPeople = new Map(
    input.desired.people.map((person) => [`${person.workerId}\u0000${person.category ?? ''}`, person]),
  );
  for (const row of current.filter((candidate) => candidate.target_kind === 'person')) {
    const wanted = desiredPeople.get(personKey(row));
    const same =
      wanted &&
      (wanted.rateMinor === null ? row.rate_minor === null : row.rate_minor !== null && BigInt(row.rate_minor) === wanted.rateMinor) &&
      (wanted.billedMinutes ?? null) === (row.billed_minutes ?? null);
    if (same) {
      desiredPeople.delete(personKey(row));
      continue;
    }
    supersede.run(input.timestamp, row.id);
    superseded.push({ id: row.id, workerId: row.worker_id, category: row.category, rateMinor: row.rate_minor === null ? null : String(row.rate_minor), billedMinutes: row.billed_minutes });
  }
  for (const [key, person] of desiredPeople) {
    const id = newId();
    const workedMinutes = person.billedMinutes === null ? null : (input.worked.get(key) ?? null);
    insert.run(
      id,
      input.invoiceId,
      'person',
      person.workerId,
      person.category,
      person.rateMinor === null ? null : person.rateMinor.toString(),
      person.billedMinutes,
      workedMinutes,
      null,
      null,
      null,
      person.reason,
      person.createdBy ?? input.actorUserId,
      input.timestamp,
    );
    created.push({
      id,
      target: 'person',
      workerId: person.workerId,
      category: person.category,
      rateMinor: person.rateMinor === null ? null : person.rateMinor.toString(),
      billedMinutes: person.billedMinutes,
      workedMinutes,
    });
  }
  const invoiceRow = current.find((row) => row.target_kind === 'invoice');
  const wantedTax = input.desired.tax;
  const wantedPo = input.desired.purchaseNo;
  const sameInvoice =
    invoiceRow
      ? (invoiceRow.tax_mode ?? null) === (wantedTax?.mode ?? null) &&
        (invoiceRow.tax_profile_id ?? null) === (wantedTax?.mode === 'profile' ? wantedTax.taxProfileId : null) &&
        (invoiceRow.purchase_no ?? null) === wantedPo
      : !wantedTax && !wantedPo;
  if (!sameInvoice) {
    if (invoiceRow) {
      supersede.run(input.timestamp, invoiceRow.id);
      superseded.push({ id: invoiceRow.id, target: 'invoice', tax: invoiceRow.tax_mode, taxProfileId: invoiceRow.tax_profile_id, purchaseNo: invoiceRow.purchase_no });
    }
    if (wantedTax || wantedPo) {
      const id = newId();
      insert.run(
        id,
        input.invoiceId,
        'invoice',
        null,
        null,
        null,
        null,
        null,
        wantedTax?.mode ?? null,
        wantedTax?.mode === 'profile' ? wantedTax.taxProfileId : null,
        wantedPo,
        null,
        input.desired.invoiceCreatedBy ?? input.actorUserId,
        input.timestamp,
      );
      created.push({ id, target: 'invoice', tax: wantedTax, purchaseNo: wantedPo });
    }
  }
  return { created, superseded };
}

/** Active overrides as stored rows (invoice screen and issued snapshot). */
export function invoiceOverrideRows(sqlite: DatabaseSync, invoiceId: string) {
  return activeRows(sqlite, invoiceId).map((row) => ({
    id: row.id,
    target: row.target_kind,
    workerId: row.worker_id,
    category: row.category,
    rateMinor: row.rate_minor === null ? null : String(row.rate_minor),
    billedMinutes: row.billed_minutes,
    workedMinutes: row.worked_minutes,
    tax: row.tax_mode,
    taxProfileId: row.tax_profile_id,
    purchaseNo: row.purchase_no,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}
