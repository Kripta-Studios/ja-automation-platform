import type { DatabaseSync } from 'node:sqlite';
import { recordAuditEvent, type V3Repository } from '@ja/database';
import type { Principal } from '@ja/domain';
import { withAssignmentFinanceTransaction } from './actions/assignment-finance';

/**
 * "Rates" screen commands. Each save is one transaction built only from the
 * existing audited V3 commands (create / supersede rule, dated assignment
 * override). Financial history is never edited or deleted: a new rate starts on
 * its date and earlier dates keep the rate they had.
 */
export type RateSaveCode =
  | 'invalid_amount'
  | 'invalid_date'
  | 'invalid_project'
  | 'invalid_person'
  | 'not_on_project'
  | 'same_day'
  | 'already_invoiced'
  | 'already_settled'
  | 'more_specific'
  | 'forbidden'
  | 'failed';

export class RateSaveError extends Error {
  constructor(readonly code: RateSaveCode) {
    super(code);
  }
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export function amountMinor(value: unknown): bigint {
  const text = String(value ?? '')
    .trim()
    .replace(/\s/gu, '')
    .replace(',', '.');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/u.test(text)) throw new RateSaveError('invalid_amount');
  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor <= 0n) throw new RateSaveError('invalid_amount');
  return minor;
}

export function validDate(value: unknown): string {
  const text = String(value ?? '');
  if (!datePattern.test(text) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text)
    throw new RateSaveError('invalid_date');
  return text;
}

type ClientRuleRow = {
  id: string;
  worker_id: string | null;
  category: string | null;
  rate_basis: string;
  hourly_rate_minor: string;
  unit_rate_minor: string | null;
  overtime_method: 'NONE' | 'FIXED_RATE' | 'BASE_RATE_MULTIPLIER' | 'FIXED_ADDITION_PER_HOUR';
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: string | null;
  eligible_for_percentage: number;
  effective_from: string;
  effective_to: string | null;
};

const clientRule = (sqlite: DatabaseSync, id: string | null | undefined) =>
  id
    ? (sqlite
        .prepare(
          `SELECT id,worker_id,category,rate_basis,CAST(hourly_rate_minor AS TEXT) hourly_rate_minor,
                  CAST(unit_rate_minor AS TEXT) unit_rate_minor,overtime_method,overtime_multiplier_bps,
                  CAST(overtime_rate_minor AS TEXT) overtime_rate_minor,eligible_for_percentage,
                  effective_from,effective_to
             FROM client_labor_rate WHERE id=?`,
        )
        .get(id) as ClientRuleRow | undefined)
    : undefined;

const clientAmount = (rule: ClientRuleRow) =>
  BigInt((rule.rate_basis === 'hourly' ? rule.hourly_rate_minor : rule.unit_rate_minor) ?? '0');

function carriedClientTerms(rule: ClientRuleRow | undefined) {
  if (!rule || rule.rate_basis !== 'hourly') return {};
  return {
    overtimeMethod: rule.overtime_method,
    overtimeMultiplierBps: rule.overtime_multiplier_bps ?? undefined,
    overtimeRateMinor: rule.overtime_rate_minor === null ? undefined : BigInt(rule.overtime_rate_minor),
    eligibleForPercentage: rule.eligible_for_percentage === 1,
  };
}

function activeMember(sqlite: DatabaseSync, projectId: string, workerId: string, date: string) {
  return sqlite
    .prepare(
      `SELECT pm.id,pm.ends_on FROM project_member pm JOIN user u ON u.id=pm.user_id
        WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active' AND u.status='active'
          AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
        ORDER BY pm.starts_on DESC,pm.id LIMIT 1`,
    )
    .get(projectId, workerId, date, date) as { id: string; ends_on: string | null } | undefined;
}

