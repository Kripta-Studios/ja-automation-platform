import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal, type Role } from '@ja/domain';
import { recordAuditEvent } from '../../core/audit.ts';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { canonicalJson, sha256 } from '../../core/canonical-json.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';

export class PeriodFollowupAccessDeniedError extends Error {
  name = 'PeriodFollowupAccessDeniedError';
}
export class PeriodFollowupConflictError extends Error {
  name = 'PeriodFollowupConflictError';
}
export class PeriodFollowupValidationError extends Error {
  name = 'PeriodFollowupValidationError';
}
export class PeriodFollowupNotFoundError extends Error {
  name = 'PeriodFollowupNotFoundError';
}

export const periodFollowupEventTypes = [
  'shared',
  'exported',
  'awaiting_signatory',
  'returned',
  'disputed',
] as const;
export type PeriodFollowupEventType = (typeof periodFollowupEventTypes)[number];

export type RecordPeriodFollowupInput = Readonly<{
  periodReportId: string;
  expectedSnapshotVersion: number;
  expectedSnapshotSha256: string;
  expectedLatestEventId: string | null;
  idempotencyKey: string;
  eventType: PeriodFollowupEventType;
  method?: string | null;
  eventDate?: string | null;
  reference?: string | null;
  signatoryName?: string | null;
  reason?: string | null;
  responsibleUserId: string;
  nextFollowUpOn?: string | null;
}>;

export type PeriodFollowupEventView = Readonly<{
  id: string;
  periodReportId: string;
  projectId: string;
  snapshotVersion: number;
  snapshotSha256: string;
  eventType: PeriodFollowupEventType;
  method: string | null;
  eventDate: string | null;
  reference: string | null;
  signatoryName: string | null;
  reason: string | null;
  responsibleUserId: string;
  nextFollowUpOn: string | null;
  actorId: string;
  idempotencyKey: string;
  payloadSha256: string;
  previousEventId: string | null;
  sequenceNo: number;
  createdAt: string;
  stale: boolean;
}>;

export type PeriodReportFollowupView = Readonly<{
  reportId: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  audience: 'customer';
  reportType: string;
  state: string;
  snapshotVersion: number;
  snapshotSha256: string;
  pdfReady: boolean;
  latestEventId: string | null;
  latestEvent: PeriodFollowupEventView | null;
  events: readonly PeriodFollowupEventView[];
}>;

export type PeriodReportReviewRow = Readonly<{
  reportId: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  reportType: string;
  state: string;
  snapshotVersion: number;
  snapshotSha256: string;
  pdfReady: boolean;
  sources: readonly Readonly<{ type: string; id: string; href: string }>[];
  followup: PeriodReportFollowupView;
}>;

export type PeriodReportReview = Readonly<{
  projectId: string;
  periodStart: string;
  periodEnd: string;
  reports: readonly PeriodReportReviewRow[];
}>;

type ReportRow = Readonly<{
  id: string;
  project_id: string;
  period_start: string;
  period_end: string;
  audience: string;
  report_type: string;
  state: string;
  snapshot_version: number;
  snapshot_sha256: string | null;
  pdf_storage_key: string | null;
  pdf_sha256: string | null;
  pdf_byte_length: number | null;
}>;

type EventRow = Readonly<{
  id: string;
  period_report_id: string;
  project_id: string;
  snapshot_version: number;
  snapshot_sha256: string;
  event_type: PeriodFollowupEventType;
  method: string | null;
  event_date: string | null;
  reference: string | null;
  signatory_name: string | null;
  reason: string | null;
  responsible_user_id: string;
  next_follow_up_on: string | null;
  actor_id: string;
  idempotency_key: string;
  payload_sha256: string;
  previous_event_id: string | null;
  sequence_no: number;
  created_at: string;
}>;

