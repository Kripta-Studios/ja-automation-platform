import {
  AssignmentExtrasRepository,
  type AssignmentExtras,
  type AssignmentExtrasInput,
  type ExtrasExpenseChoice,
  type OvertimeExtra,
} from '@ja/database';
import { formatMinorPlain, parseMajorToMinor } from '@ja/money';
import type { openPortalRepository } from './portal-repository';

type Context = ReturnType<typeof openPortalRepository>;

/** Form values of the "Extras" block, as typed (decimal amounts, ×1.5 multipliers). */
export type ExtrasFormValues = {
  version: number;
  perDiemClient: string;
  perDiemWorker: string;
  allowanceBasis: '' | 'day' | 'month';
  allowanceClient: string;
  allowanceWorker: string;
  overtimeClientMethod: '' | 'multiplier' | 'rate';
  overtimeClient: string;
  overtimeWorkerMethod: '' | 'multiplier' | 'rate';
  overtimeWorker: string;
  /** '' = the project's expense rules apply. */
  expenses: '' | ExtrasExpenseChoice;
  /** Typed: first day the new values apply ('' = today). */
  effectiveFrom: string;
  /** Saved: first day the shown values apply ('' = from the start of the assignment). */
  appliesFrom: string;
  /** Saved: the values in force before `appliesFrom` (null: none or no date). */
  previous: ExtrasFormValues | null;
};

export type ExtrasFieldError = { field: keyof ExtrasFormValues; message: string };

const EXPENSES = new Set(['none', 'worker', 'client', 'both']);

/** "1.5" / "1,5" / "x1.5" → 15000 basis points (up to 4 decimals). */
export function parseMultiplierBps(text: string): string | null {
  const match = /^[x×]?\s*(\d{1,2})(?:[.,](\d{1,4}))?$/iu.exec(text.trim());
  if (!match) return null;
  return (BigInt(match[1]!) * 10_000n + BigInt((match[2] ?? '').padEnd(4, '0'))).toString();
}

