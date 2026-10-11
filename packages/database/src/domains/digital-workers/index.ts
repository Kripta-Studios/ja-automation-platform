import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal } from '@ja/domain';
import { PortalRepository } from '../../repository.ts';
import { V3Repository } from '../../v3-repository.ts';
import { verifyPrivatePdfArtifact } from '../../core/private-pdf-proof.ts';
import { verifyEvidenceFile } from './evidence-file.ts';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { canonicalJson, sha256 } from '../../core/canonical-json.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import type {
  InvoiceCompositionSource,
  InvoiceCompositionSourceRef,
} from '../billing/invoice-composition.ts';

export class DigitalWorkAccessDeniedError extends Error {
  name = 'DigitalWorkAccessDeniedError';
}
export class DigitalWorkConflictError extends Error {
  name = 'DigitalWorkConflictError';
}
export class DigitalWorkValidationError extends Error {
  name = 'DigitalWorkValidationError';
}
export class DigitalWorkNotFoundError extends Error {
  name = 'DigitalWorkNotFoundError';
}

export type CaseScopeKind = 'whole_period' | 'selected_sources';
export type CaseScope = Readonly<{
  projectId: string;
  billingRuleId: string;
  periodStart: string;
  periodEnd: string;
  scopeKind: CaseScopeKind;
  selectedSources?: readonly InvoiceCompositionSourceRef[];
}>;
export type OpenCaseInput = CaseScope & Readonly<{ requestKey: string }>;
export type CaseActionInput = Readonly<{
  caseId: string;
  expectedVersion: number;
  requestKey: string;
}>;
export type CaseManifest = Readonly<{
  sources: readonly InvoiceCompositionSource[];
  selectedSources: readonly InvoiceCompositionSourceRef[];
  remainder: readonly InvoiceCompositionSource[];
  dispositions: readonly Readonly<{
    type: 'time' | 'expense';
    id: string;
    disposition: 'included' | 'excluded' | 'blocking' | 'remainder';
    reasons: readonly string[];
    containingInvoice: InvoiceCompositionSource['containingInvoice'];
  }>[];
  reasons: readonly { code: string; sourceId?: string }[];
  rule: Readonly<Record<string, unknown>>;
  reports: readonly Readonly<Record<string, unknown>>[];
  conformities: readonly Readonly<Record<string, unknown>>[];
  followups: readonly Readonly<Record<string, unknown>>[];
  readyForDraft: boolean;
}>;
export type CaseView = Readonly<{
  id: string;
  projectId: string;
  billingRuleId: string;
  periodStart: string;
  periodEnd: string;
  scopeKind: CaseScopeKind;
  selectedSources: readonly InvoiceCompositionSourceRef[];
  version: number;
  manifestSha256: string;
  manifest: CaseManifest;
  currentReviewId: string | null;
  reviewedManifestSha256: string | null;
  reviewCurrent: boolean;
  snapshotChanges: Readonly<{
    addedSources: readonly string[];
    removedSources: readonly string[];
    changedSources: readonly string[];
    contextChanged: boolean;
  }>;
  draftInvoiceId: string | null;
  phase: 'coordinating' | 'invoice_prepared';
  invoiceState: string | null;
  createdAt: string;
  updatedAt: string;
}>;
export type WorkItemKind = 'scope_change' | 'handover' | 'evidence' | 'policy_review';
export type WorkItemStatus =
  | 'open'
  | 'in_progress'
  | 'ready_for_review'
  | 'accepted'
  | 'waived'
  | 'cancelled';
export type ScopeClassification =
  | 'existing_scope'
  | 'rework'
  | 'goodwill'
  | 'needs_clarification'
  | 'potential_change';
export type EvidenceRef = Readonly<{
  type:
    | 'time'
    | 'expense'
    | 'daily_report'
    | 'technical_report'
    | 'period_report'
    | 'customer_conformity'
    | 'document'
    | 'external';
  id: string;
  version?: number;
  note?: string;
}>;
export type EvidenceView = EvidenceRef &
  Readonly<{ state: 'current' | 'claimed' | 'missing' | 'stale' }>;
export type WorkItemView = Readonly<{
  id: string;
  projectId: string;
  caseId: string | null;
  kind: WorkItemKind;
  title: string;
  description: string | null;
  ownerId: string;
  dueOn: string | null;
  status: WorkItemStatus;
  evidenceRefs: readonly EvidenceView[];
  scopeClassification: ScopeClassification | null;
  policyReference: string | null;
  proposedSettings: unknown | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;
export type SaveWorkItemInput = Readonly<{
  projectId: string;
  caseId?: string | null;
  kind: WorkItemKind;
  title: string;
  description?: string | null;
  ownerId: string;
  dueOn?: string | null;
  evidenceRefs?: readonly EvidenceRef[];
  scopeClassification?: ScopeClassification | null;
  policyReference?: string | null;
  proposedSettings?: unknown;
  requestKey: string;
}>;
export type UpdateWorkItemInput = Readonly<{
  id: string;
  expectedVersion: number;
  status?: WorkItemStatus;
  ownerId?: string;
  dueOn?: string | null;
  evidenceRefs?: readonly EvidenceRef[];
  scopeClassification?: ScopeClassification | null;
  policyReference?: string | null;
  proposedSettings?: unknown;
  title?: string;
  description?: string | null;
  reason: string;
  requestKey: string;
}>;

type Row = Record<string, unknown>;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const EVIDENCE_TABLES = new Set([
  'time',
  'expense',
  'daily_report',
  'technical_report',
  'period_report',
  'customer_conformity',
  'document',
]);
const FINANCE = new Set(['owner_admin', 'finance_admin']);
function required(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new DigitalWorkValidationError(`${name} is required or too long`);
  return value.trim();
}
function optional(value: unknown, name: string, max = 5000): string | null {
  if (value === undefined || value === null || value === '') return null;
  return required(value, name, max);
}
function date(value: unknown, name: string, mandatory = false): string | null {
  const s = mandatory ? required(value, name, 10) : optional(value, name, 10);
  if (s === null) return null;
  const parsed = new Date(`${s}T00:00:00Z`);
  if (
    !DATE.test(s) ||
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== s
  )
    throw new DigitalWorkValidationError(`${name} must be a real ISO date`);
  return s;
}
function integer(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new DigitalWorkValidationError(`${name} must be a positive integer`);
  return Number(value);
}
function refs(value: unknown): InvoiceCompositionSourceRef[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new DigitalWorkValidationError('At most 1000 selected sources');
  const seen = new Set<string>();
  return value
    .map((v) => {
      if (!v || !['time', 'expense'].includes(v.type))
        throw new DigitalWorkValidationError('Invalid source type');
      const id = required(v.id, 'Source ID', 200);
      const version = integer(v.version, 'Source version');
      const key = `${v.type}:${id}`;
      if (seen.has(key)) throw new DigitalWorkValidationError('Duplicate source');
      seen.add(key);
      return { type: v.type as 'time' | 'expense', id, version };
    })
    .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}
function evidenceRefs(value: unknown): EvidenceRef[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50)
    throw new DigitalWorkValidationError('At most 50 evidence references');
  const seen = new Set<string>();
  return value.map((v) => {
    if (!v || (!EVIDENCE_TABLES.has(v.type) && v.type !== 'external'))
      throw new DigitalWorkValidationError('Invalid evidence type');
    const type = v.type as EvidenceRef['type'];
    const id = required(v.id, 'Evidence ID', 200);
    const version = v.version === undefined ? undefined : integer(v.version, 'Evidence version');
    const note = optional(v.note, 'Evidence note', 1000) ?? undefined;
    const key = `${type}:${id}`;
    if (seen.has(key)) throw new DigitalWorkValidationError('Duplicate evidence');
    seen.add(key);
    return {
      type,
      id,
      ...(version === undefined ? {} : { version }),
      ...(note === undefined ? {} : { note }),
    };
  });
}
function parse<T>(s: unknown): T {
  return JSON.parse(String(s)) as T;
}
function sourceKey(s: { type: string; id: string }): string {
  return `${s.type}:${s.id}`;
}
function normalizedRow(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]),
  );
}

