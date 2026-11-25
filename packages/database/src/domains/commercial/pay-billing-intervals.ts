import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, newId, type Principal } from '@ja/domain';
import {
  isPeriodicCadence,
  isStrictIsoCalendarDate,
  nextPeriodForCadence,
  PAY_INTERVALS,
  type BillingCadence,
  type DateRange,
  type PayInterval,
} from '@ja/billing-engine';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';

/**
 * Pay and billing intervals (owner request 2026-11-25, migration 0094).
 *
 * - Pay: how often a person is paid. A person default, and an optional override per
 *   assignment. It only chooses which period My Pay, the owner's worker pay review and the
 *   settlements open with; it never changes an amount.
 * - Billing: a client default (weekly, every 2 weeks, twice a month, monthly with an optional
 *   cutoff day, per milestone, manual). A project's billing setup (its billing streams) keeps
 *   its own interval; the client value is the default for a new project billing setup.
 *
 * Settings are append-only versions; the highest version is in force.
 */

export type ClientBillingCadence = Exclude<BillingCadence, 'custom'>;
export const CLIENT_BILLING_CADENCES: readonly ClientBillingCadence[] = [
  'weekly',
  'every_14_days',
  'semi_monthly',
  'monthly',
  'milestone',
  'manual',
];

export type PayIntervalSetting = Readonly<{
  interval: PayInterval | null;
  anchorDate: string | null;
  version: number;
  createdAt: string;
}>;

export type EffectivePayInterval = Readonly<{
  interval: PayInterval | null;
  anchorDate: string | null;
  /** Where the interval comes from: the assignment, the person, or nothing set. */
  source: 'assignment' | 'person' | 'none';
}>;

export type NextPay = EffectivePayInterval &
  Readonly<{
    period: DateRange | null;
    lastPaidEnd: string | null;
  }>;

export type ClientBillingInterval = Readonly<{
  cadence: ClientBillingCadence | null;
  anchorDate: string | null;
  monthlyCutoffDay: number | null;
  version: number;
  createdAt: string;
}>;

type PayRow = {
  pay_interval: string | null;
  anchor_date: string | null;
  version: number;
  created_at: string;
};

function payView(row: PayRow | undefined): PayIntervalSetting | null {
  if (!row) return null;
  return {
    interval: (row.pay_interval as PayInterval | null) ?? null,
    anchorDate: row.anchor_date ?? null,
    version: Number(row.version),
    createdAt: row.created_at,
  };
}

function latestPay(sqlite: DatabaseSync, scopeKey: string): PayIntervalSetting | null {
  return payView(
    sqlite
      .prepare(
        `SELECT pay_interval,anchor_date,version,created_at FROM pay_interval_setting
          WHERE scope_key=? ORDER BY version DESC LIMIT 1`,
      )
      .get(scopeKey) as PayRow | undefined,
  );
}

export function personPayInterval(sqlite: DatabaseSync, userId: string): PayIntervalSetting | null {
  return latestPay(sqlite, `person:${userId}`);
}

export function assignmentPayInterval(
  sqlite: DatabaseSync,
  projectMemberId: string,
): PayIntervalSetting | null {
  return latestPay(sqlite, `assignment:${projectMemberId}`);
}

