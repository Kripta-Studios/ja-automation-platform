import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import type { V3Repository } from '@ja/database';
import {
  PAY_INTERVALS,
  adjacentPeriodForCadence,
  lastCompletePeriodForCadence,
  periodForCadence,
  totalsByCurrency,
  type PayInterval,
} from '@ja/billing-engine';
import { effectivePayInterval, nextPayPeriod } from '@ja/database';
import { foldSearchText } from '$lib/portal/client-directory';
import { personDisplayName } from '$lib/portal/display-name';

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

/**
 * Decision D7 (audit 2026-11-22): J&A's own workers (no supplier link) are paid through their
 * compensation (Detailed analysis › Settlements). The weekly subcontractor settlement shows
 * them read-only as "Internal – paid via compensation" and never offers Approve / Mark as paid,
 * so the same hours cannot be paid twice. Flip to true only if J&A pays individuals weekly here.
 */
export const SUBCONTRACTOR_SETTLEMENT_PAYS_INTERNAL_WORKERS = false;

export function isPayableSubcontractor(kind: 'supplier' | 'person'): boolean {
  return kind === 'supplier' || SUBCONTRACTOR_SETTLEMENT_PAYS_INTERNAL_WORKERS;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** ISO week (Mon–Sun) containing `value`; default = last complete week before `today`. */
export function settlementWeek(
  value: string | null,
  today = new Date().toISOString().slice(0, 10),
) {
  const anchor =
    value && ISO.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      ? value
      : addDays(today, -7);
  const day = new Date(`${anchor}T00:00:00Z`).getUTCDay();
  const start = addDays(anchor, -((day + 6) % 7));
  const end = addDays(start, 6);
  // ISO week number: the week's Thursday decides the year.
  const thursday = new Date(`${addDays(start, 3)}T00:00:00Z`);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return {
    start,
    end,
    week,
    year: thursday.getUTCFullYear(),
    previous: addDays(start, -7),
    next: addDays(start, 7),
  };
}

export type SettlementPeriod = ReturnType<typeof settlementWeek> & { interval: PayInterval };

export function parsePayInterval(value: string | null): PayInterval | null {
  return value && (PAY_INTERVALS as readonly string[]).includes(value)
    ? (value as PayInterval)
    : null;
}

/**
 * The settlement period (owner request 2026-11-25): weekly by default, or every 2 weeks /
 * twice a month / monthly. `value` is any day of the period; without it, the last complete
 * period before today. `week`/`year` name the ISO week of the first day (weekly label).
 */
export function settlementPeriod(
  value: string | null,
  interval: PayInterval = 'weekly',
  today = new Date().toISOString().slice(0, 10),
): SettlementPeriod {
  if (interval === 'weekly') return { ...settlementWeek(value, today), interval };
  const valid = value && ISO.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  const period = valid
    ? periodForCadence(interval, value, { anchorDate: '2026-01-05' })!
    : lastCompletePeriodForCadence(interval, today, { anchorDate: '2026-01-05' })!;
  const week = settlementWeek(period.start, today);
  return {
    ...week,
    start: period.start,
    end: period.end,
    previous: adjacentPeriodForCadence(interval, period, -1).start,
    next: adjacentPeriodForCadence(interval, period, 1).start,
    interval,
  };
}

function payeeWorkerIds(sqlite: DatabaseSync, payee: PayeeKey): string[] {
  const [kind, id] = payee.split(':') as ['supplier' | 'person', string];
  if (kind === 'person') return [id];
  return (
    sqlite
      .prepare('SELECT user_id FROM supplier_user_profile WHERE supplier_id=? ORDER BY user_id')
      .all(id) as Array<{
      user_id: string;
    }>
  ).map((row) => row.user_id);
}

/** How often a payee is paid: the person's interval, or the one all a supplier's people share. */
export function payeeInterval(sqlite: DatabaseSync, payee: PayeeKey): PayInterval | null {
  const intervals = new Set(
    payeeWorkerIds(sqlite, payee).map((id) => effectivePayInterval(sqlite, id).interval),
  );
  const [only] = [...intervals];
  return intervals.size === 1 && only ? only : null;
}

/** The period the payee's next pay covers (earliest among its people), with its interval. */
export function payeeNextPeriod(
  sqlite: DatabaseSync,
  payee: PayeeKey,
  today = new Date().toISOString().slice(0, 10),
): SettlementPeriod {
  const interval = payeeInterval(sqlite, payee) ?? 'weekly';
  const starts = payeeWorkerIds(sqlite, payee)
    .map((id) => nextPayPeriod(sqlite, id, { today, interval }).period?.start)
    .filter((value): value is string => Boolean(value))
    .sort();
  return settlementPeriod(starts[0] ?? null, interval, today);
}

export function parsePayeeKey(value: string | null): PayeeKey | null {
  if (!value) return null;
  const match = /^(supplier|person):([A-Za-z0-9_-]{1,200})$/u.exec(value);
  return match ? (value as PayeeKey) : null;
}

type WorkerHours = {
  worker_id: string;
  worker_name: string;
  worker_email?: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  minutes: number;
  entries: number;
};

/** Workers with approved time in the period, with their supplier link (if any). */
function workersWithApprovedTime(sqlite: DatabaseSync, start: string, end: string): WorkerHours[] {
  return sqlite
    .prepare(
      `SELECT t.worker_id,u.name worker_name,u.email worker_email,profile.supplier_id,s.name supplier_name,
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

function settlementsFor(
  sqlite: DatabaseSync,
  workerIds: readonly string[],
  start: string,
  end: string,
): SettlementRow[] {
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
          AND cs.period_start<=? AND cs.period_end>=?
        ORDER BY cs.worker_id,cs.project_id,cs.period_start`,
    )
    .all(...workerIds, end, start) as SettlementRow[];
}

/** Settled compensation that covers this entry's date (any period: week, month, assignment). */
function coveringSettlement(
  settlements: readonly SettlementRow[],
  entry: Readonly<{ workerId: string; projectId: string; workDate: string }>,
): SettlementRow | undefined {
  return settlements.find(
    (row) =>
      row.worker_id === entry.workerId &&
      row.project_id === entry.projectId &&
      row.period_start <= entry.workDate &&
      row.period_end >= entry.workDate,
  );
}

/** Settlements whose whole period lies inside the week: only these are approved/paid from here. */
function withinWeek(settlements: readonly SettlementRow[], start: string, end: string) {
  return settlements.filter((row) => row.period_start >= start && row.period_end <= end);
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
    const key: PayeeKey = row.supplier_id
      ? `supplier:${row.supplier_id}`
      : `person:${row.worker_id}`;
    const payee =
      map.get(key) ??
      ({
        key,
        kind: row.supplier_id ? 'supplier' : 'person',
        name: row.supplier_id
          ? (row.supplier_name ?? '—')
          : personDisplayName(row.worker_name, row.worker_email) || row.worker_name,
        workers: [],
        minutes: 0,
      } satisfies PayeeSummary);
    payee.workers.push({
      id: row.worker_id,
      name: personDisplayName(row.worker_name, row.worker_email) || row.worker_name,
      minutes: Number(row.minutes),
    });
    payee.minutes += Number(row.minutes);
    map.set(key, payee);
  }
  return [...map.values()].sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'supplier' ? -1 : 1,
  );
}

