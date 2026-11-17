import { AccessDeniedError, ConflictError, ValidationError, assertLiveSession, recordAuditEvent } from '@ja/database';
import type { openPortalRepository } from './portal-repository';

type Context = ReturnType<typeof openPortalRepository>;

/**
 * PO per assignment (person × project), owner decision 2026-11-17. Set at the point of need on
 * the project Team tab or the person page; invoices of that person's work print it (the
 * project PO stays the fallback). Issued invoices never change: they keep their snapshot.
 */
export function setAssignmentPurchaseOrder(
  context: Context,
  input: { projectId: string; assignmentId: string; version: number; poNumber: string },
): { poNumber: string | null; version: number } {
  assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
  if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
    throw new AccessDeniedError('Owner or Finance role required');
  const poNumber = input.poNumber.trim().replace(/\s+/gu, ' ') || null;
  if (poNumber && poNumber.length > 200) throw new ValidationError('PO number is too long');
  const row = context.sqlite
    .prepare('SELECT project_id,user_id,version,po_number FROM project_member WHERE id=?')
    .get(input.assignmentId) as
    | { project_id: string; user_id: string; version: number; po_number: string | null }
    | undefined;
  if (!row || row.project_id !== input.projectId) throw new AccessDeniedError('Assignment is not on this project');
  // Object-level access to the project (throws for projects outside the caller's scope).
  context.repository.projectOverview(context.principal, input.projectId, { includeFinance: false });
  if (Number(row.version) !== input.version) throw new ConflictError('Assignment changed before update');
  if ((row.po_number ?? null) === poNumber) return { poNumber, version: Number(row.version) };
  // Change and audit row commit together or not at all.
  context.sqlite.exec('SAVEPOINT assignment_po');
  try {
    const changed = context.sqlite
      .prepare('UPDATE project_member SET po_number=?,updated_at=?,version=version+1 WHERE id=? AND version=?')
      .run(poNumber, new Date().toISOString(), input.assignmentId, input.version);
    if (changed.changes !== 1) throw new ConflictError('Assignment changed before update');
    recordAuditEvent(context.sqlite, context.principal, 'assignment.po_update', 'project_member', input.assignmentId, {
      projectId: input.projectId,
      workerId: row.user_id,
      before: { poNumber: row.po_number ?? null },
      after: { poNumber },
    });
    context.sqlite.exec('RELEASE assignment_po');
  } catch (error) {
    context.sqlite.exec('ROLLBACK TO assignment_po');
    context.sqlite.exec('RELEASE assignment_po');
    throw error;
  }
  return { poNumber, version: Number(row.version) + 1 };
}
