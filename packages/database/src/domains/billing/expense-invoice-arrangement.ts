import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, newId, type Principal } from '@ja/domain';
import type { Currency } from '@ja/money';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  type PortalRepository,
} from '../../repository.ts';

/**
 * Expenses on the same invoice or on a separate invoice (owner request 2026-11-26,
 * migration 0096).
 *
 * - A project's own choice is its billing streams: a labor stream that includes expenses
 *   ("same") or a labor stream plus a separate expense stream ("separate").
 * - A client default (append-only versions) applies to the client's projects that have not
 *   chosen yet: a labor stream that does not carry expenses and no expense stream, or no
 *   billing stream at all.
 * - Choosing changes the streams from the first day neither stream has billed yet, so no
 *   invoice or billing period ever changes and no expense can be billed twice. The new expense
 *   stream copies the labor stream's terms (issuer, currency, tax, interval, contact, terms).
 */

export type ExpenseInvoiceMode = 'same' | 'separate';
export const EXPENSE_INVOICE_MODES: readonly ExpenseInvoiceMode[] = ['same', 'separate'];

export type ClientExpenseInvoiceSetting = Readonly<{
  mode: ExpenseInvoiceMode | null;
  version: number;
  createdAt: string;
}>;

/** How the project's open billing streams bill expenses today. */
export type ExpenseStreamsState = 'same' | 'separate' | 'labor_only' | 'none';

export type ProjectExpenseArrangement = Readonly<{
  projectId: string;
  clientId: string;
  streams: ExpenseStreamsState;
  laborRuleId: string | null;
  expenseRuleId: string | null;
  /** The client default (null = not set) and its version. */
  clientMode: ExpenseInvoiceMode | null;
  clientVersion: number;
  /** What applies to this project, and where it comes from. */
  mode: ExpenseInvoiceMode;
  source: 'project' | 'client' | 'default';
}>;

type RuleRow = {
  id: string;
  project_id: string;
  stream_type: string;
  legal_entity_id: string | null;
  cadence_type: string;
  anchor_date: string | null;
  tax_profile_id: string | null;
  currency: string;
  auto_generate_draft: number;
  effective_from: string;
  effective_to: string | null;
  template_id: string | null;
  recipient_email: string | null;
  payment_terms_days: number | null;
  po_number_override: string | null;
  semi_monthly_rule: string | null;
  grouping_mode: string | null;
  billing_contact_id: string | null;
  fixed_amount_minor: number | bigint | null;
  included_minutes: number | null;
  monthly_cutoff_day: number | null;
  include_expenses: number;
  invoice_preview_defaults_json?: string | null;
  past_due_notice?: string | null;
};

const shiftDay = (value: string, days: number): string =>
  new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const later = (a: string, b: string): string => (a > b ? a : b);
const optional = (value: unknown): string | undefined =>
  value === null || value === undefined || value === '' ? undefined : String(value);

export function clientExpenseInvoiceSetting(
  sqlite: DatabaseSync,
  clientId: string,
): ClientExpenseInvoiceSetting | null {
  // A database older than migration 0096 (e.g. during an upgrade) has no client default.
  if (
    !sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='client_expense_invoice_setting'")
      .get()
  )
    return null;
  const row = sqlite
    .prepare(
      `SELECT mode,version,created_at FROM client_expense_invoice_setting
        WHERE client_id=? ORDER BY version DESC LIMIT 1`,
    )
    .get(clientId) as { mode: string | null; version: number; created_at: string } | undefined;
  if (!row) return null;
  return {
    mode: (row.mode as ExpenseInvoiceMode | null) ?? null,
    version: Number(row.version),
    createdAt: row.created_at,
  };
}

function openRules(sqlite: DatabaseSync, projectId: string): { labor?: RuleRow; expense?: RuleRow } {
  const rows = sqlite
    .prepare(
      `SELECT * FROM billing_rule WHERE project_id=? AND enabled=1 AND effective_to IS NULL
          AND stream_type IN ('labor','expense') ORDER BY effective_from DESC`,
    )
    .all(projectId) as RuleRow[];
  return {
    labor: rows.find((row) => row.stream_type === 'labor'),
    expense: rows.find((row) => row.stream_type === 'expense'),
  };
}