function multiplierText(bps: string): string {
  const value = BigInt(bps);
  const whole = value / 10_000n;
  const fraction = (value % 10_000n).toString().padStart(4, '0').replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** Saved extras → form values (amounts in the project currency, decimal text). */
export function extrasFormValues(
  extras: AssignmentExtras | null,
  expenses: ExtrasExpenseChoice | null,
  currency: string,
  previous: AssignmentExtras | null = null,
): ExtrasFormValues {
  const money = (value: string | null) => (value === null ? '' : formatMinorPlain(value, currency));
  const overtime = (value: OvertimeExtra | null) =>
    value === null
      ? ''
      : value.method === 'multiplier'
        ? multiplierText(value.value)
        : money(value.value);
  return {
    version: extras?.version ?? 0,
    perDiemClient: money(extras?.perDiemClientMinor ?? null),
    perDiemWorker: money(extras?.perDiemWorkerMinor ?? null),
    allowanceBasis: extras?.allowanceBasis ?? '',
    allowanceClient: money(extras?.allowanceClientMinor ?? null),
    allowanceWorker: money(extras?.allowanceWorkerMinor ?? null),
    overtimeClientMethod: extras?.overtimeClient?.method ?? '',
    overtimeClient: overtime(extras?.overtimeClient ?? null),
    overtimeWorkerMethod: extras?.overtimeWorker?.method ?? '',
    overtimeWorker: overtime(extras?.overtimeWorker ?? null),
    expenses: expenses ?? '',
    effectiveFrom: '',
    appliesFrom: extras?.effectiveFrom ?? '',
    previous:
      extras?.effectiveFrom && previous
        ? { ...extrasFormValues(previous, null, currency), version: previous.version }
        : null,
  };
}

/** Typed form → repository input. Empty fields mean "not used". */
export function parseExtrasForm(
  values: Record<string, string>,
  currency: string,
):
  | { ok: true; input: Omit<AssignmentExtrasInput, 'projectMemberId'> }
  | { ok: false; error: ExtrasFieldError } {
  const fail = (field: keyof ExtrasFormValues, message: string) => ({
    ok: false as const,
    error: { field, message },
  });
  const money = (field: keyof ExtrasFormValues): string | null | false => {
    const text = (values[field] ?? '').trim();
    if (!text) return null;
    const parsed = parseMajorToMinor(text, currency, { maxWholeDigits: 9 });
    return parsed === null ? false : parsed.toString();
  };
  const fields = ['perDiemClient', 'perDiemWorker', 'allowanceClient', 'allowanceWorker'] as const;
  const amounts: Record<string, string | null> = {};
  for (const field of fields) {
    const parsed = money(field);
    if (parsed === false) return fail(field, 'Enter an amount such as 50 or 50.00.');
    amounts[field] = parsed;
  }
  const basis = (values.allowanceBasis ?? '').trim();
  if (basis && basis !== 'day' && basis !== 'month')
    return fail('allowanceBasis', 'Choose per day or per month.');
  if ((amounts.allowanceClient !== null || amounts.allowanceWorker !== null) && !basis)
    return fail('allowanceBasis', 'Choose per day or per month.');
  const overtime = (side: 'Client' | 'Worker'): OvertimeExtra | null | ExtrasFieldError => {
    const methodField = `overtime${side}Method` as const;
    const valueField = `overtime${side}` as const;
    const method = (values[methodField] ?? '').trim();
    const text = (values[valueField] ?? '').trim();
    if (!method || !text) return null;
    if (method === 'multiplier') {
      const bps = parseMultiplierBps(text);
      if (bps === null || BigInt(bps) < 10_000n || BigInt(bps) > 100_000n)
        return { field: valueField, message: 'Enter a multiplier between 1 and 10, such as 1.5.' };
      return { method: 'multiplier', value: bps };
    }
    if (method === 'rate') {
      const parsed = parseMajorToMinor(text, currency, { maxWholeDigits: 9 });
      if (parsed === null)
        return { field: valueField, message: 'Enter an hourly rate such as 90 or 90.00.' };
      return { method: 'rate', value: parsed.toString() };
    }
    return { field: methodField, message: 'Choose a rate or a multiplier.' };
  };
  const overtimeClient = overtime('Client');
  if (overtimeClient && 'field' in overtimeClient) return { ok: false, error: overtimeClient };
  const overtimeWorker = overtime('Worker');
  if (overtimeWorker && 'field' in overtimeWorker) return { ok: false, error: overtimeWorker };
  const expenses = (values.expenses ?? '').trim();
  if (expenses && !EXPENSES.has(expenses))
    return fail('expenses', 'Choose how expenses are handled.');
  const effectiveFrom = (values.effectiveFrom ?? '').trim();
  if (effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/u.test(effectiveFrom))
    return fail('effectiveFrom', 'Choose the date the new values start.');
  const version = Number(values.version ?? '0');
  if (!Number.isSafeInteger(version) || version < 0)
    return fail('version', 'Reload the page and try again.');
  return {
    ok: true,
    input: {
      expectedVersion: version,
      perDiemClientMinor: amounts.perDiemClient,
      perDiemWorkerMinor: amounts.perDiemWorker,
      allowanceBasis:
        amounts.allowanceClient !== null || amounts.allowanceWorker !== null
          ? (basis as 'day' | 'month')
          : null,
      allowanceClientMinor: amounts.allowanceClient,
      allowanceWorkerMinor: amounts.allowanceWorker,
      overtimeClient: overtimeClient as OvertimeExtra | null,
      overtimeWorker: overtimeWorker as OvertimeExtra | null,
      ...(expenses ? { expenses: expenses as ExtrasExpenseChoice } : {}),
      ...(effectiveFrom ? { effectiveFrom } : {}),
    },
  };
}

/** Owner/Finance: the extras of every assignment of a project, as form values. */
export function projectExtrasValues(
  context: Context,
  projectId: string,
  currency: string,
): Record<string, ExtrasFormValues> {
  const rows = new AssignmentExtrasRepository(context.sqlite).listForProject(
    context.principal,
    projectId,
  );
  return Object.fromEntries(
    rows.map((row) => [
      row.projectMemberId,
      extrasFormValues(row.extras, row.expenses, currency, row.previous),
    ]),
  );
}

/**
 * Save the Extras block of one assignment. The assignment is named by id, or (just after
 * "Add people") by person and start date.
 */
export function saveAssignmentExtras(
  context: Context,
  projectId: string,
  values: Record<string, string>,
) {
  const project = context.sqlite
    .prepare('SELECT currency FROM project WHERE id=?')
    .get(projectId) as { currency: string } | undefined;
  if (!project)
    return {
      ok: false as const,
      error: { field: 'version' as const, message: 'Project not found.' },
    };
  let memberId = (values.assignmentId ?? '').trim();
  if (!memberId && values.workerId) {
    const row = context.sqlite
      .prepare(
        `SELECT id FROM project_member WHERE project_id=? AND user_id=? AND status='active'
            AND starts_on<=COALESCE(NULLIF(?,''),starts_on) AND (ends_on IS NULL OR ends_on>=COALESCE(NULLIF(?,''),starts_on))
          ORDER BY starts_on DESC LIMIT 1`,
      )
      .get(projectId, values.workerId, values.startsOn ?? '', values.startsOn ?? '') as
      | { id: string }
      | undefined;
    memberId = row?.id ?? '';
  }
  const member = context.sqlite
    .prepare('SELECT id FROM project_member WHERE id=? AND project_id=?')
    .get(memberId, projectId) as { id: string } | undefined;
  if (!member)
    return {
      ok: false as const,
      error: { field: 'version' as const, message: 'Assignment not found on this project.' },
    };
  const parsed = parseExtrasForm(values, project.currency);
  if (!parsed.ok) return parsed;
  const saved = new AssignmentExtrasRepository(context.sqlite).set(context.principal, {
    projectMemberId: member.id,
    ...parsed.input,
  });
  return {
    ok: true as const,
    assignmentId: member.id,
    values: extrasFormValues(saved.extras, saved.expenses, project.currency, saved.previous),
  };
}
