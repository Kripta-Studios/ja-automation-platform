import { CrewLeaderRepository } from '@ja/database';
import type { openPortalRepository } from './portal-repository';

type Context = ReturnType<typeof openPortalRepository>;

export type ExpenseTimeOption = Readonly<{
  id: string;
  workerId: string;
  workerName: string;
  minutes: number;
  category: string;
  summary: string;
  approvalState: string;
  correctionLinked: number;
}>;

/** Use the same object-scoped choices in expense creation and correction. */
export function expenseTimeOptions(
  context: Context,
  scope: { projectId: string; date: string; workerId?: string },
): ExpenseTimeOption[] {
  const delegated =
    context.principal.role === 'worker' &&
    Boolean(scope.workerId) &&
    scope.workerId !== context.principal.userId;
  if (delegated) {
    const crew = new CrewLeaderRepository(context.sqlite);
    crew.authorizeDelegatedOperationalEntry(
      context.principal,
      scope.workerId!,
      scope.projectId,
      scope.date,
    );
    const permitted = crew
      .entries(context.principal, scope.projectId, scope.date, scope.date)
      .filter(
        (entry) =>
          entry.workerId === scope.workerId && !['rejected', 'void'].includes(entry.approvalState),
      );
    return permitted
      .filter(
        (entry) =>
          !context.sqlite
            .prepare(
              `SELECT 1 FROM record_correction_link link JOIN time_entry correction ON correction.id=link.correction_id
       WHERE link.record_type='time_entry' AND link.original_id=?
         AND correction.approval_state NOT IN ('rejected','void') LIMIT 1`,
            )
            .get(entry.id),
      )
      .map((entry) => ({
        id: entry.id,
        workerId: entry.workerId,
        workerName: entry.workerName,
        minutes: entry.minutes,
        category: entry.category,
        summary: entry.summary,
        approvalState: entry.approvalState,
        correctionLinked: Number(
          Boolean(
            context.sqlite
              .prepare(
                "SELECT 1 FROM record_correction_link WHERE record_type='time_entry' AND correction_id=? LIMIT 1",
              )
              .get(entry.id),
          ),
        ),
      }));
  }
  return context.repository
    .listTimeForScope(context.principal, {
      projectId: scope.projectId,
      from: scope.date,
      to: scope.date,
    })
    .filter(
      (row) =>
        (!scope.workerId || row.worker_id === scope.workerId) &&
        !['rejected', 'void'].includes(String(row.approval_state)) &&
        !row.active_correction_id,
    )
    .map((row) => ({
      id: String(row.id),
      workerId: String(row.worker_id),
      workerName: String(row.worker_name),
      minutes: Number(row.minutes),
      category: String(row.category),
      summary: String(row.activity_summary),
      approvalState: String(row.approval_state),
      correctionLinked: Number(row.correction_linked ?? 0),
    }));
}
