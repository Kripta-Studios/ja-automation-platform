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
  ConflictError,
  ValidationError,
  assertLiveSession,
  type InvoiceCompositionSourceRef,
  type ReadinessReason,
} from '@ja/database';
import { periodForCadence, type BillingCadence } from '@ja/billing-engine';
import type { openPortalRepository } from './portal-repository';
import { personDisplayName } from '../portal/display-name';

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
  issuerLegalEntityId: string | null;
  /** Unissued drafts of this project overlapping the period (records may already sit there). */
  openDrafts: Array<{ id: string; state: string; periodStart: string; periodEnd: string; totalMinor: string }>;
};

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
    if (line.sourceType === 'time')
      current.minutes += Number(snapshot.commercialBilledMinutes ?? snapshot.minutes ?? 0);
    if (line.sourceType === 'billing_adjustment')
      current.minutes += Number(snapshot.topUpMinutes ?? 0);
    groups.set(key, current);
  }
  const order = { labor: 0, fee: 1, expense: 2 } as const;
  return [...groups.values()]
    .sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label))
    .map(({ amount, ...group }) => ({ ...group, amountMinor: amount.toString() }));
}

function issuerWarnings(invoice: Row): QuickInvoiceWarning[] {
  const warnings: QuickInvoiceWarning[] = [];
  const add = (code: string, fix: QuickInvoiceWarning['fix'], severity: QuickInvoiceWarning['severity'] = 'issue') =>
    warnings.push({ code, severity, count: 0, minutes: 0, fix });
  const settings = (invoice.issuer_document_settings ?? {}) as Row;
  if (!String(settings.bankAccountNumber ?? '').trim() || !String(settings.bankName ?? '').trim())
    add('missing_issuer_settings', 'issuer_settings', 'info');
  const po = String(invoice.purchase_no ?? '').trim();
  if (!po || po === '—') add('missing_purchase_order', 'project_po', 'info');
  return warnings;
}

export type QuickInvoiceInput = {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  billingRuleId?: string;
};

type Computed = {
  preview: QuickInvoicePreview;
  selection: InvoiceCompositionSourceRef[] | null;
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
    issuerLegalEntityId: null,
    openDrafts: [],
  };
}

function nearbyApprovedDates(
  context: Context,
  projectId: string,
  periodStart: string,
  periodEnd: string,
): Array<{ workDate: string }> {
  // Approved hours outside the period that no live invoice holds yet.
  return context.sqlite
    .prepare(
      `SELECT DISTINCT work_date workDate FROM time_entry
        WHERE project_id=? AND (work_date<? OR work_date>?)
          AND approval_state IN ('approved','locked') AND invoice_id IS NULL
          AND billability_state IN ('pending','billable')
          AND NOT EXISTS (SELECT 1 FROM invoice_source source JOIN invoice ON invoice.id=source.invoice_id
                 WHERE source.source_type='time' AND source.source_id=time_entry.id
                   AND invoice.state NOT IN ('void','cancelled','superseded'))
        ORDER BY work_date`,
    )
    .all(projectId, periodStart, periodEnd) as Array<{ workDate: string }>;
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
    : nearbyApprovedDates(context, projectId, periodStart, periodEnd);
}

/** Oldest unbilled approved work first, aligned to the stream cadence and window. */
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

function compute(context: Context, input: QuickInvoiceInput): Computed {
  const project = context.repository
    .listFinanceProjects(context.principal)
    .find((row) => String(row.id) === input.projectId);
  if (!project) throw new ValidationError('Project not found');
  const streams = enabledStreams(context, input.projectId);
  const stream = input.billingRuleId
    ? (streams.find((candidate) => candidate.id === input.billingRuleId) ?? null)
    : chooseQuickInvoiceStream(streams, input.periodStart, input.periodEnd);
  if (input.billingRuleId && !stream) throw new ValidationError('Billing stream not found');
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
  if (!stream)
    return {
      preview: {
        ...base,
        state: 'blocked',
        warnings: [{ code: 'missing_billing_stream', severity: 'blocker', count: 0, minutes: 0, fix: 'billing_setup' }],
      },
      selection: null,
    };

  const readiness = context.repository.billingReadiness(
    context.principal,
    stream.id,
    input.periodStart,
    input.periodEnd,
  );
  const readinessReasons = readiness.reasons as readonly ReadinessReason[];
  const globalReasons = readinessReasons.filter(
    (reason) => !reason.sourceId || !RECORD_LEVEL_CODES.has(reason.code),
  );
  if (readiness.existingInvoiceId && readiness.existingInvoiceState && readiness.existingInvoiceState !== 'draft') {
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
    };
  }

  let selection: InvoiceCompositionSourceRef[] | null = null;
  let mode: 'period' | 'selection' = 'period';
  let excluded: QuickInvoiceWarning[] = [];
  if (readiness.state === 'incomplete') {
    if (globalReasons.length)
      return {
        preview: {
          ...base,
          state: 'blocked',
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
      };
    // Only individual records are not ready: invoice what is ready, list the rest.
    excluded = groupedWarnings(context, readinessReasons, () => 'excluded');
    if (stream.streamType === 'milestone')
      return { preview: { ...base, state: 'blocked', warnings: excluded }, selection: null };
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
    };
  }
  const invoice = dryRun.preview.invoice as Row;
  // A whole-period draft for exactly these dates is rebuilt, never duplicated. When the
  // rebuild would change nothing, simply point to that draft.
  let updatesDraft = false;
  if (mode === 'period' && readiness.existingInvoiceId && readiness.existingInvoiceState === 'draft') {
    const current = context.sqlite
      .prepare('SELECT CAST(total_minor AS TEXT) total,invoice_number FROM invoice WHERE id=?')
      .get(readiness.existingInvoiceId) as { total: string; invoice_number: string | null } | undefined;
    if (current?.total === dryRun.totals.totalMinor)
      return {
        preview: {
          ...base,
          state: 'existing',
          existingInvoice: { id: readiness.existingInvoiceId, state: 'draft', number: null },
          totalMinor: current.total,
        },
        selection: null,
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
      groups: groupLines(context, dryRun.lines),
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
  };
}

export function quickInvoicePreview(context: Context, input: QuickInvoiceInput): QuickInvoicePreview {
  authorize(context);
  return compute(context, input).preview;
}

export type QuickInvoiceCreateResult =
  | { ok: true; invoiceId: string; totalMinor: string; created: boolean }
  | { ok: false; reason: 'amount_changed' | 'not_ready'; preview: QuickInvoicePreview };

/**
 * Creates the draft only when it carries exactly the amount the user saw. Creation and the
 * amount check share one transaction, so a changed amount leaves nothing behind.
 */
export function quickInvoiceCreate(
  context: Context,
  input: QuickInvoiceInput & { expectedTotalMinor: string; requestKey: string },
): QuickInvoiceCreateResult {
  authorize(context);
  if (!/^\d+$/u.test(input.expectedTotalMinor)) throw new ValidationError('Expected total required');
  const sqlite = context.sqlite;
  sqlite.exec('BEGIN IMMEDIATE');
  let committed = false;
  try {
    const { preview, selection } = compute(context, input);
    if (preview.state !== 'ready' || !preview.stream) {
      sqlite.exec('ROLLBACK');
      committed = true;
      return { ok: false, reason: 'not_ready', preview };
    }
    if (preview.totalMinor !== input.expectedTotalMinor) {
      sqlite.exec('ROLLBACK');
      committed = true;
      return { ok: false, reason: 'amount_changed', preview };
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
      return { ok: false, reason: 'amount_changed', preview: compute(context, input).preview };
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
