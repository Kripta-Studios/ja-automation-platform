import { clientLaborRatesEquivalent } from './client-rate-equivalence.ts';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { OvertimeMethod } from '@ja/billing-engine';
import type { Currency } from '@ja/money';

/** Operational date and category are inputs to every financial selection. */
export type CommercialTermsContext = Readonly<{
  projectId: string;
  workerId: string;
  workDate: string;
  category: string;
  activityCode?: string | null;
}>;

export type CommercialTermsIssue = Readonly<{
  code:
    | 'missing_assignment'
    | 'ambiguous_assignment'
    | 'missing_client_rate'
    | 'missing_compensation_rule'
    | 'missing_internal_cost_rule'
    | 'ambiguous_client_rate'
    | 'ambiguous_compensation_rule'
    | 'ambiguous_internal_cost_rule'
    | 'unavailable_client_override'
    | 'unavailable_compensation_override'
    | 'unavailable_internal_cost_override'
    | 'unavailable_assignment_client_rule'
    | 'unavailable_assignment_compensation_rule'
    | 'unavailable_assignment_internal_cost_rule';
  sourceIds: readonly string[];
  configurationPath: 'people' | 'finance';
}>;

export type RuleProvenance = Readonly<{
  ruleId: string;
  ruleVersion: number;
  source:
    | 'assignment_override'
    | 'assignment_rule'
    | 'worker_project'
    | 'project_default'
    | 'worker_global';
  assignmentId: string | null;
  assignmentVersion: number | null;
  overrideId: string | null;
  overrideVersion: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}>;

export type CompensationRuleRow = Readonly<{
  id: string;
  worker_id: string;
  project_id: string | null;
  currency: Currency;
  rate_minor: string;
  rate_basis: string;
  daily_guarantee_minutes: number | null;
  rule_type: string;
  percentage_bps: number | null;
  percentage_basis: string | null;
  settlement_trigger: string;
  overtime_method: OvertimeMethod;
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: string | null;
  weekend_method: string;
  travel_method: string;
  standby_method: string;
  effective_from: string;
  effective_to: string | null;
  version: number;
}>;

export type ClientLaborRateRow = Readonly<{
  id: string;
  project_id: string;
  worker_id: string | null;
  category: string | null;
  currency: Currency;
  hourly_rate_minor: string;
  rate_basis?: string;
  unit_rate_minor?: string | null;
  overtime_method: OvertimeMethod;
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: string | null;
  eligible_for_percentage: number;
  effective_from: string;
  effective_to: string | null;
  version: number;
}>;

export type InternalCostRuleRow = Readonly<{
  id: string;
  worker_id: string;
  project_id: string | null;
  currency: Currency;
  hourly_rate_minor: string;
  overtime_method: OvertimeMethod;
  overtime_multiplier_bps: number | null;
  overtime_rate_minor: string | null;
  effective_from: string;
  effective_to: string | null;
  version: number;
}>;

export type SelectedCommercialRule<T> = Readonly<{
  rule: T;
  provenance: RuleProvenance;
}>;

export type CommercialRuleResult<T> = Readonly<{
  selected: SelectedCommercialRule<T> | null;
  issues: readonly CommercialTermsIssue[];
}>;

export type AssignmentCommercialTerms = Readonly<{
  assignmentId: string | null;
  allowGlobalCompensation: boolean;
  allowGlobalInternalCost: boolean;
  clientLaborRate: SelectedCommercialRule<ClientLaborRateRow> | null;
  workerCompensation: SelectedCommercialRule<CompensationRuleRow> | null;
  internalCost: SelectedCommercialRule<InternalCostRuleRow> | null;
  issues: readonly CommercialTermsIssue[];
}>;

type RuleKind = 'client' | 'compensation' | 'internal';
type OverrideRow = Readonly<{
  id: string;
  version: number;
  time_category: string | null;
  activity_code: string | null;
  priority: number;
  effective_from: string;
  rule_id: string;
}>;

