import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, newId, type Principal } from '@ja/domain';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';

/**
 * Owner decision D4 (2026-11-26): who carries the expenses an EXTERNAL (supplier) technician
 * logs on a project.
 *
 * - 'ja': J&A reimburses the technician (what he paid himself is owed to him in My Pay /
 *   Reimbursements, as before).
 * - 'supplier': recharged to the supplier. J&A owes the technician nothing (his own company
 *   refunds him); what J&A paid for him (company card / paid directly) is deducted from the
 *   supplier's settlement, or is still to be recovered from (invoiced to) the supplier.
 *
 * Set per project (default for all external technicians on it) and per person (override on
 * the technician's assignment). Precedence: person > project > the behaviour before D4
 * (J&A reimburses). Rules are dated: the rule in force on the expense day applies. Client
 * billing (recharge to the client) is independent and never changes here. Only applies to
 * people linked to a supplier (supplier_user_profile); J&A's own workers are never affected.
 */
export type SupplierExpenseCarrier = 'ja' | 'supplier';
export type SupplierExpenseRuleSource = 'person' | 'project' | 'default';

export type SupplierExpenseRule = Readonly<{
  carrier: SupplierExpenseCarrier;
  source: SupplierExpenseRuleSource;
  /** First day of the rule in force (null: the default, no rule). */
  effectiveFrom: string | null;
}>;

export type SupplierExpenseTreatment =
  /** Paid by the technician, J&A reimburses him (Reimbursements / My Pay). */
  | 'ja_reimburses'
  /** Paid by J&A and carried by J&A. */
  | 'ja_cost'
  /** Paid by the technician, his own company refunds him: J&A pays nothing. */
  | 'supplier_pays_technician'
  /** Paid by J&A for the technician: deducted from / invoiced to the supplier. */
  | 'recharge'
  /** Paid by the client or a third party: nobody owes anything here. */
  | 'not_ours';

const COMPANY_PAID = new Set(['company', 'company_card', 'company_direct']);
const tableCache = new WeakMap<DatabaseSync, boolean>();

/** True once migration 0097 is applied (older schemas: no rule, the old behaviour). */
export function hasSupplierExpenseRules(sqlite: DatabaseSync): boolean {
  const cached = tableCache.get(sqlite);
  if (cached !== undefined) return cached;
  const exists = Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='supplier_expense_rule'")
      .get(),
  );
  // Only cache a positive answer: a fresh database may migrate later in the same process.
  if (exists) tableCache.set(sqlite, true);
  return exists;
}

/**
 * SQL predicate, true when the expense row `alias` (columns project_id, worker_id, spent_on)
 * is carried by the technician's supplier: J&A never owes that expense to the technician.
 * Never NULL (a NULL inside NOT would hide the row): '' when no rule is set.
 * '0' on schemas before migration 0097.
 */
export function supplierCarriesExpenseSql(sqlite: DatabaseSync, alias = 'e'): string {
  if (!hasSupplierExpenseRules(sqlite)) return '0';
  const a = alias;
  return `(EXISTS(SELECT 1 FROM supplier_user_profile ser_sup WHERE ser_sup.user_id=${a}.worker_id)
    AND COALESCE(
      (SELECT ser_p.carrier FROM supplier_expense_rule ser_p
         JOIN project_member ser_pm ON ser_pm.id=ser_p.project_member_id
        WHERE ser_p.project_id=${a}.project_id AND ser_pm.user_id=${a}.worker_id
          AND ser_pm.starts_on<=${a}.spent_on AND (ser_pm.ends_on IS NULL OR ser_pm.ends_on>=${a}.spent_on)
          AND ser_p.effective_from<=${a}.spent_on
        ORDER BY ser_p.effective_from DESC,ser_p.version DESC LIMIT 1),
      (SELECT ser_j.carrier FROM supplier_expense_rule ser_j
        WHERE ser_j.project_id=${a}.project_id AND ser_j.project_member_id IS NULL
          AND ser_j.effective_from<=${a}.spent_on
        ORDER BY ser_j.effective_from DESC,ser_j.version DESC LIMIT 1),
      ''
    )='supplier')`;
}