const SHA256 = /^[a-f0-9]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const REVIEW_ROLES = new Set<Role>(['owner_admin', 'finance_admin', 'project_manager']);
const USER_ROLES = new Set<Role>(['owner_admin', 'finance_admin', 'project_manager', 'worker']);

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new PeriodFollowupValidationError(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') throw new PeriodFollowupValidationError(`${field} is invalid`);
  const clean = value.trim();
  if (required && !clean) throw new PeriodFollowupValidationError(`${field} is required`);
  if (clean.length > max) throw new PeriodFollowupValidationError(`${field} is too long`);
  return clean || null;
}

function date(value: unknown, field: string, required = false): string | null {
  const clean = text(value, field, 10, required);
  if (clean === null) return null;
  if (!DATE.test(clean)) throw new PeriodFollowupValidationError(`${field} must be a real date`);
  const parsed = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== clean)
    throw new PeriodFollowupValidationError(`${field} must be a real date`);
  return clean;
}

function asEvent(row: EventRow, current: ReportRow): PeriodFollowupEventView {
  return {
    id: row.id,
    periodReportId: row.period_report_id,
    projectId: row.project_id,
    snapshotVersion: row.snapshot_version,
    snapshotSha256: row.snapshot_sha256,
    eventType: row.event_type,
    method: row.method,
    eventDate: row.event_date,
    reference: row.reference,
    signatoryName: row.signatory_name,
    reason: row.reason,
    responsibleUserId: row.responsible_user_id,
    nextFollowUpOn: row.next_follow_up_on,
    actorId: row.actor_id,
    idempotencyKey: row.idempotency_key,
    payloadSha256: row.payload_sha256,
    previousEventId: row.previous_event_id,
    sequenceNo: row.sequence_no,
    createdAt: row.created_at,
    stale:
      row.snapshot_version !== current.snapshot_version ||
      row.snapshot_sha256 !== current.snapshot_sha256,
  };
}

function sourceHref(sourceType: string, sourceId: string): string {
  if (sourceType === 'period_report') return `/app/reports/period/${encodeURIComponent(sourceId)}`;
  return `/app/reports/${encodeURIComponent(sourceId)}`;
}

export class PeriodFollowupRepository {
  private readonly sqlite: DatabaseSync;
  private readonly options: Readonly<{
    now?: () => string;
    id?: () => string;
    audit?: (
      principal: Principal,
      action: string,
      entityType: string,
      entityId: string,
      details: unknown,
    ) => void;
  }>;

  constructor(
    sqlite: DatabaseSync,
    options: Readonly<{
      now?: () => string;
      id?: () => string;
      audit?: (
        principal: Principal,
        action: string,
        entityType: string,
        entityId: string,
        details: unknown,
      ) => void;
    }> = {},
  ) {
    this.sqlite = sqlite;
    this.options = options;
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }

  private id(): string {
    return this.options.id?.() ?? newId();
  }

  private audit(principal: Principal, event: PeriodFollowupEventView): void {
    if (this.options.audit) {
      this.options.audit(
        principal,
        'period_followup.record',
        'period_report_followup_event',
        event.id,
        {
          projectId: event.projectId,
          periodReportId: event.periodReportId,
          snapshotVersion: event.snapshotVersion,
          snapshotSha256: event.snapshotSha256,
          eventType: event.eventType,
          sequenceNo: event.sequenceNo,
        },
      );
      return;
    }
    recordAuditEvent(
      this.sqlite,
      principal,
      'period_followup.record',
      'period_report_followup_event',
      event.id,
      {
        projectId: event.projectId,
        periodReportId: event.periodReportId,
        snapshotVersion: event.snapshotVersion,
        snapshotSha256: event.snapshotSha256,
        eventType: event.eventType,
        sequenceNo: event.sequenceNo,
      },
    );
  }