/** The project's choice (its streams), else the client default, else "same invoice". */
export function projectExpenseArrangement(
  sqlite: DatabaseSync,
  projectId: string,
): ProjectExpenseArrangement {
  const project = sqlite.prepare('SELECT id,client_id FROM project WHERE id=?').get(projectId) as
    | { id: string; client_id: string }
    | undefined;
  if (!project) throw new ValidationError('Project not found');
  const { labor, expense } = openRules(sqlite, projectId);
  const streams: ExpenseStreamsState = !labor
    ? expense
      ? 'separate'
      : 'none'
    : expense
      ? 'separate'
      : Number(labor.include_expenses) === 1
        ? 'same'
        : 'labor_only';
  const client = clientExpenseInvoiceSetting(sqlite, project.client_id);
  const own = streams === 'same' || streams === 'separate';
  return {
    projectId,
    clientId: project.client_id,
    streams,
    laborRuleId: labor?.id ?? null,
    expenseRuleId: expense?.id ?? null,
    clientMode: client?.mode ?? null,
    clientVersion: client?.version ?? 0,
    mode: own ? (streams as ExpenseInvoiceMode) : (client?.mode ?? 'same'),
    source: own ? 'project' : client?.mode ? 'client' : 'default',
  };
}

/** First day after every invoice and billing period of this stream (never inside history). */
function firstUnbilledDay(sqlite: DatabaseSync, rule: RuleRow): string {
  const row = sqlite
    .prepare(
      `SELECT MAX(d) d FROM (
         SELECT MAX(period_end) d FROM invoice WHERE billing_rule_id=?
         UNION ALL SELECT MAX(period_end) FROM billing_period WHERE billing_rule_id=?)`,
    )
    .get(rule.id, rule.id) as { d: string | null };
  return row.d ? later(rule.effective_from, shiftDay(row.d, 1)) : rule.effective_from;
}

/**
 * First day no expense-carrying invoice, expense billing period or earlier expense-carrying
 * stream of the project covers (same floor as the one-step expense setup).
 */
export function expenseBillingFloorStart(sqlite: DatabaseSync, projectId: string): string | null {
  const floor = (
    sqlite
      .prepare(
        `SELECT MAX(d) d FROM (
           SELECT MAX(i.period_end) d FROM invoice i WHERE i.project_id=?
              AND i.state NOT IN ('void','cancelled','superseded')
              AND (EXISTS(SELECT 1 FROM invoice_source s WHERE s.invoice_id=i.id AND s.source_type='expense')
                OR EXISTS(SELECT 1 FROM billing_rule br WHERE br.id=i.billing_rule_id AND br.stream_type='expense'))
           UNION ALL
           SELECT MAX(bp.period_end) FROM billing_period bp JOIN billing_rule br ON br.id=bp.billing_rule_id
            WHERE br.project_id=? AND br.stream_type='expense'
           UNION ALL
           SELECT MAX(effective_to) FROM billing_rule WHERE project_id=? AND enabled=1
              AND (stream_type='expense' OR (stream_type='labor' AND include_expenses=1)))`,
      )
      .get(projectId, projectId, projectId) as { d: string | null }
  ).d;
  return floor ? shiftDay(floor, 1) : null;
}

export type ExpenseArrangementChange = Readonly<{
  changed: boolean;
  before: ExpenseStreamsState;
  mode: ExpenseInvoiceMode;
  /** First day the new arrangement applies (null when nothing changed). */
  effectiveFrom: string | null;
  laborRuleId: string | null;
  expenseRuleId: string | null;
}>;

/**
 * The day the project would switch to `mode`, without writing anything (null = no change
 * needed or no labor stream to change).
 */
export function expenseArrangementStart(
  sqlite: DatabaseSync,
  projectId: string,
  mode: ExpenseInvoiceMode,
): string | null {
  const { labor, expense } = openRules(sqlite, projectId);
  if (!labor) return null;
  const floor = expenseBillingFloorStart(sqlite, projectId);
  if (mode === 'separate') {
    if (expense) return null;
    if (Number(labor.include_expenses) !== 1) return later(labor.effective_from, floor ?? '0000-01-01');
    return firstUnbilledDay(sqlite, labor);
  }
  if (!expense && Number(labor.include_expenses) === 1) return null;
  const start = expense
    ? later(firstUnbilledDay(sqlite, labor), firstUnbilledDay(sqlite, expense))
    : firstUnbilledDay(sqlite, labor);
  return later(start, expense ? start : (floor ?? '0000-01-01'));
}