type AssignmentRuleRefs = Readonly<{
  id: string;
  version: number;
  client_bill_rule_id: string | null;
  worker_compensation_rule_id: string | null;
  internal_cost_rule_id: string | null;
  allow_global_compensation_fallback: number;
  allow_global_internal_cost_fallback: number;
}>;

type RuleWithScope = Readonly<{
  id: string;
  currency: Currency;
  worker_id: string | null;
  project_id: string | null;
  category?: string | null;
  effective_from: string;
  effective_to: string | null;
  version: number;
}>;

const SELECT = {
  client: `SELECT id,project_id,worker_id,category,currency,
    CAST(hourly_rate_minor AS TEXT) hourly_rate_minor,rate_basis,CAST(unit_rate_minor AS TEXT) unit_rate_minor,overtime_method,overtime_multiplier_bps,
    CAST(overtime_rate_minor AS TEXT) overtime_rate_minor,eligible_for_percentage,
    effective_from,effective_to,version FROM client_labor_rate`,
  compensation: `SELECT id,worker_id,project_id,currency,CAST(rate_minor AS TEXT) rate_minor,
    rate_basis,daily_guarantee_minutes,rule_type,percentage_bps,percentage_basis,
    settlement_trigger,overtime_method,overtime_multiplier_bps,
    CAST(overtime_rate_minor AS TEXT) overtime_rate_minor,weekend_method,travel_method,
    standby_method,effective_from,effective_to,version FROM compensation_rule`,
  internal: `SELECT id,worker_id,project_id,currency,
    CAST(hourly_rate_minor AS TEXT) hourly_rate_minor,overtime_method,overtime_multiplier_bps,
    CAST(overtime_rate_minor AS TEXT) overtime_rate_minor,effective_from,effective_to,version
    FROM internal_cost_rule`,
} as const;

const OVERRIDE_COLUMN = {
  client: 'client_labor_rate_id',
  compensation: 'compensation_rule_id',
  internal: 'internal_cost_rule_id',
} as const;

const ASSIGNMENT_COLUMN = {
  client: 'client_bill_rule_id',
  compensation: 'worker_compensation_rule_id',
  internal: 'internal_cost_rule_id',
} as const;

const ISSUE = {
  client: ['missing_client_rate', 'ambiguous_client_rate', 'unavailable_client_override'],
  compensation: [
    'missing_compensation_rule',
    'ambiguous_compensation_rule',
    'unavailable_compensation_override',
  ],
  internal: [
    'missing_internal_cost_rule',
    'ambiguous_internal_cost_rule',
    'unavailable_internal_cost_override',
  ],
} as const;

const UNAVAILABLE_ASSIGNMENT_ISSUE = {
  client: 'unavailable_assignment_client_rule',
  compensation: 'unavailable_assignment_compensation_rule',
  internal: 'unavailable_assignment_internal_cost_rule',
} as const;

/**
 * Rule resolution runs once per time entry in finance reads, so compiling the same few SQL
 * statements again for every entry dominated the Money screen. Statements are cached per
 * connection; they are read-only and executed synchronously, so reuse cannot interleave.
 */
const statementCache = new WeakMap<DatabaseSync, Map<string, StatementSync>>();
function statement(sqlite: DatabaseSync, sql: string): StatementSync {
  let cache = statementCache.get(sqlite);
  if (!cache) {
    cache = new Map();
    statementCache.set(sqlite, cache);
  }
  let prepared = cache.get(sql);
  if (!prepared) {
    prepared = sqlite.prepare(sql);
    cache.set(sql, prepared);
  }
  return prepared;
}

type MemberSpan = Readonly<{ id: string; starts_on: string; ends_on: string | null }>;
type RuleSnapshot = {
  rules: Partial<Record<RuleKind, Map<string, readonly RuleWithScope[]>>>;
  members: Map<string, readonly MemberSpan[]>;
  refs: Map<string, AssignmentRuleRefs>;
  overrides: Map<string, ReadonlyArray<OverrideRow & { effective_to: string | null }>>;
  projects: Map<string, { currency: Currency } | undefined>;
};
const ruleSnapshots = new WeakMap<DatabaseSync, RuleSnapshot>();