export function assertNotInvoiced(sqlite: DatabaseSync, projectId: string, date: string) {
  const billed = sqlite
    .prepare(
      "SELECT 1 FROM invoice WHERE project_id=? AND period_end>=? AND state NOT IN ('draft','void','cancelled','superseded') LIMIT 1",
    )
    .get(projectId, date);
  if (billed) throw new RateSaveError('already_invoiced');
}

/** The person's rule that already starts on `date` (set through a dated override), if any. */
function sameDayOverrideRule(
  sqlite: DatabaseSync,
  memberId: string,
  date: string,
  column: 'client_labor_rate_id' | 'compensation_rule_id' | 'internal_cost_rule_id',
): string | null {
  const existing = sqlite
    .prepare(
      `SELECT ${column} rule_id FROM assignment_rate_override WHERE project_member_id=? AND effective_from=? AND ${column} IS NOT NULL
        ORDER BY created_at DESC,id DESC LIMIT 1`,
    )
    .get(memberId, date) as { rule_id: string } | undefined;
  return existing?.rule_id ?? null;
}

/**
 * Same-day replacement: a rate that starts on the same day for the same person/project is
 * corrected in place instead of being refused (Owner/Finance only). Callers have already
 * checked that no approved or issued invoice covers that date (`assertNotInvoiced`) or, for
 * pay, that no settlement does, so no finalized document used the replaced amount.
 */
function replaceSameDay(
  sqlite: DatabaseSync,
  principal: Principal,
  kind: 'client' | 'pay' | 'cost',
  ruleId: string,
  values: { minor: bigint; basis: 'hourly' | 'daily' },
) {
  if (!['owner_admin', 'finance_admin'].includes(principal.role)) throw new RateSaveError('forbidden');
  const table = kind === 'client' ? 'client_labor_rate' : kind === 'pay' ? 'compensation_rule' : 'internal_cost_rule';
  const before = sqlite
    .prepare(
      kind === 'client'
        ? 'SELECT rate_basis basis,CAST(hourly_rate_minor AS TEXT) hourly,CAST(unit_rate_minor AS TEXT) unit FROM client_labor_rate WHERE id=?'
        : kind === 'pay'
          ? 'SELECT rate_basis basis,CAST(rate_minor AS TEXT) hourly,rule_type unit FROM compensation_rule WHERE id=?'
          : "SELECT 'hourly' basis,CAST(hourly_rate_minor AS TEXT) hourly,NULL unit FROM internal_cost_rule WHERE id=?",
    )
    .get(ruleId) as Record<string, string | null> | undefined;
  if (!before) throw new RateSaveError('failed');
  const timestamp = new Date().toISOString();
  const minor = values.minor.toString();
  const changed =
    kind === 'client'
      ? sqlite
          .prepare(
            'UPDATE client_labor_rate SET rate_basis=?,hourly_rate_minor=?,unit_rate_minor=?,updated_at=?,version=version+1 WHERE id=?',
          )
          .run(
            values.basis,
            values.basis === 'hourly' ? minor : '0',
            values.basis === 'hourly' ? null : minor,
            timestamp,
            ruleId,
          )
      : kind === 'pay'
        ? sqlite
            .prepare(
              'UPDATE compensation_rule SET rate_basis=?,rule_type=?,rate_minor=?,updated_at=?,version=version+1 WHERE id=?',
            )
            .run(values.basis, values.basis === 'daily' ? 'Daily' : 'Hourly', minor, timestamp, ruleId)
        : sqlite
            .prepare('UPDATE internal_cost_rule SET hourly_rate_minor=?,updated_at=?,version=version+1 WHERE id=?')
            .run(minor, timestamp, ruleId);
  if (changed.changes !== 1) throw new RateSaveError('failed');
  recordAuditEvent(
    sqlite,
    principal,
    kind === 'client'
      ? 'client_rate.replace_same_day'
      : kind === 'pay'
        ? 'compensation_rule.replace_same_day'
        : 'internal_cost.replace_same_day',
    table,
    ruleId,
    { before, after: { basis: values.basis, minor }, reason: 'Replaced a rate that starts the same day' },
  );
}

