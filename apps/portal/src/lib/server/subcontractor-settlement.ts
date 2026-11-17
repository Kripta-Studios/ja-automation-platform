import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import type { V3Repository } from '@ja/database';
import { totalsByCurrency } from '@ja/billing-engine';
import { foldSearchText } from '$lib/portal/client-directory';

/**
 * Money → Subcontractors: weekly settlement of approved hours × agreed pay
 * (compensation) rate per subcontractor (a supplier with linked technicians,
 * or an individually paid worker). Reuses compensation_settlement (approval)
 * and worker_compensation_payment_event (payment) — no parallel ledger.
 */

export type SettlementContext = Readonly<{
  sqlite: DatabaseSync;
  v3: V3Repository;
  principal: Principal;
}>;

export type PayeeKey = `supplier:${string}` | `person:${string}`;
export type SettlementStatus = 'draft' | 'approved' | 'paid';

const ISO = /^\d{4}-\d{2}-\d{2}$/u;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** ISO week (Mon–Sun) containing `value`; default = last complete week before `today`. */
export function settlementWeek(value: string | null, today = new Date().toISOString().slice(0, 10)) {
  const anchor = value && ISO.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : addDays(today, -7);
  const day = new Date(`${anchor}T00:00:00Z`).getUTCDay();
  const start = addDays(anchor, -((day + 6) % 7));
  const end = addDays(start, 6);
  // ISO week number: the week's Thursday decides the year.
  const thursday = new Date(`${addDays(start, 3)}T00:00:00Z`);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { start, end, week, year: thursday.getUTCFullYear(), previous: addDays(start, -7), next: addDays(start, 7) };
}

export function parsePayeeKey(value: string | null): PayeeKey | null {
  if (!value) return null;
  const match = /^(supplier|person):([A-Za-z0-9_-]{1,200})$/u.exec(value);
  return match ? (value as PayeeKey) : null;
}

type WorkerHours = {
  worker_id: string;
  worker_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  minutes: number;
  entries: number;
};

/** Workers with approved time in the period, with their supplier link (if any). */
function workersWithApprovedTime(sqlite: DatabaseSync, start: string, end: string): WorkerHours[] {
  return sqlite
    .prepare(
      `SELECT t.worker_id,u.name worker_name,profile.supplier_id,s.name supplier_name,
              SUM(t.minutes) minutes,COUNT(*) entries
         FROM time_entry t
         JOIN user u ON u.id=t.worker_id
    LEFT JOIN supplier_user_profile profile ON profile.user_id=t.worker_id
    LEFT JOIN supplier s ON s.id=profile.supplier_id
        WHERE t.work_date BETWEEN ? AND ? AND t.approval_state IN ('approved','locked')
          AND u.role IN ('worker','project_manager')
          AND NOT EXISTS (
            SELECT 1 FROM record_correction_link rcl
            JOIN time_entry correction ON correction.id=rcl.correction_id
            WHERE rcl.record_type='time_entry'
              AND ((rcl.original_id=t.id AND correction.approval_state='approved')
                OR (rcl.correction_id=t.id AND correction.approval_state<>'approved'))
          )
        GROUP BY t.worker_id
        ORDER BY u.name,t.worker_id`,
    )
    .all(start, end) as WorkerHours[];
}

type SettlementRow = {
  id: string;
  worker_id: string;
  project_id: string;
  period_start: string;
  period_end: string;
  source_amount_minor: string;
  amount_minor: string;
  currency: string;
  paid_minor: string;
  last_paid_on: string | null;
  last_reference: string | null;
};

function settlementsFor(sqlite: DatabaseSync, workerIds: readonly string[], start: string, end: string): SettlementRow[] {
  if (!workerIds.length) return [];
  const placeholders = workerIds.map(() => '?').join(',');
  return sqlite
    .prepare(
      `SELECT cs.id,cs.worker_id,cs.project_id,cs.period_start,cs.period_end,
              CAST(cs.source_amount_minor AS TEXT) source_amount_minor,
              CAST(cs.amount_minor AS TEXT) amount_minor,cs.currency,
              CAST(COALESCE((SELECT SUM(CASE WHEN p.event_type='payment' THEN p.amount_minor ELSE -p.amount_minor END)
                 FROM worker_compensation_payment_event p WHERE p.settlement_id=cs.id),0) AS TEXT) paid_minor,
              (SELECT MAX(p.paid_on) FROM worker_compensation_payment_event p
                WHERE p.settlement_id=cs.id AND p.event_type='payment') last_paid_on,
              (SELECT p.reference FROM worker_compensation_payment_event p
                WHERE p.settlement_id=cs.id AND p.event_type='payment' ORDER BY p.created_at DESC LIMIT 1) last_reference
         FROM compensation_settlement cs
        WHERE cs.worker_id IN (${placeholders}) AND cs.state='settled'
          AND cs.period_start>=? AND cs.period_end<=?
        ORDER BY cs.worker_id,cs.project_id,cs.period_start`,
    )
    .all(...workerIds, start, end) as SettlementRow[];
}