/**
 * Runs `work` with the rule tables of this connection read once and indexed in memory.
 * Finance reads resolve rules for every time entry; without the snapshot each resolution
 * scanned the whole compensation and internal-cost tables. Only for synchronous read-only
 * work: the snapshot is dropped when `work` returns, and nested calls reuse it.
 */
export function withCommercialRuleSnapshot<T>(sqlite: DatabaseSync, work: () => T): T {
  if (ruleSnapshots.has(sqlite)) return work();
  ruleSnapshots.set(sqlite, {
    rules: {},
    members: new Map(),
    refs: new Map(),
    overrides: new Map(),
    projects: new Map(),
  });
  try {
    return work();
  } finally {
    ruleSnapshots.delete(sqlite);
  }
}

function issue(
  code: CommercialTermsIssue['code'],
  sourceIds: readonly string[] = [],
): CommercialTermsIssue {
  return { code, sourceIds, configurationPath: code.includes('assignment') ? 'people' : 'finance' };
}

function assignmentIds(sqlite: DatabaseSync, context: CommercialTermsContext): readonly string[] {
  const snapshot = ruleSnapshots.get(sqlite);
  if (snapshot) {
    const key = JSON.stringify([context.projectId, context.workerId]);
    let members = snapshot.members.get(key);
    if (!members) {
      members = statement(
        sqlite,
        `SELECT id,starts_on,ends_on FROM project_member WHERE project_id=? AND user_id=?
            AND (status='active' OR (status='inactive' AND ends_on IS NOT NULL))
          ORDER BY starts_on DESC,id`,
      ).all(context.projectId, context.workerId) as MemberSpan[];
      snapshot.members.set(key, members);
    }
    return members
      .filter(
        (row) =>
          row.starts_on <= context.workDate &&
          (row.ends_on === null || row.ends_on >= context.workDate),
      )
      .map((row) => row.id);
  }
  return (
    statement(
      sqlite,
      `SELECT id FROM project_member WHERE project_id=? AND user_id=?
          AND (status='active' OR (status='inactive' AND ends_on IS NOT NULL))
          AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) ORDER BY starts_on DESC,id`,
    ).all(context.projectId, context.workerId, context.workDate, context.workDate) as {
      id: string;
    }[]
  ).map((row) => row.id);
}

function assignmentRefs(sqlite: DatabaseSync, id: string): AssignmentRuleRefs {
  const snapshot = ruleSnapshots.get(sqlite);
  const cached = snapshot?.refs.get(id);
  if (cached) return cached;
  const row = statement(
    sqlite,
    `SELECT id,version,client_bill_rule_id,worker_compensation_rule_id,
              internal_cost_rule_id,allow_global_compensation_fallback,
              allow_global_internal_cost_fallback FROM project_member WHERE id=?`,
  ).get(id) as AssignmentRuleRefs | undefined;
  if (!row) throw new Error('Active assignment disappeared while resolving commercial terms');
  snapshot?.refs.set(id, row);
  return row;
}

function precedence(row: OverrideRow): number {
  return Number(row.time_category !== null) * 2 + Number(row.activity_code !== null);
}

