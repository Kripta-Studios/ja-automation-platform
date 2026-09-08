import type { DatabaseSync } from 'node:sqlite';
import { newId } from '@ja/domain';

type NotificationRepositoryDependencies = Readonly<{
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  now: () => string;
}>;

type SourceKind = 'time' | 'expense' | 'daily' | 'technical';
type NotificationState = 'submitted' | 'needs_changes';

type MissingTimeAssignment = Readonly<{
  project_id: string;
  user_id: string;
  workday_mask: string | null;
  timezone: string;
  monday_minutes: number;
  tuesday_minutes: number;
  wednesday_minutes: number;
  thursday_minutes: number;
  friday_minutes: number;
  saturday_minutes: number;
  sunday_minutes: number;
  schedule_timezone: string;
}>;

type NotificationRecord = Readonly<{
  id: string;
  user_id: string;
  kind: string;
  subject_id: string;
  created_at: string;
}>;

type ApprovalSource = Readonly<{
  record_type: SourceKind;
  source_id: string;
  project_id: string;
  owner_id: string;
  business_date: string;
  approval_state: NotificationState;
  version: number;
}>;

type PeriodSource = Readonly<{
  period_id: string;
  project_id: string;
  state: 'ready' | 'blocked';
  version: number;
}>;

type SignatureSource = Readonly<{
  report_id: string;
  project_id: string;
  snapshot_version: number;
  snapshot_sha256: string | null;
  updated_at: string;
}>;

type BudgetSource = Readonly<{
  project_id: string;
  project_version: number;
  labor_budget_minutes: number | null;
  travel_budget_minor: string | number | null;
  other_cost_budget_minor: string | number | null;
  revenue_budget_minor: string | number | null;
  po_cap_minor: string | number | null;
  labor_count: number;
  labor_max_version: number | null;
  labor_last_updated: string | null;
  travel_count: number;
  travel_max_version: number | null;
  travel_last_updated: string | null;
  other_count: number;
  other_max_version: number | null;
  other_last_updated: string | null;
  invoice_count: number;
  invoice_max_version: number | null;
  invoice_last_updated: string | null;
  labor_minutes: number;
  travel_minor: string | number | null;
  other_minor: string | number | null;
  invoiced_minor: string | number | null;
}>;

type SettlementSource = Readonly<{
  settlement_id: string;
  worker_id: string;
  state: string;
  updated_at: string;
}>;

type ReimbursementSource = Readonly<{
  expense_id: string;
  worker_id: string;
  version: number;
  reimbursement_state: string;
}>;

type NotificationView = Readonly<{
  sourceId: string | null;
  target: string | null;
  title: string;
}>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;

