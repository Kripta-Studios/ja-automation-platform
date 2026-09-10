import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { newId } from '@ja/domain';
import { AccessDeniedError, ConflictError, ValidationError } from '../../repository.ts';
import { assertLiveSession } from '../../core/authorization.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { V3Repository } from '../../v3-repository.ts';

export const ownerRecordTypes = [
  'expense',
  'time_entry',
  'daily_report',
  'technical_report',
] as const;
export type OwnerRecordType = (typeof ownerRecordTypes)[number];
type Row = Record<string, string | number | null> & {
  id: string;
  project_id: string;
  worker_id: string;
  work_date: string;
  approval_state: string;
  version: number;
};

/** Explicit Owner operations; never accept a caller-supplied SQL table or field. */
export class OwnerRecordManagement {
  private readonly sqlite: DatabaseSync;
  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
  }

  assertOwner(principal: Principal): void {
    const user = this.sqlite
      .prepare('SELECT role,status FROM user WHERE id=?')
      .get(principal.userId);
    if (
      principal.role !== 'owner_admin' ||
      user?.role !== 'owner_admin' ||
      user.status !== 'active'
    )
      throw new AccessDeniedError('Owner administration required');
    assertLiveSession(this.sqlite, principal, AccessDeniedError);
  }

  private type(value: string): OwnerRecordType {
    if (!ownerRecordTypes.includes(value as OwnerRecordType))
      throw new ValidationError('Invalid record type');
    return value as OwnerRecordType;
  }

  list(principal: Principal, recordType: string): Array<Row & { managementBlock: string | null }> {
    this.assertOwner(principal);
    const table = this.type(recordType);
    return (
      this.sqlite
        .prepare(
          `SELECT r.*,p.project_number,u.name worker_name FROM ${table} r
      JOIN project p ON p.id=r.project_id JOIN user u ON u.id=r.${table === 'technical_report' ? 'author_id' : 'worker_id'}
      ORDER BY r.created_at DESC`,
        )
        .all() as Row[]
    ).map((row) => ({ ...row, managementBlock: this.block(table, row) }));
  }

  private block(table: OwnerRecordType, row: Row): string | null {
    if (
      row.invoice_id ||
      row.billing_lock_id ||
      row.billing_status === 'locked' ||
      row.billing_state === 'locked' ||
      row.locked_at
    )
      return 'This record is linked to billing. Manage the invoice before changing its sources.';
    if (
      this.sqlite
        .prepare('SELECT 1 FROM invoice_source WHERE source_type=? AND source_id=? LIMIT 1')
        .get(table === 'time_entry' ? 'time' : table, row.id)
    )
      return 'This record is an invoice source. Manage the invoice first.';
    if (
      this.sqlite
        .prepare(
          'SELECT 1 FROM record_correction_link WHERE record_type=? AND (original_id=? OR correction_id=?) LIMIT 1',
        )
        .get(table, row.id, row.id)
    )
      return 'This record belongs to a correction history. Use the correction workflow.';
    if (
      this.sqlite.prepare('SELECT 1 FROM direct_cost_series WHERE source_id=? LIMIT 1').get(row.id)
    )
      return 'This record has financial history. Use a financial correction.';
    if (
      this.sqlite
        .prepare(
          "SELECT 1 FROM report_source rs JOIN period_report pr ON pr.id=rs.report_id WHERE rs.source_type=? AND rs.source_id=? AND pr.state='final' LIMIT 1",
        )
        .get(table, row.id)
    )
      return 'This record is included in a period report. Manage the report before changing its sources.';
    if (table === 'expense') {
      if (row.reimbursed_at || ['paid', 'reimbursed'].includes(String(row.reimbursement_state)))
        return 'This expense has a reimbursement. Reverse or adjust the payment first.';
      if (
        this.sqlite
          .prepare('SELECT 1 FROM expense_classification_series WHERE expense_id=? LIMIT 1')
          .get(row.id)
      )
        return 'This expense has a financial classification history. Use a financial correction.';
      if (
        this.sqlite
          .prepare('SELECT 1 FROM reimbursement_principal_series WHERE expense_id=? LIMIT 1')
          .get(row.id)
      )
        return 'This expense has a reimbursement. Reverse or adjust the payment first.';
    }
    if (
      table === 'time_entry' &&
      this.sqlite
        .prepare(
          `SELECT 1 FROM compensation_settlement WHERE worker_id=? AND project_id=?
      AND period_start<=? AND period_end>=? AND state IN ('settled','paid') LIMIT 1`,
        )
        .get(row.worker_id, row.project_id, row.work_date, row.work_date)
    )
      return 'This time is included in a settlement. Adjust the settlement first.';
    if (
      table === 'technical_report' &&
      this.sqlite
        .prepare('SELECT 1 FROM technical_change WHERE technical_report_id=? LIMIT 1')
        .get(row.id)
    )
      return 'This report has technical changes. Manage those changes first.';
    return null;
  }

  mutate(
    principal: Principal,
    input: { recordType: string; id: string; version: number; operation: string; reason: string },
  ) {
    return runImmediateTransaction(this.sqlite, 'owner-record-management', () => {
      this.assertOwner(principal);
      const table = this.type(input.recordType);
      if (
        !['reopen', 'delete'].includes(input.operation) ||
        !Number.isSafeInteger(input.version) ||
        input.version < 1
      )
        throw new ValidationError('Invalid management operation');
      const reason = input.reason.trim();
      if (reason.length < 3 || reason.length > 2000)
        throw new ValidationError('A reason between 3 and 2000 characters is required');
      const before = this.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(input.id) as
        | Row
        | undefined;
      if (!before) throw new ValidationError('Record not found');
      if (before.version !== input.version)
        throw new ConflictError('Record changed. Reload before continuing.');
      const blocked = this.block(table, before);
      if (blocked) throw new ConflictError(blocked);
      const reports = this.sqlite
        .prepare(
          `SELECT DISTINCT pr.project_id,pr.period_start,pr.period_end
        FROM report_source rs JOIN period_report pr ON pr.id=rs.report_id
        WHERE rs.source_type=? AND rs.source_id=? AND pr.state<>'final'`,
        )
        .all(table, input.id);
      const timestamp = new Date().toISOString();
      const timeLinks =
        table === 'time_entry'
          ? this.sqlite
              .prepare('SELECT * FROM report_time_link WHERE time_entry_id=?')
              .all(input.id)
          : [];
      if (input.operation === 'delete') {
        if (
          ['daily_report', 'technical_report'].includes(table) &&
          this.sqlite
            .prepare('SELECT 1 FROM report_document_link WHERE report_id=? LIMIT 1')
            .get(input.id)
        )
          throw new ConflictError(
            'Reports with committed attachments require a versioned correction.',
          );
        if (table === 'time_entry')
          this.sqlite.prepare('DELETE FROM report_time_link WHERE time_entry_id=?').run(input.id);
        else if (['daily_report', 'technical_report'].includes(table))
          this.sqlite.prepare('DELETE FROM report_time_link WHERE report_id=?').run(input.id);
        this.sqlite
          .prepare(`DELETE FROM ${table} WHERE id=? AND version=?`)
          .run(input.id, input.version);
      } else {
        if (before.approval_state === 'draft')
          throw new ConflictError('This record is already a draft');
        const resets =
          table === 'expense'
            ? ",submitted_at=NULL,approved_by=NULL,approved_at=NULL,finance_approved_by=NULL,finance_approved_at=NULL,billing_amount_minor=NULL,commercial_classification_state='unclassified',project_currency_amount_minor=NULL,tax_amount_minor=NULL,fx_rate_bps=NULL,markup_bps=NULL"
            : table === 'time_entry'
              ? ",submitted_at=NULL,approved_by=NULL,approved_at=NULL,finance_approved_by=NULL,finance_approved_at=NULL,billability_state='pending',billable_minutes=NULL,client_rate_minor=NULL,compensation_amount_minor=NULL,internal_cost_minor=NULL"
              : ',reviewed_by=NULL,reviewed_at=NULL';
        this.sqlite
          .prepare(
            `UPDATE ${table} SET approval_state='draft',updated_at=?,version=version+1${resets} WHERE id=? AND version=?`,
          )
          .run(timestamp, input.id, input.version);
      }
      const after =
        input.operation === 'delete'
          ? null
          : this.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(input.id);
      const v3 = new V3Repository(this.sqlite);
      for (const report of reports) {
        const period = {
          projectId: String(report.project_id),
          periodStart: String(report.period_start),
          periodEnd: String(report.period_end),
        };
        v3.refreshPeriodReports(principal, period);
        v3.enqueueJob(
          'period_close_report',
          `owner-record-refresh:${input.id}:${input.version}:${report.period_start}:${report.period_end}`,
          period,
        );
      }
      this.sqlite
        .prepare(
          'INSERT INTO approval_event(id,entity_type,entity_id,from_state,to_state,actor_id,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          table,
          input.id,
          before.approval_state,
          input.operation === 'delete' ? 'deleted' : 'draft',
          principal.userId,
          reason,
          timestamp,
        );
      recordAuditEvent(this.sqlite, principal, `owner.record.${input.operation}`, table, input.id, {
        projectId: before.project_id,
        before,
        after,
        reason,
        refreshedReports: reports,
        timeLinks,
      });
      return { id: input.id };
    });
  }
}