/** Give one person on one project their own client rate from `date`. */
function setPersonClientRate(
  sqlite: DatabaseSync,
  v3: V3Repository,
  principal: Principal,
  input: { projectId: string; workerId: string; currency: string; minor: bigint; basis: 'hourly' | 'daily'; date: string },
): boolean {
  const member = activeMember(sqlite, input.projectId, input.workerId, input.date);
  if (!member) throw new RateSaveError('not_on_project');
  const terms = v3.resolveAssignmentCommercialTerms(
    principal,
    input.projectId,
    input.workerId,
    'regular',
    input.date,
  );
  const selected = clientRule(sqlite, terms.clientLaborRate?.id);
  if (selected && selected.rate_basis === input.basis && clientAmount(selected) === input.minor)
    return false;
  const sameDay = sameDayOverrideRule(sqlite, member.id, input.date, 'client_labor_rate_id');
  if (sameDay) {
    replaceSameDay(sqlite, principal, 'client', sameDay, { minor: input.minor, basis: input.basis });
    const replaced = v3.resolveAssignmentCommercialTerms(principal, input.projectId, input.workerId, 'regular', input.date);
    if (replaced.clientLaborRate?.id !== sameDay) throw new RateSaveError('more_specific');
    return true;
  }
  const created = v3.createClientLaborRate(principal, {
    projectId: input.projectId,
    workerId: input.workerId,
    currency: input.currency as never,
    ...carriedClientTerms(selected),
    rateBasis: input.basis,
    hourlyRateMinor: input.basis === 'hourly' ? input.minor : 0n,
    unitRateMinor: input.basis === 'hourly' ? undefined : input.minor,
    effectiveFrom: input.date,
    effectiveTo: member.ends_on || undefined,
  } as never);
  v3.createAssignmentRateOverride(principal, {
    projectMemberId: member.id,
    effectiveFrom: input.date,
    clientLaborRateId: created.id,
  } as never);
  const resolved = v3.resolveAssignmentCommercialTerms(
    principal,
    input.projectId,
    input.workerId,
    'regular',
    input.date,
  );
  if (resolved.clientLaborRate?.id !== created.id) throw new RateSaveError('more_specific');
  return true;
}

