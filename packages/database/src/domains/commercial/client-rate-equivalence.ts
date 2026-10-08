import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

const commercialFields = [
  'project_id',
  'worker_id',
  'category',
  'currency',
  'hourly_rate_minor',
  'rate_basis',
  'unit_rate_minor',
  'overtime_method',
  'overtime_multiplier_bps',
  'overtime_rate_minor',
  'eligible_for_percentage',
  'effective_from',
  'effective_to',
] as const;

type ComparableRate = { [K in (typeof commercialFields)[number]]?: string | number | null };

/** Ignore only identical commercial terms; never choose between different prices or dates. */
export function clientLaborRatesEquivalent(left: ComparableRate, right: ComparableRate): boolean {
  return commercialFields.every((field) => left[field] === right[field]);
}

/** An exact retry returns the original rule, preserving its identity and audit history. */
export function findIdenticalClientLaborRate(
  sqlite: DatabaseSync,
  values: readonly SQLInputValue[],
): { id: string } | undefined {
  const fields = [...commercialFields, 'notes'];
  return sqlite
    .prepare(
      `SELECT id FROM client_labor_rate WHERE ${fields.map((field) => `${field} IS ?`).join(' AND ')} ORDER BY id LIMIT 1`,
    )
    .get(...values) as { id: string } | undefined;
}
