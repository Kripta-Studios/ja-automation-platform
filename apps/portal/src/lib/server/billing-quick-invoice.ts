/**
 * One-screen invoice creation ("pick project + period, see the amount, create").
 *
 * Every amount shown here comes from the canonical draft engine: the preview runs the very
 * same `createInvoiceDraftCore` path inside a rolled-back savepoint
 * (`PortalRepository.invoiceDraftDryRun`). This module only chooses sensible defaults
 * (billing stream, record selection) and groups the engine's lines for display. It never
 * recomputes money.
 */
import {
  AccessDeniedError,
  AssignmentExpensePolicyRepository,
  ConflictError,
  ValidationError,
  assertLiveSession,
  currentCurrencyConversion,
  type InvoiceCompositionSource,
  type InvoiceCompositionSourceRef,
  type InvoiceOverrideInput,
  type ReadinessReason,
} from '@ja/database';
import { periodForCadence, type BillingCadence } from '@ja/billing-engine';
import type { openPortalRepository } from './portal-repository';
import { personDisplayName } from '../portal/display-name';
import { InvoiceLineLabels } from '@ja/database';
import { clientBillingIssues } from '../portal/client-billing-issues';

type Context = ReturnType<typeof openPortalRepository>;
type Row = Record<string, unknown>;

export type QuickInvoiceStream = {
  id: string;
  streamType: string;
  cadence: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  anchorDate: string | null;
  monthlyCutoffDay: number | null;
  includeExpenses: boolean;
  currency: string;
  taxProfileName: string | null;
};

export type QuickInvoiceProject = {
  id: string;
  number: string;
  name: string;
  status: string;
  client: string;
  currency: string;
  streams: QuickInvoiceStream[];
  /** Approved hours no live invoice holds yet (all dates), for sorting and the list hint. */
  unbilledMinutes: number;
  unbilledFrom: string | null;
  /** Last day covered by a live (not void/superseded) invoice. */
  lastInvoicedThrough: string | null;
  /** Oldest / newest logged work (approved or still pending) that no live invoice holds. */
  openFrom: string | null;
  openThrough: string | null;
  /** Oldest SENT (submitted/approved) work no live invoice holds: late entries to include. */
  sentFrom?: string | null;
};

export type QuickInvoiceWarning = {
  code: string;
  /** blocker: cannot create; excluded: records left out of this invoice; issue: blocks issuing later; info */
  severity: 'blocker' | 'excluded' | 'issue' | 'info';
  count: number;
  minutes: number;
  fix: 'time' | 'approvals' | 'finance_approvals' | 'expenses' | 'expense_classification' | 'rates' | 'finance' | 'issuer_authority' | 'numbering' | 'issuer_settings' | 'project_po' | 'billing_setup' | 'invoice' | 'signoff' | null;
  /** Server explanation when no plain-language text exists for the code. */
  message?: string;
};

export type QuickInvoiceGroup = {
  kind: 'labor' | 'expense' | 'fee';
  label: string;
  detail: string;
  minutes: number;
  unitPriceMinor: string | null;
  amountMinor: string;
  count: number;
  /** Labor lines: who and which commercial category (target of "this invoice only" changes). */
  workerId?: string;
  category?: string;
  unit?: string;
  /** Hours worked behind the line (differs from `minutes` when billed hours are overridden). */
  workedMinutes?: number;
  overrideRate?: boolean;
  overrideHours?: boolean;
};

/** Normalized "this invoice only" changes, echoed so the screen sends them back unchanged. */
export type QuickInvoiceOverrides = {
  people: Array<{ workerId: string; category: string | null; rateMinor: string | null; billedMinutes: number | null }>;
  tax: { mode: 'profile'; taxProfileId: string } | { mode: 'exempt' } | null;
  purchaseNo: string | null;
};

export type QuickInvoicePreview = {
  state: 'ready' | 'blocked' | 'empty' | 'existing';
  projectId: string;
  stream: QuickInvoiceStream | null;
  alternatives: QuickInvoiceStream[];
  periodStart: string;
  periodEnd: string;
  mode: 'period' | 'selection';
  currency: string;
  groups: QuickInvoiceGroup[];
  subtotalMinor: string;
  taxMinor: string;
  totalMinor: string;
  taxProfileName: string | null;
  taxes: Array<{ name: string; basisPoints: number }>;
  purchaseNo: string | null;
  dueDate: string | null;
  paymentTermsDays: number | null;
  provisionalNumber: string | null;
  sourceCount: number;
  warnings: QuickInvoiceWarning[];
  existingInvoice: { id: string; state: string; number: string | null } | null;
  /** Dates with approved, not yet invoiced hours near the chosen period (when nothing is billable). */
  suggestedPeriod: { start: string; end: string } | null;
  /** Logged work before these dates that no invoice holds yet (late entries in an invoiced period). */
  lateWork: { minutes: number; from: string; to: string } | null;
  issuerLegalEntityId: string | null;
  /** Unissued drafts of this project overlapping the period (records may already sit there). */
  openDrafts: Array<{ id: string; state: string; periodStart: string; periodEnd: string; totalMinor: string }>;
  /**
   * Everything the workers logged is selected by default. When some of it still needs an
   * approval, the engine is run a second time inside a rolled-back savepoint that simulates
   * "Approve & include": these are its exact totals. `totalMinor` above stays the amount
   * that would be created right now (the create/issue guard).
   */
  projected: QuickInvoiceProjection | null;
  /** Grouped checklist: at most one item per (fix × person), in a fixed order. */
  attention: QuickInvoiceAttention[];
  /** Expenses of an expense-carrying stream (first 50), for the treatment toggle. */
  expenseRows: QuickInvoiceExpenseRow[];
  expenseRowsTotal: number;
  /**
   * For the Hours / Expenses switch: records of these dates that no live invoice holds yet and
   * that the workers sent (submitted or approved). Counts only; drafts stay with the worker.
   */
  streamCounts?: { time: number; expense: number };
  client: QuickInvoiceClient | null;
  capabilities: { canApprove: boolean; canCorrectHours: boolean; role: string };
  /** Invoice-only changes in force for this preview (none: null). */
  overrides: QuickInvoiceOverrides | null;
  /** Tax profiles the invoice may use (issuer + currency of the stream). */
  taxOptions: Array<{ id: string; name: string; basisPoints: number }>;
  /** The stream's own tax profile (null: none). */
  streamTaxProfileId: string | null;
  /**
   * People on this invoice have different assignment POs: one invoice per PO, created and
   * issued together (owner decision 2026-11-17). Each part is an exact engine dry run.
   */
  split: QuickInvoiceSplit | null;
};

export type QuickInvoiceSplitPart = {
  /** Assignment PO of the people in this part; null: the project/stream PO applies. */
  poKey: string | null;
  /** PO printed on the invoice (assignment PO, else the project/stream fallback). */
  purchaseNo: string | null;
  people: Array<{ workerId: string; name: string; minutes: number }>;
  sourceCount: number;
  subtotalMinor: string;
  taxMinor: string;
  totalMinor: string;
};

export type QuickInvoiceSplit = {
  parts: QuickInvoiceSplitPart[];
  /** Sum of the parts (each part is taxed on its own). */
  totalMinor: string;
  /** Guard echoed by create/issue: the parts the user saw (PO and amount). */
  signature: string;
};

export type QuickInvoiceProjection = {
  state: 'ready' | 'blocked' | 'empty' | 'existing';
  groups: QuickInvoiceGroup[];
  subtotalMinor: string;
  taxMinor: string;
  totalMinor: string;
  /** Exact difference the pending approvals add (projected total − total now). */
  includedPendingMinor: string;
  pendingCount: number;
  pendingMinutes: number;
};

export type QuickInvoiceAttentionPerson = {
  workerId: string;
  name: string;
  minutes: number;
  count: number;
  /** Exact amount these records add once approved (projection lines). */
  projectedMinor?: string;
  states?: { draft: number; submitted: number; returned: number; financePending: number };
  returnedReason?: string | null;
  futureCount?: number;
  /** Oldest affected date: a saved rate/cost starts here so it covers the invoice. */
  fromDate?: string;
  /** Approve item: how many of the records are expenses, and how many still need a client decision. */
  expenseCount?: number;
  unclassifiedExpenseCount?: number;
  suggestedRateMinor?: string | null;
  sources?: InvoiceCompositionSourceRef[];
};

export type QuickInvoiceExpenseRow = {
  ref: InvoiceCompositionSourceRef;
  label: string;
  /** Canonical category code (shown through the localized category label). */
  category: string;
  date: string;
  workerName: string;
  amountMinor: string;
  currency: string;
  approvalState: string;
  classificationState: string;
  clientTreatment: string;
  billingTreatment: string;
  markupBps: number;
  /** Treatment cannot change: the expense sits on an unissued draft or live invoice. */
  locked: boolean;
  policyAvailable: boolean;
  /** Recorded in another currency than the invoice: an exact conversion is entered with the choice. */
  foreign: boolean;
  /** Foreign expense: the confirmed conversion (Money → Currency conversions), prefilled. */
  conversion?: { rate: string; amountMinor: string; rateSource: string } | null;
  /** Left out of this invoice by the user (stays unclassified, no longer blocks). */
  excluded: boolean;
};

export type QuickInvoiceClient = {
  id: string;
  version: number;
  name: string;
  legalName: string;
  billingAddress: string | null;
  billingEmail: string | null;
  taxId: string | null;
};

export type QuickInvoiceAttention = {
  kind:
    | 'approve'
    | 'unsent'
    | 'clientRate'
    | 'workerCost'
    | 'expenseTreatment'
    | 'expenseSetup'
    | 'clientDetails'
    | 'billingSetup'
    | 'issuerBank'
    | 'issuerAuthority'
    | 'purchaseOrder'
    | 'other';
  /** Engine code for 'other' items (shown with plain text + an Advanced link). */
  code?: string;
  blocks: 'create' | 'issue' | 'none';
  people?: QuickInvoiceAttentionPerson[];
  expenseIds?: string[];
  totalCount: number;
  minutes?: number;
  fix?: QuickInvoiceWarning['fix'];
  message?: string;
  billingSetup?: {
    legalEntities: IssuerChoice[];
    taxProfiles: Array<{ id: string; name: string; legalEntityId: string | null; basisPoints: number }>;
  };
  issuer?: {
    legalEntityId: string;
    currency: string;
    version: number;
    bankName: string;
    bankAccountNumber: string;
  };
  /** issuerAuthority: the issuing companies that can issue in the project currency. */
  issuerAuthority?: { legalEntities: IssuerChoice[]; current: string | null };
  project?: { id: string; version: number; poNumber: string | null };
  /** expenseSetup: expenses no billing stream carries yet (one-step inline setup). */
  expenseSetup?: ExpenseStreamGap;
  /** workerCost: which of the person's internal settings are missing. */
  payMissing?: boolean;
  costMissing?: boolean;
};

export type ExpenseStreamGap = {
  /** Submitted/approved expenses no invoice holds that only a separate expense stream could bill. */
  count: number;
  totals: Array<{ currency: string; amountMinor: string }>;
  /** Start of the new expense stream: the earliest such expense (never inside expense invoices). */
  effectiveFrom: string;
  laborRuleId: string;
};

export type IssuerChoice = { id: string; code: string; name: string; canIssue: boolean };