export function saveClientRate(
  sqlite: DatabaseSync,
  v3: V3Repository,
  principal: Principal,
  object: Record<string, unknown>,
) {
  const projectId = String(object.projectId ?? '');
  const workerId = String(object.workerId ?? '');
  if (!idPattern.test(projectId)) throw new RateSaveError('invalid_project');
  if (workerId && !idPattern.test(workerId)) throw new RateSaveError('invalid_person');
  const minor = amountMinor(object.amount);
  const basis = object.basis === 'daily' ? 'daily' : 'hourly';
  const date = validDate(object.effectiveFrom);
  const project = sqlite.prepare('SELECT currency FROM project WHERE id=?').get(projectId) as
    | { currency: string }
    | undefined;
  if (!project) throw new RateSaveError('invalid_project');
  return withAssignmentFinanceTransaction(sqlite, () => {
    assertNotInvoiced(sqlite, projectId, date);
    if (workerId) {
      const changed = setPersonClientRate(sqlite, v3, principal, {
        projectId,
        workerId,
        currency: project.currency,
        minor,
        basis,
        date,
      });
      return { changed: changed ? 1 : 0 };
    }
    // Project rate for everyone without a personal rate.
    const current = sqlite
      .prepare(
        `SELECT id FROM client_labor_rate
          WHERE project_id=? AND worker_id IS NULL AND category IS NULL
            AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
          ORDER BY effective_from DESC,id LIMIT 1`,
      )
      .get(projectId, date, date) as { id: string } | undefined;
    const currentRule = clientRule(sqlite, current?.id);
    let changed = 0;
    if (!currentRule || currentRule.rate_basis !== basis || clientAmount(currentRule) !== minor) {
      if (currentRule && currentRule.effective_from === date) {
        replaceSameDay(sqlite, principal, 'client', currentRule.id, { minor, basis });
        changed += 1;
      }
    }
    if (currentRule?.effective_from !== date && (!currentRule || currentRule.rate_basis !== basis || clientAmount(currentRule) !== minor)) {
      const input = {
        projectId,
        currency: project.currency,
        ...carriedClientTerms(currentRule),
        rateBasis: basis,
        hourlyRateMinor: basis === 'hourly' ? minor : 0n,
        unitRateMinor: basis === 'hourly' ? undefined : minor,
        effectiveFrom: date,
      } as never;
      // Close the previous project rate only when no person-specific setting points at it;
      // otherwise keep it open for them and let the newer date win for everyone else.
      const referenced =
        currentRule &&
        (sqlite
          .prepare(
            'SELECT 1 FROM assignment_rate_override WHERE client_labor_rate_id=? UNION ALL SELECT 1 FROM project_member WHERE client_bill_rule_id=? LIMIT 1',
          )
          .get(currentRule.id, currentRule.id) as unknown);
      if (currentRule && !referenced)
        v3.supersedeClientLaborRate(principal, currentRule.id, input);
      else v3.createClientLaborRate(principal, input);
      changed += 1;
    }
    if (object.applyToEveryone === 'on') {
      const members = sqlite
        .prepare(
          `SELECT pm.user_id FROM project_member pm JOIN user u ON u.id=pm.user_id
            WHERE pm.project_id=? AND pm.status='active' AND u.status='active'
              AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)`,
        )
        .all(projectId, date, date) as Array<{ user_id: string }>;
      for (const member of members) {
        const terms = v3.resolveAssignmentCommercialTerms(
          principal,
          projectId,
          member.user_id,
          'regular',
          date,
        );
        if (terms.clientLaborRate?.provenance.source === 'project_default') continue;
        if (
          setPersonClientRate(sqlite, v3, principal, {
            projectId,
            workerId: member.user_id,
            currency: project.currency,
            minor,
            basis,
            date,
          })
        )
          changed += 1;
      }
    }
    return { changed };
  });
}

type PayRuleRow = {
  id: string;
  rule_type: string;
  rate_basis: string;
  rate_minor: string;
  daily_guarantee_minutes: number | null;
  settlement_trigger: string;
  overtime_method: string;
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: string | null;
  weekend_method: string;
  travel_method: string;
  standby_method: string;
};