function chooseOverride(
  sqlite: DatabaseSync,
  assignmentId: string,
  context: CommercialTermsContext,
  kind: RuleKind,
): { selected: OverrideRow | null; ambiguous: readonly string[] } {
  const snapshot = ruleSnapshots.get(sqlite);
  let rows: OverrideRow[];
  if (snapshot) {
    const key = `${kind}:${assignmentId}`;
    let all = snapshot.overrides.get(key);
    if (!all) {
      all = statement(
        sqlite,
        `SELECT id,version,time_category,activity_code,priority,effective_from,effective_to,
                ${OVERRIDE_COLUMN[kind]} rule_id FROM assignment_rate_override
         WHERE project_member_id=? AND ${OVERRIDE_COLUMN[kind]} IS NOT NULL`,
      ).all(assignmentId) as Array<OverrideRow & { effective_to: string | null }>;
      snapshot.overrides.set(key, all);
    }
    const activityCode = context.activityCode ?? null;
    rows = all
      .filter(
        (row) =>
          (row.time_category === null || row.time_category === context.category) &&
          (row.activity_code === null ||
            (activityCode !== null && row.activity_code === activityCode)) &&
          row.effective_from <= context.workDate &&
          (row.effective_to === null || row.effective_to >= context.workDate),
      )
      .map(({ effective_to: _effectiveTo, ...row }) => row);
  } else
    rows = statement(
      sqlite,
      `SELECT id,version,time_category,activity_code,priority,effective_from,
              ${OVERRIDE_COLUMN[kind]} rule_id FROM assignment_rate_override
       WHERE project_member_id=? AND ${OVERRIDE_COLUMN[kind]} IS NOT NULL
         AND (time_category=? OR time_category IS NULL)
         AND (activity_code=? OR activity_code IS NULL)
         AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`,
    ).all(
      assignmentId,
      context.category,
      context.activityCode ?? null,
      context.workDate,
      context.workDate,
    ) as OverrideRow[];
  rows.sort(
    (left, right) =>
      precedence(right) - precedence(left) ||
      right.priority - left.priority ||
      right.effective_from.localeCompare(left.effective_from) ||
      left.id.localeCompare(right.id),
  );
  const first = rows[0];
  if (!first) return { selected: null, ambiguous: [] };
  const tied = rows.filter(
    (row) =>
      precedence(row) === precedence(first) &&
      row.priority === first.priority &&
      row.effective_from === first.effective_from,
  );
  return {
    selected: tied.length === 1 ? first : null,
    ambiguous: tied.length > 1 ? tied.map((row) => row.id) : [],
  };
}

function scopeRank(rule: RuleWithScope, kind: RuleKind): number {
  if (kind === 'client')
    return (
      Number(rule.worker_id !== null) * 2 + Number((rule as ClientLaborRateRow).category !== null)
    );
  return Number(rule.project_id !== null);
}

function source(rule: RuleWithScope, kind: RuleKind): RuleProvenance['source'] {
  if (kind === 'client') return rule.worker_id === null ? 'project_default' : 'worker_project';
  return rule.project_id === null ? 'worker_global' : 'worker_project';
}

function provenance(
  rule: RuleWithScope,
  kind: RuleKind,
  override: OverrideRow | null,
  assignment: AssignmentRuleRefs | null,
  direct = false,
): RuleProvenance {
  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    source: override ? 'assignment_override' : direct ? 'assignment_rule' : source(rule, kind),
    assignmentId: assignment?.id ?? null,
    assignmentVersion: assignment?.version ?? null,
    overrideId: override?.id ?? null,
    overrideVersion: override?.version ?? null,
    effectiveFrom: rule.effective_from,
    effectiveTo: rule.effective_to,
  };
}

function validScope(
  rule: RuleWithScope,
  context: CommercialTermsContext,
  kind: RuleKind,
  projectCurrency: Currency,
): boolean {
  if (rule.currency !== projectCurrency) return false;
  if (rule.effective_from > context.workDate) return false;
  if (rule.effective_to !== null && rule.effective_to < context.workDate) return false;
  if (kind === 'client') {
    const rate = rule as ClientLaborRateRow;
    return (
      rate.project_id === context.projectId &&
      (rate.worker_id === null || rate.worker_id === context.workerId) &&
      (rate.category === null || rate.category === context.category)
    );
  }
  return (
    rule.worker_id === context.workerId &&
    (rule.project_id === null || rule.project_id === context.projectId)
  );
}

