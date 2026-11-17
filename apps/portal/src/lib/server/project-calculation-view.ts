/**
 * Compacts the canonical project-period explanation for the calculation page.
 *
 * The explanation carries every time and expense source row of the period for
 * every person. At scale that is thousands of rows (1 MB+ of serialized data and
 * hundreds of cards). The page shows totals first, then one collapsed group per
 * person with per-category subtotals, and loads the source rows of ONE person on
 * demand (`?person=<id>`), a page at a time (`&rows=<n>`).
 *
 * Amounts are canonical minor-unit strings; subtotals are summed with BigInt and
 * never recalculated from rates. Issue context is resolved here, before rows are
 * dropped, so the page can still name the person/date a configuration gap affects.
 */

type Source = Record<string, unknown>;

export const CALCULATION_SOURCE_PAGE = 25;

export type CategorySubtotal = {
  category: string;
  count: number;
  actualMinutes: number;
  billableMinutes: number;
  revenueMinor: string;
  costMinor: string;
};

export type IssueContext = {
  code: string;
  sourceId: string | null;
  workerName: string | null;
  sourceKind: 'time' | 'expense' | 'person' | null;
  workDate: string | null;
  spentOn: string | null;
  description: string | null;
};

const minor = (value: unknown): bigint => {
  const raw = String(value ?? '').trim();
  return /^-?\d+$/u.test(raw) ? BigInt(raw) : 0n;
};

function subtotals(
  rows: readonly Source[],
  revenueKey: string,
  costKey: string,
): CategorySubtotal[] {
  const map = new Map<
    string,
    { count: number; actual: number; billable: number; revenue: bigint; cost: bigint }
  >();
  for (const row of rows) {
    const key = String(row.category ?? '') || 'other';
    const entry = map.get(key) ?? { count: 0, actual: 0, billable: 0, revenue: 0n, cost: 0n };
    entry.count += 1;
    entry.actual += Number(row.actualMinutes ?? 0) || 0;
    entry.billable += Number(row.billableMinutes ?? 0) || 0;
    entry.revenue += minor(row[revenueKey]);
    entry.cost += minor(row[costKey]);
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([category, entry]) => ({
      category,
      count: entry.count,
      actualMinutes: entry.actual,
      billableMinutes: entry.billable,
      revenueMinor: entry.revenue.toString(),
      costMinor: entry.cost.toString(),
    }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
}

export function compactCalculationExplanation<
  T extends { people?: Array<Record<string, unknown>>; issues?: Array<Record<string, unknown>> },
>(explanation: T, options: { personId?: string | null; rows?: number }) {
  const people = (explanation.people ?? []) as Array<
    Record<string, unknown> & { workerId?: unknown; workerName?: unknown; time?: Source[]; expenses?: Source[] }
  >;
  const rowLimit = Math.max(
    CALCULATION_SOURCE_PAGE,
    Math.min(5000, Math.floor(Number(options.rows) || CALCULATION_SOURCE_PAGE)),
  );
  const selectedId = options.personId
    ? (people.find((person) => String(person.workerId ?? '') === options.personId)?.workerId ?? null)
    : null;

  const sourceIndex = new Map<string, IssueContext>();
  for (const person of people) {
    const workerName = String(person.workerName ?? '');
    sourceIndex.set(String(person.workerId ?? ''), {
      code: '',
      sourceId: null,
      workerName,
      sourceKind: 'person',
      workDate: null,
      spentOn: null,
      description: null,
    });
    for (const row of person.time ?? [])
      sourceIndex.set(String(row.id ?? ''), {
        code: '',
        sourceId: null,
        workerName,
        sourceKind: 'time',
        workDate: String(row.workDate ?? ''),
        spentOn: null,
        description: null,
      });
    for (const row of person.expenses ?? [])
      sourceIndex.set(String(row.id ?? ''), {
        code: '',
        sourceId: null,
        workerName,
        sourceKind: 'expense',
        workDate: null,
        spentOn: String(row.spentOn ?? ''),
        description: row.description == null ? null : String(row.description),
      });
  }
  const issues: IssueContext[] = (explanation.issues ?? []).map((issue) => {
    const sourceId = issue.sourceId == null ? null : String(issue.sourceId);
    const found = sourceId ? sourceIndex.get(sourceId) : undefined;
    return {
      workerName: null,
      sourceKind: null,
      workDate: null,
      spentOn: null,
      description: null,
      ...found,
      code: String(issue.code ?? ''),
      sourceId,
    };
  });

  const compactPeople = people.map((person) => {
    const time = person.time ?? [];
    const expenses = person.expenses ?? [];
    const selected = selectedId !== null && person.workerId === selectedId;
    const { time: _time, expenses: _expenses, ...summary } = person;
    return {
      ...summary,
      timeCount: time.length,
      expenseCount: expenses.length,
      timeByCategory: subtotals(time, 'clientRevenueMinor', 'internalCostMinor'),
      expensesByCategory: subtotals(expenses, 'revenueMinor', 'costMinor'),
      // Source rows only for the person being reviewed, a page at a time.
      time: selected
        ? [...time].sort((a, b) => String(a.workDate).localeCompare(String(b.workDate))).slice(0, rowLimit)
        : [],
      expenses: selected
        ? [...expenses].sort((a, b) => String(a.spentOn).localeCompare(String(b.spentOn))).slice(0, rowLimit)
        : [],
    };
  });

  const categories = subtotals(
    people.flatMap((person) => person.time ?? []),
    'clientRevenueMinor',
    'internalCostMinor',
  );

  return {
    ...explanation,
    people: compactPeople,
    issues,
    categories,
    selectedPersonId: selectedId === null ? null : String(selectedId),
    sourceRowLimit: rowLimit,
  };
}