export function saveWorkerPay(
  sqlite: DatabaseSync,
  v3: V3Repository,
  principal: Principal,
  object: Record<string, unknown>,
) {
  const projectId = String(object.projectId ?? '');
  const workerId = String(object.workerId ?? '');
  if (!idPattern.test(projectId)) throw new RateSaveError('invalid_project');
  if (!idPattern.test(workerId)) throw new RateSaveError('invalid_person');
  const minor = amountMinor(object.amount);
  const basis = object.basis === 'daily' ? 'daily' : 'hourly';
  const date = validDate(object.effectiveFrom);
  const alsoCost = object.alsoCost === 'on' && basis === 'hourly';
  const project = sqlite.prepare('SELECT currency FROM project WHERE id=?').get(projectId) as
    | { currency: string }
    | undefined;
  if (!project) throw new RateSaveError('invalid_project');
  return withAssignmentFinanceTransaction(sqlite, () => {
    const member = activeMember(sqlite, projectId, workerId, date);
    if (!member) throw new RateSaveError('not_on_project');
    const settled = sqlite
      .prepare(
        "SELECT 1 FROM compensation_settlement WHERE project_id=? AND worker_id=? AND period_end>=? AND state IN ('approved','settled') LIMIT 1",
      )
      .get(projectId, workerId, date);
    if (settled) throw new RateSaveError('already_settled');
    const terms = v3.resolveAssignmentCommercialTerms(principal, projectId, workerId, 'regular', date);
    const selected = terms.workerCompensation
      ? (sqlite
          .prepare(
            `SELECT id,rule_type,rate_basis,CAST(rate_minor AS TEXT) rate_minor,daily_guarantee_minutes,
                    settlement_trigger,overtime_method,overtime_multiplier_bps,
                    CAST(overtime_rate_minor AS TEXT) overtime_rate_minor,weekend_method,travel_method,standby_method
               FROM compensation_rule WHERE id=?`,
          )
          .get(terms.workerCompensation.id) as PayRuleRow | undefined)
      : undefined;
    const ruleType = basis === 'daily' ? 'Daily' : 'Hourly';
    const payUnchanged =
      selected &&
      selected.rule_type === ruleType &&
      selected.rate_basis === basis &&
      BigInt(selected.rate_minor ?? '0') === minor;
    const costUnchanged =
      !alsoCost ||
      (terms.internalCost !== null && BigInt(String(terms.internalCost.hourlyRateMinor)) === minor);
    if (payUnchanged && costUnchanged) return { changed: 0 };
    let payRuleId: string | undefined;
    let costRuleId: string | undefined;
    const samePay = payUnchanged ? null : sameDayOverrideRule(sqlite, member.id, date, 'compensation_rule_id');
    const sameCost = costUnchanged ? null : sameDayOverrideRule(sqlite, member.id, date, 'internal_cost_rule_id');
    if (samePay) replaceSameDay(sqlite, principal, 'pay', samePay, { minor, basis });
    if (sameCost) {
      assertNotInvoiced(sqlite, projectId, date);
      replaceSameDay(sqlite, principal, 'cost', sameCost, { minor, basis: 'hourly' });
    }
    if (!payUnchanged && !samePay) {
      const carry =
        selected && selected.rule_type === ruleType
          ? {
              dailyGuaranteeMinutes: selected.daily_guarantee_minutes ?? undefined,
              settlementTrigger: selected.settlement_trigger,
              overtimeMethod: selected.overtime_method,
              overtimeMultiplierBps: selected.overtime_multiplier_bps ?? undefined,
              overtimeRateMinor:
                selected.overtime_rate_minor === null ? undefined : BigInt(selected.overtime_rate_minor),
              weekendMethod: selected.weekend_method,
              travelMethod: selected.travel_method,
              standbyMethod: selected.standby_method,
            }
          : {};
      payRuleId = v3.createCompensationRule(principal, {
        workerId,
        projectId,
        currency: project.currency,
        ...carry,
        ruleType,
        rateBasis: basis,
        rateMinor: minor,
        effectiveFrom: date,
        effectiveTo: member.ends_on || undefined,
      } as never).id;
    }
    if (!costUnchanged && !sameCost) {
      costRuleId = v3.createInternalCostRule(principal, {
        workerId,
        projectId,
        currency: project.currency,
        hourlyRateMinor: minor,
        costMethod: 'loaded_hourly',
        effectiveFrom: date,
        effectiveTo: member.ends_on || undefined,
      } as never).id;
    }
    if (payRuleId || costRuleId)
      v3.createAssignmentRateOverride(principal, {
        projectMemberId: member.id,
        effectiveFrom: date,
        compensationRuleId: payRuleId,
        internalCostRuleId: costRuleId,
      } as never);
    const resolved = v3.resolveAssignmentCommercialTerms(principal, projectId, workerId, 'regular', date);
    if (
      (payRuleId && resolved.workerCompensation?.id !== payRuleId) ||
      (costRuleId && resolved.internalCost?.id !== costRuleId)
    )
      throw new RateSaveError('more_specific');
    return { changed: 1 };
  });
}