export class ExpenseInvoiceSettingsRepository {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly repository: PortalRepository,
  ) {}

  private assertFinance(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, AccessDeniedError);
    assertLiveSession(this.sqlite, principal, AccessDeniedError);
    const current = this.sqlite
      .prepare('SELECT role,status FROM user WHERE id=?')
      .get(principal.userId) as { role: string; status: string } | undefined;
    if (
      !canManageBilling(principal) ||
      !current ||
      current.status !== 'active' ||
      !['owner_admin', 'finance_admin'].includes(current.role)
    )
      throw new AccessDeniedError('Owner or Finance role required');
  }

  /** Client default (audited version). `null` = not set. */
  setClientMode(
    principal: Principal,
    input: Readonly<{ clientId: string; mode: ExpenseInvoiceMode | null; expectedVersion: number }>,
  ): ClientExpenseInvoiceSetting | null {
    this.assertFinance(principal);
    const mode = input.mode === null || (input.mode as string) === '' ? null : input.mode;
    if (mode !== null && !EXPENSE_INVOICE_MODES.includes(mode))
      throw new ValidationError('Choose where expenses are invoiced');
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
      throw new ValidationError('Current version required');
    return runImmediateTransaction(this.sqlite, 'client-expense-invoice', () => {
      if (!this.sqlite.prepare('SELECT 1 FROM client WHERE id=?').get(input.clientId))
        throw new ValidationError('Client not found');
      const current = clientExpenseInvoiceSetting(this.sqlite, input.clientId);
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictError('This setting changed. Reload before saving.');
      if ((current?.mode ?? null) === mode) return current;
      const id = newId();
      const version = (current?.version ?? 0) + 1;
      this.sqlite
        .prepare(
          `INSERT INTO client_expense_invoice_setting(id,client_id,version,mode,reason,created_by,created_at)
           VALUES(?,?,?,?,NULL,?,?)`,
        )
        .run(id, input.clientId, version, mode, principal.userId, new Date().toISOString());
      recordAuditEvent(this.sqlite, principal, 'client.expense_invoice_set', 'client', input.clientId, {
        settingId: id,
        version,
        before: { mode: current?.mode ?? null },
        after: { mode },
      });
      return clientExpenseInvoiceSetting(this.sqlite, input.clientId);
    });
  }

  /** Project choice: rearranges the project's billing streams (audited). */
  setProjectMode(
    principal: Principal,
    input: Readonly<{ projectId: string; mode: ExpenseInvoiceMode; via?: 'project' | 'invoice' }>,
  ): ExpenseArrangementChange {
    this.assertFinance(principal);
    if (!EXPENSE_INVOICE_MODES.includes(input.mode))
      throw new ValidationError('Choose where expenses are invoiced');
    return runImmediateTransaction(this.sqlite, 'project-expense-invoice', () =>
      this.apply(principal, input.projectId, input.mode, input.via ?? 'project'),
    );
  }

  private apply(
    principal: Principal,
    projectId: string,
    mode: ExpenseInvoiceMode,
    via: 'project' | 'invoice',
  ): ExpenseArrangementChange {
    const project = this.sqlite.prepare('SELECT id,currency FROM project WHERE id=?').get(projectId) as
      | { id: string; currency: Currency }
      | undefined;
    if (!project) throw new ValidationError('Project not found');
    const before = projectExpenseArrangement(this.sqlite, projectId).streams;
    const { labor, expense } = openRules(this.sqlite, projectId);
    if (!labor || !labor.legal_entity_id)
      throw new ValidationError('Set up how this project is invoiced first');
    const effectiveFrom = expenseArrangementStart(this.sqlite, projectId, mode);
    if (effectiveFrom === null)
      return {
        changed: false,
        before,
        mode,
        effectiveFrom: null,
        laborRuleId: labor.id,
        expenseRuleId: expense?.id ?? null,
      };
    let laborRuleId = labor.id;
    let expenseRuleId: string | null = expense?.id ?? null;
    if (mode === 'separate') {
      if (Number(labor.include_expenses) === 1)
        laborRuleId = this.laborFrom(principal, project.currency, labor, effectiveFrom, false);
      expenseRuleId = this.repository.createBillingRule(principal, {
        ...this.terms(labor, project.currency),
        streamType: 'expense',
        templateId: 'expenses-detailed',
        effectiveFrom,
      }).id;
    } else {
      if (expense) this.closeExpense(principal, expense, effectiveFrom);
      expenseRuleId = null;
      laborRuleId = this.laborFrom(principal, project.currency, labor, effectiveFrom, true);
    }
    recordAuditEvent(this.sqlite, principal, 'project.expense_invoice_set', 'project', projectId, {
      projectId,
      before: { streams: before },
      after: { mode },
      effectiveFrom,
      laborRuleId,
      expenseRuleId,
      via,
    });
    return { changed: true, before, mode, effectiveFrom, laborRuleId, expenseRuleId };
  }

  private terms(rule: RuleRow, currency: Currency) {
    return {
      projectId: rule.project_id,
      legalEntityId: String(rule.legal_entity_id),
      cadenceType: rule.cadence_type,
      currency,
      anchorDate: optional(rule.anchor_date),
      taxProfileId: optional(rule.tax_profile_id),
      recipientEmail: optional(rule.recipient_email),
      billingContactId: optional(rule.billing_contact_id),
      poNumberOverride: optional(rule.po_number_override),
      semiMonthlyRule: optional(rule.semi_monthly_rule),
      groupingMode: optional(rule.grouping_mode),
      autoGenerateDraft: Number(rule.auto_generate_draft) === 1,
      ...(rule.payment_terms_days !== null && rule.payment_terms_days !== undefined
        ? { paymentTermsDays: Number(rule.payment_terms_days) }
        : {}),
      ...(rule.monthly_cutoff_day ? { monthlyCutoffDay: Number(rule.monthly_cutoff_day) } : {}),
    };
  }

  /** The labor stream with `includeExpenses` from `effectiveFrom` (in place when unused). */
  private laborFrom(
    principal: Principal,
    currency: Currency,
    labor: RuleRow,
    effectiveFrom: string,
    includeExpenses: boolean,
  ): string {
    if (effectiveFrom <= labor.effective_from) {
      this.repository.updateBillingRule(principal, labor.id, { includeExpenses });
      return labor.id;
    }
    const created = this.repository.createBillingRule(principal, {
      ...this.terms(labor, currency),
      streamType: 'labor',
      includeExpenses,
      effectiveFrom,
      templateId: optional(labor.template_id),
      ...(labor.past_due_notice ? { pastDueNotice: labor.past_due_notice } : {}),
      ...(labor.fixed_amount_minor !== null && labor.fixed_amount_minor !== undefined
        ? { fixedAmountMinor: BigInt(labor.fixed_amount_minor) }
        : {}),
      ...(labor.included_minutes !== null && labor.included_minutes !== undefined
        ? { includedMinutes: Number(labor.included_minutes) }
        : {}),
    });
    if (labor.invoice_preview_defaults_json)
      this.sqlite
        .prepare('UPDATE billing_rule SET invoice_preview_defaults_json=? WHERE id=?')
        .run(labor.invoice_preview_defaults_json, created.id);
    return created.id;
  }

  /** Stop the separate expense stream the day before `effectiveFrom` (never its history). */
  private closeExpense(principal: Principal, rule: RuleRow, effectiveFrom: string): void {
    const stamp = new Date().toISOString();
    if (effectiveFrom <= rule.effective_from)
      this.sqlite
        .prepare('UPDATE billing_rule SET enabled=0,updated_at=?,version=version+1 WHERE id=?')
        .run(stamp, rule.id);
    else
      this.sqlite
        .prepare('UPDATE billing_rule SET effective_to=?,updated_at=?,version=version+1 WHERE id=?')
        .run(shiftDay(effectiveFrom, -1), stamp, rule.id);
    recordAuditEvent(this.sqlite, principal, 'billing_rule.archive', 'billing_rule', rule.id, {
      projectId: rule.project_id,
      effectiveFrom,
      reason: 'Expenses on the same invoice as the hours',
    });
  }
}