export type PayeeSummary = {
  key: PayeeKey;
  kind: 'supplier' | 'person';
  name: string;
  workers: Array<{ id: string; name: string; minutes: number }>;
  minutes: number;
};

function groupPayees(rows: readonly WorkerHours[]): PayeeSummary[] {
  const map = new Map<PayeeKey, PayeeSummary>();
  for (const row of rows) {
    const key: PayeeKey = row.supplier_id ? `supplier:${row.supplier_id}` : `person:${row.worker_id}`;
    const payee =
      map.get(key) ??
      ({
        key,
        kind: row.supplier_id ? 'supplier' : 'person',
        name: row.supplier_id ? (row.supplier_name ?? '—') : row.worker_name,
        workers: [],
        minutes: 0,
      } satisfies PayeeSummary);
    payee.workers.push({ id: row.worker_id, name: row.worker_name, minutes: Number(row.minutes) });
    payee.minutes += Number(row.minutes);
    map.set(key, payee);
  }
  return [...map.values()].sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'supplier' ? -1 : 1,
  );
}

type Entry = ReturnType<V3Repository['subcontractorSettlementPreview']>[number];

function summarize(entries: readonly Entry[], settlements: readonly SettlementRow[]) {
  const pairs = new Map<string, { minutes: number }>();
  for (const entry of entries) {
    const key = `${entry.workerId}|${entry.projectId}`;
    pairs.set(key, { minutes: (pairs.get(key)?.minutes ?? 0) + entry.minutes });
  }
  const settledPairs = new Map<string, bigint>();
  for (const row of settlements) {
    const key = `${row.worker_id}|${row.project_id}`;
    settledPairs.set(key, (settledPairs.get(key) ?? 0n) + BigInt(row.source_amount_minor));
  }
  const unsettled = [...pairs.keys()].filter((key) => !settledPairs.has(key));
  // Hourly settlements record approved minutes as their source amount.
  const changed = [...pairs.entries()].filter(
    ([key, value]) => settledPairs.has(key) && settledPairs.get(key)! !== BigInt(value.minutes) && settledPairs.get(key)! > 0n,
  );
  const owed = settlements.map((row) => ({
    currency: row.currency,
    minorUnits: BigInt(row.amount_minor),
  }));
  const remaining = settlements.map((row) => ({
    currency: row.currency,
    minorUnits: BigInt(row.amount_minor) - BigInt(row.paid_minor),
  }));
  const estimate = entries
    .filter((entry) => entry.amountMinor !== null)
    .map((entry) => ({ currency: entry.currency, minorUnits: BigInt(entry.amountMinor!) }));
  const remainingTotal = remaining.reduce((sum, row) => sum + row.minorUnits, 0n);
  const status: SettlementStatus =
    pairs.size === 0 || unsettled.length > 0 ? 'draft' : remainingTotal > 0n ? 'approved' : 'paid';
  return {
    status,
    unsettledPairs: unsettled.length,
    changedPairs: changed.length,
    issues: entries.filter((entry) => entry.issue && entry.issue !== 'not_hourly').length,
    totals: (status === 'draft' ? totalsByCurrency(estimate) : totalsByCurrency(owed)).map((row) => ({
      currency: row.currency,
      minor: row.minorUnits.toString(),
    })),
    remaining: totalsByCurrency(remaining)
      .filter((row) => row.minorUnits !== 0n)
      .map((row) => ({ currency: row.currency, minor: row.minorUnits.toString() })),
    paidOn: settlements.map((row) => row.last_paid_on).filter(Boolean).sort().at(-1) ?? null,
    reference: settlements.find((row) => row.last_reference)?.last_reference ?? null,
  };
}

/** Overview: one row per payee with approved hours in the period (searchable, paged). */
export function settlementOverview(
  context: SettlementContext,
  input: Readonly<{ start: string; end: string; q: string; status: SettlementStatus | 'all'; limit: number }>,
) {
  const payees = groupPayees(workersWithApprovedTime(context.sqlite, input.start, input.end));
  const needle = foldSearchText(input.q);
  const searched = needle
    ? payees.filter((payee) =>
        foldSearchText([payee.name, ...payee.workers.map((worker) => worker.name)].join(' ')).includes(needle),
      )
    : payees;
  // Price only the payees that can be shown (status filter needs each summary).
  const rows: Array<PayeeSummary & ReturnType<typeof summarize>> = [];
  let matched = 0;
  for (const payee of searched) {
    const ids = payee.workers.map((worker) => worker.id);
    const summary = summarize(
      context.v3.subcontractorSettlementPreview(context.principal, { workerIds: ids, periodStart: input.start, periodEnd: input.end }),
      settlementsFor(context.sqlite, ids, input.start, input.end),
    );
    if (input.status !== 'all' && summary.status !== input.status) continue;
    matched += 1;
    if (rows.length < input.limit) rows.push({ ...payee, ...summary });
  }
  return { rows, total: matched, payeeCount: payees.length };
}

