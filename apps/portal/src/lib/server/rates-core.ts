import type { DatabaseSync } from 'node:sqlite';
import type { V3Repository } from '@ja/database';
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

function assertNoSameDayOverride(
  sqlite: DatabaseSync,
  memberId: string,
  date: string,
  column: 'client_labor_rate_id' | 'compensation_rule_id' | 'internal_cost_rule_id',
) {
  const existing = sqlite
    .prepare(
      `SELECT 1 FROM assignment_rate_override WHERE project_member_id=? AND effective_from=? AND ${column} IS NOT NULL LIMIT 1`,
    )
    .get(memberId, date);
  if (existing) throw new RateSaveError('same_day');
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
  assertNoSameDayOverride(sqlite, member.id, input.date, 'client_labor_rate_id');
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
      if (currentRule && currentRule.effective_from === date) throw new RateSaveError('same_day');
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
    if (!payUnchanged) {
      assertNoSameDayOverride(sqlite, member.id, date, 'compensation_rule_id');
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
    if (!costUnchanged) {
      assertNoSameDayOverride(sqlite, member.id, date, 'internal_cost_rule_id');
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
    assertNoSameDayOverride(sqlite, member.id, date, 'internal_cost_rule_id');
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