/** Assignment override, else the person default, else nothing set. */
export function effectivePayInterval(
  sqlite: DatabaseSync,
  userId: string,
  projectMemberId?: string | null,
): EffectivePayInterval {
  const own = projectMemberId ? assignmentPayInterval(sqlite, projectMemberId) : null;
  if (own?.interval)
    return { interval: own.interval, anchorDate: own.anchorDate, source: 'assignment' };
  const person = personPayInterval(sqlite, userId);
  if (person?.interval)
    return { interval: person.interval, anchorDate: person.anchorDate, source: 'person' };
  return { interval: null, anchorDate: null, source: 'none' };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * The period the next pay of this person covers: after the last settled pay period, at the
 * earliest approved hours not settled yet (looking back one year), otherwise the period in
 * progress. With a project, only that project's settlements and hours count.
 */
export function nextPayPeriod(
  sqlite: DatabaseSync,
  userId: string,
  options: Readonly<{
    today?: string;
    projectId?: string | null;
    projectMemberId?: string | null;
    fallback?: PayInterval;
  }> = {},
): NextPay {
  const today = options.today ?? isoToday();
  const effective = effectivePayInterval(sqlite, userId, options.projectMemberId);
  const interval = effective.interval ?? options.fallback ?? null;
  const project = options.projectId ?? null;
  const last = sqlite
    .prepare(
      `SELECT MAX(period_end) day FROM compensation_settlement
        WHERE worker_id=? AND state='settled' AND (? IS NULL OR project_id=?)`,
    )
    .get(userId, project, project) as { day: string | null } | undefined;
  const lastPaidEnd = last?.day ?? null;
  if (!interval) return { ...effective, period: null, lastPaidEnd };
  const since =
    lastPaidEnd && lastPaidEnd > shiftDays(today, -366) ? lastPaidEnd : shiftDays(today, -366);
  const open = sqlite
    .prepare(
      `SELECT MIN(t.work_date) day FROM time_entry t
        WHERE t.worker_id=? AND (? IS NULL OR t.project_id=?) AND t.work_date>?
          AND t.approval_state IN ('approved','locked') AND t.minutes>0
          AND NOT EXISTS (SELECT 1 FROM compensation_settlement s
            WHERE s.worker_id=t.worker_id AND s.project_id=t.project_id AND s.state='settled'
              AND s.period_start<=t.work_date AND s.period_end>=t.work_date)`,
    )
    .get(userId, project, project, since) as { day: string | null } | undefined;
  return {
    ...effective,
    interval,
    period: nextPeriodForCadence(interval, today, {
      anchorDate: effective.anchorDate ?? undefined,
      lastCoveredEnd: lastPaidEnd,
      firstOpenDate: open?.day ?? null,
    }),
    lastPaidEnd,
  };
}

type ClientRow = {
  cadence_type: string | null;
  anchor_date: string | null;
  monthly_cutoff_day: number | null;
  version: number;
  created_at: string;
};

export function clientBillingInterval(
  sqlite: DatabaseSync,
  clientId: string,
): ClientBillingInterval | null {
  const row = sqlite
    .prepare(
      `SELECT cadence_type,anchor_date,monthly_cutoff_day,version,created_at FROM client_billing_interval
        WHERE client_id=? ORDER BY version DESC LIMIT 1`,
    )
    .get(clientId) as ClientRow | undefined;
  if (!row) return null;
  return {
    cadence: (row.cadence_type as ClientBillingCadence | null) ?? null,
    anchorDate: row.anchor_date ?? null,
    monthlyCutoffDay: row.monthly_cutoff_day == null ? null : Number(row.monthly_cutoff_day),
    version: Number(row.version),
    createdAt: row.created_at,
  };
}

export type BillingRuleCadence = Readonly<{
  id: string;
  project_id: string;
  cadence_type: string;
  anchor_date?: string | null;
  monthly_cutoff_day?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
}>;

/**
 * The period the next invoice of a billing stream covers: after the last invoice of the stream
 * (void ones do not count), at the earliest approved work not invoiced yet if that is later,
 * otherwise the period in progress. Milestone/manual streams have no period (null).
 */
export function nextInvoicePeriod(
  sqlite: DatabaseSync,
  rule: BillingRuleCadence,
  today = isoToday(),
): DateRange | null {
  const cadence = String(rule.cadence_type) as BillingCadence;
  if (!isPeriodicCadence(cadence)) return null;
  if (cadence === 'every_14_days' && !rule.anchor_date) return null;
  const last = sqlite
    .prepare(
      `SELECT MAX(period_end) day FROM invoice
        WHERE billing_rule_id=? AND state NOT IN ('void','cancelled','superseded') AND period_end IS NOT NULL`,
    )
    .get(rule.id) as { day: string | null } | undefined;
  const from =
    rule.effective_from && isStrictIsoCalendarDate(rule.effective_from)
      ? rule.effective_from
      : null;
  const lastCoveredEnd = last?.day ?? (from ? shiftDays(from, -1) : null);
  const since = lastCoveredEnd ?? shiftDays(today, -366);
  const open = sqlite
    .prepare(
      `SELECT MIN(t.work_date) day FROM time_entry t
        WHERE t.project_id=? AND t.work_date>? AND (? IS NULL OR t.work_date<=?)
          AND t.approval_state IN ('approved','locked') AND t.minutes>0
          AND NOT EXISTS (SELECT 1 FROM invoice_source s WHERE s.source_type='time' AND s.source_id=t.id)`,
    )
    .get(rule.project_id, since, rule.effective_to ?? null, rule.effective_to ?? null) as
    | { day: string | null }
    | undefined;
  try {
    return nextPeriodForCadence(cadence, today, {
      anchorDate: rule.anchor_date ?? undefined,
      monthlyCutoffDay:
        rule.monthly_cutoff_day == null ? undefined : Number(rule.monthly_cutoff_day),
      lastCoveredEnd,
      firstOpenDate: open?.day ?? null,
    });
  } catch {
    return null;
  }
}

function anchor(value: string | null | undefined, interval: string | null): string | null {
  if (interval !== 'every_14_days' || !value) return null;
  if (!isStrictIsoCalendarDate(value)) throw new ValidationError('Choose a valid first day');
  return value;
}

function reasonText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 2000) : null;
}