/** Same rows, by the same predicate, as the SQL lookup below (ISO dates compare as text). */
function candidateRules<T extends RuleWithScope>(
  sqlite: DatabaseSync,
  context: CommercialTermsContext,
  kind: RuleKind,
): T[] {
  const snapshot = ruleSnapshots.get(sqlite);
  if (!snapshot)
    return statement(
      sqlite,
      kind === 'client'
        ? `${SELECT.client} WHERE project_id=? AND (worker_id=? OR worker_id IS NULL)
           AND (category=? OR category IS NULL)
           AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`
        : `${SELECT[kind]} WHERE worker_id=? AND (project_id=? OR project_id IS NULL)
           AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`,
    ).all(
      ...(kind === 'client'
        ? [context.projectId, context.workerId, context.category]
        : [context.workerId, context.projectId]),
      context.workDate,
      context.workDate,
    ) as T[];
  let byKey = snapshot.rules[kind];
  if (!byKey) {
    const grouped = new Map<string, RuleWithScope[]>();
    for (const row of statement(sqlite, SELECT[kind]).all() as RuleWithScope[]) {
      const key = String(kind === 'client' ? row.project_id : row.worker_id);
      const list = grouped.get(key);
      if (list) list.push(row);
      else grouped.set(key, [row]);
    }
    byKey = grouped;
    snapshot.rules[kind] = byKey;
  }
  const candidates = byKey.get(kind === 'client' ? context.projectId : context.workerId) ?? [];
  return candidates.filter(
    (row) =>
      (kind === 'client'
        ? (row.worker_id === null || row.worker_id === context.workerId) &&
          (row.category === null || row.category === context.category)
        : row.project_id === null || row.project_id === context.projectId) &&
      row.effective_from <= context.workDate &&
      (row.effective_to === null || row.effective_to >= context.workDate),
  ) as T[];
}

function projectCurrency(
  sqlite: DatabaseSync,
  projectId: string,
): { currency: Currency } | undefined {
  const snapshot = ruleSnapshots.get(sqlite);
  if (snapshot?.projects.has(projectId)) return snapshot.projects.get(projectId);
  const row = statement(sqlite, 'SELECT currency FROM project WHERE id=?').get(projectId) as
    | { currency: Currency }
    | undefined;
  snapshot?.projects.set(projectId, row);
  return row;
}

function resolveRule<T extends RuleWithScope>(
  sqlite: DatabaseSync,
  context: CommercialTermsContext,
  kind: RuleKind,
  assignment: AssignmentRuleRefs | null,
): CommercialRuleResult<T> {
  const [missingCode, ambiguousCode, unavailableCode] = ISSUE[kind];
  const project = projectCurrency(sqlite, context.projectId);
  if (!project) return { selected: null, issues: [issue(missingCode)] };
  if (assignment !== null) {
    const override = chooseOverride(sqlite, assignment.id, context, kind);
    if (override.ambiguous.length)
      return { selected: null, issues: [issue(ambiguousCode, override.ambiguous)] };
    if (override.selected) {
      const row = statement(sqlite, `${SELECT[kind]} WHERE id=?`).get(override.selected.rule_id) as
        | T
        | undefined;
      if (!row || !validScope(row, context, kind, project.currency))
        return { selected: null, issues: [issue(unavailableCode, [override.selected.id])] };
      return {
        selected: { rule: row, provenance: provenance(row, kind, override.selected, assignment) },
        issues: [],
      };
    }
    const directId = assignment[ASSIGNMENT_COLUMN[kind]];
    if (directId) {
      const row = statement(sqlite, `${SELECT[kind]} WHERE id=?`).get(directId) as T | undefined;
      if (!row || !validScope(row, context, kind, project.currency))
        return {
          selected: null,
          issues: [issue(UNAVAILABLE_ASSIGNMENT_ISSUE[kind], [assignment.id, directId])],
        };
      return {
        selected: { rule: row, provenance: provenance(row, kind, null, assignment, true) },
        issues: [],
      };
    }
  }
  const allowGlobalFallback =
    assignment !== null &&
    (kind === 'compensation'
      ? assignment.allow_global_compensation_fallback === 1
      : kind === 'internal' && assignment.allow_global_internal_cost_fallback === 1);
  const rows = candidateRules<T>(sqlite, context, kind);
  const eligible = rows.filter(
    (row) =>
      validScope(row, context, kind, project.currency) &&
      (kind === 'client' || allowGlobalFallback || row.project_id !== null),
  );
  eligible.sort(
    (left, right) =>
      scopeRank(right, kind) - scopeRank(left, kind) ||
      right.effective_from.localeCompare(left.effective_from) ||
      left.id.localeCompare(right.id),
  );
  const first = eligible[0];
  if (!first) return { selected: null, issues: [issue(missingCode)] };
  const tied = eligible.filter(
    (row) =>
      scopeRank(row, kind) === scopeRank(first, kind) &&
      row.effective_from === first.effective_from,
  );
  if (
    tied.length > 1 &&
    !(kind === 'client' && tied.every((row) => clientLaborRatesEquivalent(row, first)))
  )
    return {
      selected: null,
      issues: [
        issue(
          ambiguousCode,
          tied.map((row) => row.id),
        ),
      ],
    };
  return {
    selected: { rule: first, provenance: provenance(first, kind, null, assignment) },
    issues: [],
  };
}

