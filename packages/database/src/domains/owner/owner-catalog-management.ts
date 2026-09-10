import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { newId, type Principal } from '@ja/domain';
import { ConflictError, ValidationError } from '../../repository.ts';
import { OwnerRecordManagement } from './owner-record-management.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { V3Repository } from '../../v3-repository.ts';
import { recordAuditEvent } from '../../core/audit.ts';

type Field = {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'datetime-local' | 'project' | 'worker' | 'report' | 'select';
  required?: boolean;
  options?: string[];
};
export const ownerCatalogs: Record<string, { title: string; fields: Field[] }> = {
  document: {
    title: 'Documents',
    fields: [{ name: 'description', label: 'Description', type: 'text' }],
  },
  technical_change: {
    title: 'Technical changes',
    fields: [
      { name: 'project_id', label: 'Project', type: 'project', required: true },
      { name: 'technical_report_id', label: 'Technical report', type: 'report' },
      { name: 'component', label: 'Component', type: 'text', required: true },
      { name: 'original_behavior', label: 'Original behavior', type: 'text' },
      { name: 'root_cause', label: 'Root cause', type: 'text' },
      { name: 'change_made', label: 'Change made', type: 'text', required: true },
      {
        name: 'safety_impact',
        label: 'Safety impact',
        type: 'select',
        options: ['0', '1'],
        required: true,
      },
      { name: 'production_impact', label: 'Production impact', type: 'text' },
      { name: 'validation', label: 'Validation', type: 'text' },
      { name: 'validation_result', label: 'Validation result', type: 'text' },
      { name: 'open_risk', label: 'Open risk', type: 'text' },
      { name: 'rollback_information', label: 'Rollback information', type: 'text' },
    ],
  },
  planning_assignment: {
    title: 'Planning',
    fields: [
      { name: 'project_id', label: 'Project', type: 'project', required: true },
      { name: 'worker_id', label: 'Worker', type: 'worker', required: true },
      { name: 'starts_at', label: 'Start', type: 'datetime-local', required: true },
      { name: 'ends_at', label: 'End', type: 'datetime-local', required: true },
      { name: 'planned_minutes', label: 'Planned minutes', type: 'number', required: true },
      { name: 'site', label: 'Site', type: 'text' },
      { name: 'required_skill', label: 'Required skill', type: 'text' },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['planned', 'confirmed', 'cancelled'],
        required: true,
      },
    ],
  },
  worker_availability: {
    title: 'Availability',
    fields: [
      { name: 'worker_id', label: 'Worker', type: 'worker', required: true },
      { name: 'starts_at', label: 'Start', type: 'datetime-local', required: true },
      { name: 'ends_at', label: 'End', type: 'datetime-local', required: true },
      {
        name: 'availability',
        label: 'Availability',
        type: 'select',
        options: ['available', 'unavailable', 'tentative'],
        required: true,
      },
      { name: 'note', label: 'Notes', type: 'text' },
    ],
  },
  project_milestone: {
    title: 'Milestones',
    fields: [
      { name: 'project_id', label: 'Project', type: 'project', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'amount', label: 'Amount', type: 'text', required: true },
      { name: 'due_on', label: 'Due date', type: 'date' },
    ],
  },
};
type Row = Record<string, string | number | null>;
const token = (row: Row) => createHash('sha256').update(JSON.stringify(row)).digest('hex');