/** Owner / Finance: these settings sit next to pay rates and client billing. */
export class PayBillingIntervalRepository {
  constructor(private readonly sqlite: DatabaseSync) {}

  private assertFinance(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
    assertLiveSession(this.sqlite, principal, AccessDeniedError);
    const current = this.sqlite
      .prepare('SELECT role,status FROM user WHERE id=?')
      .get(principal.userId) as { role: string; status: string } | undefined;
    if (
      !canManageBilling(principal) ||
      !current ||
      current.status !== 'active' ||
      !['owner_admin', 'finance_admin'].includes(current.role)
    )
      throw new AccessDeniedError('Owner or Finance role required');
  }

  private payInterval(value: unknown): PayInterval | null {
    if (value === null || value === undefined || value === '') return null;
    if (!(PAY_INTERVALS as readonly unknown[]).includes(value))
      throw new ValidationError('Choose how often this person is paid');
    return value as PayInterval;
  }

  /** Person default (who is paid how often). */
  setPersonInterval(
    principal: Principal,
    input: Readonly<{
      userId: string;
      interval: PayInterval | null;
      anchorDate?: string | null;
      expectedVersion: number;
      reason?: string;
    }>,
  ): PayIntervalSetting | null {
    this.assertFinance(principal);
    const interval = this.payInterval(input.interval);
    const anchorDate = anchor(input.anchorDate, interval);
    return runImmediateTransaction(this.sqlite, 'pay-interval-person', () => {
      const person = this.sqlite
        .prepare("SELECT id FROM user WHERE id=? AND role IN ('worker','project_manager')")
        .get(input.userId);
      if (!person) throw new ValidationError('Person not found');
      return this.write(principal, {
        scopeKey: `person:${input.userId}`,
        userId: input.userId,
        projectMemberId: null,
        interval,
        anchorDate,
        expectedVersion: input.expectedVersion,
        reason: reasonText(input.reason),
        action: 'worker.pay_interval_set',
        entityType: 'user',
        entityId: input.userId,
        projectId: null,
      });
    });
  }

  /** Assignment override; null = same as the person. */
  setAssignmentInterval(
    principal: Principal,
    input: Readonly<{
      projectMemberId: string;
      interval: PayInterval | null;
      anchorDate?: string | null;
      expectedVersion: number;
      reason?: string;
    }>,
  ): PayIntervalSetting | null {
    this.assertFinance(principal);
    const interval = this.payInterval(input.interval);
    const anchorDate = anchor(input.anchorDate, interval);
    return runImmediateTransaction(this.sqlite, 'pay-interval-assignment', () => {
      const member = this.sqlite
        .prepare('SELECT id,project_id,user_id FROM project_member WHERE id=?')
        .get(input.projectMemberId) as
        | { id: string; project_id: string; user_id: string }
        | undefined;
      if (!member) throw new ValidationError('Assignment not found');
      return this.write(principal, {
        scopeKey: `assignment:${member.id}`,
        userId: member.user_id,
        projectMemberId: member.id,
        interval,
        anchorDate,
        expectedVersion: input.expectedVersion,
        reason: reasonText(input.reason),
        action: 'assignment.pay_interval_set',
        entityType: 'project_member',
        entityId: member.id,
        projectId: member.project_id,
      });
    });
  }