type RuleRow = { carrier: SupplierExpenseCarrier | null; effective_from: string; version: number };

function ruleOn(
  sqlite: DatabaseSync,
  projectId: string,
  projectMemberId: string | null,
  onDate: string,
): RuleRow | null {
  if (!hasSupplierExpenseRules(sqlite)) return null;
  return (
    (sqlite
      .prepare(
        `SELECT carrier,effective_from,version FROM supplier_expense_rule
          WHERE project_id=? AND project_member_id IS ? AND effective_from<=?
          ORDER BY effective_from DESC,version DESC LIMIT 1`,
      )
      .get(projectId, projectMemberId, onDate) as RuleRow | undefined) ?? null
  );
}

/** The next dated change after `onDate` (a rule saved to start later), if any. */
function nextRule(
  sqlite: DatabaseSync,
  projectId: string,
  projectMemberId: string | null,
  onDate: string,
): RuleRow | null {
  if (!hasSupplierExpenseRules(sqlite)) return null;
  return (
    (sqlite
      .prepare(
        `SELECT carrier,effective_from,version FROM supplier_expense_rule
          WHERE project_id=? AND project_member_id IS ? AND effective_from>?
          ORDER BY effective_from,version DESC LIMIT 1`,
      )
      .get(projectId, projectMemberId, onDate) as RuleRow | undefined) ?? null
  );
}

export function supplierOfUser(
  sqlite: DatabaseSync,
  userId: string,
): { supplierId: string; supplierName: string } | null {
  const row = sqlite
    .prepare(
      `SELECT p.supplier_id,s.name FROM supplier_user_profile p JOIN supplier s ON s.id=p.supplier_id
        WHERE p.user_id=?`,
    )
    .get(userId) as { supplier_id: string; name: string } | undefined;
  return row ? { supplierId: row.supplier_id, supplierName: row.name } : null;
}

function memberOn(
  sqlite: DatabaseSync,
  projectId: string,
  workerId: string,
  onDate: string,
): string | null {
  const row = sqlite
    .prepare(
      `SELECT id FROM project_member WHERE project_id=? AND user_id=? AND starts_on<=?
          AND (ends_on IS NULL OR ends_on>=?)
        ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,starts_on DESC LIMIT 1`,
    )
    .get(projectId, workerId, onDate, onDate) as { id: string } | undefined;
  return row?.id ?? null;
}

/** Combine a person rule and a project rule: person > project > default (J&A). */
export function combineSupplierExpenseRules(
  person: RuleRow | null,
  project: RuleRow | null,
): SupplierExpenseRule {
  if (person?.carrier)
    return { carrier: person.carrier, source: 'person', effectiveFrom: person.effective_from };
  if (project?.carrier)
    return { carrier: project.carrier, source: 'project', effectiveFrom: project.effective_from };
  return { carrier: 'ja', source: 'default', effectiveFrom: null };
}

/**
 * Who carries an expense of `workerId` on `projectId` dated `onDate`. Null when the person
 * is not a supplier's staff (D4 does not apply: J&A's own rules, unchanged).
 */
export function effectiveSupplierExpenseRule(
  sqlite: DatabaseSync,
  input: Readonly<{ projectId: string; workerId: string; onDate: string }>,
): (SupplierExpenseRule & { supplierId: string; supplierName: string }) | null {
  const supplier = supplierOfUser(sqlite, input.workerId);
  if (!supplier) return null;
  const memberId = memberOn(sqlite, input.projectId, input.workerId, input.onDate);
  const rule = combineSupplierExpenseRules(
    memberId ? ruleOn(sqlite, input.projectId, memberId, input.onDate) : null,
    ruleOn(sqlite, input.projectId, null, input.onDate),
  );
  return { ...rule, ...supplier };
}