function assertDate(value: string): void {
  if (!DATE_PATTERN.test(value)) throw new Error('Reminder work date must be an ISO date');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error('Reminder work date must be an ISO date');
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function dateDayIndex(value: string): number {
  // Assignment masks use the conventional Monday-first seven-day layout.
  return (new Date(`${value}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

function localDateAt(instant: string, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instant));
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const result = `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
    return DATE_PATTERN.test(result) ? result : null;
  } catch {
    return null;
  }
}

type LocalDateTime = Readonly<{
  date: string;
  minutes: number;
}>;

function localDateTimeAt(instant: string, timezone: string): LocalDateTime | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const date = `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
    const hour = Number(values.get('hour'));
    const minute = Number(values.get('minute'));
    const second = Number(values.get('second'));
    if (
      !DATE_PATTERN.test(date) ||
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      !Number.isInteger(second) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59
    )
      return null;
    return { date, minutes: hour * 60 + minute + (second > 0 ? 1 : 0) / 60 };
  } catch {
    return null;
  }
}

function validDateTime(value: string): boolean {
  return DATE_TIME_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function isFullDayUnavailable(
  sqlite: DatabaseSync,
  workerId: string,
  workDate: string,
  timezone: string,
): boolean {
  const followingDate = nextDate(workDate);
  const rows = sqlite
    .prepare(
      "SELECT starts_at,ends_at FROM worker_availability WHERE worker_id=? AND availability='unavailable'",
    )
    .all(workerId) as Array<{ starts_at: string; ends_at: string }>;
  return rows.some((row) => {
    if (!validDateTime(row.starts_at) || !validDateTime(row.ends_at)) return false;
    const localStart = localDateTimeAt(row.starts_at, timezone);
    const localEnd = localDateTimeAt(row.ends_at, timezone);
    if (!localStart || !localEnd) return false;

    // Availability is stored as an instant, while a workday is a configured
    // calendar date.  Suppress a reminder only when the unavailable window
    // covers the complete local date.  The UTC-boundary check preserves the
    // date-only ranges emitted by the existing availability form when its
    // server-side timezone differs from the project timezone.
    const localFullDay =
      (localStart.date < workDate || (localStart.date === workDate && localStart.minutes <= 0)) &&
      (localEnd.date > workDate ||
        (localEnd.date === workDate && localEnd.minutes >= 23 * 60 + 59));
    if (localFullDay) return true;

    const startUtc = new Date(row.starts_at).toISOString();
    const endUtc = new Date(row.ends_at).toISOString();
    const startUtcDate = startUtc.slice(0, 10);
    const endUtcDate = endUtc.slice(0, 10);
    const startUtcTime = startUtc.slice(11, 19);
    const endUtcTime = endUtc.slice(11, 19);
    return (
      startUtcDate === workDate &&
      startUtcTime === '00:00:00' &&
      ((endUtcDate === workDate && endUtcTime >= '23:59:00') ||
        (endUtcDate === followingDate && endUtcTime === '00:00:00'))
    );
  });
}

function sqliteInteger(value: string | number | null | undefined): bigint {
  return BigInt(String(value ?? 0));
}

function activeFinancialRecipients(sqlite: DatabaseSync): string[] {
  return (
    sqlite
      .prepare(
        "SELECT id FROM user WHERE status='active' AND role IN ('owner_admin','finance_admin') ORDER BY id",
      )
      .all() as Array<{ id: string }>
  ).map((row) => row.id);
}

function activeOperationalReviewers(
  sqlite: DatabaseSync,
  projectId: string,
  businessDate: string,
): string[] {
  const recipients = new Set(activeFinancialRecipients(sqlite));
  const projectManagers = sqlite
    .prepare(
      `SELECT DISTINCT u.id
         FROM user u
         JOIN project_member pm ON pm.user_id=u.id
        WHERE u.status='active' AND u.role='project_manager'
          AND pm.project_id=? AND pm.status='active' AND pm.can_review=1
          AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)
        ORDER BY u.id`,
    )
    .all(projectId, businessDate, businessDate) as Array<{ id: string }>;
  for (const row of projectManagers) recipients.add(row.id);
  return [...recipients].sort();
}

function activeUser(sqlite: DatabaseSync, userId: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM user WHERE id=? AND status='active'").get(userId));
}

function activeWorker(sqlite: DatabaseSync, workerId: string): boolean {
  return Boolean(
    sqlite
      .prepare("SELECT 1 FROM user WHERE id=? AND status='active' AND role='worker'")
      .get(workerId),
  );
}

function notificationSourceId(kind: string, subjectId: string): string | null {
  if (kind === 'missing_time') {
    const match = /^missing-time:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})$/u.exec(subjectId);
    return match?.[1] ?? null;
  }
  const sourcePattern =
    /^(?:approval_(?:requested|returned)_|missing_receipt|worker_payment_status:)?(time|expense|daily|technical):([^:]+):v\d+$/u;
  const source = sourcePattern.exec(subjectId);
  if (source) return source[2] ?? null;
  const approvalSource = /^(?:time|expense|daily|technical):([^:]+):v\d+$/u.exec(subjectId);
  if (approvalSource) return approvalSource[1] ?? null;
  const invoice = /^invoice:([^:]+):overdue:v\d+$/u.exec(subjectId);
  if (invoice) return invoice[1] ?? null;
  const period = /^billing-period:([^:]+):(?:ready|blocked):v\d+$/u.exec(subjectId);
  if (period) return period[1] ?? null;
  const report = /^period-report:([^:]+):snapshot:/u.exec(subjectId);
  if (report) return report[1] ?? null;
  const project = /^project:([^:]+):(?:budget|cap):/u.exec(subjectId);
  if (project) return project[1] ?? null;
  const settlement = /^settlement:([^:]+):/u.exec(subjectId);
  if (settlement) return settlement[1] ?? null;
  const reimbursement = /^expense:([^:]+):reimbursement:/u.exec(subjectId);
  if (reimbursement) return reimbursement[1] ?? null;
  if (
    kind === 'assignment_published' ||
    kind.startsWith('report_') ||
    kind.startsWith('technical_change_')
  )
    return subjectId;
  return null;
}

function encodedSource(kind: SourceKind, sourceId: string, version: number): string {
  return `${kind}:${sourceId}:v${version}`;
}

function safeId(value: string | null): string | null {
  return value !== null && SAFE_ID_PATTERN.test(value) ? value : null;
}

export class NotificationRepository {
  private readonly deps: NotificationRepositoryDependencies;

  constructor(deps: NotificationRepositoryDependencies) {
    this.deps = deps;
  }

  /**
   * Insert the in-app notice and its email request in one transaction.  The
   * notification table's reviewed unique key is the first deduplication guard;
   * the outbox key is a second guard for delivery retries.
   */
  private enqueue(userId: string, kind: string, subjectId: string, occurredAt: string): boolean {
    const notificationId = newId();
    const created = this.deps.sqlite
      .prepare(
        'INSERT OR IGNORE INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
      )
      .run(notificationId, userId, kind, subjectId, occurredAt);
    const existing = this.deps.sqlite
      .prepare('SELECT id FROM notification WHERE user_id=? AND kind=? AND subject_id=?')
      .get(userId, kind, subjectId) as { id: string } | undefined;
    if (!existing) throw new Error('NOTIFICATION_INSERT_FAILED');
    const payload = JSON.stringify({
      notificationId: existing.id,
      userId,
      kind,
      subjectId,
    });
    const outbox = this.deps.sqlite
      .prepare(
        'INSERT OR IGNORE INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        'notification.email.requested',
        existing.id,
        `notification-email:${existing.id}`,
        payload,
        occurredAt,
        occurredAt,
      );
    if (Number(outbox.changes) !== 1) {
      const existingOutbox = this.deps.sqlite
        .prepare(
          "SELECT 1 FROM outbox_event WHERE topic='notification.email.requested' AND aggregate_id=? AND idempotency_key=?",
        )
        .get(existing.id, `notification-email:${existing.id}`);
      if (!existingOutbox) throw new Error('NOTIFICATION_OUTBOX_INSERT_FAILED');
    }
    return Number(created.changes) === 1 || Number(outbox.changes) === 1;
  }

  private missingTimeForDate(workDate: string, now: string, projectId?: string): number {
    const projectClause = projectId ? ' AND p.id=?' : '';
    const values = projectId
      ? [workDate, workDate, projectId, workDate, workDate, workDate, workDate, workDate]
      : [workDate, workDate, workDate, workDate, workDate, workDate, workDate];
    const assignments = this.deps.sqlite
      .prepare(
        `SELECT pm.project_id,pm.user_id,pm.workday_mask,p.timezone,
                s.timezone schedule_timezone,
                s.monday_minutes,s.tuesday_minutes,s.wednesday_minutes,
                s.thursday_minutes,s.friday_minutes,s.saturday_minutes,s.sunday_minutes
           FROM project_member pm
           JOIN project p ON p.id=pm.project_id
           JOIN user u ON u.id=pm.user_id
           JOIN schedule s ON s.id=(
             SELECT current_schedule.id FROM schedule current_schedule
              WHERE current_schedule.project_id=p.id
                AND current_schedule.effective_from<=?
                AND (current_schedule.effective_to IS NULL OR current_schedule.effective_to>=?)
              ORDER BY current_schedule.effective_from DESC,current_schedule.id DESC LIMIT 1
           )
          WHERE p.status='active'${projectClause}
            AND u.role='worker' AND u.status='active'
            AND pm.status='active' AND pm.starts_on<=?
            AND (pm.ends_on IS NULL OR pm.ends_on>=?)
            AND (p.start_date IS NULL OR p.start_date<=?)
            AND (p.planned_end_date IS NULL OR p.planned_end_date>=?)
            AND (p.actual_end_date IS NULL OR p.actual_end_date>=?)
          ORDER BY pm.project_id,pm.user_id,pm.starts_on DESC,pm.id DESC`,
      )
      .all(...values) as MissingTimeAssignment[];

    const seenAssignments = new Set<string>();
    let created = 0;
    const day = dateDayIndex(workDate);
    for (const assignment of assignments) {
      const assignmentKey = `${assignment.project_id}:${assignment.user_id}`;
      if (seenAssignments.has(assignmentKey)) continue;
      seenAssignments.add(assignmentKey);

      const scheduleMinutes = [
        assignment.monday_minutes,
        assignment.tuesday_minutes,
        assignment.wednesday_minutes,
        assignment.thursday_minutes,
        assignment.friday_minutes,
        assignment.saturday_minutes,
        assignment.sunday_minutes,
      ][day];
      if (!Number.isInteger(scheduleMinutes) || (scheduleMinutes ?? 0) <= 0) continue;
      if (assignment.workday_mask !== null) {
        if (!/^[01]{7}$/u.test(assignment.workday_mask)) continue;
        if (assignment.workday_mask[day] !== '1') continue;
      }
      if (isFullDayUnavailable(this.deps.sqlite, assignment.user_id, workDate, assignment.timezone))
        continue;
      const submitted = this.deps.sqlite
        .prepare(
          `SELECT 1 FROM time_entry
            WHERE project_id=? AND worker_id=? AND work_date=?
              AND approval_state IN ('submitted','approved','locked') LIMIT 1`,
        )
        .get(assignment.project_id, assignment.user_id, workDate);
      if (submitted) continue;

      const subjectId = `missing-time:${assignment.project_id}:${assignment.user_id}:${workDate}`;
      if (this.enqueue(assignment.user_id, 'missing_time', subjectId, now)) created += 1;
    }
    return created;
  }

  /**
   * Scan a supplied work date, or derive one local prior date per active
   * project when called by the scheduler.  A supplied date is a stored
   * date-only work value and is never converted through the server timezone.
   */
  createMissingTimeReminders(workDate?: string, now = this.deps.now()): number {
    if (workDate !== undefined) assertDate(workDate);
    return this.deps.transaction(() => {
      if (workDate !== undefined) return this.missingTimeForDate(workDate, now);
      const instant = new Date(Date.parse(now) - 24 * 60 * 60 * 1000).toISOString();
      const projects = this.deps.sqlite
        .prepare("SELECT id,timezone FROM project WHERE status='active' ORDER BY id")
        .all() as Array<{ id: string; timezone: string }>;
      let created = 0;
      for (const project of projects) {
        const localDate = localDateAt(instant, project.timezone);
        if (!localDate) continue;
        created += this.missingTimeForDate(localDate, now, project.id);
      }
      return created;
    });
  }

  private approvalNotifications(now: string): number {
    const rows = this.deps.sqlite
      .prepare(
        `SELECT record_type,source_id,project_id,owner_id,business_date,approval_state,version
           FROM (
             SELECT 'time' record_type,t.id source_id,t.project_id,t.worker_id owner_id,
                    t.work_date business_date,t.approval_state,t.version
               FROM time_entry t JOIN project p ON p.id=t.project_id
              WHERE p.status IN ('active','paused','closing')
                AND t.approval_state IN ('submitted','needs_changes')
             UNION ALL
             SELECT 'expense',e.id,e.project_id,e.worker_id,e.spent_on,e.approval_state,e.version
               FROM expense e JOIN project p ON p.id=e.project_id
              WHERE p.status IN ('active','paused','closing')
                AND e.approval_state IN ('submitted','needs_changes')
             UNION ALL
             SELECT 'daily',d.id,d.project_id,d.worker_id,d.work_date,d.approval_state,d.version
               FROM daily_report d JOIN project p ON p.id=d.project_id
              WHERE p.status IN ('active','paused','closing')
                AND d.approval_state IN ('submitted','needs_changes')
             UNION ALL
             SELECT 'technical',t.id,t.project_id,t.author_id,
                    COALESCE(t.report_date,substr(t.created_at,1,10)),t.approval_state,t.version
               FROM technical_report t JOIN project p ON p.id=t.project_id
              WHERE p.status IN ('active','paused','closing')
                AND t.approval_state IN ('submitted','needs_changes')
           ) pending
          ORDER BY business_date,record_type,source_id`,
      )
      .all() as ApprovalSource[];
    let created = 0;
    for (const row of rows) {
      const requested = row.approval_state === 'submitted';
      const kind = requested
        ? `approval_requested_${row.record_type}`
        : `approval_returned_${row.record_type}`;
      const subjectId = encodedSource(row.record_type, row.source_id, row.version);
      const recipients = requested
        ? activeOperationalReviewers(this.deps.sqlite, row.project_id, row.business_date)
        : activeUser(this.deps.sqlite, row.owner_id)
          ? [row.owner_id]
          : [];
      for (const recipient of recipients)
        if (this.enqueue(recipient, kind, subjectId, now)) created += 1;
    }
    return created;
  }

  private periodNotifications(now: string): number {
    const rows = this.deps.sqlite
      .prepare(
        `SELECT bp.id period_id,br.project_id,bp.state,bp.version
           FROM billing_period bp
           JOIN billing_rule br ON br.id=bp.billing_rule_id
           JOIN project p ON p.id=br.project_id
          WHERE bp.state IN ('ready','blocked')
          ORDER BY bp.period_start,bp.id`,
      )
      .all() as PeriodSource[];
    const recipients = activeFinancialRecipients(this.deps.sqlite);
    let created = 0;
    for (const row of rows) {
      const subjectId = `billing-period:${row.period_id}:${row.state}:v${row.version}`;
      for (const recipient of recipients)
        if (this.enqueue(recipient, `period_${row.state}`, subjectId, now)) created += 1;
    }
    return created;
  }

  private signatureNotifications(now: string): number {
    const rows = this.deps.sqlite
      .prepare(
        `SELECT r.id report_id,r.project_id,r.snapshot_version,r.snapshot_sha256,r.updated_at
           FROM period_report r JOIN project p ON p.id=r.project_id
          WHERE r.audience='customer' AND r.state IN ('approved','final')
            AND NOT EXISTS(
              SELECT 1 FROM customer_conformity c
               WHERE c.period_report_id=r.id
                 AND c.snapshot_version=r.snapshot_version
                 AND c.snapshot_sha256=r.snapshot_sha256
                 AND NOT EXISTS(
                   SELECT 1 FROM customer_conformity_invalidation i
                    WHERE i.conformity_id=c.id
                 )
            )
          ORDER BY r.period_start,r.id`,
      )
      .all() as SignatureSource[];
    let created = 0;
    for (const row of rows) {
      const snapshot = row.snapshot_sha256 ?? row.updated_at;
      const subjectId = `period-report:${row.report_id}:snapshot:${row.snapshot_version}:${snapshot}`;
      const businessDate = row.updated_at.slice(0, 10);
      for (const recipient of activeOperationalReviewers(
        this.deps.sqlite,
        row.project_id,
        businessDate,
      ))
        if (this.enqueue(recipient, 'signature_outstanding', subjectId, now)) created += 1;
    }
    return created;
  }

  private invoiceNotifications(now: string): number {
    const rows = this.deps.sqlite
      .prepare(
        `SELECT i.id invoice_id,i.version
           FROM invoice i JOIN project p ON p.id=i.project_id
          WHERE i.state='overdue'
          ORDER BY i.id`,
      )
      .all() as Array<{ invoice_id: string; version: number }>;
    const recipients = activeFinancialRecipients(this.deps.sqlite);
    let created = 0;
    for (const row of rows) {
      const subjectId = `invoice:${row.invoice_id}:overdue:v${row.version}`;
      for (const recipient of recipients)
        if (this.enqueue(recipient, 'invoice_overdue', subjectId, now)) created += 1;
    }
    return created;
  }

  private receiptNotifications(now: string): number {
    const rows = this.deps.sqlite
      .prepare(
        `SELECT e.id expense_id,e.worker_id,e.version
           FROM expense e
          WHERE e.receipt_required=1 AND e.receipt_document_id IS NULL
            AND e.approval_state IN ('submitted','needs_changes','approved','locked')
          ORDER BY e.spent_on,e.id`,
      )
      .all() as Array<{ expense_id: string; worker_id: string; version: number }>;
    let created = 0;
    for (const row of rows) {
      if (!activeWorker(this.deps.sqlite, row.worker_id)) continue;
      const subjectId = encodedSource('expense', row.expense_id, row.version);
      if (this.enqueue(row.worker_id, 'missing_receipt', subjectId, now)) created += 1;
    }
    return created;
  }

  private budgetNotifications(now: string): number {
    const rows = this.deps.sqlite
      .prepare(
        `SELECT p.id project_id,p.version project_version,p.labor_budget_minutes,
                p.travel_budget_minor,p.other_cost_budget_minor,p.revenue_budget_minor,p.po_cap_minor,
                (SELECT count(*) FROM time_entry t WHERE t.project_id=p.id AND t.approval_state IN ('approved','locked')) labor_count,
                (SELECT max(t.version) FROM time_entry t WHERE t.project_id=p.id AND t.approval_state IN ('approved','locked')) labor_max_version,
                (SELECT max(t.updated_at) FROM time_entry t WHERE t.project_id=p.id AND t.approval_state IN ('approved','locked')) labor_last_updated,
                (SELECT count(*) FROM expense e WHERE e.project_id=p.id AND e.approval_state IN ('approved','locked') AND e.category='travel') travel_count,
                (SELECT max(e.version) FROM expense e WHERE e.project_id=p.id AND e.approval_state IN ('approved','locked') AND e.category='travel') travel_max_version,
                (SELECT max(e.updated_at) FROM expense e WHERE e.project_id=p.id AND e.approval_state IN ('approved','locked') AND e.category='travel') travel_last_updated,
                (SELECT count(*) FROM expense e WHERE e.project_id=p.id AND e.approval_state IN ('approved','locked') AND e.category<>'travel') other_count,
                (SELECT max(e.version) FROM expense e WHERE e.project_id=p.id AND e.approval_state IN ('approved','locked') AND e.category<>'travel') other_max_version,
                (SELECT max(e.updated_at) FROM expense e WHERE e.project_id=p.id AND e.approval_state IN ('approved','locked') AND e.category<>'travel') other_last_updated,
                (SELECT count(*) FROM invoice i WHERE i.project_id=p.id AND i.state IN ('approved','issued','sent','partially_paid','paid','overdue')) invoice_count,
                (SELECT max(i.version) FROM invoice i WHERE i.project_id=p.id AND i.state IN ('approved','issued','sent','partially_paid','paid','overdue')) invoice_max_version,
                (SELECT max(i.updated_at) FROM invoice i WHERE i.project_id=p.id AND i.state IN ('approved','issued','sent','partially_paid','paid','overdue')) invoice_last_updated,
                (SELECT COALESCE(sum(t.minutes),0) FROM time_entry t WHERE t.project_id=p.id AND t.approval_state IN ('approved','locked')) labor_minutes,
                (SELECT CAST(COALESCE(sum(CASE WHEN e.project_currency_amount_minor IS NOT NULL THEN e.project_currency_amount_minor WHEN e.currency=p.currency THEN e.amount_minor ELSE 0 END),0) AS TEXT) FROM expense e WHERE e.project_id=p.id AND e.approval_state IN ('approved','locked') AND e.category='travel') travel_minor,
                (SELECT CAST(COALESCE(sum(CASE WHEN e.project_currency_amount_minor IS NOT NULL THEN e.project_currency_amount_minor WHEN e.currency=p.currency THEN e.amount_minor ELSE 0 END),0) AS TEXT) FROM expense e WHERE e.project_id=p.id AND e.approval_state IN ('approved','locked') AND e.category<>'travel') other_minor,
                (SELECT CAST(COALESCE(sum(i.total_minor),0) AS TEXT) FROM invoice i WHERE i.project_id=p.id AND i.state IN ('approved','issued','sent','partially_paid','paid','overdue')) invoiced_minor
           FROM project p
          ORDER BY p.id`,
      )
      .all() as BudgetSource[];
    const recipients = activeFinancialRecipients(this.deps.sqlite);
    let created = 0;
    for (const row of rows) {
      const revision = [
        row.project_version,
        row.labor_count,
        row.labor_max_version ?? 0,
        row.labor_last_updated ?? '',
        row.travel_count,
        row.travel_max_version ?? 0,
        row.travel_last_updated ?? '',
        row.other_count,
        row.other_max_version ?? 0,
        row.other_last_updated ?? '',
        row.invoice_count,
        row.invoice_max_version ?? 0,
        row.invoice_last_updated ?? '',
      ].join(':');
      const exceptions: Array<'labor' | 'travel' | 'other' | 'revenue'> = [];
      if (
        row.labor_budget_minutes !== null &&
        row.labor_budget_minutes > 0 &&
        row.labor_minutes >= row.labor_budget_minutes
      )
        exceptions.push('labor');
      if (
        row.travel_budget_minor !== null &&
        sqliteInteger(row.travel_minor) >= sqliteInteger(row.travel_budget_minor)
      )
        exceptions.push('travel');
      if (
        row.other_cost_budget_minor !== null &&
        sqliteInteger(row.other_minor) >= sqliteInteger(row.other_cost_budget_minor)
      )
        exceptions.push('other');
      if (
        row.revenue_budget_minor !== null &&
        sqliteInteger(row.invoiced_minor) >= sqliteInteger(row.revenue_budget_minor)
      )
        exceptions.push('revenue');
      for (const metric of exceptions) {
        const subjectId = `project:${row.project_id}:budget:${metric}:${revision}`;
        for (const recipient of recipients)
          if (this.enqueue(recipient, 'budget_exception', subjectId, now)) created += 1;
      }
      if (
        row.po_cap_minor !== null &&
        sqliteInteger(row.invoiced_minor) >= sqliteInteger(row.po_cap_minor)
      ) {
        const subjectId = `project:${row.project_id}:cap:${revision}`;
        for (const recipient of recipients)
          if (this.enqueue(recipient, 'cap_exception', subjectId, now)) created += 1;
      }
    }
    return created;
  }

  private settlementNotifications(now: string): number {
    const settlements = this.deps.sqlite
      .prepare(
        `SELECT cs.id settlement_id,cs.worker_id,cs.state,cs.updated_at
           FROM compensation_settlement cs
          WHERE cs.state IN ('approved','settled','paid','cancelled')
          ORDER BY cs.updated_at,cs.id`,
      )
      .all() as SettlementSource[];
    const reimbursements = this.deps.sqlite
      .prepare(
        `SELECT e.id expense_id,e.worker_id,e.version,e.reimbursement_state
           FROM expense e
          WHERE e.reimbursement_state IN ('scheduled','reimbursed','paid')
          ORDER BY e.updated_at,e.id`,
      )
      .all() as ReimbursementSource[];
    let created = 0;
    for (const row of settlements) {
      if (!activeWorker(this.deps.sqlite, row.worker_id)) continue;
      const subjectId = `settlement:${row.settlement_id}:${row.state}:${row.updated_at}`;
      if (this.enqueue(row.worker_id, 'settlement_status_changed', subjectId, now)) created += 1;
    }
    for (const row of reimbursements) {
      if (!activeWorker(this.deps.sqlite, row.worker_id)) continue;
      const subjectId = `expense:${row.expense_id}:reimbursement:${row.reimbursement_state}:v${row.version}`;
      if (this.enqueue(row.worker_id, 'worker_payment_status', subjectId, now)) created += 1;
    }
    return created;
  }

  /** Scan source state and materialize all supported business notices. */
  dispatchBusinessNotifications(now = this.deps.now()): number {
    return this.deps.transaction(
      () =>
        this.approvalNotifications(now) +
        this.periodNotifications(now) +
        this.signatureNotifications(now) +
        this.invoiceNotifications(now) +
        this.receiptNotifications(now) +
        this.budgetNotifications(now) +
        this.settlementNotifications(now),
    );
  }

  notificationView(kind: string, subjectId: string): NotificationView {
    const sourceId = safeId(notificationSourceId(kind, subjectId));
    const targetId = safeId(sourceId);
    if (kind === 'missing_time') {
      const match = /^missing-time:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})$/u.exec(subjectId);
      return {
        sourceId,
        target: match && sourceId ? `/app/projects/${sourceId}` : null,
        title: 'Submit time for this project/date',
      };
    }
    if (kind.startsWith('approval_requested_time') || kind.startsWith('approval_returned_time'))
      return {
        sourceId,
        target: targetId ? `/app/time/${targetId}` : null,
        title: 'Time approval',
      };
    if (
      kind.startsWith('approval_requested_expense') ||
      kind.startsWith('approval_returned_expense') ||
      kind === 'missing_receipt' ||
      kind === 'worker_payment_status'
    )
      return {
        sourceId,
        target: targetId ? `/app/expenses/${targetId}` : null,
        title: 'Expense review',
      };
    if (
      kind.startsWith('approval_requested_daily') ||
      kind.startsWith('approval_returned_daily') ||
      kind.startsWith('approval_requested_technical') ||
      kind.startsWith('approval_returned_technical')
    )
      return {
        sourceId,
        target: targetId ? `/app/reports/${targetId}` : null,
        title: 'Report review',
      };
    if (kind === 'signature_outstanding')
      return {
        sourceId,
        target: targetId ? `/app/reports/period/${targetId}` : null,
        title: 'Customer signature outstanding',
      };
    if (kind === 'invoice_overdue')
      return {
        sourceId,
        target: targetId ? `/app/billing/invoices/${targetId}` : null,
        title: 'Invoice overdue',
      };
    if (kind === 'period_ready' || kind === 'period_blocked')
      return {
        sourceId,
        target: '/app/billing',
        title: kind === 'period_ready' ? 'Billing period ready' : 'Billing period blocked',
      };
    if (kind === 'budget_exception' || kind === 'cap_exception')
      return {
        sourceId,
        target: targetId ? `/app/projects/${targetId}` : null,
        title: kind === 'cap_exception' ? 'Project cap exception' : 'Project budget exception',
      };
    if (kind === 'settlement_status_changed')
      return { sourceId, target: '/app/pay', title: 'Worker settlement status changed' };
    if (kind === 'assignment_published')
      return {
        sourceId,
        target: sourceId ? `/app/projects/${sourceId}` : null,
        title: 'Project assignment updated',
      };
    if (kind.startsWith('report_'))
      return {
        sourceId,
        target: sourceId ? `/app/reports/${sourceId}` : null,
        title: 'Report update',
      };
    if (kind.startsWith('technical_change_'))
      return { sourceId, target: '/app/projects', title: 'Technical change update' };
    return { sourceId, target: null, title: 'J&A Automation notification' };
  }

  listNotificationRows(userId: string): NotificationRecord[] {
    return this.deps.sqlite
      .prepare(
        'SELECT id,user_id,kind,subject_id,created_at FROM notification WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      )
      .all(userId) as NotificationRecord[];
  }
}

export type { NotificationRecord, NotificationView };