export function resolveAssignmentCommercialTerms(
  sqlite: DatabaseSync,
  context: CommercialTermsContext,
): AssignmentCommercialTerms {
  const assignments = assignmentIds(sqlite, context);
  if (assignments.length !== 1) {
    return {
      assignmentId: null,
      allowGlobalCompensation: false,
      allowGlobalInternalCost: false,
      clientLaborRate: null,
      workerCompensation: null,
      internalCost: null,
      issues: [
        issue(assignments.length ? 'ambiguous_assignment' : 'missing_assignment', assignments),
      ],
    };
  }
  const assignment = assignmentRefs(sqlite, assignments[0]!);
  const client = resolveRule<ClientLaborRateRow>(sqlite, context, 'client', assignment);
  const compensation = resolveRule<CompensationRuleRow>(
    sqlite,
    context,
    'compensation',
    assignment,
  );
  const internal = resolveRule<InternalCostRuleRow>(sqlite, context, 'internal', assignment);
  return {
    assignmentId: assignment.id,
    allowGlobalCompensation: assignment.allow_global_compensation_fallback === 1,
    allowGlobalInternalCost: assignment.allow_global_internal_cost_fallback === 1,
    clientLaborRate: client.selected,
    workerCompensation: compensation.selected,
    internalCost: internal.selected,
    issues: [...client.issues, ...compensation.issues, ...internal.issues],
  };
}

export function resolveClientLaborRule(
  sqlite: DatabaseSync,
  context: CommercialTermsContext,
): CommercialRuleResult<ClientLaborRateRow> {
  const assignments = assignmentIds(sqlite, context);
  if (assignments.length > 1)
    return { selected: null, issues: [issue('ambiguous_assignment', assignments)] };
  return resolveRule(
    sqlite,
    context,
    'client',
    assignments[0] ? assignmentRefs(sqlite, assignments[0]) : null,
  );
}

export function resolveWorkerCompensationRule(
  sqlite: DatabaseSync,
  context: CommercialTermsContext,
): CommercialRuleResult<CompensationRuleRow> {
  const assignments = assignmentIds(sqlite, context);
  if (assignments.length > 1)
    return { selected: null, issues: [issue('ambiguous_assignment', assignments)] };
  return resolveRule(
    sqlite,
    context,
    'compensation',
    assignments[0] ? assignmentRefs(sqlite, assignments[0]) : null,
  );
}

export function resolveInternalCostRule(
  sqlite: DatabaseSync,
  context: CommercialTermsContext,
): CommercialRuleResult<InternalCostRuleRow> {
  const assignments = assignmentIds(sqlite, context);
  if (assignments.length > 1)
    return { selected: null, issues: [issue('ambiguous_assignment', assignments)] };
  return resolveRule(
    sqlite,
    context,
    'internal',
    assignments[0] ? assignmentRefs(sqlite, assignments[0]) : null,
  );
}
