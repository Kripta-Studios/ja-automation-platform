import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import {
  AccessDeniedError,
  ConflictError,
  PortalRepository,
  ValidationError,
} from '../../repository.ts';
import { assertLiveSession } from '../../core/authorization.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';

export type CaptureInput = Readonly<{
  requestKey: string;
  projectId: string;
  workDate: string;
  workSummary: string;
  time?: Readonly<{ category: string; minutes: number }>;
  report?: Readonly<{
    tasksCompleted: string;
    siteShift?: string;
    problemsFound?: string;
    correctiveActions?: string;
    clientDecisions?: string;
    downtimeMinutes: number;
    standbyReason?: string;
    blockers?: string;
    openItems?: string;
    nextDayPlan?: string;
    safetyRelated: boolean;
    customerContact?: string;
  }>;
  expense?: Readonly<{
    category: string;
    description: string;
    currency: string;
    amountMinor: string;
    whoPaid: string;
    vendor?: string;
  }>;
}>;

export type CaptureResult = Readonly<{
  replayed: boolean;
  records: readonly Readonly<{
    type: 'time' | 'report' | 'expense';
    id: string;
    state: string;
    createdAs: 'draft';
  }>[];
}>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/u;
const expenseCategories = new Set([
  'hotel',
  'rental_car',
  'fuel',
  'tolls',
  'parking',
  'airfare',
  'ground_transport',
  'meals',
  'per_diem',
  'materials',
  'tools',
  'shipping',
  'phone_data',
  'visa_permit',
  'other',
]);
const text = (value: unknown, label: string, required = false): string => {
  if (typeof value !== 'string' || value.length > 10000 || (required && !value.trim()))
    throw new ValidationError(`${label} is required or too long`);
  return value;
};

/** Validate the entire request before the first canonical write. Preserve user wording exactly. */
export function validateCapture(input: CaptureInput): CaptureInput {
  if (!/^[a-zA-Z0-9_-]{16,200}$/u.test(input.requestKey))
    throw new ValidationError('Invalid capture request key');
  if (!input.projectId || input.projectId.length > 200)
    throw new ValidationError('Project required');
  if (
    !isoDate.test(input.workDate) ||
    Number.isNaN(Date.parse(`${input.workDate}T00:00:00Z`)) ||
    new Date(`${input.workDate}T00:00:00Z`).toISOString().slice(0, 10) !== input.workDate
  )
    throw new ValidationError('Valid work date required');
  text(input.workSummary, 'Work summary', true);
  if (input.workSummary.length > 5000)
    throw new ValidationError('Work summary must be 5000 characters or fewer');
  if (!input.time && !input.report && !input.expense)
    throw new ValidationError('Select at least one draft');
  if (input.time) {
    text(input.time.category, 'Time category', true);
    if (input.time.category.length > 100)
      throw new ValidationError('Time category must be 100 characters or fewer');
    if (
      !Number.isInteger(input.time.minutes) ||
      input.time.minutes < 1 ||
      input.time.minutes > 1440
    )
      throw new ValidationError('Actual time must be 1 to 1440 minutes');
  }
  if (input.report) {
    text(input.report.tasksCompleted, 'Tasks completed', true);
    if (input.report.tasksCompleted.length > 5000)
      throw new ValidationError('Tasks completed must be 5000 characters or fewer');
    for (const [key, value] of Object.entries(input.report))
      if (typeof value === 'string') text(value, key);
    if (
      !Number.isInteger(input.report.downtimeMinutes) ||
      input.report.downtimeMinutes < 0 ||
      input.report.downtimeMinutes > 1440
    )
      throw new ValidationError('Downtime must be 0 to 1440 minutes');
  }
  if (input.expense) {
    text(input.expense.category, 'Expense category', true);
    if (!expenseCategories.has(input.expense.category))
      throw new ValidationError('Choose a supported expense category');
    text(input.expense.description, 'Expense description', true);
    if (input.expense.description.length > 5000)
      throw new ValidationError('Expense description must be 5000 characters or fewer');
    if (!['EUR', 'USD', 'BRL'].includes(input.expense.currency))
      throw new ValidationError('Supported currency required');
    if (!/^[1-9]\d{0,14}$/u.test(input.expense.amountMinor))
      throw new ValidationError('Expense amount must be positive');
    if (
      !['worker', 'company_card', 'company_direct', 'client', 'third_party'].includes(
        input.expense.whoPaid,
      )
    )
      throw new ValidationError('Expense payer required');
    if (input.expense.vendor) {
      text(input.expense.vendor, 'Vendor');
      if (input.expense.vendor.length > 200)
        throw new ValidationError('Vendor must be 200 characters or fewer');
    }
  }
  return input;
}

