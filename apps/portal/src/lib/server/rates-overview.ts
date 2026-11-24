import type { DatabaseSync } from 'node:sqlite';
import { withCommercialRuleSnapshot, type V3Repository } from '@ja/database';
import type { Principal } from '@ja/domain';
import type {
  RatePersonRow,
  RateRuleRow,
  RatesOverview,
  RatesProjectRow,
} from '../portal/money-overview-types';
import { normalizeSelectSearch } from '../portal/searchable-selects';
import { personDisplayName } from '../portal/display-name';

type Row = Record<string, unknown>;
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const nullable = (value: unknown) => (value === null || value === undefined ? null : String(value));

function status(from: string, to: string | null, today: string): RateRuleRow['status'] {
  if (from > today) return 'scheduled';
  if (to !== null && to < today) return 'ended';
  return 'current';
}

const dayBefore = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

/**
 * T62 (audit 2026-11-22): rate rules are "latest start wins" per scope. A rule that a later
 * rule of the same scope replaces is shown ending the day before (with the day it was
 * replaced), and its status follows that effective end, so two rates never read as valid
 * for the same days. Stored rules are not changed.
 */
export function withEffectiveRuleEnds(rules: readonly RateRuleRow[], today: string): RateRuleRow[] {
  const scope = (rule: RateRuleRow) =>
    [rule.kind, rule.projectId ?? '', rule.workerId ?? '', rule.category ?? ''].join('\u0000');
  const groups = new Map<string, RateRuleRow[]>();
  for (const rule of rules) groups.set(scope(rule), [...(groups.get(scope(rule)) ?? []), rule]);
  const result = new Map<RateRuleRow, RateRuleRow>();
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    ordered.forEach((rule, index) => {
      const next = ordered.slice(index + 1).find((later) => later.effectiveFrom > rule.effectiveFrom);
      if (next && (rule.effectiveTo === null || rule.effectiveTo >= next.effectiveFrom)) {
        const effectiveTo = dayBefore(next.effectiveFrom);
        result.set(rule, {
          ...rule,
          effectiveTo,
          replacedFrom: next.effectiveFrom,
          status: status(rule.effectiveFrom, effectiveTo, today),
        });
      } else result.set(rule, rule);
    });
  }
  return rules.map((rule) => result.get(rule) ?? rule);
}

/** Hourly cost (internal cost, else hourly pay) above the hourly client rate. */
export function isNegativeMargin(row: Pick<RatePersonRow, 'clientRateMinor' | 'clientRateBasis' | 'payRateMinor' | 'payType' | 'costRateMinor'>): boolean {
  if (!row.clientRateMinor || (row.clientRateBasis && row.clientRateBasis !== 'hourly')) return false;
  const cost =
    row.costRateMinor ?? (row.payRateMinor && (!row.payType || row.payType === 'Hourly') ? row.payRateMinor : null);
  if (!cost || !/^\d+$/u.test(cost) || !/^\d+$/u.test(row.clientRateMinor)) return false;
  return BigInt(cost) > BigInt(row.clientRateMinor);
}

export type RatesOverviewOptions = Readonly<{
  /** The project whose people and rate history are loaded; empty = list only. */
  openProjectId?: string;
  search?: string;
  missingOnly?: boolean;
  limit?: number;
  today?: string;
}>;

/**
 * One read-only answer to "what do we charge and what do we pay" today.
 * The commercial resolver (the same one billing uses) decides the applied rule
 * for each active person; no rate is computed here.
 *
 * Scale: the list is one page of projects with counts only. People rows and the
 * rate history are built only for the project the owner opened.
 */
