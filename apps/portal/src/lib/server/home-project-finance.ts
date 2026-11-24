/**
 * Home "Ready to invoice" / project glance read the full project finance
 * calculation (rate resolution for every entry) for each open project. At scale
 * that is the slowest part of Home, and it is recomputed although nothing
 * changed between two visits. This keeps the small slice Home needs per
 * project and reuses it while the project's finance inputs are unchanged.
 *
 * The fingerprint covers every table the calculation reads for the project
 * (time, expenses, invoices and their sources, assignments and overrides,
 * client rates, commercial policy, milestones, planning) plus the global
 * worker pay / cost rules and correction links. Any change there recomputes
 * that project only. Entries also expire after a few minutes as a safety net.
 * Authorization is unchanged: the calculation itself is only ever called through
 * `v3.projectFinance(principal, …)`, which asserts finance access every time a
 * value is (re)computed, and cached values are only returned to the same
 * finance-readable roles.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { openPortalRepository } from './portal-repository';

type PortalContext = ReturnType<typeof openPortalRepository>;

export type HomeProjectFinance = {
  currency?: string;
  approvedUnbilledSources?: Array<Record<string, unknown>>;
  alerts?: string[];
};

const MAX_AGE_MS = 5 * 60 * 1000;
const cache = new Map<string, { fingerprint: string; at: number; value: HomeProjectFinance }>();
const fingerprints = new WeakMap<DatabaseSync, Map<string, string>>();

const PER_PROJECT = [
  `SELECT project_id id,'t',count(*),total(version),max(updated_at),total(minutes),
          sum(invoice_id IS NOT NULL),group_concat(DISTINCT approval_state),
          group_concat(DISTINCT billability_state),group_concat(DISTINCT billing_status),
          sum(billing_lock_id IS NOT NULL),sum(locked_at IS NOT NULL)
     FROM time_entry GROUP BY project_id`,
  `SELECT project_id id,'e',count(*),total(version),max(updated_at),total(amount_minor),
          sum(invoice_id IS NOT NULL),group_concat(DISTINCT approval_state),
          sum(finance_approved_at IS NOT NULL),group_concat(DISTINCT billing_state)
     FROM expense GROUP BY project_id`,
  `SELECT project_id id,'i',count(*),total(version),max(updated_at),group_concat(DISTINCT state)
     FROM invoice GROUP BY project_id`,
  `SELECT i.project_id id,'s',count(*),max(s.rowid),total(s.rowid)
     FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id GROUP BY i.project_id`,
  `SELECT id,'p',version,updated_at,status,currency FROM project`,
  `SELECT project_id id,'m',count(*),total(version),max(updated_at) FROM project_member GROUP BY project_id`,
  `SELECT m.project_id id,'o',count(*),total(o.version),max(o.updated_at)
     FROM assignment_rate_override o JOIN project_member m ON m.id=o.project_member_id
    GROUP BY m.project_id`,
  `SELECT project_id id,'r',count(*),total(version),max(updated_at) FROM client_labor_rate GROUP BY project_id`,
  `SELECT project_id id,'c',count(*),total(version),max(created_at) FROM project_commercial_policy GROUP BY project_id`,
  `SELECT project_id id,'ms',count(*),total(version),max(updated_at) FROM project_milestone GROUP BY project_id`,
  `SELECT project_id id,'pl',count(*),total(version),max(updated_at) FROM planning_assignment GROUP BY project_id`,
] as const;
const GLOBAL = [
  `SELECT 'w',count(*),total(version),max(updated_at) FROM compensation_rule`,
  `SELECT 'k',count(*),total(version),max(updated_at) FROM internal_cost_rule`,
  `SELECT 'x',count(*),max(rowid),total(rowid) FROM record_correction_link`,
] as const;

function projectFingerprints(sqlite: DatabaseSync): Map<string, string> {
  const known = fingerprints.get(sqlite);
  if (known) return known;
  const parts = new Map<string, string[]>();
  for (const sql of PER_PROJECT)
    for (const row of sqlite.prepare(sql).all() as Array<Record<string, unknown>>) {
      const id = String(row.id ?? '');
      const list = parts.get(id) ?? [];
      list.push(JSON.stringify(Object.values(row)));
      parts.set(id, list);
    }
  const global = GLOBAL.map((sql) =>
    JSON.stringify(Object.values(sqlite.prepare(sql).get() ?? {})),
  );
  const result = new Map<string, string>();
  for (const [id, list] of parts) result.set(id, [...global, ...list].join('|'));
  fingerprints.set(sqlite, result);
  return result;
}

function databaseKey(sqlite: DatabaseSync): string {
  try {
    return (sqlite as DatabaseSync & { location?: () => string | null }).location?.() ?? '';
  } catch {
    return '';
  }
}

/** `v3.projectFinance` reduced to what Home shows, reused while its inputs are unchanged. */
export function homeProjectFinance(context: PortalContext, projectId: string): HomeProjectFinance {
  const compute = (): HomeProjectFinance => {
    const finance = context.v3.projectFinance(context.principal, projectId) as HomeProjectFinance;
    return {
      currency: finance.currency,
      approvedUnbilledSources: (finance.approvedUnbilledSources ?? []).map((source) => ({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        amountMinor: source.amountMinor,
        ...(source.waitingCorrection === true ? { waitingCorrection: true } : {}),
      })),
      alerts: finance.alerts ?? [],
    };
  };
  // Only finance-readable roles reach this path; anything else computes (and is checked) directly.
  if (!['owner_admin', 'finance_admin'].includes(context.principal.role)) return compute();
  const fingerprint = projectFingerprints(context.sqlite).get(projectId) ?? '';
  const key = `${databaseKey(context.sqlite)}\u0000${projectId}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.fingerprint === fingerprint && now - hit.at < MAX_AGE_MS) return hit.value;
  const value = compute();
  cache.set(key, { fingerprint, at: now, value });
  return value;
}