/** Detail of one payee for the period: entries per worker/day, totals per currency, status. */
export function settlementDetail(
  context: SettlementContext,
  input: Readonly<{ payee: PayeeKey; start: string; end: string }>,
) {
  const payees = groupPayees(workersWithApprovedTime(context.sqlite, input.start, input.end));
  let payee = payees.find((candidate) => candidate.key === input.payee) ?? null;
  if (!payee) {
    // No approved hours this period: still show who it is (empty settlement).
    const [kind, id] = input.payee.split(':') as ['supplier' | 'person', string];
    const name =
      kind === 'supplier'
        ? (context.sqlite.prepare('SELECT name FROM supplier WHERE id=?').get(id) as { name: string } | undefined)?.name
        : (context.sqlite.prepare("SELECT name FROM user WHERE id=? AND role IN ('worker','project_manager')").get(id) as { name: string } | undefined)?.name;
    if (!name) return null;
    payee = { key: input.payee, kind, name, workers: [], minutes: 0 };
  }
  const ids = payee.workers.map((worker) => worker.id);
  const entries = context.v3.subcontractorSettlementPreview(context.principal, {
    workerIds: ids,
    periodStart: input.start,
    periodEnd: input.end,
  });
  const settlements = settlementsFor(context.sqlite, ids, input.start, input.end);
  const workers = payee.workers.map((worker) => {
    const own = entries.filter((entry) => entry.workerId === worker.id);
    const ownSettlements = settlements.filter((row) => row.worker_id === worker.id);
    return {
      id: worker.id,
      name: worker.name,
      minutes: worker.minutes,
      entries: own,
      settled: totalsByCurrency(ownSettlements.map((row) => ({ currency: row.currency, minorUnits: BigInt(row.amount_minor) }))).map(
        (row) => ({ currency: row.currency, minor: row.minorUnits.toString() }),
      ),
      estimate: totalsByCurrency(
        own.filter((entry) => entry.amountMinor !== null).map((entry) => ({ currency: entry.currency, minorUnits: BigInt(entry.amountMinor!) })),
      ).map((row) => ({ currency: row.currency, minor: row.minorUnits.toString() })),
    };
  });
  return { payee, workers, entries, ...summarize(entries, settlements) };
}

export class SettlementActionError extends Error {}

/** Approve: create (or confirm) one compensation settlement per worker × project in the period. */
export function approveSettlement(context: SettlementContext, input: Readonly<{ payee: PayeeKey; start: string; end: string }>) {
  const detail = settlementDetail(context, input);
  if (!detail || detail.entries.length === 0) throw new SettlementActionError('No approved hours to settle');
  if (detail.issues > 0) throw new SettlementActionError('Set the missing pay rates first');
  const pairs = [...new Set(detail.entries.map((entry) => `${entry.workerId}|${entry.projectId}`))];
  let created = 0;
  for (const pair of pairs) {
    const [workerId, projectId] = pair.split('|') as [string, string];
    // Settle the part of the week covered by the worker's assignment.
    const member = context.sqlite
      .prepare(
        `SELECT MAX(starts_on) starts_on, MIN(COALESCE(ends_on,'9999-12-31')) ends_on FROM project_member
          WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)`,
      )
      .get(projectId, workerId, input.end, input.start) as { starts_on: string | null; ends_on: string | null };
    const periodStart = member.starts_on && member.starts_on > input.start ? member.starts_on : input.start;
    const periodEnd = member.ends_on && member.ends_on < input.end ? member.ends_on : input.end;
    const result = context.v3.settleCompensation(context.principal, { workerId, projectId, periodStart, periodEnd });
    created += result.length;
  }
  return { created };
}

/** Mark as paid: record one payment per open settlement for the remaining amount (audited, idempotent). */
export function markSettlementPaid(
  context: SettlementContext,
  input: Readonly<{ payee: PayeeKey; start: string; end: string; paidOn: string; reference: string; requestKey: string }>,
) {
  const detail = settlementDetail(context, input);
  if (!detail) throw new SettlementActionError('Subcontractor not found');
  if (detail.status === 'draft') throw new SettlementActionError('Approve the settlement first');
  const [kind, payeeId] = input.payee.split(':') as ['supplier' | 'person', string];
  const ids = detail.payee.workers.map((worker) => worker.id);
  let recorded = 0;
  for (const row of settlementsFor(context.sqlite, ids, input.start, input.end)) {
    const remaining = BigInt(row.amount_minor) - BigInt(row.paid_minor);
    if (remaining <= 0n) continue;
    context.v3.recordCompensationPayment(context.principal, {
      settlementId: row.id,
      payeeKind: kind,
      payeeId: kind === 'supplier' ? payeeId : row.worker_id,
      amountMinor: remaining,
      currency: row.currency as never,
      paidOn: input.paidOn,
      reference: input.reference,
      idempotencyKey: `subcontractor-pay:${input.requestKey}:${row.id}`.slice(0, 240),
    });
    recorded += 1;
  }
  return { recorded };
}