  private currentRole(principal: Principal): Role {
    const row = this.sqlite
      .prepare('SELECT status,role FROM user WHERE id=?')
      .get(principal.userId) as { status: string; role: string } | undefined;
    if (!row || row.status !== 'active')
      throw new PeriodFollowupAccessDeniedError('Active account required');
    if (!REVIEW_ROLES.has(row.role as Role) && row.role !== 'worker')
      throw new PeriodFollowupAccessDeniedError('Supported staff role required');
    if (row.role !== principal.role)
      throw new PeriodFollowupAccessDeniedError('Authenticated role changed; sign in again');
    return row.role as Role;
  }

  private assertAuthenticated(principal: Principal): Role {
    assertActiveAccount(this.sqlite, principal, PeriodFollowupAccessDeniedError);
    assertLiveSession(this.sqlite, principal, PeriodFollowupAccessDeniedError);
    return this.currentRole(principal);
  }

  private assertProjectReviewer(principal: Principal, projectId: string): void {
    const role = this.assertAuthenticated(principal);
    if (!REVIEW_ROLES.has(role))
      throw new PeriodFollowupAccessDeniedError('Project review role required');
    if (role === 'owner_admin' || role === 'finance_admin') return;
    if (!principal.projectIds.has(projectId))
      throw new PeriodFollowupAccessDeniedError('Project access required');
    const today = this.now().slice(0, 10);
    const member = this.sqlite
      .prepare(
        `SELECT 1 FROM project_member
          WHERE project_id=? AND user_id=? AND status='active' AND can_review=1
            AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)
          LIMIT 1`,
      )
      .get(projectId, principal.userId, today, today);
    if (!member) throw new PeriodFollowupAccessDeniedError('Project review required');
  }

  private report(reportId: string): ReportRow {
    const row = this.sqlite
      .prepare(
        `SELECT id,project_id,period_start,period_end,audience,report_type,state,
                snapshot_version,snapshot_sha256,pdf_storage_key,pdf_sha256,pdf_byte_length
           FROM period_report WHERE id=?`,
      )
      .get(reportId) as ReportRow | undefined;
    if (!row) throw new PeriodFollowupNotFoundError('Period report not found');
    if (row.audience !== 'customer')
      throw new PeriodFollowupValidationError('Customer period report required');
    if (
      !Number.isSafeInteger(row.snapshot_version) ||
      row.snapshot_version < 1 ||
      !row.snapshot_sha256
    )
      throw new PeriodFollowupConflictError('Customer report snapshot binding is unavailable');
    if (!SHA256.test(row.snapshot_sha256))
      throw new PeriodFollowupConflictError('Customer report snapshot binding is invalid');
    return row;
  }

  private pdfReady(report: ReportRow): boolean {
    return (
      (report.state === 'review' || report.state === 'approved' || report.state === 'final') &&
      Boolean(
        report.pdf_storage_key &&
        report.pdf_sha256 &&
        report.pdf_byte_length &&
        report.pdf_byte_length > 0 &&
        SHA256.test(report.pdf_sha256),
      )
    );
  }

  private events(report: ReportRow): PeriodFollowupEventView[] {
    const rows = this.sqlite
      .prepare(
        `SELECT id,period_report_id,project_id,snapshot_version,snapshot_sha256,event_type,
                method,event_date,reference,signatory_name,reason,responsible_user_id,
                next_follow_up_on,actor_id,idempotency_key,payload_sha256,previous_event_id,
                sequence_no,created_at
           FROM period_report_followup_event
          WHERE period_report_id=? ORDER BY sequence_no DESC`,
      )
      .all(report.id) as EventRow[];
    return rows.map((row) => asEvent(row, report));
  }

  private view(report: ReportRow): PeriodReportFollowupView {
    const events = this.events(report);
    return {
      reportId: report.id,
      projectId: report.project_id,
      periodStart: report.period_start,
      periodEnd: report.period_end,
      audience: 'customer',
      reportType: report.report_type,
      state: report.state,
      snapshotVersion: report.snapshot_version,
      snapshotSha256: report.snapshot_sha256 as string,
      pdfReady: this.pdfReady(report),
      latestEventId: events[0]?.id ?? null,
      latestEvent: events[0] ?? null,
      events,
    };
  }