type Entry = ReturnType<V3Repository['subcontractorSettlementPreview']>[number];

type ExtrasGroup = ReturnType<V3Repository['subcontractorSettlementExtras']>[number];

/** Worker-side per diem / allowance of the period as display rows (exact minor units). */
function extraRows(groups: readonly ExtrasGroup[]) {
  return groups.flatMap((group) =>
    group.charges.map((charge) => ({
      workerId: group.workerId,
      projectId: group.projectId,
      kind: charge.kind,
      basis: charge.basis,
      units: charge.units.length,
      currency: charge.currency,
      rateMinor: charge.rateMinor.toString(),
      amountMinor: charge.amountMinor.toString(),
    })),
  );
}

function summarize(
  entries: readonly Entry[],
  allSettlements: readonly SettlementRow[],
  week: Readonly<{ start: string; end: string }>,
  extras: readonly ExtrasGroup[] = [],
) {
  const pairs = new Map<string, { minutes: number }>();
  const uncovered = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.workerId}|${entry.projectId}`;
    pairs.set(key, { minutes: (pairs.get(key)?.minutes ?? 0) + entry.minutes });
    // Match per entry date: a monthly (or longer) settlement covers the week's hours too.
    if (!coveringSettlement(allSettlements, entry)) uncovered.add(key);
  }
  const covering = allSettlements.filter((row) =>
    entries.some((entry) => coveringSettlement([row], entry)),
  );
  // Amounts owed/remaining come from settlements of this week only; a longer settlement
  // (e.g. the month) is shown with this week's estimate and paid where it was created.
  const settlements = withinWeek(covering, week.start, week.end);
  const coveredByLongerPeriod = covering.length > settlements.length;
  const settledPairs = new Map<string, bigint>();
  for (const row of settlements) {
    const key = `${row.worker_id}|${row.project_id}`;
    settledPairs.set(key, (settledPairs.get(key) ?? 0n) + BigInt(row.source_amount_minor));
  }
  const unsettled = [...pairs.keys()].filter((key) => uncovered.has(key));
  // Hourly settlements record approved minutes as their source amount.
  const changed = [...pairs.entries()].filter(
    ([key, value]) =>
      settledPairs.has(key) &&
      settledPairs.get(key)! !== BigInt(value.minutes) &&
      settledPairs.get(key)! > 0n,
  );
  const owed = settlements.map((row) => ({
    currency: row.currency,
    minorUnits: BigInt(row.amount_minor),
  }));
  const remaining = settlements.map((row) => ({
    currency: row.currency,
    minorUnits: BigInt(row.amount_minor) - BigInt(row.paid_minor),
  }));
  // Per diem / allowance are paid with the hours (settleCompensation adds them to the amount).
  const estimate = [
    ...entries
      .filter((entry) => entry.amountMinor !== null)
      .map((entry) => ({ currency: entry.currency, minorUnits: BigInt(entry.amountMinor!) })),
    ...extras.flatMap((group) =>
      group.charges.map((charge) => ({
        currency: charge.currency,
        minorUnits: charge.amountMinor,
      })),
    ),
  ];
  const remainingTotal = [
    ...remaining,
    ...covering
      .filter((row) => !settlements.includes(row))
      .map((row) => ({ minorUnits: BigInt(row.amount_minor) - BigInt(row.paid_minor) })),
  ].reduce((sum, row) => sum + row.minorUnits, 0n);
  const status: SettlementStatus =
    pairs.size === 0 || unsettled.length > 0 ? 'draft' : remainingTotal > 0n ? 'approved' : 'paid';
  return {
    status,
    unsettledPairs: unsettled.length,
    changedPairs: changed.length,
    issues: entries.filter((entry) => entry.issue && entry.issue !== 'not_hourly').length,
    coveredByLongerPeriod,
    totals: (status === 'draft' || coveredByLongerPeriod
      ? totalsByCurrency(estimate)
      : totalsByCurrency(owed)
    ).map((row) => ({
      currency: row.currency,
      minor: row.minorUnits.toString(),
    })),
    remaining: totalsByCurrency(remaining)
      .filter((row) => row.minorUnits !== 0n)
      .map((row) => ({ currency: row.currency, minor: row.minorUnits.toString() })),
    paidOn:
      covering
        .map((row) => row.last_paid_on)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    reference: covering.find((row) => row.last_reference)?.last_reference ?? null,
  };
}

/** Overview: one row per payee with approved hours in the period (searchable, paged). */
export function settlementOverview(
  context: SettlementContext,
  input: Readonly<{
    start: string;
    end: string;
    q: string;
    status: SettlementStatus | 'all';
    limit: number;
  }>,
) {
  const payees = groupPayees(workersWithApprovedTime(context.sqlite, input.start, input.end));
  const needle = foldSearchText(input.q);
  const searched = needle
    ? payees.filter((payee) =>
        foldSearchText(
          [payee.name, ...payee.workers.map((worker) => worker.name)].join(' '),
        ).includes(needle),
      )
    : payees;
  // Price only the payees that can be shown (status filter needs each summary).
  const rows: Array<
    PayeeSummary & ReturnType<typeof summarize> & { payable: boolean; interval: PayInterval | null }
  > = [];
  let matched = 0;
  for (const payee of searched) {
    const ids = payee.workers.map((worker) => worker.id);
    const scope = { workerIds: ids, periodStart: input.start, periodEnd: input.end };
    const summary = summarize(
      context.v3.subcontractorSettlementPreview(context.principal, scope),
      settlementsFor(context.sqlite, ids, input.start, input.end),
      input,
      context.v3.subcontractorSettlementExtras(context.principal, scope),
    );
    if (input.status !== 'all' && summary.status !== input.status) continue;
    matched += 1;
    if (rows.length < input.limit)
      rows.push({
        ...payee,
        ...summary,
        payable: isPayableSubcontractor(payee.kind),
        interval: payeeInterval(context.sqlite, payee.key),
      });
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
        ? (
            context.sqlite.prepare('SELECT name FROM supplier WHERE id=?').get(id) as
              | { name: string }
              | undefined
          )?.name
        : (() => {
            const person = context.sqlite
              .prepare(
                "SELECT name,email FROM user WHERE id=? AND role IN ('worker','project_manager')",
              )
              .get(id) as { name: string; email: string | null } | undefined;
            return person ? personDisplayName(person.name, person.email) || person.name : undefined;
          })();
    if (!name) return null;
    payee = { key: input.payee, kind, name, workers: [], minutes: 0 };
  }
  const ids = payee.workers.map((worker) => worker.id);
  const workerNames = new Map(payee.workers.map((worker) => [worker.id, worker.name]));
  const entries = context.v3
    .subcontractorSettlementPreview(context.principal, {
      workerIds: ids,
      periodStart: input.start,
      periodEnd: input.end,
    })
    // Display names on screen and in exports, never the login.
    .map((entry) => ({
      ...entry,
      workerName: workerNames.get(entry.workerId) ?? entry.workerName,
    }));
  const settlements = settlementsFor(context.sqlite, ids, input.start, input.end);
  const extras = context.v3.subcontractorSettlementExtras(context.principal, {
    workerIds: ids,
    periodStart: input.start,
    periodEnd: input.end,
  });
  const workers = payee.workers.map((worker) => {
    const own = entries.filter((entry) => entry.workerId === worker.id);
    const ownExtras = extras.filter((group) => group.workerId === worker.id);
    const ownSettlements = settlements.filter((row) => row.worker_id === worker.id);
    return {
      id: worker.id,
      name: worker.name,
      minutes: worker.minutes,
      entries: own,
      settled: totalsByCurrency(
        ownSettlements.map((row) => ({
          currency: row.currency,
          minorUnits: BigInt(row.amount_minor),
        })),
      ).map((row) => ({ currency: row.currency, minor: row.minorUnits.toString() })),
      estimate: totalsByCurrency([
        ...own
          .filter((entry) => entry.amountMinor !== null)
          .map((entry) => ({ currency: entry.currency, minorUnits: BigInt(entry.amountMinor!) })),
        ...ownExtras.flatMap((group) =>
          group.charges.map((charge) => ({
            currency: charge.currency,
            minorUnits: charge.amountMinor,
          })),
        ),
      ]).map((row) => ({ currency: row.currency, minor: row.minorUnits.toString() })),
      extras: extraRows(ownExtras),
    };
  });
  return {
    payee,
    workers,
    entries,
    ...summarize(entries, settlements, input, extras),
    extras: extraRows(extras),
    payable: isPayableSubcontractor(payee.kind),
    interval: payeeInterval(context.sqlite, payee.key),
  };
}

export class SettlementActionError extends Error {}
export const INTERNAL_PAID_VIA_COMPENSATION =
  'J&A workers are paid through their compensation settlements, not in the subcontractor settlement';

/** Approve: create (or confirm) one compensation settlement per worker × project in the period. */
export function approveSettlement(
  context: SettlementContext,
  input: Readonly<{ payee: PayeeKey; start: string; end: string }>,
) {
  const detail = settlementDetail(context, input);
  if (!detail || detail.entries.length === 0)
    throw new SettlementActionError('No approved hours to settle');
  if (!detail.payable) throw new SettlementActionError(INTERNAL_PAID_VIA_COMPENSATION);
  if (detail.issues > 0) throw new SettlementActionError('Set the missing pay rates first');
  const allSettlements = settlementsFor(
    context.sqlite,
    detail.payee.workers.map((worker) => worker.id),
    input.start,
    input.end,
  );
  // Pairs whose hours are already covered by a settled period (any length) are not settled again.
  const pairs = [
    ...new Set(
      detail.entries
        .filter((entry) => !coveringSettlement(allSettlements, entry))
        .map((entry) => `${entry.workerId}|${entry.projectId}`),
    ),
  ];
  let created = 0;
  for (const pair of pairs) {
    const [workerId, projectId] = pair.split('|') as [string, string];
    // Settle the part of the week covered by the worker's assignment.
    const member = context.sqlite
      .prepare(
        `SELECT MAX(starts_on) starts_on, MIN(COALESCE(ends_on,'9999-12-31')) ends_on FROM project_member
          WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)`,
      )
      .get(projectId, workerId, input.end, input.start) as {
      starts_on: string | null;
      ends_on: string | null;
    };
    const periodStart =
      member.starts_on && member.starts_on > input.start ? member.starts_on : input.start;
    const periodEnd = member.ends_on && member.ends_on < input.end ? member.ends_on : input.end;
    const result = context.v3.settleCompensation(context.principal, {
      workerId,
      projectId,
      periodStart,
      periodEnd,
    });
    created += result.length;
  }
  return { created };
}

/** Mark as paid: record one payment per open settlement for the remaining amount (audited, idempotent). */
export function markSettlementPaid(
  context: SettlementContext,
  input: Readonly<{
    payee: PayeeKey;
    start: string;
    end: string;
    paidOn: string;
    reference: string;
    requestKey: string;
  }>,
) {
  const detail = settlementDetail(context, input);
  if (!detail) throw new SettlementActionError('Subcontractor not found');
  if (!detail.payable) throw new SettlementActionError(INTERNAL_PAID_VIA_COMPENSATION);
  if (detail.status === 'draft') throw new SettlementActionError('Approve the settlement first');
  const [kind, payeeId] = input.payee.split(':') as ['supplier' | 'person', string];
  const ids = detail.payee.workers.map((worker) => worker.id);
  let recorded = 0;
  // Only settlements of this week are paid here; a longer period is paid where it was settled.
  for (const row of withinWeek(
    settlementsFor(context.sqlite, ids, input.start, input.end),
    input.start,
    input.end,
  )) {
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
