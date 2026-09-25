import { json, type RequestHandler } from '@sveltejs/kit';
import { AccessDeniedError, CrewLeaderRepository, assertLiveSession } from '@ja/database';
import type { Principal } from '@ja/domain';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { openPortalRepository } from '$lib/server/portal-repository';

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
      `SELECT pm.id FROM project_member pm JOIN user subject ON subject.id=pm.user_id
        WHERE pm.project_id=? AND pm.user_id=? AND pm.status='active'
          AND subject.status='active' AND subject.role IN ('worker','project_manager')
          AND pm.starts_on<=? AND (pm.ends_on IS NULL OR pm.ends_on>=?) LIMIT 1`,
    )
    .get(projectId, workerId, date, date) as { id: string } | undefined;
  if (!assignment) throw new AccessDeniedError('Active worker assignment required');
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
  if (!locals.user || !locals.session) return json({ error: 'Sign in required' }, { status: 401 });
  const parsed = query.safeParse({
    projectId: url.searchParams.get('projectId'),
    workerId: url.searchParams.get('workerId'),
    date: url.searchParams.get('date'),
  });
  if (!parsed.success)
    return json({ error: 'Project, worker and date are required' }, { status: 400 });
  const context = openPortalRepository(locals);
  try {
    const description = _expenseDescriptionDefault(context.sqlite, context.principal, parsed.data);
    return json({ description }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (caught) {
    if (caught instanceof AccessDeniedError)
      return json({ error: 'Expense scope denied' }, { status: 403 });
    throw caught;
  } finally {
    context.sqlite.close();
  }
};