function assertCurrentOwnAccess(
  sqlite: DatabaseSync,
  principal: Principal,
  input: CaptureInput,
): void {
  assertLiveSession(sqlite, principal, AccessDeniedError);
  const actor = sqlite.prepare('SELECT role,status FROM user WHERE id=?').get(principal.userId) as
    | { role: string; status: string }
    | undefined;
  if (!actor || actor.status !== 'active' || actor.role !== 'worker' || principal.role !== 'worker')
    throw new AccessDeniedError('Active worker account required');
  const supplier = sqlite
    .prepare(
      "SELECT 1 FROM supplier_user_profile WHERE user_id=? AND profile='supplier_coordinator'",
    )
    .get(principal.userId);
  if (supplier) throw new AccessDeniedError('Use the supplier workflow for coordinated entries');
  const project = sqlite
    .prepare("SELECT timezone FROM project WHERE id=? AND status IN ('active','planned','paused')")
    .get(input.projectId) as { timezone: string } | undefined;
  if (!project) throw new AccessDeniedError('Active project access required');
  let today: string;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: project.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (name: string) => parts.find((part) => part.type === name)?.value;
    today = `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    throw new AccessDeniedError('Active project access required');
  }
  const allowed = sqlite
    .prepare(
      "SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)",
    )
    .get(input.projectId, principal.userId, today, today, input.workDate, input.workDate);
  if (!allowed) throw new AccessDeniedError('Current and work-date project assignment required');
}

export function createFieldCapture(
  sqlite: DatabaseSync,
  repository: PortalRepository,
  principal: Principal,
  raw: CaptureInput,
): CaptureResult {
  const input = validateCapture(raw);
  const { requestKey: _key, ...payload } = input;
  const hash = createHash('sha256').update(canonicalJson(payload)).digest('hex');
  return runImmediateTransaction(sqlite, 'field-capture', () => {
    assertCurrentOwnAccess(sqlite, principal, input);
    const prior = sqlite
      .prepare(
        'SELECT payload_sha256,result_json FROM capture_request WHERE actor_user_id=? AND request_key=?',
      )
      .get(principal.userId, input.requestKey) as
      | { payload_sha256: string; result_json: string }
      | undefined;
    if (prior) {
      if (prior.payload_sha256 !== hash) throw new ConflictError('Capture retry has changed');
      const result = JSON.parse(prior.result_json) as CaptureResult;
      return {
        ...result,
        replayed: true,
        records: result.records.map((record) => {
          const table =
            record.type === 'time'
              ? 'time_entry'
              : record.type === 'report'
                ? 'daily_report'
                : 'expense';
          const row = sqlite
            .prepare(`SELECT approval_state FROM ${table} WHERE id=? AND worker_id=?`)
            .get(record.id, principal.userId) as { approval_state: string } | undefined;
          return { ...record, state: row?.approval_state ?? 'missing' };
        }),
      };
    }
    const records: Array<{
      type: 'time' | 'report' | 'expense';
      id: string;
      state: string;
      createdAs: 'draft';
    }> = [];
    if (input.time) {
      const created = repository.createTimeEntry(principal, {
        projectId: input.projectId,
        workDate: input.workDate,
        category: input.time.category,
        minutes: input.time.minutes,
        summary: input.workSummary,
      });
      records.push({ type: 'time', id: created.id, state: 'draft', createdAs: 'draft' });
    }
    if (input.report) {
      const created = repository.createDailyReport(principal, {
        projectId: input.projectId,
        workDate: input.workDate,
        summary: input.workSummary,
        ...input.report,
      });
      records.push({ type: 'report', id: created.id, state: 'draft', createdAs: 'draft' });
    }
    if (input.expense) {
      const timeEntryId = records.find((record) => record.type === 'time')?.id;
      const created = repository.createExpense(principal, {
        projectId: input.projectId,
        spentOn: input.workDate,
        timeEntryId,
        category: input.expense.category,
        description: input.expense.description,
        currency: input.expense.currency as 'EUR' | 'USD' | 'BRL',
        amountMinor: BigInt(input.expense.amountMinor),
        whoPaid: input.expense.whoPaid,
        vendor: input.expense.vendor,
        receiptRequired: false,
      });
      records.push({ type: 'expense', id: created.id, state: 'draft', createdAs: 'draft' });
    }
    const result: CaptureResult = { replayed: false, records };
    sqlite
      .prepare(
        'INSERT INTO capture_request(actor_user_id,request_key,payload_sha256,result_json,created_at) VALUES(?,?,?,?,?)',
      )
      .run(
        principal.userId,
        input.requestKey,
        hash,
        JSON.stringify(result),
        new Date().toISOString(),
      );
    return result;
  });
}