/**
 * Issuing companies for a currency, the default first: those with a complete company record
 * (canonical revision) for that currency can issue; the default is the one most projects in
 * that currency already invoice from.
 */
export function issuerChoices(context: Context, currency: string): IssuerChoice[] {
  const entities = (context.repository.listLegalEntities(context.principal) as unknown as Row[]).filter(
    (entity) => String(entity.currency) === currency && String(entity.status ?? 'active') === 'active',
  );
  const issuing = new Set(
    (
      context.sqlite
        .prepare(
          `SELECT DISTINCT b.legacy_legal_entity_id id FROM legal_entity_revision_bridge b
             JOIN legal_entity_revision r ON r.revision_id=b.canonical_revision_id
            WHERE r.base_currency=? AND r.effective_to IS NULL`,
        )
        .all(currency) as Array<{ id: string }>
    ).map((row) => row.id),
  );
  const uses = new Map(
    (
      context.sqlite
        .prepare(
          `SELECT legal_entity_id id,COUNT(DISTINCT project_id) n FROM billing_rule WHERE currency=? AND enabled=1 GROUP BY legal_entity_id`,
        )
        .all(currency) as Array<{ id: string; n: number }>
    ).map((row) => [row.id, Number(row.n)]),
  );
  return entities
    .map((entity) => ({
      id: String(entity.id),
      code: String(entity.code),
      name: String(entity.legal_name),
      canIssue: issuing.has(String(entity.id)),
    }))
    .sort(
      (a, b) =>
        Number(b.canIssue) - Number(a.canIssue) ||
        (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) ||
        a.code.localeCompare(b.code),
    );
}

function authorize(context: Context): void {
  assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
  if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
    throw new AccessDeniedError('Active Finance or Owner role required');
}

function streamDto(row: Row): QuickInvoiceStream {
  return {
    id: String(row.id),
    streamType: String(row.stream_type),
    cadence: String(row.cadence_type),
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to ? String(row.effective_to) : null,
    anchorDate: row.anchor_date ? String(row.anchor_date) : null,
    monthlyCutoffDay:
      row.monthly_cutoff_day === null || row.monthly_cutoff_day === undefined
        ? null
        : Number(row.monthly_cutoff_day),
    includeExpenses: Number(row.include_expenses) === 1,
    currency: String(row.currency),
    taxProfileName: row.tax_profile_name ? String(row.tax_profile_name) : null,
  };
}

function enabledStreams(context: Context, projectId?: string): QuickInvoiceStream[] {
  return context.repository
    .listBillingRules(context.principal)
    .filter(
      (row) =>
        Number(row.enabled) === 1 &&
        ['labor', 'expense', 'milestone'].includes(String(row.stream_type)) &&
        (!projectId || String(row.project_id) === projectId),
    )
    .map((row) => ({ ...streamDto(row), projectId: String(row.project_id) }))
    .map(({ projectId: _projectId, ...stream }) => stream);
}

export function quickInvoiceProjects(context: Context): QuickInvoiceProject[] {
  authorize(context);
  const projects = context.repository.listFinanceProjects(context.principal);
  const rules = context.repository
    .listBillingRules(context.principal)
    .filter((row) => Number(row.enabled) === 1);
  const clients = new Map(
    (
      context.sqlite.prepare('SELECT id,display_name,legal_name FROM client').all() as Array<{
        id: string;
        display_name: string | null;
        legal_name: string | null;
      }>
    ).map((client) => [client.id, client.display_name || client.legal_name || '']),
  );
  const unbilled = new Map(
    (
      context.sqlite
        .prepare(
          `SELECT project_id projectId,SUM(minutes) minutes,MIN(work_date) firstDate FROM time_entry
            WHERE approval_state IN ('approved','locked') AND invoice_id IS NULL
              AND billability_state IN ('pending','billable')
              AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
                     WHERE source.source_type='time' AND source.source_id=time_entry.id
                       AND invoice.state NOT IN ('void','cancelled','superseded'))
            GROUP BY project_id`,
        )
        .all() as Array<{ projectId: string; minutes: number; firstDate: string }>
    ).map((row) => [row.projectId, row]),
  );
  const open = new Map(
    (
      context.sqlite
        .prepare(
          `SELECT project_id projectId,MIN(work_date) openFrom,MAX(work_date) openThrough,
                  -- The owner's own drafts count as sent: he may approve & include them here.
                  MIN(CASE WHEN approval_state IN ('submitted','approved','locked') OR worker_id=? THEN work_date END) sentFrom
             FROM time_entry
            WHERE approval_state IN ('draft','submitted','needs_changes','approved','locked') AND invoice_id IS NULL
              AND billability_state IN ('pending','billable')
              AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
                     WHERE source.source_type='time' AND source.source_id=time_entry.id
                       AND invoice.state NOT IN ('void','cancelled','superseded'))
            GROUP BY project_id`,
        )
        .all(context.principal.role === 'owner_admin' ? context.principal.userId : '') as Array<{
        projectId: string;
        openFrom: string;
        openThrough: string;
        sentFrom: string | null;
      }>
    ).map((row) => [row.projectId, row]),
  );
  const invoicedThrough = new Map(
    (
      context.sqlite
        .prepare(
          `SELECT project_id projectId,MAX(period_end) through FROM invoice
            WHERE state NOT IN ('void','cancelled','superseded') AND period_end IS NOT NULL
            GROUP BY project_id`,
        )
        .all() as Array<{ projectId: string; through: string }>
    ).map((row) => [row.projectId, row.through]),
  );
  return projects
    .filter((project) => String(project.status) !== 'archived')
    .map((project) => ({
      unbilledMinutes: Number(unbilled.get(String(project.id))?.minutes ?? 0),
      unbilledFrom: unbilled.get(String(project.id))?.firstDate ?? null,
      lastInvoicedThrough: invoicedThrough.get(String(project.id)) ?? null,
      openFrom: open.get(String(project.id))?.openFrom ?? null,
      openThrough: open.get(String(project.id))?.openThrough ?? null,
      sentFrom: open.get(String(project.id))?.sentFrom ?? null,
      id: String(project.id),
      number: String(project.project_number),
      name: String(project.name),
      status: String(project.status),
      client: clients.get(String(project.client_id)) ?? '',
      currency: String(project.currency),
      streams: rules
        .filter(
          (rule) =>
            String(rule.project_id) === String(project.id) &&
            ['labor', 'expense', 'milestone'].includes(String(rule.stream_type)),
        )
        .map(streamDto),
    }))
    .sort(
      (a, b) =>
        Number(b.unbilledMinutes > 0) - Number(a.unbilledMinutes > 0) ||
        a.number.localeCompare(b.number),
    );
}

const streamPriority: Record<string, number> = { labor: 0, milestone: 1, expense: 2 };

/** Default stream for a period: covers the period end, labor first, newest terms first. */
export function chooseQuickInvoiceStream(
  streams: readonly QuickInvoiceStream[],
  periodStart: string,
  periodEnd: string,
): QuickInvoiceStream | null {
  const overlapping = streams.filter(
    (stream) =>
      stream.effectiveFrom <= periodEnd && (!stream.effectiveTo || stream.effectiveTo >= periodStart),
  );
  const pool = overlapping.length ? overlapping : [...streams];
  return (
    [...pool].sort(
      (a, b) =>
        Number(b.effectiveFrom <= periodEnd && (!b.effectiveTo || b.effectiveTo >= periodEnd)) -
          Number(a.effectiveFrom <= periodEnd && (!a.effectiveTo || a.effectiveTo >= periodEnd)) ||
        (streamPriority[a.streamType] ?? 9) - (streamPriority[b.streamType] ?? 9) ||
        b.effectiveFrom.localeCompare(a.effectiveFrom),
    )[0] ?? null
  );
}

/** Codes that concern individual records: those records can be left out of this invoice. */
const RECORD_LEVEL_CODES = new Set([
  'pending_time_submission',
  'pending_time_approval',
  'pending_time_finance_review',
  'pending_expense_approval',
  'missing_expense_classification',
  'missing_client_rate',
  'missing_overtime_client_rate',
  'ambiguous_client_rate',
  'missing_internal_cost',
  'missing_compensation_rule',
  'source_already_reserved',
  'source_not_billable',
  'missing_expense_currency_conversion',
  'missing_expense_finance_projection',
  'complete_client_billing_group_required',
  'client_daily_minimum_already_billed',
  'source_requires_remaining_period_billing',
]);

const FIX_FOR: Record<string, QuickInvoiceWarning['fix']> = {
  pending_time_submission: 'time',
  pending_time_approval: 'approvals',
  pending_time_finance_review: 'finance_approvals',
  pending_expense_approval: 'expenses',
  missing_expense_classification: 'expense_classification',
  missing_expense_currency_conversion: 'expense_classification',
  missing_expense_finance_projection: 'expense_classification',
  missing_client_rate: 'rates',
  missing_overtime_client_rate: 'rates',
  ambiguous_client_rate: 'rates',
  missing_internal_cost: 'finance',
  missing_compensation_rule: 'finance',
  source_already_reserved: 'invoice',
  canonical_legal_entity_revision_required: 'issuer_authority',
  missing_accountant_approved_number_policy: 'numbering',
  customer_signoff_required: 'signoff',
  missing_legal_entity: 'billing_setup',
  archived_legal_entity: 'billing_setup',
  inactive_tax_profile: 'billing_setup',
  legal_entity_currency_mismatch: 'billing_setup',
  tax_profile_currency_mismatch: 'billing_setup',
  tax_profile_legal_entity_mismatch: 'billing_setup',
  conflicting_billing_modes: 'billing_setup',
  inactive_billing_configuration: 'billing_setup',
  stale_billing_configuration: 'billing_setup',
  missing_fixed_price: 'billing_setup',
  hybrid_requires_hourly_client_rates: 'rates',
};

function sourceMinutes(context: Context, ids: readonly string[]): number {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const row = context.sqlite
    .prepare(`SELECT COALESCE(SUM(minutes),0) minutes FROM time_entry WHERE id IN (${placeholders})`)
    .get(...ids) as { minutes: number };
  return Number(row.minutes);
}

function groupedWarnings(
  context: Context,
  reasons: readonly ReadinessReason[],
  severity: (code: string) => QuickInvoiceWarning['severity'],
): QuickInvoiceWarning[] {
  const byCode = new Map<string, Set<string>>();
  for (const reason of reasons) {
    if (reason.code === 'source_not_billable') continue; // non-billable work is intentional.
    const ids = byCode.get(reason.code) ?? new Set<string>();
    if (reason.sourceId) ids.add(reason.sourceId);
    byCode.set(reason.code, ids);
  }
  return [...byCode.entries()].map(([code, ids]) => ({
    code,
    severity: severity(code),
    count: ids.size,
    minutes: code.includes('expense') ? 0 : sourceMinutes(context, [...ids]),
    fix: FIX_FOR[code] ?? null,
  }));
}