export class OwnerCatalogManagement {
  private readonly sqlite: DatabaseSync;
  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
  }
  private definition(kind: string) {
    if (!Object.hasOwn(ownerCatalogs, kind)) throw new ValidationError('Invalid management area');
    return ownerCatalogs[kind]!;
  }
  list(principal: Principal, kind: string): Array<Row & { token: string }> {
    new OwnerRecordManagement(this.sqlite).assertOwner(principal);
    this.definition(kind);
    return (
      this.sqlite.prepare(`SELECT * FROM ${kind} ORDER BY created_at DESC`).all() as Row[]
    ).map((row) => ({ ...row, token: token(row) }));
  }
  mutate(
    principal: Principal,
    input: {
      kind: string;
      id?: string;
      token?: string;
      operation: string;
      reason: string;
      values: Record<string, unknown>;
    },
  ) {
    return runImmediateTransaction(this.sqlite, 'owner-catalog-management', () => {
      new OwnerRecordManagement(this.sqlite).assertOwner(principal);
      const definition = this.definition(input.kind);
      if (
        !['create', 'update', 'delete', 'restore'].includes(input.operation) ||
        (input.operation === 'restore' && input.kind !== 'document') ||
        (input.operation === 'create' && input.kind === 'document')
      )
        throw new ValidationError('Invalid operation');
      const reason = input.reason.trim();
      if (reason.length < 3 || reason.length > 2000)
        throw new ValidationError('A reason between 3 and 2000 characters is required');
      const before =
        input.operation === 'create'
          ? null
          : (this.sqlite.prepare(`SELECT * FROM ${input.kind} WHERE id=?`).get(input.id ?? '') as
              | Row
              | undefined);
      if (input.operation !== 'create' && (!before || token(before) !== input.token))
        throw new ConflictError('Record changed. Reload before continuing.');
      if (before?.invoice_id)
        throw new ConflictError('Manage the linked invoice before changing this milestone');
      if (
        input.kind === 'project_milestone' &&
        before &&
        this.sqlite
          .prepare("SELECT 1 FROM invoice_source WHERE source_type='milestone' AND source_id=?")
          .get(String(before.id))
      )
        throw new ConflictError('Manage the linked invoice before changing this milestone');
      const reports =
        input.kind === 'technical_change' && before
          ? this.sqlite
              .prepare(
                "SELECT pr.* FROM report_source rs JOIN period_report pr ON pr.id=rs.report_id WHERE rs.source_type='technical_change' AND rs.source_id=?",
              )
              .all(String(before.id))
          : [];
      if (reports.some((report) => report.state === 'final'))
        throw new ConflictError('Finalized reports require a versioned correction');
      const id = input.operation === 'create' ? newId() : String(before!.id);
      if (input.kind === 'document' && ['delete', 'restore'].includes(input.operation)) {
        this.sqlite
          .prepare(
            'UPDATE document SET archived_at=?,archived_by=?,updated_at=?,version=version+1 WHERE id=?',
          )
          .run(
            input.operation === 'delete' ? new Date().toISOString() : null,
            input.operation === 'delete' ? principal.userId : null,
            new Date().toISOString(),
            id,
          );
      } else if (input.operation === 'delete')
        this.sqlite.prepare(`DELETE FROM ${input.kind} WHERE id=?`).run(id);
      else {
        const values: Row = {};
        for (const field of definition.fields) {
          const raw = String(input.values[field.name] ?? '').trim();
          if ((field.required && !raw) || raw.length > 5000)
            throw new ValidationError(`Invalid ${field.label}`);
          if (field.options && !field.options.includes(raw))
            throw new ValidationError(`Invalid ${field.label}`);
          if (field.type === 'number') {
            if (
              !/^\d+$/.test(raw) ||
              !Number.isSafeInteger(Number(raw)) ||
              Number(raw) < 1 ||
              Number(raw) > 10080
            )
              throw new ValidationError(`Invalid ${field.label}`);
            values[field.name] = Number(raw);
          } else if (field.type === 'datetime-local') {
            if (
              !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?Z?)?$/.test(raw) ||
              !Number.isFinite(Date.parse(raw)) ||
              new Date(raw).toISOString().slice(0, 10) !== raw.slice(0, 10)
            )
              throw new ValidationError(`Invalid ${field.label}`);
            values[field.name] = new Date(raw.endsWith('Z') ? raw : `${raw}Z`).toISOString();
          } else if (field.type === 'date' && raw) {
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
              !Number.isFinite(Date.parse(raw)) ||
              new Date(raw).toISOString().slice(0, 10) !== raw
            )
              throw new ValidationError(`Invalid ${field.label}`);
            values[field.name] = raw;
          } else values[field.name] = raw || null;
        }
        if (input.kind === 'document') {
          // Metadata editing leaves private bytes, hashes and all references intact.
        } else if (input.kind === 'technical_change') {
          if (
            values.technical_report_id &&
            !this.sqlite
              .prepare('SELECT 1 FROM technical_report WHERE id=? AND project_id=?')
              .get(String(values.technical_report_id), String(values.project_id))
          )
            throw new ValidationError('Technical report does not belong to the project');
          values.safety_impact = Number(values.safety_impact);
          if (values.safety_impact && (!values.validation || !values.rollback_information))
            throw new ValidationError(
              'Safety-impacting changes require validation and rollback information',
            );
          values.reason = reason;
          values.approval_state = 'draft';
          if (input.operation === 'create') values.author_id = principal.userId;
        } else if (input.kind === 'project_milestone') {
          const amount = String(values.amount);
          if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new ValidationError('Invalid amount');
          const [whole, cents = ''] = amount.split('.');
          const minor = BigInt(whole!) * 100n + BigInt(cents.padEnd(2, '0'));
          if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER))
            throw new ValidationError('Invalid amount');
          delete values.amount;
          values.amount_minor = Number(minor);
          const project = this.sqlite
            .prepare('SELECT currency FROM project WHERE id=?')
            .get(String(values.project_id));
          if (!project) throw new ValidationError('Project not found');
          values.currency = String(project.currency);
          values.approval_state = 'draft';
          values.approved_by = null;
          values.approved_at = null;
        } else {
          const startsAt = String(values.starts_at),
            endsAt = String(values.ends_at),
            workerId = String(values.worker_id);
          if (endsAt <= startsAt) throw new ValidationError('End must follow start');
          if (
            !this.sqlite
              .prepare(
                "SELECT 1 FROM user WHERE id=? AND status='active' AND role IN ('worker','project_manager')",
              )
              .get(workerId)
          )
            throw new ValidationError('Active worker required');
          if (input.kind === 'planning_assignment' && values.status !== 'cancelled') {
            if (
              !this.sqlite
                .prepare(
                  `SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE pm.user_id=? AND pm.project_id=? AND pm.status='active' AND p.status IN ('active','planned','paused') AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?)`,
                )
                .get(
                  workerId,
                  String(values.project_id),
                  startsAt.slice(0, 10),
                  endsAt.slice(0, 10),
                )
            )
              throw new ValidationError('Worker assignment must cover the planning window');
            if (
              this.sqlite
                .prepare(
                  "SELECT 1 FROM planning_assignment WHERE worker_id=? AND id<>? AND status<>'cancelled' AND starts_at<? AND ends_at>?",
                )
                .get(workerId, id, endsAt, startsAt)
            )
              throw new ConflictError('Planning overlaps another assignment');
            if (
              this.sqlite
                .prepare(
                  "SELECT 1 FROM worker_availability WHERE worker_id=? AND availability='unavailable' AND starts_at<? AND ends_at>?",
                )
                .get(workerId, endsAt, startsAt)
            )
              throw new ConflictError('Worker is unavailable');
          }
        }
        const now = new Date().toISOString();
        values.updated_at = now;
        if (input.operation === 'create') {
          values.id = id;
          values.created_at = now;
          if (input.kind === 'planning_assignment') values.created_by = principal.userId;
          const columns = Object.keys(values);
          this.sqlite
            .prepare(
              `INSERT INTO ${input.kind}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
            )
            .run(...Object.values(values));
        } else {
          if (Object.hasOwn(before!, 'version')) values.version = Number(before!.version) + 1;
          this.sqlite
            .prepare(
              `UPDATE ${input.kind} SET ${Object.keys(values)
                .map((key) => `${key}=?`)
                .join(',')} WHERE id=?`,
            )
            .run(...Object.values(values), id);
        }
      }
      const after =
        input.operation === 'delete' && input.kind !== 'document'
          ? null
          : this.sqlite.prepare(`SELECT * FROM ${input.kind} WHERE id=?`).get(id);
      if (reports.length) {
        const v3 = new V3Repository(this.sqlite);
        const periods = new Map(
          reports.map((report) => [
            `${report.project_id}:${report.period_start}:${report.period_end}`,
            report,
          ]),
        );
        for (const report of periods.values()) {
          const period = {
            projectId: String(report.project_id),
            periodStart: String(report.period_start),
            periodEnd: String(report.period_end),
          };
          v3.refreshPeriodReports(principal, period);
          v3.enqueueJob('period_close_report', `owner-technical-refresh:${id}:${newId()}`, period);
        }
      }
      recordAuditEvent(this.sqlite, principal, `owner.catalog.${input.operation}`, input.kind, id, {
        before,
        after,
        reason,
        projectId: before?.project_id ?? after?.project_id,
      });
      return { id };
    });
  }
}
