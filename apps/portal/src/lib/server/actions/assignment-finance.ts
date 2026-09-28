import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const positiveMoney = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,9})(?:[.,]\d{1,2})?$/u)
  .refine((value) => value !== '0' && !/^0[.,]0{1,2}$/u.test(value));

const financeTermsSchema = z.object({
  internalCostHourlyRate: positiveMoney,
  compensationRate: positiveMoney,
  compensationBasis: z.enum(['hourly', 'daily']),
  financeEffectiveFrom: z.iso.date(),
  financeEffectiveTo: z.union([z.literal(''), z.iso.date()]),
  financeNotes: z.string().trim().max(2000).optional(),
});

export type AssignmentFinanceTerms = z.infer<typeof financeTermsSchema>;

export class AssignmentFinanceInputError extends Error {
  constructor(
    readonly kind: 'required' | 'dates',
    readonly fields: string[],
  ) {
    super('Assignment finance terms need review');
  }
}

export class AssignmentFinanceRuleOverlapError extends Error {
  constructor() {
    super('An overlapping project finance rule already exists');
  }
}

export class AssignmentFinanceSetupRequiredError extends Error {
  constructor() {
    super('Project finance setup required before assignment');
  }
}

/** Exact decimal conversion; floating point must not enter compensation rules. */
export function rateMinor(value: string): bigint {
  const [whole, fraction = ''] = value.split(/[.,]/u);
  return BigInt(whole ?? '0') * 100n + BigInt((fraction + '00').slice(0, 2));
}

export function parseAssignmentFinanceTerms(
  value: Record<string, unknown>,
  assignment: { startsOn: string; endsOn?: string },
):
  | { ok: true; terms: AssignmentFinanceTerms }
  | { ok: false; kind: 'required' | 'dates'; fields: string[] } {
  const parsed = financeTermsSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'required',
      fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))],
    };
  }
  const { financeEffectiveFrom, financeEffectiveTo } = parsed.data;
  const assignmentEnd = assignment.endsOn || '';
  // Rules must cover the complete assignment, and the V3 repository requires
  // effective dates to stay within the worker's assignment.
  if (financeEffectiveFrom !== assignment.startsOn || financeEffectiveTo !== assignmentEnd) {
    return {
      ok: false,
      kind: 'dates',
      fields: [
        ...(financeEffectiveFrom !== assignment.startsOn ? ['financeEffectiveFrom'] : []),
        ...(financeEffectiveTo !== assignmentEnd ? ['financeEffectiveTo'] : []),
      ],
    };
  }
  return { ok: true, terms: parsed.data };
}

/** The portal repository nests its own write in a savepoint on this connection. */
export function withAssignmentFinanceTransaction<T>(sqlite: DatabaseSync, work: () => T): T {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    sqlite.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      // Keep the original repository error for the action's problem mapping.
    }
    throw error;
  }
}

export function hasOverlappingAssignmentFinanceRule(
  sqlite: DatabaseSync,
  projectId: string,
  workerId: string,
  startsOn: string,
  endsOn?: string,
): boolean {
  const params = [projectId, workerId, endsOn || null, endsOn || null, startsOn] as const;
  for (const table of ['internal_cost_rule', 'compensation_rule'] as const) {
    const existing = sqlite
      .prepare(
        `SELECT 1 FROM ${table}
         WHERE project_id=? AND worker_id=?
           AND (? IS NULL OR effective_from<=?)
           AND (effective_to IS NULL OR effective_to>=?) LIMIT 1`,
      )
      .get(...params);
    if (existing) return true;
  }
  return false;
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function rulePeriodsCover(
  sqlite: DatabaseSync,
  table: 'internal_cost_rule' | 'compensation_rule',
  projectId: string,
  workerId: string,
  currency: string,
  startsOn: string,
  endsOn?: string,
): boolean {
  const periods = sqlite
    .prepare(
      `SELECT effective_from,effective_to FROM ${table}
       WHERE worker_id=? AND currency=? AND (project_id=? OR project_id IS NULL)
         AND (effective_to IS NULL OR effective_to>=?)
         AND (? IS NULL OR effective_from<=?)
       ORDER BY effective_from,effective_to`,
    )
    .all(workerId, currency, projectId, startsOn, endsOn || null, endsOn || null) as {
    effective_from: string;
    effective_to: string | null;
  }[];
  let cursor = startsOn;
  for (const period of periods) {
    if (period.effective_from > cursor) break;
    if (period.effective_to === null) return true;
    if (period.effective_to < cursor) continue;
    cursor = nextDate(period.effective_to);
    if (endsOn && cursor > endsOn) return true;
  }
  return false;
}

/** Private, yes/no readiness check for a manager; no rate or rule identifier leaves the server. */
export function hasAssignmentFinanceCoverage(
  sqlite: DatabaseSync,
  projectId: string,
  workerId: string,
  currency: string,
  startsOn: string,
  endsOn?: string,
): boolean {
  return (
    rulePeriodsCover(
      sqlite,
      'internal_cost_rule',
      projectId,
      workerId,
      currency,
      startsOn,
      endsOn,
    ) &&
    rulePeriodsCover(sqlite, 'compensation_rule', projectId, workerId, currency, startsOn, endsOn)
  );
}

/** Preserve the project-creation form's date boundary for later web assignments. */
export function assignmentStartWithinProjectDates(
  sqlite: DatabaseSync,
  projectId: string,
  startsOn: string,
): boolean {
  const project = sqlite
    .prepare('SELECT start_date,planned_end_date FROM project WHERE id=?')
    .get(projectId) as { start_date: string | null; planned_end_date: string | null } | undefined;
  if (!project) return false;
  return (
    (!project.start_date || startsOn >= project.start_date) &&
    (!project.planned_end_date || startsOn <= project.planned_end_date)
  );
}
