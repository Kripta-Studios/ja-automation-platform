import { json, type RequestHandler } from '@sveltejs/kit';
import {
  AccessDeniedError,
  CrewLeaderRepository,
  assertLiveSession,
  isSupplierCoordinator,
  projectCalendarDate,
  readLiveSupplierCoordinatorGrant,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  expenseLookupCaught,
  expenseLookupInvalid,
  expenseLookupSignIn,
} from '$lib/server/expense-lookup-problem';

const query = z.object({
  projectId: z.uuid(),
  workerId: z.uuid(),
  date: z.iso.date(),
});

/** Evaluate effective assignment terms after checking the exact worker and project scope. */
export function _expenseDescriptionDefault(
  sqlite: DatabaseSync,
  principal: Principal,
  scope: { projectId: string; workerId: string; date: string },
): 'Perdiem' | 'Only hours' {
  const { projectId, workerId, date } = scope;
  assertLiveSession(sqlite, principal, AccessDeniedError);
  const actor = sqlite.prepare('SELECT role,status FROM user WHERE id=?').get(principal.userId) as
    | { role: string; status: string }
    | undefined;
  if (!actor || actor.status !== 'active' || actor.role !== principal.role)
    throw new AccessDeniedError('Active account required');
  if (workerId !== principal.userId) {
    if (principal.role === 'worker') {
      new CrewLeaderRepository(sqlite).authorizeDelegatedOperationalEntry(
        principal,
        workerId,
        projectId,
        date,
      );
    } else if (
      principal.role !== 'owner_admin' &&
      !(principal.role === 'project_manager' && principal.projectIds.has(projectId))
    ) {
      throw new AccessDeniedError('Worker scope required');
    }
  }
  const assignment = sqlite
    .prepare(
      `SELECT pm.id,p.timezone
         FROM project_member pm JOIN user subject ON subject.id=pm.user_id
         JOIN project p ON p.id=pm.project_id
        WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active'
          AND subject.status='active' AND subject.role IN ('worker','project_manager')
          AND p.status IN ('active','planned','paused')
          AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?) LIMIT 1`,
    )
    .get(projectId, workerId, date, date) as { id: string; timezone: string } | undefined;
  if (!assignment) throw new AccessDeniedError('Active worker assignment required');
  if (principal.role === 'worker') {
    let currentDate: string;
    try {
      currentDate = projectCalendarDate(assignment.timezone);
    } catch {
      throw new AccessDeniedError('Active worker assignment required');
    }
    const currentAssignment = sqlite
      .prepare(
        `SELECT 1 FROM project_member pm
         WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active'
           AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?) LIMIT 1`,
      )
      .get(projectId, workerId, currentDate, currentDate);
    if (!currentAssignment) throw new AccessDeniedError('Active worker assignment required');
    if (
      isSupplierCoordinator(sqlite, principal.userId) &&
      !readLiveSupplierCoordinatorGrant(sqlite, principal, projectId, date, currentDate)
    )
      throw new AccessDeniedError('Current supplier project grant required');
  }
  const perDiem = sqlite
    .prepare(
      `SELECT 1 FROM assignment_expense_policy
        WHERE project_member_id=? AND category='per_diem'
          AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) LIMIT 1`,
    )
    .get(assignment.id, date, date);
  return perDiem ? 'Perdiem' : 'Only hours';
}

/** Only return a suggested operational description, never commercial policy details. */
export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) return expenseLookupSignIn(locals.correlationId);
  const parsed = query.safeParse({
    projectId: url.searchParams.get('projectId'),
    workerId: url.searchParams.get('workerId'),
    date: url.searchParams.get('date'),
  });
  if (!parsed.success) return expenseLookupInvalid('description', locals.correlationId);
  let context: ReturnType<typeof openPortalRepository> | undefined;
  try {
    context = openPortalRepository(locals);
    const description = _expenseDescriptionDefault(context.sqlite, context.principal, parsed.data);
    return json({ description }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (caught) {
    return expenseLookupCaught('description', caught, locals.correlationId);
  } finally {
    context?.sqlite.close();
  }
};
