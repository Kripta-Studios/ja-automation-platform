import type { DatabaseSync } from 'node:sqlite';
import type { V3Repository } from '@ja/database';
import type { Principal } from '@ja/domain';
import type { RateRuleRow, RatesOverview } from '../portal/money-overview-types';

type Row = Record<string, unknown>;
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const nullable = (value: unknown) => (value === null || value === undefined ? null : String(value));

function status(from: string, to: string | null, today: string): RateRuleRow['status'] {
  if (from > today) return 'scheduled';
  if (to !== null && to < today) return 'ended';
  return 'current';
}

/**
 * One read-only answer to "what do we charge and what do we pay" today.
 * The commercial resolver (the same one billing uses) decides the applied rule
 * for each active person on each visible project; no rate is computed here.
 */
export function buildRatesOverview(
  sqlite: DatabaseSync,
  v3: V3Repository,
  principal: Principal,
  projects: ReadonlyArray<Row>,
  today = new Date().toISOString().slice(0, 10),
): RatesOverview {
  const visible = new Map(projects.map((project) => [String(project.id), project]));
  const projectLabel = (id: unknown) => {
    const project = visible.get(String(id));
    return project ? `${text(project.project_number)} — ${text(project.name)}` : text(id);
  };
  const clientRates = (v3.listClientLaborRates(principal) as Row[]).filter((rule) =>
    visible.has(String(rule.project_id)),
  );
  const payRules = (v3.listCompensationRules(principal) as Row[]).filter(
    (rule) => !rule.project_id || visible.has(String(rule.project_id)),
  );
  const costRules = (v3.listInternalCostRules(principal) as Row[]).filter(
    (rule) => !rule.project_id || visible.has(String(rule.project_id)),
  );
  const rules: RateRuleRow[] = [
    ...clientRates.map((rule) => {
      const basis = text(rule.rate_basis) || 'hourly';
      return {
        id: text(rule.id),
        kind: 'client' as const,
        projectId: text(rule.project_id),
        projectLabel: projectLabel(rule.project_id),
        workerId: nullable(rule.worker_id),
        workerName: text(rule.worker_name),
        category: nullable(rule.category),
        currency: text(rule.currency),
        rateMinor: basis === 'hourly' ? text(rule.hourly_rate_minor) : text(rule.unit_rate_minor),
        basis,
        effectiveFrom: text(rule.effective_from),
        effectiveTo: nullable(rule.effective_to),
        status: status(text(rule.effective_from), nullable(rule.effective_to), today),
      };
    }),
    ...payRules.map((rule) => ({
      id: text(rule.id),
      kind: 'pay' as const,
      projectId: nullable(rule.project_id),
      projectLabel: rule.project_id ? projectLabel(rule.project_id) : '',
      workerId: nullable(rule.worker_id),
      workerName: text(rule.worker_name),
      category: null,
      currency: text(rule.currency),
      rateMinor: text(rule.rate_minor),
      basis: text(rule.rate_basis) || 'hourly',
      effectiveFrom: text(rule.effective_from),
      effectiveTo: nullable(rule.effective_to),
      status: status(text(rule.effective_from), nullable(rule.effective_to), today),
    })),
    ...costRules.map((rule) => ({
      id: text(rule.id),
      kind: 'cost' as const,
      projectId: nullable(rule.project_id),
      projectLabel: rule.project_id ? projectLabel(rule.project_id) : '',
      workerId: nullable(rule.worker_id),
      workerName: text(rule.worker_name),
      category: null,
      currency: text(rule.currency),
      rateMinor: text(rule.hourly_rate_minor),
      basis: 'hourly',
      effectiveFrom: text(rule.effective_from),
      effectiveTo: nullable(rule.effective_to),
      status: status(text(rule.effective_from), nullable(rule.effective_to), today),
    })),
  ];

  const activeProjects = projects.filter((project) => text(project.status) !== 'archived');
  const clientNames = new Map(
    (sqlite.prepare('SELECT id,display_name FROM client').all() as Array<{
      id: string;
      display_name: string;
    }>).map((client) => [client.id, client.display_name]),
  );
  const clientOf = (project: Row) => clientNames.get(text(project.client_id)) ?? '';
  const members = activeProjects.length
    ? (sqlite
        .prepare(
          `SELECT pm.id,pm.project_id,pm.user_id,u.name
             FROM project_member pm JOIN user u ON u.id=pm.user_id
            WHERE pm.status='active' AND u.status='active'
              AND pm.project_id IN (${activeProjects.map(() => '?').join(',')})
              AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
            ORDER BY u.name,pm.id`,
        )
        .all(...activeProjects.map((project) => String(project.id)), today, today) as Array<{
        id: string;
        project_id: string;
        user_id: string;
        name: string;
      }>)
    : [];
  const people = members.map((member) => {
    const project = visible.get(member.project_id) ?? {};
    const terms = v3.resolveAssignmentCommercialTerms(
      principal,
      member.project_id,
      member.user_id,
      'regular',
      today,
    );
    const client = terms.clientLaborRate;
    const hourlyClient = !client || client.rateBasis === 'hourly';
    return {
      assignmentId: member.id,
      projectId: member.project_id,
      projectNumber: text(project.project_number),
      projectName: text(project.name),
      clientName: clientOf(project),
      currency: text(project.currency),
      workerId: member.user_id,
      workerName: member.name,
      clientRateMinor: client
        ? hourlyClient
          ? text(client.hourlyRateMinor)
          : nullable(client.unitRateMinor)
        : null,
      clientRateBasis: client ? text(client.rateBasis) : null,
      clientSource: client ? text(client.provenance.source) : null,
      clientRuleId: client ? text(client.id) : null,
      payRateMinor: terms.workerCompensation ? text(terms.workerCompensation.rateMinor) : null,
      payBasis: terms.workerCompensation ? text(terms.workerCompensation.rateBasis) : null,
      payType: terms.workerCompensation ? text(terms.workerCompensation.ruleType) : null,
      paySource: terms.workerCompensation ? text(terms.workerCompensation.provenance.source) : null,
      payRuleId: terms.workerCompensation ? text(terms.workerCompensation.id) : null,
      costRateMinor: terms.internalCost ? text(terms.internalCost.hourlyRateMinor) : null,
      costRuleId: terms.internalCost ? text(terms.internalCost.id) : null,
      issues: terms.issues.map((issue) => String(issue.code)),
    };
  });

  const projectRows = activeProjects.map((project) => {
    const id = String(project.id);
    const current = clientRates
      .filter(
        (rule) =>
          String(rule.project_id) === id &&
          rule.worker_id === null &&
          rule.category === null &&
          status(text(rule.effective_from), nullable(rule.effective_to), today) === 'current',
      )
      .sort((a, b) => text(b.effective_from).localeCompare(text(a.effective_from)))[0];
    const basis = current ? text(current.rate_basis) || 'hourly' : null;
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
    };
  });
  const workers = [
    ...new Map(members.map((member) => [member.user_id, member.name])).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { today, people, rules, projects: projectRows, workers };
}