  private write(
    principal: Principal,
    input: Readonly<{
      scopeKey: string;
      userId: string;
      projectMemberId: string | null;
      interval: PayInterval | null;
      anchorDate: string | null;
      expectedVersion: number;
      reason: string | null;
      action: string;
      entityType: string;
      entityId: string;
      projectId: string | null;
    }>,
  ): PayIntervalSetting | null {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
      throw new ValidationError('Current version required');
    const current = latestPay(this.sqlite, input.scopeKey);
    if ((current?.version ?? 0) !== input.expectedVersion)
      throw new ConflictError('This pay interval changed. Reload before saving.');
    const same =
      (current?.interval ?? null) === input.interval &&
      (current?.anchorDate ?? null) === input.anchorDate;
    if (same || (!current && input.interval === null)) return current;
    const id = newId();
    const version = (current?.version ?? 0) + 1;
    this.sqlite
      .prepare(
        `INSERT INTO pay_interval_setting(id,user_id,project_member_id,scope_key,version,pay_interval,
           anchor_date,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.userId,
        input.projectMemberId,
        input.scopeKey,
        version,
        input.interval,
        input.anchorDate,
        input.reason,
        principal.userId,
        new Date().toISOString(),
      );
    recordAuditEvent(this.sqlite, principal, input.action, input.entityType, input.entityId, {
      ...(input.projectId ? { projectId: input.projectId } : {}),
      workerId: input.userId,
      settingId: id,
      version,
      before: current ? { interval: current.interval, anchorDate: current.anchorDate } : null,
      after: { interval: input.interval, anchorDate: input.anchorDate },
      ...(input.reason ? { reason: input.reason } : {}),
    });
    return latestPay(this.sqlite, input.scopeKey);
  }

  /** Client default invoice interval. */
  setClientInterval(
    principal: Principal,
    input: Readonly<{
      clientId: string;
      cadence: ClientBillingCadence | null;
      anchorDate?: string | null;
      monthlyCutoffDay?: number | null;
      expectedVersion: number;
      reason?: string;
    }>,
  ): ClientBillingInterval | null {
    this.assertFinance(principal);
    const cadence =
      input.cadence === null || (input.cadence as string) === '' ? null : input.cadence;
    if (cadence !== null && !CLIENT_BILLING_CADENCES.includes(cadence))
      throw new ValidationError('Choose how often this client is invoiced');
    const anchorDate = anchor(input.anchorDate, cadence);
    if (cadence === 'every_14_days' && !anchorDate)
      throw new ValidationError('Choose the first day of a two-week period');
    const cutoff =
      cadence === 'monthly' && input.monthlyCutoffDay != null
        ? Number(input.monthlyCutoffDay)
        : null;
    if (cutoff !== null && (!Number.isInteger(cutoff) || cutoff < 1 || cutoff > 28))
      throw new ValidationError('The closing day must be from 1 to 28');
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
      throw new ValidationError('Current version required');
    const reason = reasonText(input.reason);
    return runImmediateTransaction(this.sqlite, 'client-billing-interval', () => {
      if (!this.sqlite.prepare('SELECT 1 FROM client WHERE id=?').get(input.clientId))
        throw new ValidationError('Client not found');
      const current = clientBillingInterval(this.sqlite, input.clientId);
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictError('This invoice interval changed. Reload before saving.');
      const same =
        (current?.cadence ?? null) === cadence &&
        (current?.anchorDate ?? null) === anchorDate &&
        (current?.monthlyCutoffDay ?? null) === cutoff;
      if (same || (!current && cadence === null)) return current;
      const id = newId();
      const version = (current?.version ?? 0) + 1;
      this.sqlite
        .prepare(
          `INSERT INTO client_billing_interval(id,client_id,version,cadence_type,anchor_date,
             monthly_cutoff_day,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          input.clientId,
          version,
          cadence,
          anchorDate,
          cutoff,
          reason,
          principal.userId,
          new Date().toISOString(),
        );
      recordAuditEvent(
        this.sqlite,
        principal,
        'client.billing_interval_set',
        'client',
        input.clientId,
        {
          clientId: input.clientId,
          settingId: id,
          version,
          before: current
            ? {
                cadence: current.cadence,
                anchorDate: current.anchorDate,
                monthlyCutoffDay: current.monthlyCutoffDay,
              }
            : null,
          after: { cadence, anchorDate, monthlyCutoffDay: cutoff },
          ...(reason ? { reason } : {}),
        },
      );
      return clientBillingInterval(this.sqlite, input.clientId);
    });
  }
}