  getReportFollowup(principal: Principal, periodReportId: string): PeriodReportFollowupView {
    const report = this.report(periodReportId);
    this.assertProjectReviewer(principal, report.project_id);
    return this.view(report);
  }

  /** Guard route entry points even when no project/report has been selected yet. */
  assertReviewAccess(principal: Principal): void {
    const role = this.assertAuthenticated(principal);
    if (!REVIEW_ROLES.has(role))
      throw new PeriodFollowupAccessDeniedError('Project review role required');
  }

  private validateInput(input: RecordPeriodFollowupInput): {
    eventType: PeriodFollowupEventType;
    method: string | null;
    eventDate: string | null;
    reference: string | null;
    signatoryName: string | null;
    reason: string | null;
    responsibleUserId: string;
    nextFollowUpOn: string | null;
    idempotencyKey: string;
  } {
    if (!input.periodReportId?.trim())
      throw new PeriodFollowupValidationError('Period report id is required');
    if (!Number.isSafeInteger(input.expectedSnapshotVersion) || input.expectedSnapshotVersion < 1)
      throw new PeriodFollowupValidationError('Expected snapshot version is invalid');
    if (!SHA256.test(input.expectedSnapshotSha256))
      throw new PeriodFollowupValidationError('Expected snapshot hash is invalid');
    if (input.expectedLatestEventId === undefined)
      throw new PeriodFollowupValidationError('Expected latest event id is required');
    if (!periodFollowupEventTypes.includes(input.eventType))
      throw new PeriodFollowupValidationError('Follow-up event type is invalid');
    const idempotencyKey = text(input.idempotencyKey, 'Idempotency key', 200, true) as string;
    const method = text(
      input.method,
      'Dispatch method',
      200,
      input.eventType === 'shared' || input.eventType === 'exported',
    );
    const eventDate = date(
      input.eventDate,
      'Event date',
      input.eventType === 'shared' || input.eventType === 'exported',
    );
    const reference = text(
      input.reference,
      'Dispatch reference',
      500,
      input.eventType === 'shared' || input.eventType === 'exported',
    );
    const signatoryName = text(
      input.signatoryName,
      'Signatory name',
      200,
      input.eventType === 'awaiting_signatory',
    );
    const reason = text(
      input.reason,
      'Reason',
      2000,
      input.eventType === 'returned' || input.eventType === 'disputed',
    );
    const responsibleUserId = text(
      input.responsibleUserId,
      'Responsible staff member',
      200,
      true,
    ) as string;
    const nextFollowUpOn = date(input.nextFollowUpOn, 'Next follow-up date');
    return {
      eventType: input.eventType,
      method,
      eventDate,
      reference,
      signatoryName,
      reason,
      responsibleUserId,
      nextFollowUpOn,
      idempotencyKey,
    };
  }

  private assertResponsible(projectId: string, responsibleUserId: string): void {
    const user = this.sqlite
      .prepare('SELECT status,role FROM user WHERE id=?')
      .get(responsibleUserId) as { status: string; role: string } | undefined;
    if (!user || user.status !== 'active' || !USER_ROLES.has(user.role as Role))
      throw new PeriodFollowupValidationError('Active staff member required');
    if (user.role === 'owner_admin' || user.role === 'finance_admin') return;
    const today = this.now().slice(0, 10);
    const member = this.sqlite
      .prepare(
        `SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active'
          AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) LIMIT 1`,
      )
      .get(projectId, responsibleUserId, today, today);
    if (!member)
      throw new PeriodFollowupValidationError(
        'Responsible staff member is not assigned to the project',
      );
  }