/** Eligible records only; whole client billing groups (daily/weekly units) stay together. */
function eligibleSelection(
  context: Context,
  scope: { projectId: string; billingRuleId: string; periodStart: string; periodEnd: string },
): InvoiceCompositionSourceRef[] {
  const inventory = context.repository.invoiceCompositionSources(context.principal, scope);
  const candidates = inventory.sources.filter(
    (source) => source.blockers.length === 0 && source.containingInvoice === null,
  );
  let eligible = new Set(candidates.map((source) => `${source.type}:${source.id}`));
  for (let changed = true; changed; ) {
    changed = false;
    for (const source of candidates) {
      const key = `${source.type}:${source.id}`;
      if (!eligible.has(key) || source.type !== 'time') continue;
      if (source.selectedDependencies.some((id) => !eligible.has(`time:${id}`))) {
        eligible.delete(key);
        changed = true;
      }
    }
  }
  eligible = new Set(eligible);
  return candidates
    .filter((source) => eligible.has(`${source.type}:${source.id}`))
    .map((source) => ({ type: source.type, id: source.id, version: source.version }));
}

/** Records of the period that no invoice (draft or issued) holds and that can be billed. */
function openSources(
  context: Context,
  scope: { projectId: string; billingRuleId: string; periodStart: string; periodEnd: string },
): InvoiceCompositionSource[] {
  const hard = new Set(['source_not_billable', 'source_already_reserved', 'source_requires_remaining_period_billing']);
  return context.repository
    .invoiceCompositionSources(context.principal, scope)
    .sources.filter(
      (source) =>
        source.containingInvoice === null &&
        !source.blockers.some((reason) => hard.has(reason.code)) &&
        !['void', 'rejected', 'cancelled'].includes(source.approvalState),
    );
}

function parseSnapshot(value: unknown): Row {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Row) : {};
  } catch {
    return {};
  }
}

/** Display grouping of engine lines. Amounts are summed in bigint minor units. */
function groupLines(
  context: Context,
  lines: ReadonlyArray<{
    description: string;
    quantityNumerator: number;
    quantityDenominator: number;
    unitPriceMinor: string;
    subtotalMinor: string;
    sourceType: string;
    snapshotJson: string | null;
  }>,
): QuickInvoiceGroup[] {
  const names = new Map(
    (context.sqlite.prepare('SELECT id,name FROM user').all() as Array<{ id: string; name: string }>).map(
      (user) => [user.id, user.name],
    ),
  );
  const groups = new Map<string, QuickInvoiceGroup & { amount: bigint }>();
  for (const line of lines) {
    const snapshot = parseSnapshot(line.snapshotJson);
    let key: string;
    let group: Omit<QuickInvoiceGroup, 'amountMinor'> & { amount: bigint };
    if (line.sourceType === 'time') {
      const worker = String(snapshot.worker_id ?? '');
      const category = String(snapshot.commercialCategory ?? snapshot.category ?? 'regular');
      const unit = String(snapshot.customerBillingUnit ?? 'hourly');
      key = `labor:${worker}:${category}:${unit}:${line.unitPriceMinor}`;
      group = {
        kind: 'labor',
        label: personDisplayName(names.get(worker)) || '—',
        detail: unit === 'hourly' ? category : `${category} · ${unit}`,
        minutes: 0,
        unitPriceMinor: line.unitPriceMinor,
        count: 0,
        amount: 0n,
        workerId: worker,
        category,
        unit,
        workedMinutes: 0,
        overrideRate: false,
        overrideHours: false,
      };
    } else if (line.sourceType === 'expense') {
      key = `expense:${line.description}:${groups.size}`;
      group = {
        kind: 'expense',
        label: line.description,
        detail: '',
        minutes: 0,
        unitPriceMinor: null,
        count: 0,
        amount: 0n,
      };
    } else {
      key = `fee:${line.sourceType}:${line.description.replace(/^\d{4}-\d{2}-\d{2} · /u, '')}`;
      group = {
        kind: 'fee',
        label: line.description.replace(/^\d{4}-\d{2}-\d{2} · /u, ''),
        detail: '',
        minutes: 0,
        unitPriceMinor: null,
        count: 0,
        amount: 0n,
      };
    }
    const current = groups.get(key) ?? { ...group, amountMinor: '0' };
    current.amount += BigInt(line.subtotalMinor);
    current.count += 1;
    if (line.sourceType === 'time') {
      current.minutes += Number(snapshot.commercialBilledMinutes ?? snapshot.minutes ?? 0);
      current.workedMinutes =
        (current.workedMinutes ?? 0) +
        Number(snapshot.workedMinutes ?? snapshot.commercialSliceMinutes ?? snapshot.minutes ?? 0);
      if (snapshot.overrideRateMinor !== undefined) current.overrideRate = true;
      if (snapshot.overrideBilledMinutes !== undefined) current.overrideHours = true;
    }
    if (line.sourceType === 'billing_adjustment')
      current.minutes += Number(snapshot.topUpMinutes ?? 0);
    groups.set(key, current);
  }
  const order = { labor: 0, fee: 1, expense: 2 } as const;
  return [...groups.values()]
    .sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label))
    .map(({ amount, ...group }) => ({ ...group, amountMinor: amount.toString() }));
}

/** Billed-hours overrides: the hours worked come from the override (trimmed slices have no line). */
function withWorkedMinutes(
  groups: QuickInvoiceGroup[],
  overrides: ReadonlyArray<{ target: string; workerId: string | null; category: string | null; workedMinutes: number | null }>,
): QuickInvoiceGroup[] {
  return groups.map((group) => {
    if (group.kind !== 'labor' || !group.overrideHours) return group;
    const row =
      overrides.find((item) => item.target === 'person' && item.workerId === group.workerId && item.category === group.category) ??
      overrides.find((item) => item.target === 'person' && item.workerId === group.workerId && item.category === null);
    return row?.workedMinutes != null ? { ...group, workedMinutes: row.workedMinutes } : group;
  });
}

function issuerWarnings(invoice: Row): QuickInvoiceWarning[] {
  const warnings: QuickInvoiceWarning[] = [];
  const add = (code: string, fix: QuickInvoiceWarning['fix'], severity: QuickInvoiceWarning['severity'] = 'issue') =>
    warnings.push({ code, severity, count: 0, minutes: 0, fix });
  const settings = (invoice.issuer_document_settings ?? {}) as Row;
  if (!String(settings.bankAccountNumber ?? '').trim() || !String(settings.bankName ?? '').trim())
    add('missing_issuer_settings', 'issuer_settings', 'info');
  const po = String(invoice.purchase_no ?? '').trim();
  // A project name or number is not a purchase order (audit T11: "PURCHASE NO. BBS Mexico").
  const notAPo = [invoice.project_name, invoice.project_number]
    .map((value) => String(value ?? '').trim().toLocaleLowerCase())
    .filter(Boolean)
    .includes(po.toLocaleLowerCase());
  if (!po || po === '—' || notAPo) add('missing_purchase_order', 'project_po', 'info');
  return warnings;
}

export type QuickInvoiceInput = {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  billingRuleId?: string;
  /** "Change for this invoice only": applied inside the draft engine, persisted on the draft. */
  overrides?: InvoiceOverrideInput | null;
  /** Unclassified expenses the user left out of this invoice (they no longer block it). */
  excludedExpenseIds?: readonly string[];
  /** Internal: price only records no invoice holds yet (never rebuild a same-dates draft). */
  forceSelection?: boolean;
};

function hasOverrides(input: QuickInvoiceInput): boolean {
  const value = input.overrides;
  return Boolean(value && ((value.people?.length ?? 0) > 0 || value.tax || value.purchaseNo?.trim()));
}

function normalizedOverrides(input: QuickInvoiceInput): QuickInvoiceOverrides | null {
  if (!hasOverrides(input)) return null;
  const value = input.overrides!;
  return {
    people: (value.people ?? [])
      .filter((person) => person.rateMinor != null || person.billedMinutes != null)
      .map((person) => ({
        workerId: person.workerId,
        category: person.category ?? null,
        rateMinor: person.rateMinor ?? null,
        billedMinutes: person.billedMinutes ?? null,
      })),
    tax: value.tax ?? null,
    purchaseNo: value.purchaseNo?.trim() || null,
  };
}

type Computed = {
  preview: QuickInvoicePreview;
  selection: InvoiceCompositionSourceRef[] | null;
  /** Raw engine reasons (per record), for the grouped checklist. */
  reasons: ReadinessReason[];
  lines: Array<{ sourceType: string; sourceId: string; subtotalMinor: string }>;
};

function emptyPreview(
  input: QuickInvoiceInput,
  stream: QuickInvoiceStream | null,
  alternatives: QuickInvoiceStream[],
  currency: string,
): QuickInvoicePreview {
  return {
    state: 'empty',
    projectId: input.projectId,
    stream,
    alternatives,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    mode: 'period',
    currency,
    groups: [],
    subtotalMinor: '0',
    taxMinor: '0',
    totalMinor: '0',
    taxProfileName: stream?.taxProfileName ?? null,
    taxes: [],
    purchaseNo: null,
    dueDate: null,
    paymentTermsDays: null,
    provisionalNumber: null,
    sourceCount: 0,
    warnings: [],
    existingInvoice: null,
    suggestedPeriod: null,
    lateWork: null,
    issuerLegalEntityId: null,
    openDrafts: [],
    projected: null,
    attention: [],
    expenseRows: [],
    expenseRowsTotal: 0,
    client: null,
    capabilities: { canApprove: false, canCorrectHours: false, role: '' },
    overrides: null,
    taxOptions: [],
    streamTaxProfileId: null,
    split: null,
  };
}

function nearbyApprovedDates(
  context: Context,
  projectId: string,
  periodStart: string,
  periodEnd: string,
): Array<{ workDate: string }> {
  // Logged hours outside the period that no live invoice holds yet: approved ones, and also
  // those still waiting for an approval ("Approve & include" handles them on that screen).
  // Other people's drafts / returned entries stay with them and never move the dates; the
  // owner's own drafts count (he may approve & include them).
  return context.sqlite
    .prepare(
      `SELECT DISTINCT work_date workDate FROM time_entry
        WHERE project_id=? AND (work_date<? OR work_date>?)
          AND (approval_state IN ('submitted','approved','locked')
            OR (approval_state IN ('draft','needs_changes') AND worker_id=?)) AND invoice_id IS NULL
          AND billability_state IN ('pending','billable')
          AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
                 WHERE source.source_type='time' AND source.source_id=time_entry.id
                   AND invoice.state NOT IN ('void','cancelled','superseded'))
        ORDER BY work_date`,
    )
    .all(projectId, periodStart, periodEnd, ownDraftsOf(context)) as Array<{ workDate: string }>;
}

/** The acting owner's id (his own drafts may be approved & included); '' for anyone else. */
const ownDraftsOf = (context: Context) =>
  context.principal.role === 'owner_admin' ? context.principal.userId : '';

/** Same as {@link nearbyApprovedDates} for the expenses an expense stream bills. */
function nearbyApprovedExpenseDates(
  context: Context,
  projectId: string,
  periodStart: string,
  periodEnd: string,
): Array<{ workDate: string }> {
  return context.sqlite
    .prepare(
      `SELECT DISTINCT spent_on workDate FROM expense
        WHERE project_id=? AND (spent_on<? OR spent_on>?)
          AND (approval_state IN ('submitted','approved','locked')
            OR (approval_state IN ('draft','needs_changes') AND worker_id=?)) AND invoice_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
                 WHERE source.source_type='expense' AND source.source_id=expense.id
                   AND invoice.state NOT IN ('void','cancelled','superseded'))
        ORDER BY spent_on`,
    )
    .all(projectId, periodStart, periodEnd, ownDraftsOf(context)) as Array<{ workDate: string }>;
}