export class DigitalWorkersRepository {
  private readonly portal: PortalRepository;
  constructor(private readonly sqlite: DatabaseSync) {
    this.portal = new PortalRepository(sqlite);
  }
  private now(): string {
    return new Date().toISOString();
  }
  private auth(principal: Principal): void {
    assertActiveAccount(this.sqlite, principal, DigitalWorkAccessDeniedError);
    assertLiveSession(this.sqlite, principal, DigitalWorkAccessDeniedError);
    const row = this.sqlite
      .prepare('SELECT role,status FROM user WHERE id=?')
      .get(principal.userId) as Row | undefined;
    if (!row || row.role !== principal.role || row.status !== 'active')
      throw new DigitalWorkAccessDeniedError('Current role required');
    if (
      this.sqlite
        .prepare('SELECT 1 FROM supplier_user_profile WHERE user_id=?')
        .get(principal.userId)
    )
      throw new DigitalWorkAccessDeniedError('Restricted supplier profile');
  }
  private finance(principal: Principal): void {
    this.auth(principal);
    if (!FINANCE.has(principal.role))
      throw new DigitalWorkAccessDeniedError('Finance role required');
  }
  private membership(userId: string, projectId: string, canReview = false): boolean {
    const p = this.sqlite
      .prepare('SELECT timezone,status FROM project WHERE id=?')
      .get(projectId) as Row | undefined;
    if (!p || !['active', 'planned', 'paused', 'closing'].includes(String(p.status))) return false;
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat('en-US', {
        timeZone: String(p.timezone),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
    } catch {
      return false;
    }
    const part = (t: string) => parts.find((x) => x.type === t)?.value;
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    return Boolean(
      this.sqlite
        .prepare(
          `SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active' ${canReview ? 'AND can_review=1' : ''} AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) LIMIT 1`,
        )
        .get(projectId, userId, today, today),
    );
  }
  private project(principal: Principal, projectId: string, canReview = false): void {
    this.auth(principal);
    if (FINANCE.has(principal.role) || principal.role === 'auditor_read_only') return;
    if (
      principal.role !== 'project_manager' ||
      !this.membership(principal.userId, projectId, canReview)
    )
      throw new DigitalWorkAccessDeniedError('Current project authority required');
  }
  private receipt<T>(
    principal: Principal,
    action: string,
    requestKey: string,
    payload: unknown,
  ): T | undefined {
    const key = required(requestKey, 'Request key', 200);
    if (key.length < 8)
      throw new DigitalWorkValidationError('Request key must have at least 8 characters');
    const row = this.sqlite
      .prepare(
        'SELECT payload_sha256,result_json FROM digital_work_request WHERE actor_user_id=? AND action=? AND request_key=?',
      )
      .get(principal.userId, action, key) as Row | undefined;
    if (!row) return undefined;
    if (row.payload_sha256 !== sha256(canonicalJson(payload)))
      throw new DigitalWorkConflictError('Request key used for different payload');
    return parse<T>(row.result_json);
  }
  private storeReceipt(
    principal: Principal,
    action: string,
    requestKey: string,
    payload: unknown,
    result: unknown,
  ): void {
    this.sqlite
      .prepare(
        'INSERT INTO digital_work_request(actor_user_id,action,request_key,payload_sha256,result_json,created_at) VALUES(?,?,?,?,?,?)',
      )
      .run(
        principal.userId,
        action,
        required(requestKey, 'Request key', 200),
        sha256(canonicalJson(payload)),
        canonicalJson(result),
        this.now(),
      );
  }
  private caseRow(caseId: string): Row {
    const row = this.sqlite.prepare('SELECT * FROM digital_work_case WHERE id=?').get(caseId) as
      | Row
      | undefined;
    if (!row) throw new DigitalWorkNotFoundError('Case not found');
    return row;
  }
  private context(projectId: string, ruleId: string, start: string, end: string) {
    const rule = this.sqlite
      .prepare('SELECT * FROM billing_rule WHERE id=? AND project_id=?')
      .get(ruleId, projectId) as Row | undefined;
    if (!rule) throw new DigitalWorkValidationError('Project billing rule required');
    const project = this.sqlite
      .prepare('SELECT id,version,status,billing_model,currency,client_id FROM project WHERE id=?')
      .get(projectId) as Row | undefined;
    const reports = (
      this.sqlite
        .prepare(
          'SELECT id,report_type,audience,state,snapshot_version,snapshot_sha256,pdf_sha256,updated_at FROM period_report WHERE project_id=? AND period_start<=? AND period_end>=? ORDER BY id',
        )
        .all(projectId, end, start) as Row[]
    ).map(normalizedRow);
    const conformities = (
      this.sqlite
        .prepare(
          'SELECT c.id,c.period_report_id,c.snapshot_version,c.snapshot_sha256,c.report_pdf_sha256,c.signed_at,c.signature_document_id,i.id invalidation_id,i.reason invalidation_reason,i.occurred_at invalidated_at FROM customer_conformity c JOIN period_report r ON r.id=c.period_report_id LEFT JOIN customer_conformity_invalidation i ON i.conformity_id=c.id WHERE r.project_id=? AND r.period_start<=? AND r.period_end>=? ORDER BY c.id',
        )
        .all(projectId, end, start) as Row[]
    ).map(normalizedRow);
    const followups = (
      this.sqlite
        .prepare(
          'SELECT f.id,f.period_report_id,f.snapshot_version,f.snapshot_sha256,f.event_type,f.responsible_user_id,f.next_follow_up_on,f.sequence_no FROM period_report_followup_event f JOIN period_report r ON r.id=f.period_report_id WHERE r.project_id=? AND r.period_start<=? AND r.period_end>=? ORDER BY f.period_report_id,f.sequence_no',
        )
        .all(projectId, end, start) as Row[]
    ).map(normalizedRow);
    const policies = [
      'project_commercial_policy',
      'client_labor_rate',
      'client_minimum_policy_revision',
    ].map((table) => ({
      table,
      rows: this.sqlite
        .prepare(`SELECT * FROM ${table} WHERE project_id=? ORDER BY id`)
        .all(projectId)
        .map(normalizedRow),
    }));
    policies.push({
      table: 'assignment_rate_override',
      rows: (
        this.sqlite
          .prepare(
            'SELECT a.id,a.project_member_id,a.client_labor_rate_id,a.effective_from,a.effective_to,a.priority,a.version FROM assignment_rate_override a JOIN project_member m ON m.id=a.project_member_id WHERE m.project_id=? ORDER BY a.id',
          )
          .all(projectId) as Row[]
      ).map(normalizedRow),
    });
    const tax = rule.tax_profile_id
      ? (this.sqlite
          .prepare('SELECT * FROM tax_profile WHERE id=?')
          .get(String(rule.tax_profile_id)) as Row | undefined)
      : undefined;
    return {
      rule: normalizedRow(rule),
      project: project ? normalizedRow(project) : null,
      tax: tax ? normalizedRow(tax) : null,
      policies,
      reports,
      conformities,
      followups,
    };
  }
  private manifest(principal: Principal, scope: CaseScope): CaseManifest {
    const context = this.context(
      scope.projectId,
      scope.billingRuleId,
      scope.periodStart,
      scope.periodEnd,
    );
    const supported = ['labor', 'expense'].includes(String(context.rule.stream_type));
    const inventory = supported
      ? this.portal.invoiceCompositionSources(principal, {
          projectId: scope.projectId,
          billingRuleId: scope.billingRuleId,
          periodStart: scope.periodStart,
          periodEnd: scope.periodEnd,
        })
      : { sources: [], reasons: [{ code: 'stream_requires_existing_invoice_workflow' }] };
    const sources = [...inventory.sources].sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
    const pendingCodes = new Set([
      'pending_time_submission',
      'pending_expense_submission',
      'pending_expense_approval',
      'missing_expense_classification',
    ]);
    const disposition = (
      source: InvoiceCompositionSource,
    ): 'included' | 'excluded' | 'blocking' | 'remainder' => {
      if (scope.scopeKind === 'selected_sources')
        return refs(scope.selectedSources ?? []).some((ref) => sourceKey(ref) === sourceKey(source))
          ? 'included'
          : 'remainder';
      if (source.blockers.length === 0) return 'included';
      if (source.blockers.some((blocker) => pendingCodes.has(blocker.code))) return 'blocking';
      if (
        source.blockers.some((blocker) =>
          ['source_not_billable', 'source_already_reserved'].includes(blocker.code),
        )
      )
        return 'excluded';
      return 'blocking';
    };
    const dispositions = sources.map((source) => ({
      type: source.type,
      id: source.id,
      disposition: disposition(source),
      reasons: source.blockers.map((blocker) => blocker.code),
      containingInvoice: source.containingInvoice,
    }));
    const selected =
      scope.scopeKind === 'selected_sources'
        ? refs(scope.selectedSources ?? [])
        : sources
            .filter((s) => disposition(s) === 'included')
            .map((s) => ({ type: s.type, id: s.id, version: s.version }));
    const selectedKeys = new Set(selected.map(sourceKey));
    const remainder = sources.filter((s) => !selectedKeys.has(sourceKey(s)));
    const reasons = [...inventory.reasons];
    if (scope.scopeKind === 'whole_period')
      for (const source of sources)
        if (disposition(source) === 'blocking') reasons.push(...source.blockers);
    for (const ref of selected) {
      const source = sources.find((s) => sourceKey(s) === sourceKey(ref));
      if (!source) reasons.push({ code: 'selected_source_outside_scope', sourceId: ref.id });
      else if (source.version !== ref.version)
        reasons.push({ code: 'selected_source_changed', sourceId: ref.id });
      else reasons.push(...source.blockers);
    }
    if (!selected.length) reasons.push({ code: 'no_invoice_sources_selected' });
    let readyForDraft = false;
    if (supported && selected.length && reasons.length === 0) {
      const preview = this.portal.invoiceCompositionPreview(principal, {
        projectId: scope.projectId,
        billingRuleId: scope.billingRuleId,
        periodStart: scope.periodStart,
        periodEnd: scope.periodEnd,
        sources: selected,
      });
      reasons.push(...preview.reasons);
      readyForDraft = preview.state === 'ready';
    }
    return {
      sources,
      selectedSources: selected,
      remainder,
      dispositions,
      reasons,
      rule: {
        ...context.rule,
        project: context.project,
        tax: context.tax,
        policies: context.policies,
      },
      reports: context.reports,
      conformities: context.conformities,
      followups: context.followups,
      readyForDraft,
    };
  }
  private scope(row: Row): CaseScope {
    return {
      projectId: String(row.project_id),
      billingRuleId: String(row.billing_rule_id),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      scopeKind: row.scope_kind as CaseScopeKind,
      selectedSources: parse<InvoiceCompositionSourceRef[]>(row.selected_sources_json),
    };
  }
  private view(principal: Principal, row: Row): CaseView {
    if (row.draft_invoice_id !== null) return this.recordedCaseView(row);
    const manifest = this.manifest(principal, this.scope(row));
    const hash = sha256(canonicalJson(manifest));
    const reviewed = row.review_revision_id
      ? (this.sqlite
          .prepare(
            'SELECT id,manifest_sha256,revision_id FROM digital_work_case_review WHERE revision_id=? ORDER BY created_at DESC LIMIT 1',
          )
          .get(String(row.review_revision_id)) as Row | undefined)
      : undefined;
    const previous = reviewed
      ? (this.sqlite
          .prepare('SELECT manifest_json FROM digital_work_case_revision WHERE id=?')
          .get(String(reviewed.revision_id)) as Row | undefined)
      : undefined;
    const old = previous ? parse<CaseManifest>(previous.manifest_json) : null;
    const oldMap = new Map(old?.sources.map((s) => [sourceKey(s), s]) ?? []);
    const newMap = new Map(manifest.sources.map((s) => [sourceKey(s), s]));
    const added = [...newMap.keys()].filter((k) => !oldMap.has(k));
    const removed = [...oldMap.keys()].filter((k) => !newMap.has(k));
    const changed = [...newMap.keys()].filter(
      (k) => oldMap.has(k) && canonicalJson(newMap.get(k)) !== canonicalJson(oldMap.get(k)),
    );
    const contextChanged =
      old !== null &&
      canonicalJson({
        rule: old.rule,
        reports: old.reports,
        conformities: old.conformities,
        followups: old.followups,
      }) !==
        canonicalJson({
          rule: manifest.rule,
          reports: manifest.reports,
          conformities: manifest.conformities,
          followups: manifest.followups,
        });
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      billingRuleId: String(row.billing_rule_id),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      scopeKind: row.scope_kind as CaseScopeKind,
      selectedSources: parse(row.selected_sources_json),
      version: Number(row.version),
      manifestSha256: hash,
      manifest,
      currentReviewId: reviewed ? String(reviewed.id) : null,
      reviewedManifestSha256: reviewed ? String(reviewed.manifest_sha256) : null,
      reviewCurrent: Boolean(
        reviewed &&
        reviewed.manifest_sha256 === hash &&
        reviewed.revision_id === row.current_revision_id,
      ),
      snapshotChanges: {
        addedSources: added,
        removedSources: removed,
        changedSources: changed,
        contextChanged,
      },
      draftInvoiceId: row.draft_invoice_id === null ? null : String(row.draft_invoice_id),
      phase: row.draft_invoice_id === null ? 'coordinating' : 'invoice_prepared',
      invoiceState:
        row.draft_invoice_id === null
          ? null
          : String(
              this.sqlite
                .prepare('SELECT state FROM invoice WHERE id=?')
                .get(String(row.draft_invoice_id))?.state ?? 'unavailable',
            ),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
  private audit(
    principal: Principal,
    action: string,
    type: string,
    id: string,
    details: unknown,
  ): void {
    recordAuditEvent(this.sqlite, principal, action, type, id, details);
  }
  private caseEvent(
    principal: Principal,
    row: Row,
    eventType: 'opened' | 'reconciled' | 'reviewed' | 'draft_prepared',
    details: unknown,
  ): void {
    this.sqlite
      .prepare(
        'INSERT INTO digital_work_case_event(id,case_id,event_type,revision_id,actor_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        String(row.id),
        eventType,
        String(row.current_revision_id),
        principal.userId,
        canonicalJson(details),
        this.now(),
      );
  }
  openCase(principal: Principal, input: OpenCaseInput): CaseView {
    this.finance(principal);
    const projectId = required(input.projectId, 'Project ID', 200),
      billingRuleId = required(input.billingRuleId, 'Billing rule ID', 200);
    const periodStart = date(input.periodStart, 'Period start', true)!,
      periodEnd = date(input.periodEnd, 'Period end', true)!;
    if (periodEnd < periodStart)
      throw new DigitalWorkValidationError('Period end must follow start');
    if (!['whole_period', 'selected_sources'].includes(input.scopeKind))
      throw new DigitalWorkValidationError('Invalid case scope');
    const selectedSources =
      input.scopeKind === 'selected_sources' ? refs(input.selectedSources) : [];
    if (input.scopeKind === 'selected_sources' && !selectedSources.length)
      throw new DigitalWorkValidationError('Selected source scope requires sources');
    const payload = {
      projectId,
      billingRuleId,
      periodStart,
      periodEnd,
      scopeKind: input.scopeKind,
      selectedSources,
    };
    return runImmediateTransaction(this.sqlite, 'DigitalWork', () => {
      const prior = this.receipt<{ caseId: string }>(
        principal,
        'case_open',
        input.requestKey,
        payload,
      );
      if (prior) return this.caseDetail(principal, prior.caseId);
      const existing = this.sqlite
        .prepare(
          'SELECT id FROM digital_work_case WHERE project_id=? AND billing_rule_id=? AND period_start=? AND period_end=? AND scope_kind=? AND selected_sources_json=? AND draft_invoice_id IS NULL ORDER BY created_at,id LIMIT 1',
        )
        .get(
          projectId,
          billingRuleId,
          periodStart,
          periodEnd,
          input.scopeKind,
          canonicalJson(selectedSources),
        ) as Row | undefined;
      if (existing) {
        this.storeReceipt(principal, 'case_open', input.requestKey, payload, {
          caseId: String(existing.id),
        });
        return this.caseDetail(principal, String(existing.id));
      }
      const manifest = this.manifest(principal, payload);
      const hash = sha256(canonicalJson(manifest));
      const id = newId(),
        revisionId = newId(),
        now = this.now();
      this.sqlite
        .prepare(
          'INSERT INTO digital_work_case(id,project_id,billing_rule_id,period_start,period_end,scope_kind,selected_sources_json,version,current_revision_id,review_revision_id,draft_invoice_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?)',
        )
        .run(
          id,
          projectId,
          billingRuleId,
          periodStart,
          periodEnd,
          input.scopeKind,
          canonicalJson(selectedSources),
          1,
          revisionId,
          principal.userId,
          now,
          now,
        );
      this.sqlite
        .prepare(
          'INSERT INTO digital_work_case_revision(id,case_id,version,manifest_json,manifest_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(revisionId, id, 1, canonicalJson(manifest), hash, principal.userId, now);
      const row = this.caseRow(id);
      this.caseEvent(principal, row, 'opened', { manifestSha256: hash });
      this.audit(principal, 'digital_work.case_open', 'digital_work_case', id, {
        projectId,
        manifestSha256: hash,
      });
      this.storeReceipt(principal, 'case_open', input.requestKey, payload, { caseId: id });
      return this.view(principal, row);
    });
  }
  caseDetail(principal: Principal, caseId: string): CaseView {
    this.auth(principal);
    if (!FINANCE.has(principal.role) && principal.role !== 'auditor_read_only')
      throw new DigitalWorkAccessDeniedError('Finance read required');
    const row = this.caseRow(required(caseId, 'Case ID', 200));
    return principal.role === 'auditor_read_only'
      ? this.recordedCaseView(row)
      : this.view(principal, row);
  }
  reconcileCase(principal: Principal, input: CaseActionInput): CaseView {
    this.finance(principal);
    const caseId = required(input.caseId, 'Case ID', 200),
      expectedVersion = integer(input.expectedVersion, 'Expected version');
    const payload = { caseId, expectedVersion };
    return runImmediateTransaction(this.sqlite, 'DigitalWork', () => {
      const prior = this.receipt<{ caseId: string }>(
        principal,
        'case_reconcile',
        input.requestKey,
        payload,
      );
      if (prior) return this.caseDetail(principal, prior.caseId);
      const row = this.caseRow(caseId);
      if (row.version !== expectedVersion)
        throw new DigitalWorkConflictError('Case version changed');
      if (row.draft_invoice_id !== null)
        throw new DigitalWorkConflictError(
          'Case handed over to its invoice; continue in the invoice workflow',
        );
      if (row.scope_kind === 'selected_sources') {
        const inventory = this.manifest(principal, this.scope(row)).sources;
        const selected = parse<InvoiceCompositionSourceRef[]>(row.selected_sources_json).map(
          (ref) => {
            const current = inventory.find((source) => sourceKey(source) === sourceKey(ref));
            return current && current.blockers.length === 0
              ? { ...ref, version: current.version }
              : ref;
          },
        );
        row.selected_sources_json = canonicalJson(selected);
      }
      const live = this.view(principal, row);
      const current = this.sqlite
        .prepare('SELECT manifest_sha256 FROM digital_work_case_revision WHERE id=?')
        .get(String(row.current_revision_id)) as Row;
      if (current.manifest_sha256 !== live.manifestSha256) {
        const version = expectedVersion + 1,
          revisionId = newId(),
          now = this.now();
        this.sqlite
          .prepare(
            'INSERT INTO digital_work_case_revision(id,case_id,version,manifest_json,manifest_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            revisionId,
            caseId,
            version,
            canonicalJson(live.manifest),
            live.manifestSha256,
            principal.userId,
            now,
          );
        this.sqlite
          .prepare(
            'UPDATE digital_work_case SET version=?,current_revision_id=?,selected_sources_json=?,updated_at=? WHERE id=? AND version=?',
          )
          .run(
            version,
            revisionId,
            String(row.selected_sources_json),
            now,
            caseId,
            expectedVersion,
          );
        const updated = this.caseRow(caseId);
        this.caseEvent(principal, updated, 'reconciled', {
          previousRevisionId: row.current_revision_id,
          manifestSha256: live.manifestSha256,
        });
        this.audit(
          principal,
          'digital_work.case_reconcile',
          'digital_work_case_revision',
          revisionId,
          { projectId: row.project_id, caseId, manifestSha256: live.manifestSha256 },
        );
      }
      this.storeReceipt(principal, 'case_reconcile', input.requestKey, payload, { caseId });
      return this.caseDetail(principal, caseId);
    });
  }
  recordCaseReview(
    principal: Principal,
    input: CaseActionInput & { manifestSha256: string; reason: string },
  ): CaseView {
    this.finance(principal);
    const caseId = required(input.caseId, 'Case ID', 200),
      expectedVersion = integer(input.expectedVersion, 'Expected version'),
      reason = required(input.reason, 'Review reason', 2000),
      manifestSha256 = required(input.manifestSha256, 'Manifest SHA-256', 64);
    const payload = { caseId, expectedVersion, reason, manifestSha256 };
    return runImmediateTransaction(this.sqlite, 'DigitalWork', () => {
      const prior = this.receipt<{ caseId: string }>(
        principal,
        'case_review',
        input.requestKey,
        payload,
      );
      if (prior) return this.caseDetail(principal, prior.caseId);
      const row = this.caseRow(caseId);
      if (row.version !== expectedVersion)
        throw new DigitalWorkConflictError('Case version changed');
      if (row.draft_invoice_id !== null)
        throw new DigitalWorkConflictError(
          'Case handed over to its invoice; continue in the invoice workflow',
        );
      const live = this.view(principal, row);
      if (live.manifestSha256 !== manifestSha256)
        throw new DigitalWorkConflictError('Case evidence changed');
      const revision = this.sqlite
        .prepare('SELECT manifest_sha256 FROM digital_work_case_revision WHERE id=?')
        .get(String(row.current_revision_id)) as Row;
      if (revision.manifest_sha256 !== manifestSha256)
        throw new DigitalWorkConflictError('Reconcile changed case evidence first');
      const id = newId(),
        now = this.now();
      this.sqlite
        .prepare(
          'INSERT INTO digital_work_case_review(id,case_id,revision_id,manifest_sha256,actor_id,reason,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          id,
          caseId,
          String(row.current_revision_id),
          manifestSha256,
          principal.userId,
          reason,
          now,
        );
      this.sqlite
        .prepare('UPDATE digital_work_case SET review_revision_id=?,updated_at=? WHERE id=?')
        .run(String(row.current_revision_id), now, caseId);
      this.caseEvent(principal, row, 'reviewed', { reviewId: id, reason, manifestSha256 });
      this.audit(principal, 'digital_work.case_review', 'digital_work_case_review', id, {
        projectId: row.project_id,
        caseId,
        reason,
        manifestSha256,
      });
      this.storeReceipt(principal, 'case_review', input.requestKey, payload, { caseId });
      return this.caseDetail(principal, caseId);
    });
  }
  prepareInvoiceDraft(principal: Principal, input: CaseActionInput): CaseView {
    this.finance(principal);
    const caseId = required(input.caseId, 'Case ID', 200),
      expectedVersion = integer(input.expectedVersion, 'Expected version');
    const payload = { caseId, expectedVersion };
    return runImmediateTransaction(this.sqlite, 'DigitalWork', () => {
      const prior = this.receipt<{ caseId: string }>(
        principal,
        'draft_prepare',
        input.requestKey,
        payload,
      );
      if (prior) return this.caseDetail(principal, prior.caseId);
      const row = this.caseRow(caseId);
      if (row.version !== expectedVersion)
        throw new DigitalWorkConflictError('Case version changed');
      if (row.draft_invoice_id !== null)
        throw new DigitalWorkConflictError(
          'Case handed over to its invoice; continue in the invoice workflow',
        );
      const live = this.view(principal, row);
      if (!live.reviewCurrent) throw new DigitalWorkConflictError('Current case review required');
      if (!live.manifest.readyForDraft)
        throw new DigitalWorkConflictError('Case has invoice blockers');
      const draft = this.portal.createSelectedInvoiceDraft(principal, {
        projectId: live.projectId,
        billingRuleId: live.billingRuleId,
        periodStart: live.periodStart,
        periodEnd: live.periodEnd,
        sources: live.manifest.selectedSources,
        requestKey: `digital-work:${caseId}:${input.requestKey}`,
      });
      const now = this.now();
      this.sqlite
        .prepare('UPDATE digital_work_case SET draft_invoice_id=?,updated_at=? WHERE id=?')
        .run(draft.id, now, caseId);
      this.caseEvent(principal, row, 'draft_prepared', {
        invoiceId: draft.id,
        manifestSha256: live.manifestSha256,
      });
      this.audit(principal, 'digital_work.draft_prepare', 'digital_work_case', caseId, {
        projectId: row.project_id,
        invoiceId: draft.id,
        manifestSha256: live.manifestSha256,
      });
      this.storeReceipt(principal, 'draft_prepare', input.requestKey, payload, { caseId });
      return this.caseDetail(principal, caseId);
    });
  }
  private canReadEvidence(principal: Principal, projectId: string, ref: EvidenceRef): boolean {
    if (
      FINANCE.has(principal.role) ||
      principal.role === 'auditor_read_only' ||
      ref.type === 'external'
    )
      return true;
    if (principal.role === 'worker' && ['period_report', 'customer_conformity'].includes(ref.type))
      return false;
    if (ref.type === 'document') {
      try {
        const row = this.sqlite
          .prepare('SELECT project_id,archived_at FROM document WHERE id=?')
          .get(ref.id);
        if (!row || row.project_id !== projectId || row.archived_at) return false;
        new V3Repository(this.sqlite).authorizeDocument(principal, ref.id);
        return true;
      } catch {
        return false;
      }
    }
    if (ref.type === 'period_report' || ref.type === 'customer_conformity') {
      const query =
        ref.type === 'period_report'
          ? "SELECT 1 FROM period_report WHERE id=? AND project_id=? AND audience='customer'"
          : "SELECT 1 FROM customer_conformity c JOIN period_report r ON r.id=c.period_report_id WHERE c.id=? AND r.project_id=? AND r.audience='customer'";
      return Boolean(this.sqlite.prepare(query).get(ref.id, projectId));
    }
    const table = ref.type === 'time' ? 'time_entry' : ref.type;
    const owned = principal.role === 'worker';
    const column = ref.type === 'technical_report' ? 'author_id' : 'worker_id';
    return Boolean(
      this.sqlite
        .prepare(
          `SELECT 1 FROM ${table} WHERE id=? AND project_id=? ${owned ? `AND ${column}=?` : ''}`,
        )
        .get(ref.id, projectId, ...(owned ? [principal.userId] : [])),
    );
  }
  private evidence(
    principal: Principal,
    projectId: string,
    input: readonly EvidenceRef[],
  ): EvidenceView[] {
    return input
      .filter((ref) => this.canReadEvidence(principal, projectId, ref))
      .map((ref) => {
        if (ref.type === 'external') return { ...ref, state: 'claimed' as const };
        if (
          principal.role === 'worker' &&
          ['period_report', 'customer_conformity'].includes(ref.type)
        )
          return { ...ref, state: 'claimed' as const };
        const table = ref.type === 'time' ? 'time_entry' : ref.type;
        const query =
          ref.type === 'customer_conformity'
            ? 'SELECT c.snapshot_version version,c.period_report_id,i.id invalidation_id FROM customer_conformity c JOIN period_report r ON r.id=c.period_report_id LEFT JOIN customer_conformity_invalidation i ON i.conformity_id=c.id WHERE c.id=? AND r.project_id=?'
            : `SELECT * FROM ${table} WHERE id=? AND project_id=?`;
        // Documents may be global, but only project-bound documents support a current project reference.
        const owned = principal.role === 'worker';
        const ownerColumn = ref.type === 'technical_report' ? 'author_id' : 'worker_id';
        if (
          owned &&
          !['time', 'expense', 'daily_report', 'technical_report', 'document'].includes(ref.type)
        )
          return { ...ref, state: 'claimed' as const };
        const workerQuery = owned
          ? `${query} AND ${ref.type === 'document' ? 'owner_id' : ownerColumn}=?`
          : query;
        const row = this.sqlite
          .prepare(workerQuery)
          .get(ref.id, projectId, ...(owned ? [principal.userId] : [])) as Row | undefined;
        if (!row) return { ...ref, state: owned ? ('claimed' as const) : ('missing' as const) };
        if (ref.type === 'document') {
          try {
            if (row.archived_at) throw new Error('Archived document');
            const proof = new V3Repository(this.sqlite).authorizeDocument(principal, ref.id);
            verifyEvidenceFile(proof.storageKey, proof.sha256, proof.byteLength);
          } catch {
            return { ...ref, state: 'missing' as const };
          }
        }
        if (ref.type === 'period_report' || ref.type === 'customer_conformity') {
          try {
            const report =
              ref.type === 'period_report'
                ? row
                : (this.sqlite
                    .prepare('SELECT * FROM period_report WHERE id=? AND project_id=?')
                    .get(String(row.period_report_id), projectId) as Row | undefined);
            if (
              !report ||
              !['approved', 'final'].includes(String(report.state)) ||
              (principal.role === 'project_manager' && report.audience !== 'customer')
            )
              throw new Error('Unavailable report');
            verifyPrivatePdfArtifact({
              storageKey: String(report.pdf_storage_key),
              sha256: String(report.pdf_sha256),
              byteLength: Number(report.pdf_byte_length),
              requiredPrefix: `reports/${String(report.id)}/`,
            });
            if (ref.type === 'customer_conformity') {
              const conformity = new V3Repository(this.sqlite).getCustomerConformityForPeriodReport(
                principal,
                String(report.id),
              );
              const binding = this.sqlite
                .prepare(
                  `SELECT 1 FROM customer_conformity c JOIN period_report r ON r.id=c.period_report_id
              WHERE c.id=? AND r.id=? AND c.snapshot_version=r.snapshot_version AND c.snapshot_sha256=r.snapshot_sha256
                AND c.snapshot_json=r.snapshot_json AND c.report_pdf_storage_key=r.pdf_storage_key
                AND c.report_pdf_sha256=r.pdf_sha256 AND c.report_pdf_byte_length=r.pdf_byte_length`,
                )
                .get(ref.id, String(report.id));
              if (
                !binding ||
                !conformity ||
                conformity.id !== ref.id ||
                conformity.status !== 'active' ||
                conformity.signatureEvidenceStatus !== 'verified'
              )
                throw new Error('Stale customer acceptance');
            }
          } catch {
            return { ...ref, state: 'stale' as const };
          }
        }
        if (ref.version === undefined) return { ...ref, state: 'claimed' as const };
        const version = ref.type === 'period_report' ? row.snapshot_version : row.version;
        if (Number(version) !== ref.version || row.invalidation_id)
          return { ...ref, state: 'stale' as const };
        const lifecycle =
          ref.type === 'document'
            ? row.state
            : ref.type === 'period_report'
              ? row.state
              : row.approval_state;
        if (ref.type === 'document' && lifecycle !== 'committed')
          return { ...ref, state: 'claimed' as const };
        if (ref.type === 'period_report' && !['approved', 'final'].includes(String(lifecycle)))
          return { ...ref, state: 'claimed' as const };
        if (
          ['time', 'expense', 'daily_report', 'technical_report'].includes(ref.type) &&
          lifecycle !== 'approved'
        )
          return { ...ref, state: 'claimed' as const };
        return { ...ref, state: 'current' as const };
      });
  }
  private bindEvidence(
    principal: Principal,
    projectId: string,
    input: readonly EvidenceRef[],
  ): EvidenceRef[] {
    return input.map((ref) => {
      if (ref.type === 'external' || ref.version !== undefined) return ref;
      if (
        principal.role === 'worker' &&
        ['period_report', 'customer_conformity'].includes(ref.type)
      )
        return ref;
      const table = ref.type === 'time' ? 'time_entry' : ref.type;
      const query =
        ref.type === 'customer_conformity'
          ? 'SELECT c.snapshot_version version FROM customer_conformity c JOIN period_report r ON r.id=c.period_report_id WHERE c.id=? AND r.project_id=?'
          : `SELECT ${ref.type === 'period_report' ? 'snapshot_version' : 'version'} version FROM ${table} WHERE id=? AND project_id=?`;
      const owned = principal.role === 'worker';
      const ownerColumn = ref.type === 'technical_report' ? 'author_id' : 'worker_id';
      const scoped = owned
        ? `${query} AND ${ref.type === 'document' ? 'owner_id' : ownerColumn}=?`
        : query;
      const row = this.sqlite
        .prepare(scoped)
        .get(ref.id, projectId, ...(owned ? [principal.userId] : [])) as Row | undefined;
      return row && Number.isSafeInteger(Number(row.version))
        ? { ...ref, version: Number(row.version) }
        : ref;
    });
  }
  private itemRow(id: string): Row {
    const row = this.sqlite.prepare('SELECT * FROM digital_work_item WHERE id=?').get(id) as
      | Row
      | undefined;
    if (!row) throw new DigitalWorkNotFoundError('Work item not found');
    return row;
  }
  private itemView(principal: Principal, row: Row): WorkItemView {
    const finance = FINANCE.has(principal.role) || principal.role === 'auditor_read_only';
    const raw = parse<EvidenceRef[]>(row.evidence_refs_json);
    // Workers see assigned factual evidence only. Policy work never reaches this projection.
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      caseId: !finance || row.case_id === null ? null : String(row.case_id),
      kind: row.kind as WorkItemKind,
      title: String(row.title),
      description: row.description === null ? null : String(row.description),
      ownerId: String(row.owner_id),
      dueOn: row.due_on === null ? null : String(row.due_on),
      status: row.status as WorkItemStatus,
      evidenceRefs: this.evidence(principal, String(row.project_id), raw),
      scopeClassification:
        principal.role === 'worker'
          ? null
          : (row.scope_classification as ScopeClassification | null),
      policyReference: finance ? (row.policy_reference as string | null) : null,
      proposedSettings:
        finance && row.proposed_settings_json !== null ? parse(row.proposed_settings_json) : null,
      version: Number(row.version),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
  private itemAccess(principal: Principal, row: Row, write = false): void {
    this.auth(principal);
    if (principal.role === 'auditor_read_only') {
      if (write) throw new DigitalWorkAccessDeniedError('Read-only role');
      return;
    }
    if (FINANCE.has(principal.role)) return;
    if (row.kind === 'policy_review')
      throw new DigitalWorkAccessDeniedError('Finance policy review required');
    if (principal.role === 'project_manager') {
      this.project(principal, String(row.project_id), write);
      return;
    }
    if (
      principal.role === 'worker' &&
      row.owner_id === principal.userId &&
      this.membership(principal.userId, String(row.project_id))
    )
      return;
    throw new DigitalWorkAccessDeniedError('Assigned work item required');
  }
  listWorkspace(
    principal: Principal,
    filter: Readonly<{ projectId?: string }> = {},
  ): Readonly<{ cases: readonly CaseView[]; workItems: readonly WorkItemView[] }> {
    this.auth(principal);
    const projectId =
      filter.projectId === undefined ? undefined : required(filter.projectId, 'Project ID', 200);
    if (principal.role === 'project_manager' && projectId) this.project(principal, projectId);
    const finance = FINANCE.has(principal.role) || principal.role === 'auditor_read_only';
    const cases = finance
      ? (
          this.sqlite
            .prepare(
              `SELECT * FROM digital_work_case ${projectId ? 'WHERE project_id=?' : ''} ORDER BY updated_at DESC,id DESC LIMIT 200`,
            )
            .all(...(projectId ? [projectId] : [])) as Row[]
        ).map((row) => {
          // Auditor can inspect recorded evidence, but canonical composition requires a finance principal.
          if (principal.role === 'auditor_read_only') return this.recordedCaseView(row);
          return this.view(principal, row);
        })
      : [];
    const rows = finance
      ? (this.sqlite
          .prepare(
            `SELECT * FROM digital_work_item ${projectId ? 'WHERE project_id=?' : ''} ORDER BY updated_at DESC,id DESC LIMIT 300`,
          )
          .all(...(projectId ? [projectId] : [])) as Row[])
      : principal.role === 'project_manager'
        ? (this.sqlite
            .prepare(
              `SELECT i.* FROM digital_work_item i WHERE i.kind<>'policy_review' ${projectId ? 'AND i.project_id=?' : ''} ORDER BY i.updated_at DESC,i.id DESC LIMIT 300`,
            )
            .all(...(projectId ? [projectId] : [])) as Row[])
        : principal.role === 'worker'
          ? (this.sqlite
              .prepare(
                `SELECT * FROM digital_work_item WHERE owner_id=? AND kind<>'policy_review' ${projectId ? 'AND project_id=?' : ''} ORDER BY updated_at DESC,id DESC LIMIT 300`,
              )
              .all(principal.userId, ...(projectId ? [projectId] : [])) as Row[])
          : [];
    const workItems = rows
      .filter((row) => {
        try {
          this.itemAccess(principal, row);
          return true;
        } catch {
          return false;
        }
      })
      .map((row) => this.itemView(principal, row));
    return { cases, workItems };
  }
  private recordedCaseView(row: Row): CaseView {
    const revision = this.sqlite
      .prepare('SELECT manifest_json,manifest_sha256 FROM digital_work_case_revision WHERE id=?')
      .get(String(row.current_revision_id)) as Row;
    const manifest = parse<CaseManifest>(revision.manifest_json);
    const reviewed = row.review_revision_id
      ? (this.sqlite
          .prepare(
            'SELECT id,manifest_sha256 FROM digital_work_case_review WHERE revision_id=? ORDER BY created_at DESC LIMIT 1',
          )
          .get(String(row.review_revision_id)) as Row | undefined)
      : undefined;
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      billingRuleId: String(row.billing_rule_id),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      scopeKind: row.scope_kind as CaseScopeKind,
      selectedSources: parse(row.selected_sources_json),
      version: Number(row.version),
      manifestSha256: String(revision.manifest_sha256),
      manifest,
      currentReviewId: reviewed ? String(reviewed.id) : null,
      reviewedManifestSha256: reviewed ? String(reviewed.manifest_sha256) : null,
      reviewCurrent: false,
      snapshotChanges: {
        addedSources: [],
        removedSources: [],
        changedSources: [],
        contextChanged: false,
      },
      draftInvoiceId: row.draft_invoice_id === null ? null : String(row.draft_invoice_id),
      phase: row.draft_invoice_id === null ? 'coordinating' : 'invoice_prepared',
      invoiceState:
        row.draft_invoice_id === null
          ? null
          : String(
              this.sqlite
                .prepare('SELECT state FROM invoice WHERE id=?')
                .get(String(row.draft_invoice_id))?.state ?? 'unavailable',
            ),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
  private validOwner(ownerId: string, projectId: string, financeOnly = false): void {
    const u = this.sqlite
      .prepare("SELECT role FROM user WHERE id=? AND status='active'")
      .get(ownerId) as Row | undefined;
    if (
      !u ||
      this.sqlite.prepare('SELECT 1 FROM supplier_user_profile WHERE user_id=?').get(ownerId)
    )
      throw new DigitalWorkValidationError('Eligible owner required');
    if (financeOnly && !FINANCE.has(String(u.role)))
      throw new DigitalWorkValidationError('Finance policy reviewer required');
    if (
      !FINANCE.has(String(u.role)) &&
      !(
        ['worker', 'project_manager'].includes(String(u.role)) &&
        this.membership(ownerId, projectId)
      )
    )
      throw new DigitalWorkValidationError('Current project owner required');
  }
  private validateKind(kind: unknown): WorkItemKind {
    if (!['scope_change', 'handover', 'evidence', 'policy_review'].includes(String(kind)))
      throw new DigitalWorkValidationError('Invalid work item kind');
    return kind as WorkItemKind;
  }
  private classification(value: unknown): ScopeClassification | null {
    if (value === undefined || value === null || value === '') return null;
    if (
      !['existing_scope', 'rework', 'goodwill', 'needs_clarification', 'potential_change'].includes(
        String(value),
      )
    )
      throw new DigitalWorkValidationError('Invalid scope classification');
    return value as ScopeClassification;
  }
  private settings(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const encoded = canonicalJson(value);
    if (encoded.length > 10000 || !value || typeof value !== 'object' || Array.isArray(value))
      throw new DigitalWorkValidationError('Typed proposed settings object required');
    const allowed = new Set([
      'billingRuleId',
      'effectiveFrom',
      'effectiveTo',
      'streamType',
      'cadenceType',
      'currency',
      'includeExpenses',
      'minimumMinutes',
      'fixedPriceMinor',
      'note',
    ]);
    const entries = Object.entries(value);
    if (entries.length === 0 || entries.some(([k]) => !allowed.has(k)))
      throw new DigitalWorkValidationError('Unsupported or empty proposed settings');
    for (const [key, entry] of entries) {
      if (['billingRuleId', 'note'].includes(key))
        required(entry, key, key === 'note' ? 2000 : 200);
      else if (['effectiveFrom', 'effectiveTo'].includes(key)) date(entry, key, true);
      else if (
        key === 'streamType' &&
        !['labor', 'expense', 'milestone', 'other'].includes(String(entry))
      )
        throw new DigitalWorkValidationError('Invalid stream type proposal');
      else if (
        key === 'cadenceType' &&
        ![
          'weekly',
          'every_14_days',
          'semi_monthly',
          'monthly',
          'custom',
          'milestone',
          'manual',
        ].includes(String(entry))
      )
        throw new DigitalWorkValidationError('Invalid cadence proposal');
      else if (key === 'currency' && (typeof entry !== 'string' || !/^[A-Z]{3}$/u.test(entry)))
        throw new DigitalWorkValidationError('Invalid currency proposal');
      else if (key === 'includeExpenses' && typeof entry !== 'boolean')
        throw new DigitalWorkValidationError('Invalid expense inclusion proposal');
      else if (
        key === 'minimumMinutes' &&
        (!Number.isSafeInteger(entry) || Number(entry) < 0 || Number(entry) > 1440)
      )
        throw new DigitalWorkValidationError('Invalid minimum minutes proposal');
      else if (
        key === 'fixedPriceMinor' &&
        (typeof entry !== 'string' || !/^\d{1,18}$/u.test(entry))
      )
        throw new DigitalWorkValidationError('Invalid exact minor unit proposal');
    }
    const v = value as Record<string, unknown>;
    if (
      v.effectiveFrom !== undefined &&
      v.effectiveTo !== undefined &&
      String(v.effectiveTo) < String(v.effectiveFrom)
    )
      throw new DigitalWorkValidationError('Proposal end precedes start');
    return encoded;
  }
  private itemEvent(
    principal: Principal,
    row: Row,
    eventType: 'created' | 'updated',
    reason: string,
  ): void {
    this.sqlite
      .prepare(
        'INSERT INTO digital_work_item_event(id,work_item_id,version,event_type,snapshot_json,reason,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        String(row.id),
        Number(row.version),
        eventType,
        canonicalJson(normalizedRow(row)),
        reason,
        principal.userId,
        this.now(),
      );
  }
  saveWorkItem(principal: Principal, input: SaveWorkItemInput): WorkItemView {
    const projectId = required(input.projectId, 'Project ID', 200),
      kind = this.validateKind(input.kind);
    if (principal.role === 'auditor_read_only')
      throw new DigitalWorkAccessDeniedError('Read-only role');
    if (kind === 'policy_review') this.finance(principal);
    else this.project(principal, projectId);
    const title = required(input.title, 'Title', 300),
      description = optional(input.description, 'Description'),
      ownerId = required(input.ownerId, 'Owner ID', 200),
      dueOn = date(input.dueOn, 'Due date');
    this.validOwner(ownerId, projectId, kind === 'policy_review');
    const submittedEvidence = evidenceRefs(input.evidenceRefs),
      classification = this.classification(input.scopeClassification);
    const policyReference = optional(input.policyReference, 'Policy reference', 1000),
      proposedSettings = this.settings(input.proposedSettings);
    if (kind !== 'scope_change' && classification !== null)
      throw new DigitalWorkValidationError('Classification belongs to scope change');
    if (kind !== 'policy_review' && (policyReference !== null || proposedSettings !== null))
      throw new DigitalWorkValidationError('Policy proposal belongs to finance review');
    if (kind === 'policy_review' && !policyReference)
      throw new DigitalWorkValidationError('Policy reference required');
    const caseId =
      input.caseId === undefined || input.caseId === null
        ? null
        : required(input.caseId, 'Case ID', 200);
    const payload = {
      projectId,
      caseId,
      kind,
      title,
      description,
      ownerId,
      dueOn,
      evidence: submittedEvidence,
      classification,
      policyReference,
      proposedSettings,
    };
    return runImmediateTransaction(this.sqlite, 'DigitalWork', () => {
      const prior = this.receipt<{ itemId: string }>(
        principal,
        'item_save',
        input.requestKey,
        payload,
      );
      if (prior) {
        const row = this.itemRow(prior.itemId);
        this.itemAccess(principal, row);
        return this.itemView(principal, row);
      }
      if (caseId && this.caseRow(caseId).project_id !== projectId)
        throw new DigitalWorkValidationError('Case belongs to different project');
      if (submittedEvidence.some((ref) => !this.canReadEvidence(principal, projectId, ref)))
        throw new DigitalWorkAccessDeniedError('Authorized evidence reference required');
      const evidence = this.bindEvidence(principal, projectId, submittedEvidence);
      const id = newId(),
        now = this.now();
      this.sqlite
        .prepare(
          'INSERT INTO digital_work_item(id,project_id,case_id,kind,title,description,owner_id,due_on,status,evidence_refs_json,scope_classification,policy_reference,proposed_settings_json,version,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)',
        )
        .run(
          id,
          projectId,
          caseId,
          kind,
          title,
          description,
          ownerId,
          dueOn,
          'open',
          canonicalJson(evidence),
          classification,
          policyReference,
          proposedSettings,
          principal.userId,
          now,
          now,
        );
      const row = this.itemRow(id);
      this.itemEvent(principal, row, 'created', 'Created');
      this.audit(principal, 'digital_work.item_save', 'digital_work_item', id, {
        projectId,
        kind,
        ownerId,
      });
      this.storeReceipt(principal, 'item_save', input.requestKey, payload, { itemId: id });
      return this.itemView(principal, row);
    });
  }
  updateWorkItem(principal: Principal, input: UpdateWorkItemInput): WorkItemView {
    const id = required(input.id, 'Work item ID', 200),
      expectedVersion = integer(input.expectedVersion, 'Expected version'),
      reason = required(input.reason, 'Reason', 2000);
    return runImmediateTransaction(this.sqlite, 'DigitalWork', () => {
      const old = this.itemRow(id);
      this.itemAccess(principal, old, true);
      const payload = { ...input, id, expectedVersion, reason };
      const prior = this.receipt<{ itemId: string }>(
        principal,
        'item_update',
        input.requestKey,
        payload,
      );
      if (prior) return this.itemView(principal, this.itemRow(prior.itemId));
      if (old.version !== expectedVersion)
        throw new DigitalWorkConflictError('Work item version changed');
      if (['accepted', 'waived', 'cancelled'].includes(String(old.status)))
        throw new DigitalWorkConflictError('Reviewed work item is immutable');
      const worker = principal.role === 'worker';
      if (
        worker &&
        (input.ownerId !== undefined ||
          input.dueOn !== undefined ||
          input.title !== undefined ||
          input.description !== undefined ||
          input.scopeClassification !== undefined ||
          input.policyReference !== undefined ||
          input.proposedSettings !== undefined)
      )
        throw new DigitalWorkAccessDeniedError(
          'Worker may update assigned progress and evidence only',
        );
      const status = input.status ?? (old.status as WorkItemStatus);
      const transitions: Record<WorkItemStatus, readonly WorkItemStatus[]> = {
        open: ['in_progress', 'ready_for_review', 'cancelled'],
        in_progress: ['ready_for_review', 'cancelled'],
        ready_for_review: ['in_progress', 'accepted', 'waived', 'cancelled'],
        accepted: [],
        waived: [],
        cancelled: [],
      };
      if (worker && !['open', 'in_progress', 'ready_for_review'].includes(status))
        throw new DigitalWorkAccessDeniedError('Manager review required');
      if (status !== old.status && !transitions[old.status as WorkItemStatus].includes(status))
        throw new DigitalWorkConflictError('Invalid work item transition');
      if ((status === 'accepted' || status === 'waived' || status === 'cancelled') && worker)
        throw new DigitalWorkAccessDeniedError('Manager review required');
      const ownerId =
        input.ownerId === undefined
          ? String(old.owner_id)
          : required(input.ownerId, 'Owner ID', 200);
      this.validOwner(ownerId, String(old.project_id), old.kind === 'policy_review');
      const dueOn =
        input.dueOn === undefined ? (old.due_on as string | null) : date(input.dueOn, 'Due date');
      const title =
        input.title === undefined ? String(old.title) : required(input.title, 'Title', 300);
      const description =
        input.description === undefined
          ? (old.description as string | null)
          : optional(input.description, 'Description');
      const oldEvidence = parse<EvidenceRef[]>(old.evidence_refs_json);
      const submittedEvidence =
        input.evidenceRefs === undefined ? undefined : evidenceRefs(input.evidenceRefs);
      if (
        submittedEvidence?.some(
          (ref) => !this.canReadEvidence(principal, String(old.project_id), ref),
        )
      )
        throw new DigitalWorkAccessDeniedError('Authorized evidence reference required');
      const hiddenEvidence = oldEvidence.filter(
        (ref) => !this.canReadEvidence(principal, String(old.project_id), ref),
      );
      const evidence =
        submittedEvidence === undefined
          ? oldEvidence
          : [
              ...hiddenEvidence,
              ...this.bindEvidence(principal, String(old.project_id), submittedEvidence),
            ];
      if (evidence.length > 50)
        throw new DigitalWorkValidationError('At most 50 evidence references');
      const classification =
        input.scopeClassification === undefined
          ? (old.scope_classification as ScopeClassification | null)
          : this.classification(input.scopeClassification);
      const policyReference =
        input.policyReference === undefined
          ? (old.policy_reference as string | null)
          : optional(input.policyReference, 'Policy reference', 1000);
      const proposedSettings =
        input.proposedSettings === undefined
          ? (old.proposed_settings_json as string | null)
          : this.settings(input.proposedSettings);
      if (old.kind !== 'scope_change' && classification !== null)
        throw new DigitalWorkValidationError('Classification belongs to scope change');
      if (old.kind !== 'policy_review' && (policyReference !== null || proposedSettings !== null))
        throw new DigitalWorkValidationError('Policy proposal belongs to finance review');
      if (old.kind === 'policy_review' && !policyReference)
        throw new DigitalWorkValidationError('Policy reference required');
      if (
        status === 'accepted' &&
        old.kind === 'handover' &&
        !this.evidence(principal, String(old.project_id), evidence).some(
          (e) =>
            e.state === 'current' &&
            ['document', 'period_report', 'customer_conformity'].includes(e.type),
        )
      )
        throw new DigitalWorkConflictError(
          'Current handover document or customer report evidence required',
        );
      if (status === 'accepted' && old.kind === 'scope_change' && !classification)
        throw new DigitalWorkConflictError('Scope classification required');
      const now = this.now();
      this.sqlite
        .prepare(
          'UPDATE digital_work_item SET title=?,description=?,owner_id=?,due_on=?,status=?,evidence_refs_json=?,scope_classification=?,policy_reference=?,proposed_settings_json=?,version=version+1,updated_at=? WHERE id=? AND version=?',
        )
        .run(
          title,
          description,
          ownerId,
          dueOn,
          status,
          canonicalJson(evidence),
          classification,
          policyReference,
          proposedSettings,
          now,
          id,
          expectedVersion,
        );
      const row = this.itemRow(id);
      this.itemEvent(principal, row, 'updated', reason);
      this.audit(principal, 'digital_work.item_update', 'digital_work_item', id, {
        projectId: row.project_id,
        reason,
        before: { status: old.status, ownerId: old.owner_id, dueOn: old.due_on },
        after: { status, ownerId, dueOn },
      });
      this.storeReceipt(principal, 'item_update', input.requestKey, payload, { itemId: id });
      return this.itemView(principal, row);
    });
  }
}