  recordEvent(principal: Principal, input: RecordPeriodFollowupInput): PeriodFollowupEventView {
    const values = this.validateInput(input);
    const report = this.report(input.periodReportId);
    this.assertProjectReviewer(principal, report.project_id);
    this.assertResponsible(report.project_id, values.responsibleUserId);
    const payload = {
      periodReportId: input.periodReportId,
      expectedSnapshotVersion: input.expectedSnapshotVersion,
      expectedSnapshotSha256: input.expectedSnapshotSha256,
      eventType: values.eventType,
      method: values.method,
      eventDate: values.eventDate,
      reference: values.reference,
      signatoryName: values.signatoryName,
      reason: values.reason,
      responsibleUserId: values.responsibleUserId,
      nextFollowUpOn: values.nextFollowUpOn,
    };
    const payloadSha256 = sha256(canonicalJson(payload));

    return runImmediateTransaction(this.sqlite, 'period-followup', () => {
      const current = this.report(input.periodReportId);
      this.assertProjectReviewer(principal, current.project_id);
      const existing = this.sqlite
        .prepare(
          `SELECT id,period_report_id,project_id,snapshot_version,snapshot_sha256,event_type,
                  method,event_date,reference,signatory_name,reason,responsible_user_id,
                  next_follow_up_on,actor_id,idempotency_key,payload_sha256,previous_event_id,
                  sequence_no,created_at
             FROM period_report_followup_event
            WHERE period_report_id=? AND idempotency_key=?`,
        )
        .get(current.id, values.idempotencyKey) as EventRow | undefined;
      if (existing) {
        if (existing.payload_sha256 !== payloadSha256)
          throw new PeriodFollowupConflictError(
            'Idempotency key was already used for different follow-up data',
          );
        return asEvent(existing, current);
      }
      if (
        current.snapshot_version !== input.expectedSnapshotVersion ||
        current.snapshot_sha256 !== input.expectedSnapshotSha256
      )
        throw new PeriodFollowupConflictError(
          'Customer report snapshot changed; refresh before recording follow-up',
        );
      const latest = this.sqlite
        .prepare(
          `SELECT id,sequence_no FROM period_report_followup_event
            WHERE period_report_id=? ORDER BY sequence_no DESC LIMIT 1`,
        )
        .get(current.id) as { id: string; sequence_no: number } | undefined;
      if ((input.expectedLatestEventId ?? null) !== (latest?.id ?? null))
        throw new PeriodFollowupConflictError(
          'Follow-up history changed; refresh before recording follow-up',
        );
      if (
        (values.eventType === 'shared' ||
          values.eventType === 'exported' ||
          values.eventType === 'awaiting_signatory') &&
        !this.pdfReady(current)
      )
        throw new PeriodFollowupConflictError(
          'A ready customer PDF is required before dispatch or signatory follow-up',
        );
      const id = this.id();
      const createdAt = this.now();
      const sequenceNo = (latest?.sequence_no ?? 0) + 1;
      this.sqlite
        .prepare(
          `INSERT INTO period_report_followup_event(
             id,period_report_id,project_id,snapshot_version,snapshot_sha256,event_type,
             method,event_date,reference,signatory_name,reason,responsible_user_id,
             next_follow_up_on,actor_id,idempotency_key,payload_sha256,previous_event_id,
             sequence_no,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          current.id,
          current.project_id,
          input.expectedSnapshotVersion,
          input.expectedSnapshotSha256,
          values.eventType,
          values.method,
          values.eventDate,
          values.reference,
          values.signatoryName,
          values.reason,
          values.responsibleUserId,
          values.nextFollowUpOn,
          principal.userId,
          values.idempotencyKey,
          payloadSha256,
          latest?.id ?? null,
          sequenceNo,
          createdAt,
        );
      const row = this.sqlite
        .prepare(
          `SELECT id,period_report_id,project_id,snapshot_version,snapshot_sha256,event_type,
                  method,event_date,reference,signatory_name,reason,responsible_user_id,
                  next_follow_up_on,actor_id,idempotency_key,payload_sha256,previous_event_id,
                  sequence_no,created_at
             FROM period_report_followup_event WHERE id=?`,
        )
        .get(id) as EventRow;
      const event = asEvent(row, current);
      this.audit(principal, event);
      return event;
    });
  }

  reviewProjectPeriod(
    principal: Principal,
    projectId: string,
    periodStart: string,
    periodEnd: string,
  ): PeriodReportReview {
    if (!DATE.test(periodStart) || !DATE.test(periodEnd))
      throw new PeriodFollowupValidationError('Review period dates must be real dates');
    const parsedStart = new Date(`${periodStart}T00:00:00Z`);
    const parsedEnd = new Date(`${periodEnd}T00:00:00Z`);
    if (
      Number.isNaN(parsedStart.valueOf()) ||
      Number.isNaN(parsedEnd.valueOf()) ||
      periodEnd < periodStart
    )
      throw new PeriodFollowupValidationError('Review period end must follow start');
    this.assertProjectReviewer(principal, projectId);
    const rows = this.sqlite
      .prepare(
        `SELECT id,project_id,period_start,period_end,audience,report_type,state,
                snapshot_version,snapshot_sha256,pdf_storage_key,pdf_sha256,pdf_byte_length
           FROM period_report
          WHERE project_id=? AND audience='customer'
            AND period_start<=? AND period_end>=?
          ORDER BY period_start,period_end,id`,
      )
      .all(projectId, periodEnd, periodStart) as ReportRow[];
    const reports = rows.map((report) => {
      const sources = this.sqlite
        .prepare(
          `SELECT rs.source_type,rs.source_id
             FROM report_source rs JOIN period_report p ON p.id=rs.report_id
            WHERE rs.report_id=? AND p.project_id=?
              AND (
                (rs.source_type='time_entry' AND EXISTS (
                  SELECT 1 FROM time_entry source WHERE source.id=rs.source_id AND source.project_id=p.project_id
                )) OR
                (rs.source_type='expense' AND EXISTS (
                  SELECT 1 FROM expense source WHERE source.id=rs.source_id AND source.project_id=p.project_id
                )) OR
                (rs.source_type='daily_report' AND EXISTS (
                  SELECT 1 FROM daily_report source WHERE source.id=rs.source_id AND source.project_id=p.project_id
                )) OR
                (rs.source_type='technical_report' AND EXISTS (
                  SELECT 1 FROM technical_report source WHERE source.id=rs.source_id AND source.project_id=p.project_id
                )) OR
                (rs.source_type='technical_change' AND EXISTS (
                  SELECT 1 FROM technical_change source WHERE source.id=rs.source_id AND source.project_id=p.project_id
                )) OR
                (rs.source_type='document' AND EXISTS (
                  SELECT 1 FROM document source WHERE source.id=rs.source_id AND source.project_id=p.project_id
                ))
              )
            ORDER BY rs.source_type,rs.source_id`,
        )
        .all(report.id, projectId) as Array<{ source_type: string; source_id: string }>;
      return {
        reportId: report.id,
        projectId: report.project_id,
        periodStart: report.period_start,
        periodEnd: report.period_end,
        reportType: report.report_type,
        state: report.state,
        snapshotVersion: report.snapshot_version,
        snapshotSha256: report.snapshot_sha256 as string,
        pdfReady: this.pdfReady(report),
        sources: sources.map((source) => ({
          type: source.source_type,
          id: source.source_id,
          href: sourceHref(source.source_type, source.source_id),
        })),
        followup: this.view(report),
      } satisfies PeriodReportReviewRow;
    });
    return { projectId, periodStart, periodEnd, reports };
  }
}

export function periodFollowupRepository(
  sqlite: DatabaseSync,
  options?: ConstructorParameters<typeof PeriodFollowupRepository>[1],
): PeriodFollowupRepository {
  return new PeriodFollowupRepository(sqlite, options);
}
