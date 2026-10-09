import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { isStrictIsoCalendarDate, weeklyPeriod } from '@ja/billing-engine';
import {
  ConflictError,
  ReadinessError,
  ValidationError,
  type ReadinessReason,
} from '../../repository.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { clientBillingUnit } from '../commercial/client-labor-charge.ts';
import { resolveClientLaborRule } from '../commercial/assignment-commercial-terms.ts';

export type InvoiceCompositionSourceRef = Readonly<{
  type: 'time' | 'expense';
  id: string;
  version: number;
}>;
export type InvoiceCompositionScope = Readonly<{
  projectId: string;
  billingRuleId: string;
  periodStart: string;
  periodEnd: string;
}>;
export type InvoiceCompositionInput = InvoiceCompositionScope &
  Readonly<{ sources: readonly InvoiceCompositionSourceRef[] }>;
export type InvoiceCompositionSource = InvoiceCompositionSourceRef &
  Readonly<{
    workerId: string;
    workerName: string;
    date: string;
    summary: string;
    minutes?: number;
    amountMinor?: string;
    remainingAmountMinor?: string;
    remainingCurrency?: string;
    originalAmountMinor?: string;
    originalCurrency?: string;
    currency: string;
    approvalState: string;
    financeAccepted: boolean;
    billabilityState?: string;
    classificationState?: string;
    billingState: string;
    groupKey: string;
    selectedDependencies: readonly string[];
    blockers: readonly ReadinessReason[];
  }>;
export type InvoiceCompositionLine = Readonly<{
  description: string;
  quantityNumerator: number;
  quantityDenominator: number;
  unitPriceMinor: string;
  subtotalMinor: string;
  sourceType: string;
  sourceId: string;
}>;
export type InvoiceCompositionPreview = Readonly<{
  state: 'ready' | 'incomplete';
  reasons: readonly ReadinessReason[];
  sources: readonly InvoiceCompositionSource[];
  lines: readonly InvoiceCompositionLine[];
  currency: string;
  subtotalMinor: string;
  taxMinor: string;
  totalMinor: string;
}>;
function distinctReasons(reasons: readonly ReadinessReason[]): ReadinessReason[] {
  return reasons.filter(
    (reason, index) =>
      reasons.findIndex(
        (candidate) => candidate.code === reason.code && candidate.sourceId === reason.sourceId,
      ) === index,
  );
}
type Readiness = { state: string; reasons: readonly ReadinessReason[] };
type DraftResult = { id: string; created: boolean; refreshed: boolean; existingState?: string };
type Adapter = {
  authorize(principal: Principal): void;
  readiness(principal: Principal, input: InvoiceCompositionInput): Readiness;
  draft(
    principal: Principal,
    input: InvoiceCompositionInput,
    refreshInvoiceId?: string,
  ): DraftResult;
  approve(principal: Principal, source: InvoiceCompositionSourceRef): void;
};
type SourceRow = Record<string, unknown> & {
  id: string;
  project_id: string;
  version: number;
  worker_id: string;
  worker_name: string;
  date: string;
  summary: string;
  currency: string;
  approval_state: string;
  finance_approved_at: string | null;
  invoice_id: string | null;
};

export function invoiceSourceSelected(
  selection: readonly InvoiceCompositionSourceRef[] | undefined,
  type: 'time' | 'expense',
  id: string,
): boolean {
  return !selection || selection.some((source) => source.type === type && source.id === id);
}

export function readInvoiceCompositionSelection(
  sqlite: DatabaseSync,
  invoiceId: string,
): readonly InvoiceCompositionSourceRef[] | undefined {
  const row = sqlite.prepare('SELECT source_selection_json FROM invoice WHERE id=?').get(invoiceId);
  if (typeof row?.source_selection_json !== 'string') return undefined;
  return JSON.parse(row.source_selection_json) as InvoiceCompositionSourceRef[];
}

/** Source identity, grouping, atomic approval and retry semantics live together.
 * Pricing remains delegated to the existing exact-money invoice engine. */