export function buildRatesOverview(
  sqlite: DatabaseSync,
  v3: V3Repository,
  principal: Principal,
  projects: ReadonlyArray<Row>,
  options: RatesOverviewOptions = {},
): RatesOverview {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const visible = new Map(projects.map((project) => [String(project.id), project]));
  const projectLabel = (id: unknown) => {
    const project = visible.get(String(id));
    return project ? `${text(project.project_number)} — ${text(project.name)}` : text(id);
  };
  const activeProjects = projects.filter((project) => text(project.status) !== 'archived');
  const activeIds = new Set(activeProjects.map((project) => String(project.id)));
  const openProjectId =
    options.openProjectId && activeIds.has(options.openProjectId) ? options.openProjectId : '';
  const clientNames = new Map(
    (
      sqlite.prepare('SELECT id,display_name FROM client').all() as Array<{
        id: string;
        display_name: string;
      }>
    ).map((client) => [client.id, client.display_name]),
  );
  const clientOf = (project: Row) => clientNames.get(text(project.client_id)) ?? '';

  // Current project-wide default client rate per project, in one query.
  const defaults = new Map<string, Row>();
  if (activeProjects.length)
    for (const rule of sqlite
      .prepare(
        `SELECT id,project_id,rate_basis,CAST(hourly_rate_minor AS TEXT) hourly_rate_minor,
                CAST(unit_rate_minor AS TEXT) unit_rate_minor,effective_from
           FROM client_labor_rate
          WHERE worker_id IS NULL AND category IS NULL
            AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
          ORDER BY effective_from DESC`,
      )
      .all(today, today) as Row[]) {
      const projectId = String(rule.project_id);
      if (activeIds.has(projectId) && !defaults.has(projectId)) defaults.set(projectId, rule);
    }
  // T62: the next project-wide rate that starts later (future rates were invisible).
  const upcoming = new Map<string, Row>();
  if (activeProjects.length)
    for (const rule of sqlite
      .prepare(
        `SELECT project_id,rate_basis,CAST(hourly_rate_minor AS TEXT) hourly_rate_minor,
                CAST(unit_rate_minor AS TEXT) unit_rate_minor,effective_from
           FROM client_labor_rate
          WHERE worker_id IS NULL AND category IS NULL AND effective_from>?
          ORDER BY effective_from ASC`,
      )
      .all(today) as Row[]) {
      const projectId = String(rule.project_id);
      if (activeIds.has(projectId) && !upcoming.has(projectId)) upcoming.set(projectId, rule);
    }

  const members = activeProjects.length
    ? (
        sqlite
          .prepare(
            `SELECT pm.id,pm.project_id,pm.user_id,u.name,u.email,pm.starts_on
             FROM project_member pm JOIN user u ON u.id=pm.user_id
            WHERE pm.status='active' AND u.status='active'
              AND (pm.ends_on IS NULL OR pm.ends_on>=?)
            ORDER BY u.name,pm.id`,
          )
          .all(today) as Array<{
          id: string;
          project_id: string;
          user_id: string;
          name: string;
          email: string | null;
          starts_on: string | null;
        }>
      ).filter((member) => activeIds.has(member.project_id))
    : [];

  // The resolver runs once per active person (for the "missing" counts) inside one
  // read-only rule snapshot; full rows are kept only for the open project.
  const people: RatePersonRow[] = [];
  const counts = new Map<string, { people: number; missing: number; names: string[] }>();
  withCommercialRuleSnapshot(sqlite, () => {
    for (const member of members) {
      // People who join later are listed with the rates that apply on their first day (T62).
      const startsLater = Boolean(member.starts_on && member.starts_on > today);
      const asOf = startsLater ? String(member.starts_on) : today;
      const terms = v3.resolveAssignmentCommercialTerms(
        principal,
        member.project_id,
        member.user_id,
        'regular',
        asOf,
      );
      const client = terms.clientLaborRate;
      const hourlyClient = !client || client.rateBasis === 'hourly';
      const clientRateMinor = client
        ? hourlyClient
          ? text(client.hourlyRateMinor)
          : nullable(client.unitRateMinor)
        : null;
      const count = counts.get(member.project_id) ?? { people: 0, missing: 0, names: [] };
      count.people += 1;
      if (!clientRateMinor) count.missing += 1;
      count.names.push(member.name, personDisplayName(member.name, member.email));
      counts.set(member.project_id, count);
      if (member.project_id !== openProjectId) continue;
      const project = visible.get(member.project_id) ?? {};
      people.push({
        assignmentId: member.id,
        projectId: member.project_id,
        projectNumber: text(project.project_number),
        projectName: text(project.name),
        clientName: clientOf(project),
        currency: text(project.currency),
        workerId: member.user_id,
        workerName: personDisplayName(member.name, member.email) || member.name,
        ...(startsLater ? { startsOn: asOf } : {}),
        clientRateMinor,
        clientRateBasis: client ? text(client.rateBasis) : null,
        clientSource: client ? text(client.provenance.source) : null,
        clientRuleId: client ? text(client.id) : null,
        payRateMinor: terms.workerCompensation ? text(terms.workerCompensation.rateMinor) : null,
        payBasis: terms.workerCompensation ? text(terms.workerCompensation.rateBasis) : null,
        payType: terms.workerCompensation ? text(terms.workerCompensation.ruleType) : null,
        paySource: terms.workerCompensation
          ? text(terms.workerCompensation.provenance.source)
          : null,
        payRuleId: terms.workerCompensation ? text(terms.workerCompensation.id) : null,
        costRateMinor: terms.internalCost ? text(terms.internalCost.hourlyRateMinor) : null,
        costRuleId: terms.internalCost ? text(terms.internalCost.id) : null,
        issues: terms.issues.map((issue) => String(issue.code)),
      });
    }
  });

  const allRows = activeProjects.map((project): RatesProjectRow & { searchText: string } => {
    const id = String(project.id);
    const current = defaults.get(id);
    const basis = current ? text(current.rate_basis) || 'hourly' : null;
    const count = counts.get(id) ?? { people: 0, missing: 0, names: [] };
    return {
      id,
      label: projectLabel(id),
      clientName: clientOf(project),
      currency: text(project.currency),
      defaultRateMinor: current
        ? basis === 'hourly'
          ? text(current.hourly_rate_minor)
          : text(current.unit_rate_minor)
        : null,
      defaultRateBasis: basis,
      defaultRuleId: current ? text(current.id) : null,
      defaultEffectiveFrom: current ? text(current.effective_from) : null,
      ...(() => {
        const next = upcoming.get(id);
        if (!next) return {};
        const nextBasis = text(next.rate_basis) || 'hourly';
        return {
          upcomingRateMinor:
            nextBasis === 'hourly' ? text(next.hourly_rate_minor) : text(next.unit_rate_minor),
          upcomingRateFrom: text(next.effective_from),
        };
      })(),
      peopleCount: count.people,
      missingCount: count.missing,
      searchText: normalizeSelectSearch(
        `${projectLabel(id)} ${clientOf(project)} ${count.names.join(' ')}`,
      ),
    };
  });
  // What needs the owner first: projects with missing client rates.
  allRows.sort(
    (a, b) =>
      Number(b.missingCount > 0) - Number(a.missingCount > 0) || a.label.localeCompare(b.label),
  );
  const search = normalizeSelectSearch(options.search ?? '');
  const matches = allRows.filter(
    (row) =>
      (!options.missingOnly || row.missingCount > 0) &&
      (!search || row.searchText.includes(search)),
  );
  const limit = Math.max(1, options.limit ?? 20);
  const page = matches.slice(0, limit);
  // An opened project stays visible even when it is outside the current page or filter.
  const opened = openProjectId ? allRows.find((row) => row.id === openProjectId) : undefined;
  if (opened && !page.includes(opened)) page.unshift(opened);

  // Rate history of the open project: its own client/pay/cost rules and the
  // all-project pay/cost rules of the people on it.
  const rules: RateRuleRow[] = [];
  if (openProjectId) {
    const memberIds = new Set(people.map((person) => person.workerId));
    const inScope = (rule: Row) =>
      rule.project_id
        ? String(rule.project_id) === openProjectId
        : memberIds.has(text(rule.worker_id));
    for (const rule of v3.listClientLaborRates(principal) as Row[]) {
      if (String(rule.project_id) !== openProjectId) continue;
      const basis = text(rule.rate_basis) || 'hourly';
      rules.push({
        id: text(rule.id),
        kind: 'client',
        projectId: text(rule.project_id),
        projectLabel: projectLabel(rule.project_id),
        workerId: nullable(rule.worker_id),
        workerName: personDisplayName(rule.worker_name) || text(rule.worker_name),
        category: nullable(rule.category),
        currency: text(rule.currency),
        rateMinor: basis === 'hourly' ? text(rule.hourly_rate_minor) : text(rule.unit_rate_minor),
        basis,
        effectiveFrom: text(rule.effective_from),
        effectiveTo: nullable(rule.effective_to),
        status: status(text(rule.effective_from), nullable(rule.effective_to), today),
      });
    }
    for (const rule of v3.listCompensationRules(principal) as Row[]) {
      if (!inScope(rule)) continue;
      rules.push({
        id: text(rule.id),
        kind: 'pay',
        projectId: nullable(rule.project_id),
        projectLabel: rule.project_id ? projectLabel(rule.project_id) : '',
        workerId: nullable(rule.worker_id),
        workerName: personDisplayName(rule.worker_name) || text(rule.worker_name),
        category: null,
        currency: text(rule.currency),
        rateMinor: text(rule.rate_minor),
        basis: text(rule.rate_basis) || 'hourly',
        effectiveFrom: text(rule.effective_from),
        effectiveTo: nullable(rule.effective_to),
        status: status(text(rule.effective_from), nullable(rule.effective_to), today),
      });
    }
    for (const rule of v3.listInternalCostRules(principal) as Row[]) {
      if (!inScope(rule)) continue;
      rules.push({
        id: text(rule.id),
        kind: 'cost',
        projectId: nullable(rule.project_id),
        projectLabel: rule.project_id ? projectLabel(rule.project_id) : '',
        workerId: nullable(rule.worker_id),
        workerName: personDisplayName(rule.worker_name) || text(rule.worker_name),
        category: null,
        currency: text(rule.currency),
        rateMinor: text(rule.hourly_rate_minor),
        basis: 'hourly',
        effectiveFrom: text(rule.effective_from),
        effectiveTo: nullable(rule.effective_to),
        status: status(text(rule.effective_from), nullable(rule.effective_to), today),
      });
    }
  }

  const effectiveRules = withEffectiveRuleEnds(rules, today);
  // T62: margin warning, and the latest dated cost when none applies today ("Our cost —").
  for (const person of people) {
    if (isNegativeMargin(person)) person.negativeMargin = true;
    if (!person.costRateMinor) {
      const last = effectiveRules
        .filter(
          (rule) =>
            rule.kind === 'cost' &&
            rule.workerId === person.workerId &&
            (rule.projectId === null || rule.projectId === person.projectId) &&
            rule.effectiveFrom <= today,
        )
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      if (last) person.lastCost = { rateMinor: last.rateMinor, effectiveTo: last.effectiveTo };
    }
  }
  return {
    today,
    projects: page.map(({ searchText: _searchText, ...row }) => row),
    projectList: {
      total: allRows.length,
      matches: matches.length,
      projectsMissing: allRows.filter((row) => row.missingCount > 0).length,
      peopleMissing: allRows.reduce((sum, row) => sum + row.missingCount, 0),
      search: (options.search ?? '').trim(),
      missingOnly: Boolean(options.missingOnly),
      limit,
    },
    openProjectId,
    people,
    rules: effectiveRules,
  };
}