/** Sent, not yet invoiced hours and expenses of the period (Hours / Expenses switch counts). */
function openStreamCounts(
  context: Context,
  projectId: string,
  periodStart: string,
  periodEnd: string,
): { time: number; expense: number } {
  const live = (type: string, table: string) =>
    `NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
       WHERE source.source_type='${type}' AND source.source_id=${table}.id
         AND invoice.state NOT IN ('void','cancelled','superseded'))`;
  const row = context.sqlite
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM time_entry WHERE project_id=? AND work_date BETWEEN ? AND ?
            AND approval_state IN ('submitted','approved') AND invoice_id IS NULL
            AND billability_state IN ('pending','billable') AND ${live('time', 'time_entry')}) time,
         (SELECT COUNT(*) FROM expense WHERE project_id=? AND spent_on BETWEEN ? AND ?
            AND approval_state IN ('submitted','approved') AND invoice_id IS NULL
            AND ${live('expense', 'expense')}) expense`,
    )
    .get(projectId, periodStart, periodEnd, projectId, periodStart, periodEnd) as { time: number; expense: number };
  return { time: Number(row.time), expense: Number(row.expense) };
}

/** Approved milestones that no live invoice holds yet, dated by due date (or approval). */
function nearbyApprovedMilestones(
  context: Context,
  projectId: string,
  periodStart: string,
  periodEnd: string,
): Array<{ workDate: string }> {
  return context.sqlite
    .prepare(
      `SELECT DISTINCT COALESCE(due_on,substr(approved_at,1,10)) workDate FROM project_milestone
        WHERE project_id=? AND approval_state='approved' AND invoice_id IS NULL
          AND COALESCE(due_on,substr(approved_at,1,10)) IS NOT NULL
          AND (COALESCE(due_on,substr(approved_at,1,10))<? OR COALESCE(due_on,substr(approved_at,1,10))>?)
          AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
                 WHERE source.source_type='milestone' AND source.source_id=project_milestone.id
                   AND invoice.state NOT IN ('void','cancelled','superseded'))
        ORDER BY workDate`,
    )
    .all(projectId, periodStart, periodEnd) as Array<{ workDate: string }>;
}

function nearbyForStream(
  context: Context,
  stream: QuickInvoiceStream,
  projectId: string,
  periodStart: string,
  periodEnd: string,
): Array<{ workDate: string }> {
  return stream.streamType === 'milestone'
    ? nearbyApprovedMilestones(context, projectId, periodStart, periodEnd)
    : stream.streamType === 'expense'
      ? nearbyApprovedExpenseDates(context, projectId, periodStart, periodEnd)
      : nearbyApprovedDates(context, projectId, periodStart, periodEnd);
}

/** Oldest unbilled (approved or pending) work first, aligned to the stream cadence and window. */
function suggestPeriod(
  stream: QuickInvoiceStream,
  nearby: ReadonlyArray<{ workDate: string }>,
): { start: string; end: string } | null {
  const dates = nearby
    .map((row) => row.workDate)
    .filter(
      (date) => date >= stream.effectiveFrom && (!stream.effectiveTo || date <= stream.effectiveTo),
    )
    .sort();
  if (!dates.length) return null;
  let range: { start: string; end: string } | null = null;
  try {
    range = periodForCadence(stream.cadence as BillingCadence, dates[0]!, {
      anchorDate: stream.anchorDate ?? undefined,
      monthlyCutoffDay: stream.monthlyCutoffDay ?? undefined,
    });
  } catch {
    range = null;
  }
  range ??= { start: dates[0]!, end: dates.at(-1)! };
  return {
    start: range.start < stream.effectiveFrom ? stream.effectiveFrom : range.start,
    end: stream.effectiveTo && range.end > stream.effectiveTo ? stream.effectiveTo : range.end,
  };
}

/** The stream's first cadence period (clamped to its window), not later than today. */
function firstStreamPeriod(stream: QuickInvoiceStream): { start: string; end: string } | null {
  try {
    const range = periodForCadence(stream.cadence as BillingCadence, stream.effectiveFrom, {
      anchorDate: stream.anchorDate ?? undefined,
      monthlyCutoffDay: stream.monthlyCutoffDay ?? undefined,
    });
    if (!range) return null;
    return {
      start: range.start < stream.effectiveFrom ? stream.effectiveFrom : range.start,
      end: stream.effectiveTo && range.end > stream.effectiveTo ? stream.effectiveTo : range.end,
    };
  } catch {
    return null;
  }
}

function cyclePeriodAround(stream: QuickInvoiceStream, date: string): { start: string; end: string } | null {
  try {
    const range = periodForCadence(stream.cadence as BillingCadence, date < stream.effectiveFrom ? stream.effectiveFrom : date, {
      anchorDate: stream.anchorDate ?? undefined,
      monthlyCutoffDay: stream.monthlyCutoffDay ?? undefined,
    });
    if (!range) return null;
    return {
      start: range.start < stream.effectiveFrom ? stream.effectiveFrom : range.start,
      end: stream.effectiveTo && range.end > stream.effectiveTo ? stream.effectiveTo : range.end,
    };
  } catch {
    return null;
  }
}

/** Open logged hours dated before `before` inside an already issued period: the "late work" hint. */
function lateWork(context: Context, projectId: string, before: string): QuickInvoicePreview['lateWork'] {
  const row = context.sqlite
    .prepare(
      `SELECT COALESCE(SUM(minutes),0) minutes,MIN(work_date) first,MAX(work_date) last FROM time_entry
        WHERE project_id=? AND work_date<?
          AND approval_state IN ('draft','submitted','needs_changes','approved','locked') AND invoice_id IS NULL
          AND billability_state IN ('pending','billable')
          AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
                 WHERE source.source_type='time' AND source.source_id=time_entry.id
                   AND invoice.state NOT IN ('void','cancelled','superseded'))
          AND EXISTS (SELECT 1 FROM invoice issued WHERE issued.project_id=time_entry.project_id
                 AND issued.state NOT IN ('draft','void','cancelled','superseded')
                 AND issued.period_start<=time_entry.work_date AND issued.period_end>=time_entry.work_date)`,
    )
    .get(projectId, before) as { minutes: number; first: string | null; last: string | null };
  return row.first && row.last && Number(row.minutes) > 0
    ? { minutes: Number(row.minutes), from: row.first, to: row.last }
    : null;
}

function computeCore(context: Context, input: QuickInvoiceInput): Computed {
  const project = context.repository
    .listFinanceProjects(context.principal)
    .find((row) => String(row.id) === input.projectId);
  if (!project) throw new ValidationError('Project not found');
  const streams = enabledStreams(context, input.projectId);
  const stream = input.billingRuleId
    ? (streams.find((candidate) => candidate.id === input.billingRuleId) ?? null)
    : chooseQuickInvoiceStream(streams, input.periodStart, input.periodEnd);
  if (input.billingRuleId && !stream) throw new ValidationError('Billing stream not found');
  const collected: ReadinessReason[] = [];
  // A stream's terms apply only inside its effective window: bill the part of the
  // requested period the stream covers and show the dates actually used.
  if (stream) {
    const periodStart =
      input.periodStart < stream.effectiveFrom ? stream.effectiveFrom : input.periodStart;
    const periodEnd =
      stream.effectiveTo && input.periodEnd > stream.effectiveTo ? stream.effectiveTo : input.periodEnd;
    if (periodStart <= periodEnd) input = { ...input, periodStart, periodEnd };
  }
  const alternatives = streams.filter((candidate) => candidate.id !== stream?.id);
  const base = {
    ...emptyPreview(input, stream, alternatives, String(project.currency)),
    openDrafts: (
      context.sqlite
        .prepare(
          `SELECT id,state,period_start periodStart,period_end periodEnd,CAST(total_minor AS TEXT) totalMinor
             FROM invoice WHERE project_id=? AND state IN ('draft','approved')
            ORDER BY period_start DESC,id LIMIT 5`,
        )
        .all(input.projectId) as QuickInvoicePreview['openDrafts']
    ).map((row) => ({ ...row })),
  };
  if (
    stream &&
    (input.periodEnd < stream.effectiveFrom || (stream.effectiveTo !== null && input.periodStart > stream.effectiveTo))
  ) {
    // The dates lie outside the stream (e.g. "Last month" for a stream that starts mid-month):
    // nothing to bill here; suggest the stream's first open period instead of a blocker.
    const nearby = nearbyForStream(context, stream, input.projectId, input.periodStart, input.periodEnd);
    return {
      preview: { ...base, state: 'empty', suggestedPeriod: suggestPeriod(stream, nearby) ?? firstStreamPeriod(stream) },
      selection: null,
      reasons: collected,
      lines: [],
    };
  }
  if (!stream)
    return {
      preview: {
        ...base,
        state: 'blocked',
        warnings: [{ code: 'missing_billing_stream', severity: 'blocker', count: 0, minutes: 0, fix: 'billing_setup' }],
      },
      selection: null,
      reasons: collected,
      lines: [],
    };

  const readiness = context.repository.billingReadiness(
    context.principal,
    stream.id,
    input.periodStart,
    input.periodEnd,
  );
  const readinessReasons = readiness.reasons as readonly ReadinessReason[];
  collected.push(...readinessReasons);
  const globalReasons = readinessReasons.filter(
    (reason) => !reason.sourceId || !RECORD_LEVEL_CODES.has(reason.code),
  );
  let forceSelection = Boolean(input.forceSelection) && stream.streamType !== 'milestone';
  if (readiness.existingInvoiceId && readiness.existingInvoiceState && readiness.existingInvoiceState !== 'draft') {
    // Work logged later inside an already invoiced period (late entries, new people) is still
    // billable: price only what no invoice holds yet instead of pointing at the old invoice.
    const late =
      stream.streamType !== 'milestone' &&
      openSources(context, {
        projectId: input.projectId,
        billingRuleId: stream.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      }).length > 0;
    if (late) forceSelection = true;
  }
  if (
    !forceSelection &&
    readiness.existingInvoiceId &&
    readiness.existingInvoiceState &&
    readiness.existingInvoiceState !== 'draft'
  ) {
    const existing = context.repository.invoicePreview(context.principal, readiness.existingInvoiceId);
    const invoice = existing.invoice as Row;
    return {
      preview: {
        ...base,
        state: 'existing',
        existingInvoice: {
          id: String(invoice.id),
          state: String(invoice.state),
          number: invoice.invoice_number ? String(invoice.invoice_number) : null,
        },
        totalMinor: String(invoice.total_minor ?? '0'),
      },
      selection: null,
      reasons: collected,
      lines: [],
    };
  }

  let selection: InvoiceCompositionSourceRef[] | null = null;
  let mode: 'period' | 'selection' = 'period';
  let excluded: QuickInvoiceWarning[] = [];
  // Invoice-only changes are recorded on whichever draft the engine builds (period or
  // selection); a rebuilt draft inherits them, so no special selection is needed here.
  if (readiness.state === 'incomplete') {
    if (globalReasons.length)
      return {
        preview: {
          ...base,
          state: 'blocked',
          // Dates that don't match the cycle: offer the cycle period around them.
          suggestedPeriod: globalReasons.some((reason) => reason.code === 'period_cutoff_mismatch')
            ? (cyclePeriodAround(stream, input.periodStart) ?? null)
            : null,
          warnings: [
            ...groupedWarnings(context, globalReasons, () => 'blocker'),
            ...groupedWarnings(
              context,
              readinessReasons.filter((reason) => !globalReasons.includes(reason)),
              () => 'excluded',
            ),
          ],
        },
        selection: null,
      reasons: collected,
      lines: [],
      };
    // Only individual records are not ready: invoice what is ready, list the rest.
    excluded = groupedWarnings(context, readinessReasons, () => 'excluded');
    if (stream.streamType === 'milestone')
      return { preview: { ...base, state: 'blocked', warnings: excluded }, selection: null, reasons: collected, lines: [] };
    selection = eligibleSelection(context, {
      projectId: input.projectId,
      billingRuleId: stream.id,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    mode = 'selection';
    if (!selection.length)
      return {
        preview: {
          ...base,
          state: 'empty',
          warnings: excluded,
          suggestedPeriod: suggestPeriod(
            stream,
            nearbyForStream(context, stream, input.projectId, input.periodStart, input.periodEnd),
          ),
        },
        selection: null,
      reasons: collected,
      lines: [],
      };
  } else if (forceSelection) {
    selection = eligibleSelection(context, {
      projectId: input.projectId,
      billingRuleId: stream.id,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    mode = 'selection';
    if (!selection.length)
      return {
        preview: {
          ...base,
          state: 'empty',
          suggestedPeriod: suggestPeriod(
            stream,
            nearbyForStream(context, stream, input.projectId, input.periodStart, input.periodEnd),
          ),
        },
        selection: null,
        reasons: collected,
        lines: [],
      };
  }

  const dryRun = context.repository.invoiceDraftDryRun(
    context.principal,
    stream.id,
    input.periodStart,
    input.periodEnd,
    selection ?? undefined,
  );
  if (!dryRun.ok) {
    collected.push(...dryRun.reasons);
    const nothing = dryRun.reasons.every((reason) =>
      ['no_billable_sources', 'no_new_client_unit_charges'].includes(reason.code),
    );
    const nearby = nearbyForStream(
      context,
      stream,
      input.projectId,
      input.periodStart,
      input.periodEnd,
    );
    return {
      preview: {
        ...base,
        state: nothing ? 'empty' : 'blocked',
        mode,
        warnings: [
          ...(nothing ? [] : groupedWarnings(context, dryRun.reasons, () => 'blocker')),
          ...excluded,
        ],
        suggestedPeriod: nothing ? suggestPeriod(stream, nearby) : null,
      },
      selection: null,
      reasons: collected,
      lines: [],
    };
  }
  const invoice = dryRun.preview.invoice as Row;
  if (!dryRun.issue.ok) collected.push(...dryRun.issue.reasons);
  // A whole-period draft for exactly these dates is rebuilt, never duplicated. When the
  // rebuild would change nothing, simply point to that draft.
  let updatesDraft = false;
  if (mode === 'period' && readiness.existingInvoiceId && readiness.existingInvoiceState === 'draft') {
    const current = context.sqlite
      .prepare('SELECT CAST(total_minor AS TEXT) total,invoice_number FROM invoice WHERE id=?')
      .get(readiness.existingInvoiceId) as { total: string; invoice_number: string | null } | undefined;
    // Records no invoice holds yet (e.g. expenses still waiting for a decision) keep the
    // screen open on this draft so they can be fixed here, instead of "already on an invoice".
    const waiting =
      current?.total === dryRun.totals.totalMinor &&
      openSources(context, {
        projectId: input.projectId,
        billingRuleId: stream.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      }).length > 0;
    if (current?.total === dryRun.totals.totalMinor && !waiting)
      return {
        preview: {
          ...base,
          state: 'existing',
          existingInvoice: { id: readiness.existingInvoiceId, state: 'draft', number: null },
          totalMinor: current.total,
        },
        selection: null,
      reasons: collected,
      lines: [],
      };
    updatesDraft = true;
  }
  // What would stop issuing later (exact: the real issue path ran in a rolled-back savepoint).
  const issuer = [
    ...(dryRun.issue.ok
      ? []
      : groupedWarnings(context, dryRun.issue.reasons, () => 'issue').map((warning) =>
          warning.code === 'issue_blocked' && !dryRun.issue.ok
            ? { ...warning, message: dryRun.issue.message }
            : warning,
        )),
    ...issuerWarnings(invoice),
  ];
  const separateExpenses =
    stream.streamType === 'labor' &&
    !stream.includeExpenses &&
    alternatives.some(
      (candidate) =>
        candidate.streamType === 'expense' &&
        candidate.effectiveFrom <= input.periodEnd &&
        (!candidate.effectiveTo || candidate.effectiveTo >= input.periodStart),
    );
  if (updatesDraft)
    issuer.push({ code: 'updates_existing_draft', severity: 'info', count: 0, minutes: 0, fix: 'invoice' });
  if (separateExpenses)
    issuer.push({ code: 'expenses_separate', severity: 'info', count: 0, minutes: 0, fix: null });
  const numberPreview = invoice.draft_number_preview as { number?: string | null } | null;
  return {
    preview: {
      ...base,
      state: 'ready',
      mode,
      currency: dryRun.totals.currency,
      groups: withWorkedMinutes(groupLines(context, dryRun.lines), dryRun.overrides),
      subtotalMinor: dryRun.totals.subtotalMinor,
      taxMinor: dryRun.totals.taxMinor,
      totalMinor: dryRun.totals.totalMinor,
      taxProfileName: invoice.tax_profile_name ? String(invoice.tax_profile_name) : null,
      taxes: (dryRun.preview.taxes ?? []).map((tax) => ({
        name: String((tax as Row).name ?? ''),
        basisPoints: Number((tax as Row).basis_points ?? 0),
      })),
      purchaseNo:
        invoice.purchase_no && invoice.purchase_no !== '—' ? String(invoice.purchase_no) : null,
      dueDate: invoice.due_date ? String(invoice.due_date) : null,
      paymentTermsDays:
        invoice.payment_terms_days === null || invoice.payment_terms_days === undefined
          ? null
          : Number(invoice.payment_terms_days),
      provisionalNumber: numberPreview?.number ? String(numberPreview.number) : null,
      sourceCount: dryRun.lines.filter((line) => ['time', 'expense', 'milestone'].includes(line.sourceType))
        .length,
      warnings: [...excluded, ...issuer],
      issuerLegalEntityId: invoice.issuer_legal_entity_id ? String(invoice.issuer_legal_entity_id) : null,
    },
    selection,
    reasons: collected,
    lines: dryRun.lines,
  };
}

const HARD_SOURCE_CODES = new Set([
  'source_not_billable',
  'source_already_reserved',
  'source_requires_remaining_period_billing',
]);

/**
 * Records the worker sent that still need an approval step before they can be invoiced:
 * submitted entries, and approved ones still waiting for the finance step. Other people's
 * drafts and entries returned for changes are theirs (owner decision 2026-11-19): never
 * offered as "Approve & include" and never projected. The acting owner's OWN drafts are the
 * exception (owner decision 2026-11-17): he may submit and approve them in one step here.
 */
export function pendingInvoiceSources(
  sources: readonly InvoiceCompositionSource[],
  actor?: { userId: string; role: string } | null,
): InvoiceCompositionSource[] {
  return sources.filter(
    (source) =>
      source.containingInvoice === null &&
      !source.blockers.some((reason) => HARD_SOURCE_CODES.has(reason.code)) &&
      (source.approvalState === 'submitted' ||
        (source.approvalState === 'approved' && !source.financeAccepted) ||
        (ownUnsent(source, actor) && ['draft', 'needs_changes'].includes(source.approvalState))),
  );
}

/** The owner's own unsent records (the only unsent records approvable from the invoice). */
function ownUnsent(source: InvoiceCompositionSource, actor?: { userId: string; role: string } | null): boolean {
  return Boolean(actor && actor.role === 'owner_admin' && source.workerId === actor.userId);
}

/** Other people's drafts and returned entries: shown apart, left out of the invoice. */
export function unsentInvoiceSources(
  sources: readonly InvoiceCompositionSource[],
  actor?: { userId: string; role: string } | null,
): InvoiceCompositionSource[] {
  return sources.filter(
    (source) =>
      source.containingInvoice === null &&
      !source.blockers.some((reason) => HARD_SOURCE_CODES.has(reason.code)) &&
      ['draft', 'needs_changes'].includes(source.approvalState) &&
      !ownUnsent(source, actor),
  );
}

const ATTENTION_CODES: Record<string, QuickInvoiceAttention['kind']> = {
  missing_client_rate: 'clientRate',
  missing_overtime_client_rate: 'clientRate',
  ambiguous_client_rate: 'clientRate',
  hybrid_requires_hourly_client_rates: 'clientRate',
  missing_internal_cost: 'workerCost',
  missing_compensation_rule: 'workerCost',
  missing_expense_classification: 'expenseTreatment',
  missing_expense_finance_projection: 'expenseTreatment',
  missing_issuer_settings: 'issuerBank',
  missing_purchase_order: 'purchaseOrder',
  missing_billing_stream: 'billingSetup',
  canonical_legal_entity_revision_required: 'issuerAuthority',
};
/** Handled by "Approve & include" (or simply the selection), never listed separately. */
const APPROVAL_CODES = new Set([
  'pending_time_submission',
  'pending_time_approval',
  'pending_time_finance_review',
  'pending_expense_approval',
  'pending_expense_submission',
  'complete_client_billing_group_required',
  'source_not_billable',
  'no_billable_sources',
  'no_new_client_unit_charges',
  'updates_existing_draft',
]);
const CLIENT_RATE_CODES = new Set([
  'missing_client_rate',
  'missing_overtime_client_rate',
  'ambiguous_client_rate',
  'hybrid_requires_hourly_client_rates',
]);
const COST_CODES = new Set(['missing_internal_cost', 'missing_compensation_rule']);
const KIND_ORDER: QuickInvoiceAttention['kind'][] = [
  'approve',
  'unsent',
  'clientRate',
  'workerCost',
  'expenseTreatment',
  'expenseSetup',
  'clientDetails',
  'billingSetup',
  'issuerAuthority',
  'issuerBank',
  'other',
  'purchaseOrder',
];

function latestReturnReasons(context: Context, ids: readonly string[]): Map<string, string> {
  const reasons = new Map<string, string>();
  if (!ids.length) return reasons;
  for (let offset = 0; offset < ids.length; offset += 400) {
    const batch = ids.slice(offset, offset + 400);
    for (const row of context.sqlite
      .prepare(
        `SELECT entity_id id,reason FROM approval_event WHERE to_state='needs_changes' AND reason IS NOT NULL
           AND entity_id IN (${batch.map(() => '?').join(',')}) ORDER BY occurred_at`,
      )
      .all(...batch) as Array<{ id: string; reason: string }>)
      reasons.set(row.id, row.reason);
  }
  return reasons;
}

/** Suggested client rate: the project-wide rate, else this person's latest rate for the client. */
function suggestedRate(context: Context, projectId: string, workerId: string, date: string): string | null {
  const row = context.sqlite
    .prepare(
      `SELECT CAST(COALESCE(CASE WHEN rate_basis='hourly' THEN hourly_rate_minor ELSE unit_rate_minor END,0) AS TEXT) minor
         FROM client_labor_rate r
        WHERE rate_basis='hourly' AND (
              (r.project_id=? AND r.worker_id IS NULL AND r.category IS NULL AND r.effective_from<=? AND (r.effective_to IS NULL OR r.effective_to>=?))
           OR (r.worker_id=? AND r.project_id IN (SELECT id FROM project WHERE client_id=(SELECT client_id FROM project WHERE id=?))))
        ORDER BY (r.project_id=? AND r.worker_id IS NULL) DESC, r.effective_from DESC LIMIT 1`,
    )
    .get(projectId, date, date, workerId, projectId, projectId) as { minor: string } | undefined;
  return row && BigInt(row.minor) > 0n ? row.minor : null;
}

function clientOf(context: Context, projectId: string): QuickInvoiceClient | null {
  const row = context.sqlite
    .prepare(
      `SELECT c.id,c.version,c.display_name,c.legal_name,c.billing_address,c.billing_email,
              ${context.sqlite.prepare("SELECT 1 FROM pragma_table_info('client') WHERE name='tax_id'").get() ? 'c.tax_id' : 'NULL'} tax_id
         FROM project p JOIN client c ON c.id=p.client_id WHERE p.id=?`,
    )
    .get(projectId) as Row | undefined;
  if (!row) return null;
  const clean = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
  return {
    id: String(row.id),
    version: Number(row.version),
    name: String(row.display_name || row.legal_name || ''),
    legalName: String(row.legal_name || ''),
    billingAddress: clean(row.billing_address),
    billingEmail: clean(row.billing_email),
    taxId: clean(row.tax_id),
  };
}

function people(
  context: Context,
  sources: readonly InvoiceCompositionSource[],
): Map<string, QuickInvoiceAttentionPerson> {
  const names = new Map<string, QuickInvoiceAttentionPerson>();
  for (const source of sources) {
    const person = names.get(source.workerId) ?? {
      workerId: source.workerId,
      name: personDisplayName(source.workerName) || '—',
      minutes: 0,
      count: 0,
      fromDate: source.date,
      sources: [],
    };
    person.count += 1;
    person.minutes += source.type === 'time' ? Number(source.minutes ?? 0) : 0;
    if (source.date < (person.fromDate ?? source.date)) person.fromDate = source.date;
    person.sources!.push({ type: source.type, id: source.id, version: source.version });
    names.set(source.workerId, person);
  }
  void context;
  return names;
}

function buildAttention(
  context: Context,
  input: QuickInvoiceInput,
  base: Computed,
  projected: Computed | null,
  inventory: readonly InvoiceCompositionSource[],
  pending: readonly InvoiceCompositionSource[],
  client: QuickInvoiceClient | null,
  unsent: readonly InvoiceCompositionSource[] = [],
): { attention: QuickInvoiceAttention[]; expenseRows: QuickInvoiceExpenseRow[]; expenseRowsTotal: number } {
  const items: QuickInvoiceAttention[] = [];
  const byId = new Map(inventory.map((source) => [`${source.id}`, source]));
  const today = new Date().toISOString().slice(0, 10);

  // 1. Approval: one row per person, whatever state the worker left the records in.
  if (pending.length) {
    const pendingIds = new Set(pending.map((source) => source.id));
    const projectedByWorker = new Map<string, bigint>();
    for (const line of projected?.lines ?? []) {
      if (!pendingIds.has(line.sourceId)) continue;
      const worker = byId.get(line.sourceId)?.workerId;
      if (worker)
        projectedByWorker.set(worker, (projectedByWorker.get(worker) ?? 0n) + BigInt(line.subtotalMinor));
    }
    const returned = latestReturnReasons(
      context,
      pending.filter((source) => source.approvalState === 'needs_changes').map((source) => source.id),
    );
    const grouped = people(context, pending);
    for (const person of grouped.values()) {
      const mine = pending.filter((source) => source.workerId === person.workerId);
      person.states = {
        draft: mine.filter((source) => source.approvalState === 'draft').length,
        submitted: mine.filter((source) => source.approvalState === 'submitted').length,
        returned: mine.filter((source) => source.approvalState === 'needs_changes').length,
        financePending: mine.filter((source) => source.approvalState === 'approved').length,
      };
      person.returnedReason =
        mine.map((source) => returned.get(source.id)).find((reason) => Boolean(reason)) ?? null;
      person.futureCount = mine.filter((source) => source.date > today).length;
      person.expenseCount = mine.filter((source) => source.type === 'expense').length;
      // Approving cannot include an expense until the client treatment is decided.
      person.unclassifiedExpenseCount = mine.filter(
        (source) => source.type === 'expense' && source.classificationState === 'unclassified',
      ).length;
      const amount = projectedByWorker.get(person.workerId);
      if (amount !== undefined) person.projectedMinor = amount.toString();
    }
    const list = [...grouped.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
    items.push({
      kind: 'approve',
      blocks: base.preview.state === 'ready' ? 'none' : 'create',
      people: list.slice(0, 25),
      totalCount: list.length,
      minutes: list.reduce((total, person) => total + person.minutes, 0),
    });
  }

  // 1b. Not sent by the worker yet (drafts, returned for changes): information only. They are
  // not on this invoice and cannot be approved from here; the worker sends them first.
  if (unsent.length) {
    const grouped = [...people(context, unsent).values()].sort(
      (a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name),
    );
    for (const person of grouped) {
      const mine = unsent.filter((source) => source.workerId === person.workerId);
      person.states = {
        draft: mine.filter((source) => source.approvalState === 'draft').length,
        submitted: 0,
        returned: mine.filter((source) => source.approvalState === 'needs_changes').length,
        financePending: 0,
      };
      person.expenseCount = mine.filter((source) => source.type === 'expense').length;
      delete person.sources;
    }
    items.push({
      kind: 'unsent',
      blocks: 'none',
      people: grouped.slice(0, 25),
      totalCount: grouped.length,
      minutes: grouped.reduce((total, person) => total + person.minutes, 0),
    });
  }

  // 2–4. Rates, costs, expense treatment from the engine reasons of the projected selection.
  const reasons = (projected ?? base).reasons;
  const issueCodes = new Set(
    (projected ?? base).preview.warnings
      .filter((warning) => warning.severity === 'issue')
      .map((warning) => warning.code),
  );
  const perKind = new Map<string, Set<string>>();
  const otherCodes = new Map<string, Set<string>>();
  for (const reason of reasons) {
    const kind = ATTENTION_CODES[reason.code];
    if (kind && ['clientRate', 'workerCost', 'expenseTreatment'].includes(kind)) {
      const ids = perKind.get(kind) ?? new Set<string>();
      if (reason.sourceId) ids.add(reason.sourceId);
      perKind.set(kind, ids);
    } else if (!kind && !APPROVAL_CODES.has(reason.code)) {
      const ids = otherCodes.get(reason.code) ?? new Set<string>();
      if (reason.sourceId) ids.add(reason.sourceId);
      otherCodes.set(reason.code, ids);
    }
  }
  const unsentIds = new Set(unsent.map((source) => source.id));
  for (const kind of ['clientRate', 'workerCost'] as const) {
    const ids = perKind.get(kind);
    if (!ids?.size) continue;
    // Records another draft already holds are priced there, not here.
    const sources = [...ids]
      .map((id) => byId.get(id))
      .filter((source): source is InvoiceCompositionSource => Boolean(source) && source!.containingInvoice === null)
      // Hours the worker has not sent are not on this invoice: their rate is asked once sent.
      .filter((source) => !unsentIds.has(source.id));
    if (!sources.length) continue;
    const grouped = [...people(context, sources).values()].sort((a, b) => b.minutes - a.minutes);
    for (const person of grouped) {
      if (kind === 'clientRate')
        person.suggestedRateMinor = suggestedRate(context, input.projectId, person.workerId, person.fromDate ?? input.periodStart);
      delete person.sources;
    }
    const codes = kind === 'clientRate' ? CLIENT_RATE_CODES : COST_CODES;
    const present = new Set(reasons.filter((reason) => reason.sourceId && ids.has(reason.sourceId)).map((reason) => reason.code));
    items.push({
      kind,
      ...(kind === 'workerCost'
        ? { payMissing: present.has('missing_compensation_rule'), costMissing: present.has('missing_internal_cost') }
        : {}),
      // Missing only on records still waiting for approval: issuing what is approved now
      // stays possible; once approved (or for approved records) it must be fixed first.
      blocks:
        base.reasons.some((reason) => codes.has(reason.code) && !(reason.sourceId && unsentIds.has(reason.sourceId))) ||
        base.preview.state !== 'ready'
          ? 'create'
          : 'none',
      people: grouped.slice(0, 25),
      totalCount: grouped.length,
      minutes: grouped.reduce((total, person) => total + person.minutes, 0),
    });
  }
  const excluded = new Set(input.excludedExpenseIds ?? []);
  // Other people's drafts and returned expenses are not on this invoice (listed under "Not
  // sent by the worker yet"): never offered for a client decision and never blocking.
  const unclassified = [...(perKind.get('expenseTreatment') ?? [])].filter(
    (id) => !excluded.has(id) && !unsentIds.has(id) && byId.get(id)?.containingInvoice == null,
  );
  const expenses = inventory.filter((source) => source.type === 'expense' && !unsentIds.has(source.id));
  const expenseRows: QuickInvoiceExpenseRow[] = [];
  if (expenses.length) {
    const detail = context.sqlite.prepare(
      'SELECT client_treatment,billing_treatment,markup_bps,category FROM expense WHERE id=?',
    );
    const policies = new AssignmentExpensePolicyRepository(context.sqlite);
    for (const source of expenses.slice(0, 50)) {
      const row = (detail.get(source.id) ?? {}) as Row;
      let policyAvailable = false;
      if (source.classificationState === 'unclassified')
        try {
          const policy = policies.preview(context.principal, source.id);
          policyAvailable =
            policy.issues.length === 0 && !!policy.policy && !!policy.clientTreatment && !!policy.billingTreatment;
        } catch {
          policyAvailable = false;
        }
      const foreign = String(source.originalCurrency ?? source.currency) !== base.preview.currency;
      const current = foreign
        ? currentCurrencyConversion(context.sqlite, 'expense', source.id, base.preview.currency)
        : null;
      const confirmed =
        current && current.sourceAmountMinor === String(source.originalAmountMinor ?? source.amountMinor ?? '')
          ? current
          : null;
      expenseRows.push({
        ref: { type: 'expense', id: source.id, version: source.version },
        // The screen puts the category in words (localized); never the stored code.
        label: source.summary ?? '',
        category: String(row.category ?? ''),
        date: source.date,
        workerName: personDisplayName(source.workerName),
        amountMinor: String(source.originalAmountMinor ?? source.amountMinor ?? '0'),
        currency: String(source.originalCurrency ?? source.currency),
        approvalState: source.approvalState,
        classificationState: String(source.classificationState ?? ''),
        clientTreatment: String(row.client_treatment ?? ''),
        billingTreatment: String(row.billing_treatment ?? ''),
        markupBps: Number(row.markup_bps ?? 0),
        locked: source.containingInvoice !== null,
        policyAvailable,
        foreign,
        conversion: confirmed
          ? { rate: confirmed.rate, amountMinor: confirmed.targetAmountMinor, rateSource: confirmed.rateSource }
          : null,
        excluded: excluded.has(source.id),
      });
    }
  }
  // Unclassified expenses always need a decision before approval, even without an engine reason.
  for (const source of expenses)
    if (
      source.classificationState === 'unclassified' &&
      source.containingInvoice === null &&
      !excluded.has(source.id) &&
      !unclassified.includes(source.id)
    )
      unclassified.push(source.id);
  if (unclassified.length)
    items.push({
      kind: 'expenseTreatment',
      blocks: 'create',
      expenseIds: unclassified.slice(0, 50),
      totalCount: unclassified.length,
    });

  // 5. Client details (saved on the client; drafts read it live, issuing freezes it).
  if (client && clientBillingIssues(client).length)
    items.push({ kind: 'clientDetails', blocks: 'none', totalCount: 1 });

  // 6–8. Billing setup, issuer bank details, other engine reasons, PO.
  const warnings = (projected ?? base).preview.warnings;
  if (warnings.some((warning) => warning.code === 'missing_billing_stream')) {
    const entities = issuerChoices(context, base.preview.currency);
    const taxProfiles = (context.repository.listTaxProfiles(context.principal) as Row[])
      .filter((profile) => String(profile.currency) === base.preview.currency && String(profile.status) === 'active')
      .map((profile) => ({
        id: String(profile.id),
        name: String(profile.name),
        legalEntityId: profile.legal_entity_id ? String(profile.legal_entity_id) : null,
        basisPoints: (() => {
          try {
            return (JSON.parse(String(profile.components_json ?? '[]')) as Array<{ basisPoints: string }>).reduce(
              (total, component) => total + Number(component.basisPoints ?? 0),
              0,
            );
          } catch {
            return 0;
          }
        })(),
      }));
    items.push({ kind: 'billingSetup', blocks: 'create', totalCount: 1, billingSetup: { legalEntities: entities, taxProfiles } });
  }
  if (warnings.some((warning) => warning.code === 'canonical_legal_entity_revision_required')) {
    const streamId = (projected ?? base).preview.stream?.id;
    const rule = streamId
      ? (context.sqlite.prepare('SELECT legal_entity_id FROM billing_rule WHERE id=?').get(streamId) as
          | { legal_entity_id: string | null }
          | undefined)
      : undefined;
    items.push({
      kind: 'issuerAuthority',
      blocks: 'issue',
      totalCount: 1,
      issuerAuthority: {
        legalEntities: issuerChoices(context, base.preview.currency),
        current: rule?.legal_entity_id ?? null,
      },
    });
  }
  const issuerId = (projected ?? base).preview.issuerLegalEntityId;
  if (warnings.some((warning) => warning.code === 'missing_issuer_settings') && issuerId) {
    const entity = (context.repository.listLegalEntities(context.principal) as unknown as Row[])
      .find((candidate) => String(candidate.id) === issuerId) as Row | undefined;
    const settings = entity?.document_settings as Row | undefined;
    if (settings)
      items.push({
        kind: 'issuerBank',
        blocks: 'none',
        totalCount: 1,
        issuer: {
          legalEntityId: issuerId,
          currency: String(settings.currency),
          version: Number(settings.version ?? 0),
          bankName: String(settings.bankName ?? ''),
          bankAccountNumber: String(settings.bankAccountNumber ?? ''),
        },
      });
  }
  for (const warning of warnings) {
    if (ATTENTION_CODES[warning.code] || APPROVAL_CODES.has(warning.code) || warning.code === 'expenses_separate')
      continue;
    if (warning.severity === 'excluded' && !otherCodes.has(warning.code)) continue;
    items.push({
      kind: 'other',
      code: warning.code,
      blocks: warning.severity === 'blocker' ? 'create' : warning.severity === 'issue' || issueCodes.has(warning.code) ? 'issue' : 'none',
      totalCount: warning.count,
      minutes: warning.minutes,
      fix: warning.fix,
      ...(warning.message ? { message: warning.message } : {}),
    });
  }
  if (warnings.some((warning) => warning.code === 'missing_purchase_order')) {
    const project = context.sqlite
      .prepare('SELECT version,po_number FROM project WHERE id=?')
      .get(input.projectId) as { version: number; po_number: string | null } | undefined;
    if (project)
      items.push({
        kind: 'purchaseOrder',
        blocks: 'none',
        totalCount: 1,
        project: { id: input.projectId, version: Number(project.version), poNumber: project.po_number },
      });
  }
  items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return { attention: items, expenseRows, expenseRowsTotal: expenses.length };
}

/**
 * A project invoiced for labor only (no expense stream, labor stream without expenses) whose
 * workers submitted expenses: nothing would ever bill them. Returns what a separate expense
 * stream would cover, starting at the earliest such expense but never inside dates already
 * billed by an expense invoice or an earlier expense-carrying stream.
 */
export function expenseStreamGap(context: Context, projectId: string): ExpenseStreamGap | null {
  const sqlite = context.sqlite;
  const labor = sqlite
    .prepare(
      `SELECT id,effective_from,include_expenses FROM billing_rule WHERE project_id=? AND enabled=1
          AND stream_type='labor' AND effective_to IS NULL ORDER BY effective_from DESC LIMIT 1`,
    )
    .get(projectId) as { id: string; effective_from: string; include_expenses: number } | undefined;
  if (!labor || Number(labor.include_expenses) === 1) return null;
  if (
    sqlite
      .prepare(
        `SELECT 1 FROM billing_rule WHERE project_id=? AND enabled=1 AND stream_type='expense'
            AND effective_to IS NULL LIMIT 1`,
      )
      .get(projectId)
  )
    return null;
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
  const next = floor ? shiftDay(floor, 1) : '0000-01-01';
  const from = next > labor.effective_from ? next : labor.effective_from;
  const rows = sqlite
    .prepare(
      `SELECT e.currency,CAST(SUM(e.amount_minor) AS TEXT) total,COUNT(*) n,MIN(e.spent_on) first
         FROM expense e
        WHERE e.project_id=? AND e.approval_state IN ('submitted','approved') AND e.invoice_id IS NULL
          AND e.spent_on>=?
          AND (e.commercial_classification_state='unclassified'
            OR e.billing_treatment LIKE 'reimbursable%' OR e.billing_treatment='allowance_per_diem')
          AND NOT EXISTS(SELECT 1 FROM invoice_source s JOIN invoice i ON i.id=s.invoice_id
                WHERE s.source_type='expense' AND s.source_id=e.id
                  AND i.state NOT IN ('void','cancelled','superseded'))
        GROUP BY e.currency ORDER BY e.currency`,
    )
    .all(projectId, from) as Array<{ currency: string; total: string; n: number; first: string }>;
  if (!rows.length) return null;
  return {
    count: rows.reduce((total, row) => total + Number(row.n), 0),
    totals: rows.map((row) => ({ currency: row.currency, amountMinor: row.total })),
    effectiveFrom: rows.map((row) => row.first).sort()[0]!,
    laborRuleId: labor.id,
  };
}

const shiftDay = (value: string, days: number) =>
  new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function compute(context: Context, input: QuickInvoiceInput): Computed {
  const base = computeCore(context, input);
  const preview = base.preview;
  const client = clientOf(context, input.projectId);
  const capabilities = {
    canApprove: ['owner_admin', 'finance_admin'].includes(context.principal.role),
    canCorrectHours: ['owner_admin', 'finance_admin'].includes(context.principal.role),
    role: context.principal.role,
  };
  let inventory: InvoiceCompositionSource[] = [];
  let pending: InvoiceCompositionSource[] = [];
  let unsent: InvoiceCompositionSource[] = [];
  let projected: Computed | null = null;
  const stream = preview.stream;
  if (stream && ['labor', 'expense'].includes(stream.streamType) && preview.state !== 'existing') {
    inventory = [
      ...context.repository.invoiceCompositionSources(context.principal, {
        projectId: input.projectId,
        billingRuleId: stream.id,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
      }).sources,
    ];
    pending = pendingInvoiceSources(inventory, context.principal);
    unsent = unsentInvoiceSources(inventory, context.principal);
    if (pending.length && capabilities.canApprove) {
      // Exact "if you approve" amount: the real approval commands and the real draft
      // engine run inside a savepoint that is always rolled back.
      context.sqlite.exec('SAVEPOINT quick_invoice_projection');
      try {
        context.repository.approvePendingForInvoice(context.principal, {
          projectId: input.projectId,
          sources: pending.map((source) => ({ type: source.type, id: source.id, version: source.version })),
          requestKey: `projection-${Date.now()}`,
          periodStart: preview.periodStart,
          periodEnd: preview.periodEnd,
          simulate: true,
        });
        // Same selection rules as the amount shown now: records that another draft (also a
        // draft for exactly these dates) already holds are never counted a second time.
        projected = computeCore(context, {
          ...input,
          periodStart: preview.periodStart,
          periodEnd: preview.periodEnd,
          billingRuleId: stream.id,
          forceSelection: true,
        });
      } catch {
        projected = null;
      } finally {
        context.sqlite.exec('ROLLBACK TO quick_invoice_projection');
        context.sqlite.exec('RELEASE quick_invoice_projection');
      }
    }
  }
  const { attention, expenseRows, expenseRowsTotal } = buildAttention(
    context,
    input,
    base,
    projected,
    inventory,
    pending,
    client,
    unsent,
  );
  // Expenses that no stream would ever bill (labor-only project): offer the one-step setup,
  // whatever the state of these dates (also "already on an invoice").
  if (stream?.streamType === 'labor' && capabilities.canApprove) {
    const gap = expenseStreamGap(context, input.projectId);
    if (gap) {
      attention.push({ kind: 'expenseSetup', blocks: 'none', totalCount: gap.count, expenseSetup: gap });
      attention.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    }
  }
  const split = splitByPurchaseOrder(context, input, base, inventory);
  const projectedPreview = projected?.preview;
  const zeroIfNotReady = (state: string, value: string) => (state === 'ready' ? value : '0');
  return {
    ...base,
    preview: {
      ...preview,
      // An approval-only blocker is not "blocked": the checklist resolves it here.
      state:
        preview.state === 'empty' && projectedPreview?.state === 'ready' ? 'blocked' : preview.state,
      projected:
        projectedPreview && pending.length
          ? {
              state: projectedPreview.state,
              groups: projectedPreview.groups,
              subtotalMinor: projectedPreview.subtotalMinor,
              taxMinor: projectedPreview.taxMinor,
              totalMinor: projectedPreview.totalMinor,
              includedPendingMinor: (
                BigInt(zeroIfNotReady(projectedPreview.state, projectedPreview.totalMinor)) -
                BigInt(zeroIfNotReady(preview.state, preview.totalMinor))
              ).toString(),
              pendingCount: pending.length,
              pendingMinutes: pending.reduce((total, source) => total + Number(source.minutes ?? 0), 0),
            }
          : null,
      attention,
      expenseRows,
      expenseRowsTotal,
      streamCounts: openStreamCounts(context, input.projectId, preview.periodStart, preview.periodEnd),
      client,
      capabilities,
      suggestedPeriod: pending.length ? null : preview.suggestedPeriod,
      lateWork:
        preview.state === 'existing' || stream?.streamType !== 'labor'
          ? null
          : lateWork(context, input.projectId, preview.periodStart),
      overrides: normalizedOverrides(input),
      ...taxChoices(context, stream?.id ?? null),
      split,
    },
  };
}

/**
 * One invoice per assignment PO. Runs only when the invoice could be created now, the people
 * on it have different POs and no PO was typed for this invoice. Every part is priced by the
 * canonical engine (rolled-back dry run) with exactly its own records, so the amounts shown
 * are the amounts the drafts will carry.
 */
function splitByPurchaseOrder(
  context: Context,
  input: QuickInvoiceInput,
  base: Computed,
  inventory: readonly InvoiceCompositionSource[],
): QuickInvoiceSplit | null {
  const preview = base.preview;
  const stream = preview.stream;
  if (!stream || preview.state !== 'ready' || !['labor', 'expense'].includes(stream.streamType)) return null;
  if (input.overrides?.purchaseNo?.trim()) return null;
  const labels = new InvoiceLineLabels(context.sqlite, input.projectId);
  if (!labels.assignmentPos) return null;
  const model = context.sqlite.prepare('SELECT billing_model FROM project WHERE id=?').get(input.projectId) as
    | { billing_model: string }
    | undefined;
  // Fixed fees, caps and included hours belong to the project as a whole: never split them.
  if (model && ['hybrid', 'capped_tm'].includes(model.billing_model)) return null;
  if (base.lines.some((line) => !['time', 'expense', 'billing_adjustment'].includes(line.sourceType))) return null;
  const refs =
    base.selection ??
    eligibleSelection(context, {
      projectId: input.projectId,
      billingRuleId: stream.id,
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
    });
  const byId = new Map(inventory.map((source) => [`${source.type}:${source.id}`, source]));
  const billed = new Set(base.lines.map((line) => `${line.sourceType}:${line.sourceId}`));
  const groups = new Map<string, { poKey: string | null; refs: InvoiceCompositionSourceRef[]; people: Map<string, { workerId: string; name: string; minutes: number }> }>();
  for (const ref of refs) {
    const source = byId.get(`${ref.type}:${ref.id}`);
    if (!source) return null;
    const poKey = labels.po(source.workerId, source.date);
    const key = poKey ?? '';
    const group = groups.get(key) ?? { poKey, refs: [] as InvoiceCompositionSourceRef[], people: new Map() };
    group.refs.push(ref);
    const person = group.people.get(source.workerId) ?? {
      workerId: source.workerId,
      name: personDisplayName(source.workerName) || '—',
      minutes: 0,
    };
    if (source.type === 'time' && billed.has(`time:${source.id}`)) person.minutes += Number(source.minutes ?? 0);
    group.people.set(source.workerId, person);
    groups.set(key, group);
  }
  if (groups.size < 2) return null;
  const parts: QuickInvoiceSplitPart[] = [];
  for (const group of [...groups.values()].sort((a, b) =>
    a.poKey === null ? 1 : b.poKey === null ? -1 : a.poKey.localeCompare(b.poKey),
  )) {
    const dryRun = context.repository.invoiceDraftDryRun(
      context.principal,
      stream.id,
      preview.periodStart,
      preview.periodEnd,
      group.refs,
    );
    if (!dryRun.ok) return null;
    const invoice = dryRun.preview.invoice as Row;
    parts.push({
      poKey: group.poKey,
      purchaseNo: invoice.purchase_no && invoice.purchase_no !== '—' ? String(invoice.purchase_no) : null,
      people: [...group.people.values()].sort((a, b) => a.name.localeCompare(b.name)),
      sourceCount: dryRun.lines.filter((line) => ['time', 'expense'].includes(line.sourceType)).length,
      subtotalMinor: dryRun.totals.subtotalMinor,
      taxMinor: dryRun.totals.taxMinor,
      totalMinor: dryRun.totals.totalMinor,
      refs: group.refs,
    } as QuickInvoiceSplitPart & { refs: InvoiceCompositionSourceRef[] });
  }
  const totalMinor = parts.reduce((sum, part) => sum + BigInt(part.totalMinor), 0n).toString();
  return {
    parts,
    totalMinor,
    signature: parts.map((part) => `${part.poKey ?? '-'}=${part.totalMinor}`).join('|'),
  };
}

/** Server-side record selection of each split part (never sent to the browser). */
function splitRefs(part: QuickInvoiceSplitPart): InvoiceCompositionSourceRef[] {
  return (part as QuickInvoiceSplitPart & { refs?: InvoiceCompositionSourceRef[] }).refs ?? [];
}

function publicSplit(split: QuickInvoiceSplit | null): QuickInvoiceSplit | null {
  return split
    ? { ...split, parts: split.parts.map((part) => { const { refs: _refs, ...rest } = part as QuickInvoiceSplitPart & { refs?: unknown }; return rest; }) }
    : null;
}

/** Active tax profiles for the stream's issuer and currency (the tax chip's choices). */
function taxChoices(
  context: Context,
  ruleId: string | null,
): Pick<QuickInvoicePreview, 'taxOptions' | 'streamTaxProfileId'> {
  if (!ruleId) return { taxOptions: [], streamTaxProfileId: null };
  const rule = context.sqlite
    .prepare('SELECT tax_profile_id,currency,legal_entity_id FROM billing_rule WHERE id=?')
    .get(ruleId) as { tax_profile_id: string | null; currency: string; legal_entity_id: string } | undefined;
  if (!rule) return { taxOptions: [], streamTaxProfileId: null };
  const rows = context.sqlite
    .prepare(
      `SELECT tp.id,tp.name,COALESCE((SELECT SUM(basis_points) FROM tax_component tc WHERE tc.tax_profile_id=tp.id),0) bps
         FROM tax_profile tp WHERE tp.status='active' AND tp.currency=?
          AND (tp.legal_entity_id IS NULL OR tp.legal_entity_id=?) ORDER BY tp.name,tp.id LIMIT 50`,
    )
    .all(rule.currency, rule.legal_entity_id) as Array<{ id: string; name: string; bps: number }>;
  return {
    taxOptions: rows.map((row) => ({ id: row.id, name: row.name, basisPoints: Number(row.bps) })),
    streamTaxProfileId: rule.tax_profile_id,
  };
}

export function quickInvoicePreview(context: Context, input: QuickInvoiceInput): QuickInvoicePreview {
  authorize(context);
  return context.repository.withInvoiceOverrides(input.overrides, () => publicPreview(compute(context, input).preview));
}

function publicPreview(preview: QuickInvoicePreview): QuickInvoicePreview {
  return { ...preview, split: publicSplit(preview.split) };
}

export type QuickInvoiceCreateResult =
  | {
      ok: true;
      invoiceId: string;
      totalMinor: string;
      created: boolean;
      /** Split by PO: every draft created in this action (first = invoiceId). */
      invoiceIds?: string[];
    }
  | { ok: false; reason: 'amount_changed' | 'not_ready'; preview: QuickInvoicePreview };

/**
 * Creates the draft only when it carries exactly the amount the user saw. Creation and the
 * amount check share one transaction, so a changed amount leaves nothing behind.
 */
export function quickInvoiceCreate(
  context: Context,
  input: QuickInvoiceInput & { expectedTotalMinor: string; requestKey: string; expectedSplit?: string | null },
): QuickInvoiceCreateResult {
  authorize(context);
  // Overrides are applied by the engine and recorded on the draft it creates.
  return context.repository.withInvoiceOverrides(input.overrides, () => createGuarded(context, input));
}

function createGuarded(
  context: Context,
  input: QuickInvoiceInput & { expectedTotalMinor: string; requestKey: string; expectedSplit?: string | null },
): QuickInvoiceCreateResult {
  if (!/^\d+$/u.test(input.expectedTotalMinor)) throw new ValidationError('Expected total required');
  const sqlite = context.sqlite;
  sqlite.exec('BEGIN IMMEDIATE');
  let committed = false;
  try {
    const computed = computeCore(context, input);
    const { preview, selection } = computed;
    if (preview.state !== 'ready' || !preview.stream) {
      sqlite.exec('ROLLBACK');
      committed = true;
      return { ok: false, reason: 'not_ready', preview: publicPreview(compute(context, input).preview) };
    }
    // Different assignment POs: one draft per PO, all or nothing, each exactly as previewed.
    // Only labor/expense streams have a per-source inventory (and can split by PO);
    // milestone streams are invoiced whole.
    const inventory = ['labor', 'expense'].includes(preview.stream.streamType)
      ? context.repository.invoiceCompositionSources(context.principal, {
          projectId: input.projectId,
          billingRuleId: preview.stream.id,
          periodStart: preview.periodStart,
          periodEnd: preview.periodEnd,
        }).sources
      : [];
    const split = splitByPurchaseOrder(context, input, computed, inventory);
    if (split || input.expectedSplit) {
      if (!split || split.signature !== input.expectedSplit || split.totalMinor !== input.expectedTotalMinor) {
        sqlite.exec('ROLLBACK');
        committed = true;
        return { ok: false, reason: 'amount_changed', preview: publicPreview(compute(context, input).preview) };
      }
      const ids: string[] = [];
      split.parts.forEach((part, index) => {
        const created = context.repository.createSelectedInvoiceDraft(context.principal, {
          projectId: input.projectId,
          billingRuleId: preview.stream!.id,
          periodStart: preview.periodStart,
          periodEnd: preview.periodEnd,
          sources: splitRefs(part),
          requestKey: `${input.requestKey}:po:${index}`,
        });
        const saved = sqlite
          .prepare("SELECT state,CAST(total_minor AS TEXT) total FROM invoice WHERE id=?")
          .get(created.id) as { state: string; total: string } | undefined;
        if (!saved || saved.state !== 'draft' || saved.total !== part.totalMinor)
          throw new ConflictError('Invoice amount changed while creating');
        ids.push(created.id);
      });
      sqlite.exec('COMMIT');
      committed = true;
      return { ok: true, invoiceId: ids[0]!, invoiceIds: ids, totalMinor: split.totalMinor, created: true };
    }
    if (preview.totalMinor !== input.expectedTotalMinor) {
      sqlite.exec('ROLLBACK');
      committed = true;
      return { ok: false, reason: 'amount_changed', preview: publicPreview(compute(context, input).preview) };
    }
    const result = selection
      ? context.repository.createSelectedInvoiceDraft(context.principal, {
          projectId: input.projectId,
          billingRuleId: preview.stream.id,
          periodStart: preview.periodStart,
          periodEnd: preview.periodEnd,
          sources: selection,
          requestKey: input.requestKey,
        })
      : context.repository.createInvoiceDraft(
          context.principal,
          preview.stream.id,
          preview.periodStart,
          preview.periodEnd,
        );
    if (!result.id) throw new ConflictError('Invoice draft could not be created');
    const saved = sqlite
      .prepare("SELECT state,CAST(total_minor AS TEXT) total FROM invoice WHERE id=?")
      .get(result.id) as { state: string; total: string } | undefined;
    if (!saved || saved.state !== 'draft' || saved.total !== input.expectedTotalMinor) {
      sqlite.exec('ROLLBACK');
      committed = true;
      return { ok: false, reason: 'amount_changed', preview: publicPreview(compute(context, input).preview) };
    }
    sqlite.exec('COMMIT');
    committed = true;
    return { ok: true, invoiceId: result.id, totalMinor: saved.total, created: result.created };
  } finally {
    if (!committed)
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        /* keep the original error */
      }
  }
}