export class InvoiceCompositionService {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly adapter: Adapter,
  ) {}

  private refs(value: readonly InvoiceCompositionSourceRef[]): InvoiceCompositionSourceRef[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 1000)
      throw new ValidationError('Select between 1 and 1000 invoice sources');
    const seen = new Set<string>();
    const refs = value.map((source) => {
      if (
        !source ||
        !['time', 'expense'].includes(source.type) ||
        typeof source.id !== 'string' ||
        !source.id.trim() ||
        source.id.length > 200 ||
        !Number.isSafeInteger(source.version) ||
        source.version < 1
      )
        throw new ValidationError('Valid typed source IDs and current versions are required');
      const key = `${source.type}:${source.id}`;
      if (seen.has(key)) throw new ValidationError('Duplicate invoice source');
      seen.add(key);
      return { type: source.type, id: source.id, version: source.version };
    });
    return refs.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  }

  private scope(input: InvoiceCompositionScope) {
    if (
      !isStrictIsoCalendarDate(input.periodStart) ||
      !isStrictIsoCalendarDate(input.periodEnd) ||
      input.periodEnd < input.periodStart
    )
      throw new ValidationError('Valid inclusive billing period required');
    const rule = this.sqlite
      .prepare(
        `SELECT br.*,p.client_daily_minimum_minutes,p.billing_model,p.fixed_price_minor
      FROM billing_rule br JOIN project p ON p.id=br.project_id WHERE br.id=? AND br.project_id=? AND br.enabled=1`,
      )
      .get(input.billingRuleId, input.projectId);
    if (!rule || !['labor', 'expense'].includes(String(rule.stream_type)))
      throw new ValidationError('Active project labor or expense billing stream required');
    return rule;
  }

  private rows(
    projectId: string,
    type: 'time' | 'expense',
    start?: string,
    end?: string,
  ): SourceRow[] {
    const time = type === 'time';
    const table = time ? 'time_entry' : 'expense';
    const date = time ? 'work_date' : 'spent_on';
    return this.sqlite
      .prepare(
        `SELECT r.*,u.name worker_name,r.${date} date,
      ${time ? 'r.activity_summary' : 'r.description'} summary,${time ? 'p.currency' : 'r.currency'} currency
      FROM ${table} r JOIN user u ON u.id=r.worker_id JOIN project p ON p.id=r.project_id
      WHERE r.project_id=? ${start ? `AND r.${date} BETWEEN ? AND ?` : ''}
      ORDER BY r.${date},r.worker_id,r.id`,
      )
      .all(...(start ? [projectId, start, end!] : [projectId])) as SourceRow[];
  }

  private status(type: 'time' | 'expense', row: SourceRow): string {
    const reservation = this.sqlite
      .prepare(
        `SELECT invoice.state FROM invoice WHERE invoice.project_id=? AND invoice.state NOT IN ('void','cancelled','superseded')
      AND (EXISTS(SELECT 1 FROM invoice_source source WHERE source.invoice_id=invoice.id AND source.source_type=? AND source.source_id=?)
        OR EXISTS(SELECT 1 FROM invoice_commercial_source_manifest manifest WHERE manifest.invoice_id=invoice.id AND manifest.source_type=? AND manifest.source_id=?))
      ORDER BY CASE WHEN invoice.state IN ('draft','approved') THEN 0 ELSE 1 END,invoice.created_at DESC,invoice.rowid DESC LIMIT 1`,
      )
      .get(row.project_id, type, row.id, type, row.id);
    return String(
      reservation?.state ??
        (row.invoice_id ? 'invoiced' : type === 'time' ? row.billing_status : row.billing_state),
    );
  }

  private remainingAmount(type: 'time' | 'expense', row: SourceRow): string | null {
    if (
      row.invoice_id !== null ||
      (type === 'time' ? row.billing_status : row.billing_state) !== 'cap_blocked'
    )
      return null;
    if (
      this.sqlite
        .prepare(
          `SELECT 1 FROM invoice WHERE invoice.project_id=? AND invoice.state IN ('draft','approved')
      AND (EXISTS(SELECT 1 FROM invoice_source source WHERE source.invoice_id=invoice.id AND source.source_type=? AND source.source_id=?)
        OR EXISTS(SELECT 1 FROM invoice_commercial_source_manifest manifest WHERE manifest.invoice_id=invoice.id AND manifest.source_type=? AND manifest.source_id=?)) LIMIT 1`,
        )
        .get(row.project_id, type, row.id, type, row.id)
    )
      return null;
    const manifest = this.sqlite
      .prepare(
        `SELECT CAST(manifest.remaining_minor AS TEXT) amount FROM invoice_commercial_source_manifest manifest JOIN invoice ON invoice.id=manifest.invoice_id
      WHERE manifest.source_type=? AND manifest.source_id=? AND invoice.state IN ('issued','sent','partially_paid','paid','overdue')
      ORDER BY invoice.issued_at DESC,invoice.rowid DESC LIMIT 1`,
      )
      .get(type, row.id);
    return typeof manifest?.amount === 'string' && BigInt(manifest.amount) > 0n
      ? manifest.amount
      : null;
  }

  private group(row: SourceRow, type: 'time' | 'expense', rule: Record<string, unknown>): string {
    if (type === 'expense') return `expense:${row.id}`;
    const resolved = resolveClientLaborRule(this.sqlite, {
      projectId: row.project_id,
      workerId: row.worker_id,
      workDate: row.date,
      category: String(row.category),
      activityCode: row.activity_code as string | null,
    });
    const unit = clientBillingUnit(resolved.selected?.rule.rate_basis);
    if (unit === 'weekly') return `weekly:${row.worker_id}:${weeklyPeriod(row.date).start}`;
    if (unit === 'daily' || Number(rule.client_daily_minimum_minutes) > 0)
      return `daily:${row.worker_id}:${row.date}`;
    return `time:${row.id}`;
  }

  private groupCandidate(row: SourceRow): boolean {
    if (
      ['rejected', 'void'].includes(row.approval_state) ||
      row.billability_state === 'non_billable'
    )
      return false;
    if (
      row.category === 'travel' &&
      this.sqlite
        .prepare(
          `SELECT travel_client_billable FROM project_commercial_policy WHERE project_id=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from DESC,version DESC LIMIT 1`,
        )
        .get(row.project_id, row.date, row.date)?.travel_client_billable === 0
    )
      return false;
    return !this.sqlite
      .prepare(
        `SELECT 1 FROM record_correction_link link JOIN time_entry correction ON correction.id=link.correction_id WHERE link.record_type='time_entry' AND link.original_id=? AND correction.approval_state NOT IN ('rejected','void') LIMIT 1`,
      )
      .get(row.id);
  }

  private source(
    type: 'time' | 'expense',
    row: SourceRow,
    rule: Record<string, unknown>,
    allTime: SourceRow[],
    reasons: readonly ReadinessReason[],
  ): InvoiceCompositionSource {
    // Readiness is projected per type: IDs are local to their source table.
    const blockers = reasons.filter((reason) => reason.sourceId === row.id);
    const remainingAmountMinor = this.remainingAmount(type, row);
    const billingState =
      remainingAmountMinor === null ? this.status(type, row) : 'partially_billed';
    if (['draft', 'needs_changes'].includes(row.approval_state))
      blockers.push({
        code: type === 'time' ? 'pending_time_submission' : 'pending_expense_submission',
        sourceId: row.id,
      });
    if (['rejected', 'void'].includes(row.approval_state))
      blockers.push({ code: 'source_not_billable', sourceId: row.id });
    if (remainingAmountMinor !== null)
      blockers.push({ code: 'source_requires_remaining_period_billing', sourceId: row.id });
    if (remainingAmountMinor === null && !['unlocked', 'locked'].includes(billingState))
      blockers.push({ code: 'source_already_reserved', sourceId: row.id });
    if (type === 'time' && row.billability_state === 'non_billable')
      blockers.push({ code: 'source_not_billable', sourceId: row.id });
    if (
      type === 'expense' &&
      ['classified', 'legacy_classified'].includes(String(row.commercial_classification_state)) &&
      !(
        String(row.billing_treatment).startsWith('reimbursable') ||
        row.billing_treatment === 'allowance_per_diem'
      )
    )
      blockers.push({ code: 'source_not_billable', sourceId: row.id });
    if (type === 'expense' && row.commercial_classification_state === 'unclassified')
      blockers.push({ code: 'missing_expense_classification', sourceId: row.id });
    if (
      type === 'expense' &&
      (row.approval_state === 'submitted' ||
        (row.approval_state === 'approved' && row.finance_approved_at === null))
    )
      blockers.push({ code: 'pending_expense_approval', sourceId: row.id });
    if (type === 'time' && !this.groupCandidate(row))
      blockers.push({ code: 'source_not_billable', sourceId: row.id });
    const groupKey = this.group(row, type, rule);
    const dependencies =
      type === 'time' && !groupKey.startsWith('time:')
        ? allTime
            .filter(
              (other) =>
                other.worker_id === row.worker_id &&
                this.groupCandidate(other) &&
                (groupKey.startsWith('weekly:')
                  ? weeklyPeriod(other.date).start === weeklyPeriod(row.date).start
                  : other.date === row.date),
            )
            .map((other) => other.id)
        : [row.id];
    return {
      type,
      id: row.id,
      version: row.version,
      workerId: row.worker_id,
      workerName: row.worker_name,
      date: row.date,
      summary: row.summary,
      currency:
        type === 'expense' &&
        (row.billing_amount_minor !== null || row.project_currency_amount_minor !== null)
          ? String(rule.currency)
          : row.currency,
      approvalState: row.approval_state,
      financeAccepted: row.finance_approved_at !== null,
      billingState,
      ...(remainingAmountMinor === null
        ? {}
        : { remainingAmountMinor, remainingCurrency: String(rule.currency) }),
      groupKey,
      selectedDependencies: dependencies,
      ...(type === 'time'
        ? { minutes: Number(row.minutes), billabilityState: String(row.billability_state) }
        : {
            originalAmountMinor: String(row.amount_minor),
            originalCurrency: row.currency,
            amountMinor: String(
              row.billing_amount_minor ?? row.project_currency_amount_minor ?? row.amount_minor,
            ),
            classificationState: String(row.commercial_classification_state),
          }),
      blockers: distinctReasons(blockers),
    };
  }

  sources(principal: Principal, input: InvoiceCompositionScope) {
    this.adapter.authorize(principal);
    const rule = this.scope(input);
    const allTime = this.rows(input.projectId, 'time');
    const types: Array<'time' | 'expense'> =
      rule.stream_type === 'expense'
        ? ['expense']
        : rule.include_expenses === 1
          ? ['time', 'expense']
          : ['time'];
    const rows = types.flatMap((type) =>
      this.rows(input.projectId, type, input.periodStart, input.periodEnd).map((row) => ({
        type,
        row,
      })),
    );
    const readinessByType = new Map(
      types.map((type) => {
        const typed = rows.filter((source) => source.type === type);
        return [
          type,
          typed.length
            ? this.adapter.readiness(principal, {
                ...input,
                sources: typed.map(({ row }) => ({ type, id: row.id, version: row.version })),
              })
            : { state: 'incomplete', reasons: [] },
        ] as const;
      }),
    );
    const sources = rows.map(({ type, row }) =>
      this.source(type, row, rule, allTime, readinessByType.get(type)!.reasons),
    );
    const keys = new Set(sources.map((source) => source.groupKey));
    return {
      mode: (rule.stream_type === 'expense'
        ? 'expense'
        : rule.include_expenses === 1
          ? 'combined'
          : 'labor') as 'labor' | 'expense' | 'combined',
      sources,
      groups: [...keys].map((key) => ({
        key,
        sourceIds: sources.filter((source) => source.groupKey === key).map((source) => source.id),
      })),
      reasons: distinctReasons(
        [...readinessByType.values()].flatMap((readiness) =>
          readiness.reasons.filter((reason) => !reason.sourceId),
        ),
      ),
      currency: String(rule.currency),
    };
  }

  private validate(principal: Principal, input: InvoiceCompositionInput) {
    const refs = this.refs(input.sources);
    const inventory = this.sources(principal, input);
    const selected = refs.map((ref) => {
      const source = inventory.sources.find((row) => row.type === ref.type && row.id === ref.id);
      if (!source)
        throw new ValidationError(
          'Selected source is outside this project, period or billing stream',
        );
      if (source.version !== ref.version)
        throw new ConflictError('Selected source changed. Reload before continuing.');
      return source;
    });
    const rule = this.scope(input);
    const reasons: ReadinessReason[] = [];
    if (
      rule.billing_model === 'hybrid' ||
      (rule.billing_model === 'all_in' && rule.fixed_price_minor !== null)
    )
      reasons.push({ code: 'selection_requires_whole_period_billing' });
    for (const source of selected) {
      reasons.push(...source.blockers);
      if (
        source.type === 'time' &&
        source.selectedDependencies.some(
          (id) => !refs.some((ref) => ref.type === 'time' && ref.id === id),
        )
      )
        reasons.push({ code: 'complete_client_billing_group_required', sourceId: source.id });
      if (
        source.type === 'time' &&
        source.groupKey.startsWith('daily:') &&
        this.sqlite
          .prepare(
            `SELECT 1 FROM invoice_line line JOIN invoice ON invoice.id=line.invoice_id
        WHERE line.source_type='billing_adjustment' AND line.source_id=? AND invoice.state NOT IN ('void','cancelled','superseded') LIMIT 1`,
          )
          .get(`${input.projectId}:${source.workerId}:${source.date}:daily-minimum`)
      )
        reasons.push({ code: 'client_daily_minimum_already_billed', sourceId: source.id });
    }
    return { refs, sources: selected, reasons };
  }

  assertSelection(principal: Principal, input: InvoiceCompositionInput): void {
    const validated = this.validate(principal, input);
    if (validated.reasons.length) throw new ReadinessError(validated.reasons);
  }

  dependencies(input: InvoiceCompositionInput): readonly Record<string, unknown>[] {
    const rule = this.scope(input);
    const allTime = this.rows(input.projectId, 'time');
    const grouped = allTime
      .filter((row) => invoiceSourceSelected(input.sources, 'time', row.id))
      .map((row) => ({ row, group: this.group(row, 'time', rule) }))
      .filter(({ group }) => !group.startsWith('time:'));
    return allTime
      .filter(
        (row) =>
          this.groupCandidate(row) &&
          grouped.some(
            (chosen) =>
              row.worker_id === chosen.row.worker_id &&
              (chosen.group.startsWith('weekly:')
                ? weeklyPeriod(row.date).start === weeklyPeriod(chosen.row.date).start
                : row.date === chosen.row.date),
          ),
      )
      .map((row) => ({
        kind: 'client_billing_group_dependency',
        id: row.id,
        version: row.version,
        workDate: row.date,
        workerId: row.worker_id,
        category: row.category,
        minutes: row.minutes,
        approvalState: row.approval_state,
        billabilityState: row.billability_state,
      }));
  }

  approve(
    principal: Principal,
    input: { projectId: string; sources: readonly InvoiceCompositionSourceRef[] },
  ) {
    this.adapter.authorize(principal);
    const refs = this.refs(input.sources);
    return runImmediateTransaction(this.sqlite, 'InvoiceComposition', () => {
      // Validate the entire batch before the first lifecycle mutation.
      for (const ref of refs) {
        const table = ref.type === 'time' ? 'time_entry' : 'expense';
        const row = this.sqlite
          .prepare(`SELECT project_id,version FROM ${table} WHERE id=?`)
          .get(ref.id);
        if (!row || row.project_id !== input.projectId)
          throw new ValidationError('Selected source is outside this project');
        if (row.version !== ref.version)
          throw new ConflictError('Selected source changed. Reload before approving.');
        const full = this.sqlite.prepare(`SELECT invoice_id FROM ${table} WHERE id=?`).get(ref.id)!;
        if (
          full.invoice_id ||
          this.sqlite
            .prepare(
              `SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id WHERE source.source_type=? AND source.source_id=? AND invoice.state NOT IN ('void','cancelled','superseded') LIMIT 1`,
            )
            .get(ref.type, ref.id)
        )
          throw new ConflictError('Reserved source cannot be approved');
      }
      for (const ref of refs) this.adapter.approve(principal, ref);
      return refs.map((ref) => {
        const table = ref.type === 'time' ? 'time_entry' : 'expense';
        const row = this.sqlite
          .prepare(`SELECT version,approval_state,finance_approved_at FROM ${table} WHERE id=?`)
          .get(ref.id)!;
        return {
          ...ref,
          version: Number(row.version),
          approvalState: String(row.approval_state),
          financeAccepted: row.finance_approved_at !== null,
        };
      });
    });
  }

  private assertIncluded(invoiceId: string, refs: readonly InvoiceCompositionSourceRef[]) {
    const included = this.sqlite
      .prepare('SELECT source_type,source_id FROM invoice_source WHERE invoice_id=?')
      .all(invoiceId);
    const missing = refs.filter(
      (ref) => !included.some((row) => row.source_type === ref.type && row.source_id === ref.id),
    );
    if (missing.length)
      throw new ReadinessError(
        missing.map((ref) => ({ code: 'selected_source_not_eligible', sourceId: ref.id })),
      );
  }

  preview(principal: Principal, input: InvoiceCompositionInput): InvoiceCompositionPreview {
    this.adapter.authorize(principal);
    const validated = this.validate(principal, input);
    const readiness = this.adapter.readiness(principal, { ...input, sources: validated.refs });
    const reasons = distinctReasons([...validated.reasons, ...readiness.reasons]);
    const empty = {
      sources: validated.sources,
      lines: [] as InvoiceCompositionLine[],
      subtotalMinor: '0',
      taxMinor: '0',
      totalMinor: '0',
      currency: String(this.scope(input).currency),
    };
    if (reasons.length) return { ...empty, state: 'incomplete', reasons };
    // The canonical engine only writes SQLite records (including audit). This
    // private savepoint always rolls back; reads leave no invoice or reservation.
    this.sqlite.exec('SAVEPOINT invoice_composition_preview');
    try {
      const draft = this.adapter.draft(principal, { ...input, sources: validated.refs });
      this.assertIncluded(draft.id, validated.refs);
      const invoice = this.sqlite
        .prepare(
          `SELECT currency,CAST(subtotal_minor AS TEXT) subtotalMinor,CAST(tax_minor AS TEXT) taxMinor,CAST(total_minor AS TEXT) totalMinor FROM invoice WHERE id=?`,
        )
        .get(draft.id)!;
      const lines = this.sqlite
        .prepare(
          `SELECT description,quantity_numerator quantityNumerator,quantity_denominator quantityDenominator,CAST(unit_price_minor AS TEXT) unitPriceMinor,CAST(subtotal_minor AS TEXT) subtotalMinor,source_type sourceType,source_id sourceId FROM invoice_line WHERE invoice_id=? ORDER BY rowid`,
        )
        .all(draft.id);
      return {
        ...empty,
        currency: String(invoice.currency),
        subtotalMinor: String(invoice.subtotalMinor),
        taxMinor: String(invoice.taxMinor),
        totalMinor: String(invoice.totalMinor),
        lines: lines.map((line) => ({
          description: String(line.description),
          quantityNumerator: Number(line.quantityNumerator),
          quantityDenominator: Number(line.quantityDenominator),
          unitPriceMinor: String(line.unitPriceMinor),
          subtotalMinor: String(line.subtotalMinor),
          sourceType: String(line.sourceType),
          sourceId: String(line.sourceId),
        })),
        state: 'ready',
        reasons: [] as ReadinessReason[],
      };
    } catch (error) {
      if (error instanceof ReadinessError)
        return { ...empty, state: 'incomplete', reasons: error.reasons };
      throw error;
    } finally {
      this.sqlite.exec('ROLLBACK TO invoice_composition_preview');
      this.sqlite.exec('RELEASE invoice_composition_preview');
    }
  }

  refresh(principal: Principal, invoiceId: string, expectedVersion: number): DraftResult {
    this.adapter.authorize(principal);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      throw new ValidationError('Current invoice version required');
    return runImmediateTransaction(this.sqlite, 'InvoiceComposition', () => {
      const invoice = this.sqlite.prepare('SELECT * FROM invoice WHERE id=?').get(invoiceId);
      if (!invoice || typeof invoice.source_selection_json !== 'string')
        throw new ValidationError('Selected invoice draft required');
      if (invoice.version !== expectedVersion)
        throw new ConflictError('Invoice changed. Reload before refreshing.');
      if (
        invoice.state !== 'draft' ||
        invoice.invoice_number ||
        invoice.issued_at ||
        invoice.source_lock_at
      )
        throw new ConflictError('Only an unissued selected draft can be refreshed');
      if (
        this.sqlite
          .prepare(
            "SELECT 1 FROM localized_pdf_variant WHERE owner_type='invoice' AND owner_id=? UNION ALL SELECT 1 FROM invoice_source WHERE invoice_id=? AND locked_at IS NOT NULL LIMIT 1",
          )
          .get(invoiceId, invoiceId)
      )
        throw new ConflictError('Draft has finalized evidence and cannot be refreshed');
      const selected = readInvoiceCompositionSelection(this.sqlite, invoiceId)!;
      const sources = selected.map((source) => ({
        ...source,
        version: Number(
          this.sqlite
            .prepare(
              `SELECT version FROM ${source.type === 'time' ? 'time_entry' : 'expense'} WHERE id=?`,
            )
            .get(source.id)?.version ?? source.version,
        ),
      }));
      const input: InvoiceCompositionInput = {
        projectId: String(invoice.project_id),
        billingRuleId: String(invoice.billing_rule_id),
        periodStart: String(invoice.period_start),
        periodEnd: String(invoice.period_end),
        sources,
      };
      this.sqlite
        .prepare('DELETE FROM invoice_commercial_source_manifest WHERE invoice_id=?')
        .run(invoiceId);
      this.sqlite.prepare('DELETE FROM invoice_source WHERE invoice_id=?').run(invoiceId);
      this.sqlite.prepare('DELETE FROM invoice_line WHERE invoice_id=?').run(invoiceId);
      this.assertSelection(principal, input);
      const result = this.adapter.draft(principal, input, invoiceId);
      this.assertIncluded(result.id, sources);
      if (result.id !== invoiceId || !result.refreshed)
        throw new ConflictError('Selected draft could not be refreshed');
      return result;
    });
  }

  create(
    principal: Principal,
    input: InvoiceCompositionInput & { requestKey: string },
  ): DraftResult {
    this.adapter.authorize(principal);
    const refs = this.refs(input.sources);
    if (
      typeof input.requestKey !== 'string' ||
      input.requestKey.trim().length < 8 ||
      input.requestKey.length > 200
    )
      throw new ValidationError('Stable invoice request key required');
    const payload = JSON.stringify({
      projectId: input.projectId,
      billingRuleId: input.billingRuleId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      sources: refs,
    });
    const hash = createHash('sha256').update(payload).digest('hex');
    return runImmediateTransaction(this.sqlite, 'InvoiceComposition', () => {
      const prior = this.sqlite
        .prepare(
          'SELECT payload_hash,invoice_id FROM invoice_composition_request WHERE request_key=?',
        )
        .get(input.requestKey);
      if (prior) {
        if (prior.payload_hash !== hash)
          throw new ConflictError('Invoice request key was already used for another selection');
        const invoice = this.sqlite
          .prepare('SELECT state FROM invoice WHERE id=?')
          .get(String(prior.invoice_id))!;
        if (!invoice)
          throw new ConflictError('This invoice draft was discarded; use a new request key');
        return {
          id: String(prior.invoice_id),
          created: false,
          refreshed: false,
          existingState: String(invoice.state),
        };
      }
      const validated = this.validate(principal, { ...input, sources: refs });
      if (validated.reasons.length) throw new ReadinessError(validated.reasons);
      const result = this.adapter.draft(principal, { ...input, sources: refs });
      this.assertIncluded(result.id, refs);
      this.sqlite
        .prepare(
          'INSERT INTO invoice_composition_request(request_key,payload_hash,invoice_id,created_at) VALUES(?,?,?,?)',
        )
        .run(input.requestKey, hash, result.id, new Date().toISOString());
      return result;
    });
  }
}
