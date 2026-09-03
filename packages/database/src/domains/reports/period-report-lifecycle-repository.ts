import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';

export type PeriodReportApprovalInput = Readonly<{
  periodReportId: string;
  expectedSnapshotVersion: number;
  expectedSnapshotSha256: string;
}>;

export type PeriodReportApprovalResult = Readonly<{
  id: string;
  projectId: string;
  state: 'approved';
  snapshotVersion: number;
  snapshotSha256: string;
  approvedAt: string;
  changed: boolean;
}>;

type PeriodReportLifecycleDependencies = Readonly<{
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  assertActive: (principal: Principal) => void;
  assertProjectAccess: (principal: Principal, projectId: string) => void;
  audit: (
    principal: Principal,
    action: string,
    entityType: string,
    entityId: string,
    details: unknown,
  ) => void;
  now: () => string;
  errors: Readonly<{
    accessDenied: (message: string) => never;
    conflict: (message: string) => never;
    validation: (message: string) => never;
  }>;
}>;

type PeriodReportApprovalRow = Readonly<{
  id: string;
  project_id: string;
  audience: string;
  state: string;
  snapshot_version: number;
  snapshot_sha256: string | null;
  approved_at: string | null;
}>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

/**
 * Owns the human approval boundary for the compatibility period-report model.
 * Approval records operational review only; customer conformity remains a
 * separate, stepped-up Finance/Owner command bound to the rendered PDF.
 */
export class PeriodReportLifecycleRepository {
  private readonly deps: PeriodReportLifecycleDependencies;

  constructor(deps: PeriodReportLifecycleDependencies) {
    this.deps = deps;
  }

  private selectReport(periodReportId: string): PeriodReportApprovalRow | undefined {
    return this.deps.sqlite
      .prepare(
        `SELECT id,project_id,audience,state,snapshot_version,snapshot_sha256,approved_at
           FROM period_report
          WHERE id=?`,
      )
      .get(periodReportId) as PeriodReportApprovalRow | undefined;
  }

  private assertInput(input: PeriodReportApprovalInput): void {
    if (typeof input.periodReportId !== 'string' || !input.periodReportId.trim())
      return this.deps.errors.validation('Period report id is required');
    if (!Number.isSafeInteger(input.expectedSnapshotVersion) || input.expectedSnapshotVersion < 1)
      return this.deps.errors.validation('Expected period report snapshot version is invalid');
    if (!SHA256_PATTERN.test(input.expectedSnapshotSha256))
      return this.deps.errors.validation('Expected period report snapshot hash is invalid');
  }

  private assertApprover(principal: Principal, report: PeriodReportApprovalRow): void {
    this.deps.assertActive(principal);
    if (
      principal.role !== 'owner_admin' &&
      principal.role !== 'finance_admin' &&
      principal.role !== 'project_manager'
    )
      return this.deps.errors.accessDenied('Period report approval role required');
    this.deps.assertProjectAccess(principal, report.project_id);
    if (principal.role === 'project_manager' && report.audience !== 'customer')
      return this.deps.errors.accessDenied('Internal report approval requires Finance access');
  }

  approvePeriodReport(
    principal: Principal,
    input: PeriodReportApprovalInput,
  ): PeriodReportApprovalResult {
    this.assertInput(input);
    return this.deps.transaction(() => {
      const report = this.selectReport(input.periodReportId);
      if (!report) return this.deps.errors.validation('Period report not found');
      this.assertApprover(principal, report);

      const bindingMatches =
        report.snapshot_version === input.expectedSnapshotVersion &&
        report.snapshot_sha256 === input.expectedSnapshotSha256;
      if (report.state === 'approved' && bindingMatches) {
        if (!report.approved_at)
          return this.deps.errors.conflict(
            'Period report approval timestamp is missing; refresh and approve the report again',
          );
        return {
          id: report.id,
          projectId: report.project_id,
          state: 'approved',
          snapshotVersion: report.snapshot_version,
          snapshotSha256: input.expectedSnapshotSha256,
          approvedAt: report.approved_at,
          changed: false,
        };
      }
      if (report.state !== 'review')
        return this.deps.errors.conflict(
          `Period report cannot be approved from state ${report.state}`,
        );
      if (!bindingMatches)
        return this.deps.errors.conflict('Period report snapshot changed before approval');

      const approvedAt = this.deps.now();
      const update = this.deps.sqlite
        .prepare(
          `UPDATE period_report
              SET state='approved',approved_at=?,updated_at=?
            WHERE id=? AND state='review' AND snapshot_version=? AND snapshot_sha256=?`,
        )
        .run(
          approvedAt,
          approvedAt,
          report.id,
          input.expectedSnapshotVersion,
          input.expectedSnapshotSha256,
        );
      if (update.changes !== 1) {
        const current = this.selectReport(report.id);
        if (
          current?.state === 'approved' &&
          current.snapshot_version === input.expectedSnapshotVersion &&
          current.snapshot_sha256 === input.expectedSnapshotSha256 &&
          current.approved_at
        ) {
          return {
            id: current.id,
            projectId: current.project_id,
            state: 'approved',
            snapshotVersion: current.snapshot_version,
            snapshotSha256: input.expectedSnapshotSha256,
            approvedAt: current.approved_at,
            changed: false,
          };
        }
        return this.deps.errors.conflict('Period report changed during approval');
      }

      this.deps.audit(principal, 'lifecycle.transition', 'project', report.project_id, {
        entityType: 'period_report',
        entityId: report.id,
        projectId: report.project_id,
        audience: report.audience,
        previousState: report.state,
        state: 'approved',
        snapshotVersion: input.expectedSnapshotVersion,
        snapshotSha256: input.expectedSnapshotSha256,
      });
      return {
        id: report.id,
        projectId: report.project_id,
        state: 'approved',
        snapshotVersion: input.expectedSnapshotVersion,
        snapshotSha256: input.expectedSnapshotSha256,
        approvedAt,
        changed: true,
      };
    });
  }
}