export function supplierCarriesExpense(
  sqlite: DatabaseSync,
  input: Readonly<{ projectId: string; workerId: string; onDate: string }>,
): boolean {
  return effectiveSupplierExpenseRule(sqlite, input)?.carrier === 'supplier';
}

export function supplierExpenseTreatment(
  carrier: SupplierExpenseCarrier,
  whoPaid: string,
): SupplierExpenseTreatment {
  if (whoPaid === 'worker')
    return carrier === 'supplier' ? 'supplier_pays_technician' : 'ja_reimburses';
  if (COMPANY_PAID.has(whoPaid)) return carrier === 'supplier' ? 'recharge' : 'ja_cost';
  return 'not_ours';
}

function calendarDate(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new ValidationError(`${field} must be a date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new ValidationError(`${field} must be a real date`);
  return value;
}

function carrierValue(value: unknown): SupplierExpenseCarrier | null {
  if (value === null || value === undefined || value === '') return null;
  if (value === 'ja' || value === 'supplier') return value;
  throw new ValidationError('Choose who pays the external technicians’ expenses');
}

export type SupplierExpenseRuleView = Readonly<{
  /** The project default in force today (null: not set, J&A reimburses as before). */
  project: Readonly<{ carrier: SupplierExpenseCarrier | null; effectiveFrom: string | null }>;
  /** A project change saved to start after today. */
  projectNext: Readonly<{ carrier: SupplierExpenseCarrier | null; effectiveFrom: string }> | null;
  technicians: ReadonlyArray<
    Readonly<{
      projectMemberId: string;
      workerId: string;
      supplierName: string;
      /** The person's own choice in force today (null: follows the project). */
      person: SupplierExpenseCarrier | null;
      personFrom: string | null;
      personNext: Readonly<{
        carrier: SupplierExpenseCarrier | null;
        effectiveFrom: string;
      }> | null;
      effective: SupplierExpenseRule;
    }>
  >;
}>;

/** Owner / Finance only (PM and everyone else are refused on the server). */
export class SupplierExpenseRuleRepository {
  constructor(private readonly sqlite: DatabaseSync) {}

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

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  view(principal: Principal, projectId: string, today = this.today()): SupplierExpenseRuleView {
    this.assertFinance(principal);
    const project = ruleOn(this.sqlite, projectId, null, today);
    const next = nextRule(this.sqlite, projectId, null, today);
    const members = this.sqlite
      .prepare(
        `SELECT pm.id,pm.user_id,pm.starts_on,s.name supplier_name FROM project_member pm
           JOIN supplier_user_profile p ON p.user_id=pm.user_id JOIN supplier s ON s.id=p.supplier_id
          WHERE pm.project_id=? AND pm.status='active' AND (pm.ends_on IS NULL OR pm.ends_on>=?)
          ORDER BY pm.starts_on,pm.id`,
      )
      .all(projectId, today) as Array<{
      id: string;
      user_id: string;
      starts_on: string;
      supplier_name: string;
    }>;
    return {
      project: {
        carrier: project?.carrier ?? null,
        effectiveFrom: project?.effective_from ?? null,
      },
      projectNext: next ? { carrier: next.carrier, effectiveFrom: next.effective_from } : null,
      technicians: members.map((member) => {
        const on = member.starts_on > today ? member.starts_on : today;
        const person = ruleOn(this.sqlite, projectId, member.id, on);
        const personNext = nextRule(this.sqlite, projectId, member.id, on);
        return {
          projectMemberId: member.id,
          workerId: member.user_id,
          supplierName: member.supplier_name,
          person: person?.carrier ?? null,
          personFrom: person?.effective_from ?? null,
          personNext: personNext
            ? { carrier: personNext.carrier, effectiveFrom: personNext.effective_from }
            : null,
          effective: combineSupplierExpenseRules(person, ruleOn(this.sqlite, projectId, null, on)),
        };
      }),
    };
  }

  /**
   * A new rule may not reinterpret expenses that are already settled: reimbursed to the
   * technician, deducted from a supplier settlement, or (when the supplier would now carry
   * them) already decided as owed to the technician by J&A.
   */
  private assertHistory(
    projectId: string,
    workerIds: readonly string[],
    from: string,
    carrier: SupplierExpenseCarrier | null,
  ): void {
    if (!workerIds.length) return;
    const placeholders = workerIds.map(() => '?').join(',');
    const scope = `e.project_id=? AND e.worker_id IN (${placeholders}) AND e.spent_on>=?
       AND e.approval_state NOT IN ('rejected','void')`;
    const args = [projectId, ...workerIds, from];
    const paid = this.sqlite
      .prepare(
        `SELECT 1 FROM expense e WHERE ${scope}
           AND (e.reimbursed_at IS NOT NULL OR e.reimbursement_state='reimbursed') LIMIT 1`,
      )
      .get(...args);
    const recharged = this.sqlite
      .prepare(
        `SELECT 1 FROM expense e JOIN supplier_expense_recharge r ON r.expense_id=e.id
          WHERE ${scope} LIMIT 1`,
      )
      .get(...args);
    const owed =
      carrier === 'supplier'
        ? this.sqlite
            .prepare(
              `SELECT 1 FROM expense e WHERE ${scope} AND e.who_paid='worker'
                 AND e.commercial_classification_state='classified' AND e.reimbursement_amount_minor>0
               LIMIT 1`,
            )
            .get(...args)
        : undefined;
    if (paid || recharged || owed)
      throw new ConflictError(
        'Some expenses from this date are already reimbursed, deducted or set to be reimbursed by J&A. Choose a later date.',
      );
  }

  private insert(
    principal: Principal,
    input: {
      projectId: string;
      projectMemberId: string | null;
      carrier: SupplierExpenseCarrier | null;
      effectiveFrom: string;
      reason: string | null;
      before: SupplierExpenseCarrier | null;
      workerId?: string;
    },
  ): void {
    const prior = this.sqlite
      .prepare(
        'SELECT COALESCE(MAX(version),0) version FROM supplier_expense_rule WHERE project_id=? AND project_member_id IS ?',
      )
      .get(input.projectId, input.projectMemberId) as { version: number };
    const id = newId();
    const version = Number(prior.version) + 1;
    this.sqlite
      .prepare(
        `INSERT INTO supplier_expense_rule(id,project_id,project_member_id,carrier,effective_from,version,reason,created_by,created_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.projectId,
        input.projectMemberId,
        input.carrier,
        input.effectiveFrom,
        version,
        input.reason,
        principal.userId,
        new Date().toISOString(),
      );
    recordAuditEvent(
      this.sqlite,
      principal,
      input.projectMemberId
        ? 'assignment.supplier_expense_rule_set'
        : 'project.supplier_expense_rule_set',
      input.projectMemberId ? 'project_member' : 'project',
      input.projectMemberId ?? input.projectId,
      {
        supplierExpenseRuleId: id,
        projectId: input.projectId,
        ...(input.workerId ? { workerId: input.workerId } : {}),
        version,
        effectiveFrom: input.effectiveFrom,
        before: input.before,
        after: input.carrier,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    );
  }

  /** Project default for all external technicians on the project (audited, dated). */
  setProjectRule(
    principal: Principal,
    input: Readonly<{
      projectId: string;
      carrier: SupplierExpenseCarrier | null | '';
      effectiveFrom?: string | null;
      reason?: string | null;
    }>,
  ): { changed: boolean; effectiveFrom: string } {
    this.assertFinance(principal);
    const carrier = carrierValue(input.carrier);
    const from = input.effectiveFrom
      ? calendarDate(input.effectiveFrom, 'Applies from')
      : this.today();
    const reason = input.reason?.trim().slice(0, 2000) || null;
    return runImmediateTransaction(this.sqlite, 'supplier-expense-rule', () => {
      const project = this.sqlite.prepare('SELECT id FROM project WHERE id=?').get(input.projectId);
      if (!project) throw new ValidationError('Project not found');
      const current = ruleOn(this.sqlite, input.projectId, null, from);
      const later = nextRule(this.sqlite, input.projectId, null, from);
      if ((current?.carrier ?? null) === carrier && !later)
        return { changed: false, effectiveFrom: from };
      const workers = (
        this.sqlite
          .prepare(
            `SELECT DISTINCT pm.user_id FROM project_member pm JOIN supplier_user_profile p ON p.user_id=pm.user_id
              WHERE pm.project_id=?`,
          )
          .all(input.projectId) as Array<{ user_id: string }>
      ).map((row) => row.user_id);
      this.assertHistory(input.projectId, workers, from, carrier);
      this.insert(principal, {
        projectId: input.projectId,
        projectMemberId: null,
        carrier,
        effectiveFrom: from,
        reason,
        before: current?.carrier ?? null,
      });
      return { changed: true, effectiveFrom: from };
    });
  }

  /** Override on one external technician's assignment (null: follow the project). */
  setPersonRule(
    principal: Principal,
    input: Readonly<{
      projectMemberId: string;
      carrier: SupplierExpenseCarrier | null | '';
      effectiveFrom?: string | null;
      reason?: string | null;
    }>,
  ): { changed: boolean; effectiveFrom: string } {
    this.assertFinance(principal);
    const carrier = carrierValue(input.carrier);
    const requested = input.effectiveFrom
      ? calendarDate(input.effectiveFrom, 'Applies from')
      : this.today();
    const reason = input.reason?.trim().slice(0, 2000) || null;
    return runImmediateTransaction(this.sqlite, 'supplier-expense-rule', () => {
      const member = this.sqlite
        .prepare(
          'SELECT id,project_id,user_id,starts_on,ends_on,status FROM project_member WHERE id=?',
        )
        .get(input.projectMemberId) as
        | {
            id: string;
            project_id: string;
            user_id: string;
            starts_on: string;
            ends_on: string | null;
            status: string;
          }
        | undefined;
      if (!member || member.status !== 'active')
        throw new ValidationError('Active project assignment required');
      if (!supplierOfUser(this.sqlite, member.user_id))
        throw new ValidationError('Only a supplier’s technician has this choice');
      const from = requested < member.starts_on ? member.starts_on : requested;
      if (member.ends_on && from > member.ends_on)
        throw new ValidationError(
          'This assignment has ended: its expense terms can no longer change',
        );
      const current = ruleOn(this.sqlite, member.project_id, member.id, from);
      const later = nextRule(this.sqlite, member.project_id, member.id, from);
      if ((current?.carrier ?? null) === carrier && !later)
        return { changed: false, effectiveFrom: from };
      const effectiveAfter = combineSupplierExpenseRules(
        carrier ? { carrier, effective_from: from, version: 0 } : null,
        ruleOn(this.sqlite, member.project_id, null, from),
      ).carrier;
      this.assertHistory(member.project_id, [member.user_id], from, effectiveAfter);
      this.insert(principal, {
        projectId: member.project_id,
        projectMemberId: member.id,
        carrier,
        effectiveFrom: from,
        reason,
        before: current?.carrier ?? null,
        workerId: member.user_id,
      });
      return { changed: true, effectiveFrom: from };
    });
  }
}

/** Read-only "who pays my expenses" for a technician (own projects) or a coordinator. */
export function supplierExpenseRulesForViewer(
  sqlite: DatabaseSync,
  principal: Principal,
  today = new Date().toISOString().slice(0, 10),
): Array<{
  projectId: string;
  workerId: string;
  carrier: SupplierExpenseCarrier;
  source: SupplierExpenseRuleSource;
  effectiveFrom: string | null;
  supplierName: string;
}> {
  const supplier = supplierOfUser(sqlite, principal.userId);
  if (!supplier) return [];
  const coordinator = Boolean(
    sqlite
      .prepare(
        "SELECT 1 FROM supplier_user_profile WHERE user_id=? AND profile='supplier_coordinator'",
      )
      .get(principal.userId),
  );
  const rows = coordinator
    ? (sqlite
        .prepare(
          `SELECT DISTINCT pm.project_id,pm.user_id,pm.starts_on FROM supplier_project_grant g
             JOIN project_member pm ON pm.project_id=g.project_id AND pm.status='active'
             JOIN supplier_user_profile p ON p.user_id=pm.user_id AND p.supplier_id=g.supplier_id
               AND p.profile='external_technician'
            WHERE g.supplier_id=? AND g.coordinator_id=? AND g.status='active'
              AND (g.ends_on IS NULL OR g.ends_on>=?) AND (pm.ends_on IS NULL OR pm.ends_on>=?)
            ORDER BY pm.project_id,pm.user_id`,
        )
        .all(supplier.supplierId, principal.userId, today, today) as Array<{
        project_id: string;
        user_id: string;
        starts_on: string;
      }>)
    : (sqlite
        .prepare(
          `SELECT project_id,user_id,starts_on FROM project_member WHERE user_id=? AND status='active'
              AND (ends_on IS NULL OR ends_on>=?) ORDER BY project_id`,
        )
        .all(principal.userId, today) as Array<{
        project_id: string;
        user_id: string;
        starts_on: string;
      }>);
  return rows.map((row) => {
    const on = row.starts_on > today ? row.starts_on : today;
    const rule = effectiveSupplierExpenseRule(sqlite, {
      projectId: row.project_id,
      workerId: row.user_id,
      onDate: on,
    })!;
    return {
      projectId: row.project_id,
      workerId: row.user_id,
      carrier: rule.carrier,
      source: rule.source,
      effectiveFrom: rule.effectiveFrom,
      supplierName: rule.supplierName,
    };
  });
}

export type SupplierExpenseItem = Readonly<{
  expenseId: string;
  workerId: string;
  projectId: string;
  spentOn: string;
  category: string;
  vendor: string | null;
  whoPaid: string;
  sourceCurrency: string;
  sourceAmountMinor: string;
  /** Project (settlement) currency and the amount in it; null when a conversion is missing. */
  currency: string;
  amountMinor: string | null;
  carrier: SupplierExpenseCarrier;
  source: SupplierExpenseRuleSource;
  treatment: SupplierExpenseTreatment;
  /** Already deducted from this settlement (recharge recorded). */
  rechargedSettlementId: string | null;
}>;

/**
 * Approved expenses of a supplier's technicians in a period with who carries each one.
 * Callers authorize (Owner / Finance: Money → Subcontractors).
 */
export function supplierExpenseItems(
  sqlite: DatabaseSync,
  input: Readonly<{ workerIds: readonly string[]; periodStart: string; periodEnd: string }>,
): SupplierExpenseItem[] {
  const ids = [...new Set(input.workerIds)].slice(0, 500);
  if (!ids.length || !hasSupplierExpenseRules(sqlite)) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = sqlite
    .prepare(
      `SELECT e.id,e.worker_id,e.project_id,e.spent_on,e.category,e.vendor,e.who_paid,e.currency,
              CAST(e.amount_minor AS TEXT) amount_minor,
              CAST(e.project_currency_amount_minor AS TEXT) project_amount_minor,
              p.currency project_currency,r.settlement_id recharged_settlement_id
         FROM expense e JOIN project p ON p.id=e.project_id
         JOIN supplier_user_profile sup ON sup.user_id=e.worker_id
         LEFT JOIN supplier_expense_recharge r ON r.expense_id=e.id
        WHERE e.worker_id IN (${placeholders}) AND e.spent_on BETWEEN ? AND ?
          AND e.approval_state IN ('approved','locked')
          AND NOT EXISTS (
            SELECT 1 FROM record_correction_link rcl
            JOIN expense correction ON correction.id=rcl.correction_id
            WHERE rcl.record_type='expense'
              AND ((rcl.original_id=e.id AND correction.approval_state='approved')
                OR (rcl.correction_id=e.id AND correction.approval_state<>'approved'))
          )
        ORDER BY e.worker_id,e.spent_on,e.id`,
    )
    .all(...ids, input.periodStart, input.periodEnd) as Array<{
    id: string;
    worker_id: string;
    project_id: string;
    spent_on: string;
    category: string;
    vendor: string | null;
    who_paid: string;
    currency: string;
    amount_minor: string;
    project_amount_minor: string | null;
    project_currency: string;
    recharged_settlement_id: string | null;
  }>;
  return rows.map((row) => {
    const rule = effectiveSupplierExpenseRule(sqlite, {
      projectId: row.project_id,
      workerId: row.worker_id,
      onDate: row.spent_on,
    }) ?? { carrier: 'ja' as const, source: 'default' as const };
    return {
      expenseId: row.id,
      workerId: row.worker_id,
      projectId: row.project_id,
      spentOn: row.spent_on,
      category: row.category,
      vendor: row.vendor,
      whoPaid: row.who_paid,
      sourceCurrency: row.currency,
      sourceAmountMinor: row.amount_minor,
      currency: row.project_currency,
      amountMinor:
        row.currency === row.project_currency ? row.amount_minor : row.project_amount_minor,
      carrier: rule.carrier,
      source: rule.source,
      treatment: supplierExpenseTreatment(rule.carrier, row.who_paid),
      rechargedSettlementId: row.recharged_settlement_id,
    };
  });
}

/**
 * Link expenses deducted from one supplier settlement to the offset payment event recorded
 * on it (inside the caller's transaction). UNIQUE(expense_id): an expense is deducted once.
 */
export function recordSupplierRecharges(
  sqlite: DatabaseSync,
  principal: Principal,
  input: Readonly<{
    settlementId: string;
    supplierId: string;
    paymentEventId: string;
    currency: string;
    expenses: ReadonlyArray<Readonly<{ expenseId: string; amountMinor: bigint }>>;
  }>,
): void {
  const at = new Date().toISOString();
  const insert = sqlite.prepare(
    `INSERT INTO supplier_expense_recharge(id,expense_id,supplier_id,settlement_id,payment_event_id,amount_minor,currency,created_by,created_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
  );
  let total = 0n;
  for (const expense of input.expenses) {
    if (expense.amountMinor <= 0n) throw new ValidationError('Recharge amount must be positive');
    insert.run(
      newId(),
      expense.expenseId,
      input.supplierId,
      input.settlementId,
      input.paymentEventId,
      expense.amountMinor,
      input.currency,
      principal.userId,
      at,
    );
    total += expense.amountMinor;
  }
  recordAuditEvent(
    sqlite,
    principal,
    'supplier.expense_recharge',
    'compensation_settlement',
    input.settlementId,
    {
      supplierId: input.supplierId,
      paymentEventId: input.paymentEventId,
      currency: input.currency,
      amountMinor: total.toString(),
      expenseIds: input.expenses.map((expense) => expense.expenseId),
    },
  );
}

type PaymentRecorder = Readonly<{
  recordCompensationPayment(
    principal: Principal,
    input: Readonly<{
      settlementId: string;
      payeeKind: 'person' | 'supplier';
      payeeId: string;
      amountMinor: bigint;
      currency: never;
      paidOn: string;
      reference: string;
      note?: string;
      idempotencyKey: string;
    }>,
  ): { id: string; idempotent: boolean };
}>;

export const SUPPLIER_RECHARGE_REFERENCE = 'Recharged expenses';

/** Expenses still to deduct from one settlement (greedy, by date, never above `remaining`). */
export function rechargesForSettlement(
  items: readonly SupplierExpenseItem[],
  settlement: Readonly<{
    worker_id: string;
    project_id: string;
    period_start: string;
    period_end: string;
    currency: string;
  }>,
  remaining: bigint,
): Array<{ expenseId: string; amountMinor: bigint }> {
  const chosen: Array<{ expenseId: string; amountMinor: bigint }> = [];
  let left = remaining;
  for (const item of items) {
    if (
      item.treatment !== 'recharge' ||
      item.rechargedSettlementId !== null ||
      item.amountMinor === null ||
      item.workerId !== settlement.worker_id ||
      item.projectId !== settlement.project_id ||
      item.currency !== settlement.currency ||
      item.spentOn < settlement.period_start ||
      item.spentOn > settlement.period_end
    )
      continue;
    const amount = BigInt(item.amountMinor);
    if (amount <= 0n || amount > left) continue;
    chosen.push({ expenseId: item.expenseId, amountMinor: amount });
    left -= amount;
  }
  return chosen;
}

/**
 * Pay one supplier settlement: first deduct the expenses recharged to the supplier (an offset
 * payment event, linked expense by expense), then record the cash part. One transaction.
 * Returns the deducted and the cash amounts.
 */
export function paySupplierSettlementWithRecharges(
  sqlite: DatabaseSync,
  payments: PaymentRecorder,
  principal: Principal,
  input: Readonly<{
    settlement: Readonly<{
      id: string;
      worker_id: string;
      project_id: string;
      period_start: string;
      period_end: string;
      currency: string;
    }>;
    supplierId: string;
    remaining: bigint;
    paidOn: string;
    reference: string;
    requestKey: string;
  }>,
): { deductedMinor: bigint; cashMinor: bigint } {
  return runImmediateTransaction(sqlite, 'supplier-recharge', () => {
    const items = supplierExpenseItems(sqlite, {
      workerIds: [input.settlement.worker_id],
      periodStart: input.settlement.period_start,
      periodEnd: input.settlement.period_end,
    });
    const recharges = rechargesForSettlement(items, input.settlement, input.remaining);
    const deducted = recharges.reduce((sum, row) => sum + row.amountMinor, 0n);
    if (deducted > 0n) {
      const event = payments.recordCompensationPayment(principal, {
        settlementId: input.settlement.id,
        payeeKind: 'supplier',
        payeeId: input.supplierId,
        amountMinor: deducted,
        currency: input.settlement.currency as never,
        paidOn: input.paidOn,
        reference: SUPPLIER_RECHARGE_REFERENCE,
        note: `Deducted: ${recharges.length} expense(s) recharged to the supplier`,
        idempotencyKey: `supplier-recharge:${input.requestKey}:${input.settlement.id}`.slice(
          0,
          240,
        ),
      });
      if (!event.idempotent)
        recordSupplierRecharges(sqlite, principal, {
          settlementId: input.settlement.id,
          supplierId: input.supplierId,
          paymentEventId: event.id,
          currency: input.settlement.currency,
          expenses: recharges,
        });
    }
    const cash = input.remaining - deducted;
    if (cash > 0n)
      payments.recordCompensationPayment(principal, {
        settlementId: input.settlement.id,
        payeeKind: 'supplier',
        payeeId: input.supplierId,
        amountMinor: cash,
        currency: input.settlement.currency as never,
        paidOn: input.paidOn,
        reference: input.reference,
        idempotencyKey: `subcontractor-pay:${input.requestKey}:${input.settlement.id}`.slice(
          0,
          240,
        ),
      });
    return { deductedMinor: deducted, cashMinor: cash };
  });
}