/** Last day covered by a non-draft, live invoice of the project (null when none). */
export function lastIssuedThrough(sqlite: DatabaseSync, projectId: string): string | null {
  const row = sqlite
    .prepare(
      "SELECT MAX(period_end) through FROM invoice WHERE project_id=? AND state NOT IN ('draft','void','cancelled','superseded')",
    )
    .get(projectId) as { through: string | null } | undefined;
  return row?.through ?? null;
}

function nextDay(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/**
 * Point-of-need save used by invoice preparation: dated from the oldest affected work
 * (so the rate covers the invoice period). When an issued invoice already covers that
 * date, the rate starts the day after the last issued period instead; issued history is
 * never re-priced. Returns the date actually used.
 */
export function saveRateFromDate(
  kind: 'client' | 'pay' | 'cost',
  sqlite: DatabaseSync,
  v3: V3Repository,
  principal: Principal,
  object: Record<string, unknown> & { projectId: string; effectiveFrom: string },
): { changed: number; effectiveFrom: string; shifted: boolean } {
  const save = kind === 'client' ? saveClientRate : kind === 'pay' ? saveWorkerPay : saveWorkerCost;
  try {
    return { ...save(sqlite, v3, principal, object), effectiveFrom: object.effectiveFrom, shifted: false };
  } catch (error) {
    if (!(error instanceof RateSaveError) || error.code !== 'already_invoiced') throw error;
    const through = lastIssuedThrough(sqlite, object.projectId);
    if (!through || through < object.effectiveFrom) throw error;
    const effectiveFrom = nextDay(through);
    return { ...save(sqlite, v3, principal, { ...object, effectiveFrom }), effectiveFrom, shifted: true };
  }
}

/** Internal cost only (never shown to the client); pay stays as configured. */
export function saveWorkerCost(
  sqlite: DatabaseSync,
  v3: V3Repository,
  principal: Principal,
  object: Record<string, unknown>,
) {
  const projectId = String(object.projectId ?? '');
  const workerId = String(object.workerId ?? '');
  if (!idPattern.test(projectId)) throw new RateSaveError('invalid_project');
  if (!idPattern.test(workerId)) throw new RateSaveError('invalid_person');
  const minor = amountMinor(object.amount);
  const date = validDate(object.effectiveFrom);
  const project = sqlite.prepare('SELECT currency FROM project WHERE id=?').get(projectId) as
    | { currency: string }
    | undefined;
  if (!project) throw new RateSaveError('invalid_project');
  return withAssignmentFinanceTransaction(sqlite, () => {
    const member = activeMember(sqlite, projectId, workerId, date);
    if (!member) throw new RateSaveError('not_on_project');
    const terms = v3.resolveAssignmentCommercialTerms(principal, projectId, workerId, 'regular', date);
    if (terms.internalCost !== null && BigInt(String(terms.internalCost.hourlyRateMinor)) === minor)
      return { changed: 0 };
    const sameCost = sameDayOverrideRule(sqlite, member.id, date, 'internal_cost_rule_id');
    if (sameCost) {
      assertNotInvoiced(sqlite, projectId, date);
      replaceSameDay(sqlite, principal, 'cost', sameCost, { minor, basis: 'hourly' });
      return { changed: 1 };
    }
    const costRuleId = v3.createInternalCostRule(principal, {
      workerId,
      projectId,
      currency: project.currency,
      hourlyRateMinor: minor,
      costMethod: 'loaded_hourly',
      effectiveFrom: date,
      effectiveTo: member.ends_on || undefined,
    } as never).id;
    v3.createAssignmentRateOverride(principal, {
      projectMemberId: member.id,
      effectiveFrom: date,
      internalCostRuleId: costRuleId,
    } as never);
    const resolved = v3.resolveAssignmentCommercialTerms(principal, projectId, workerId, 'regular', date);
    if (resolved.internalCost?.id !== costRuleId) throw new RateSaveError('more_specific');
    return { changed: 1 };
  });
}
