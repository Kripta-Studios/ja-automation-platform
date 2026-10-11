import type { DatabaseSync } from 'node:sqlite';

export type WorkflowProject = { id: string; number: string; name: string };
export type WorkflowOwner = { id: string; name: string; role: string; projectIds: string[] };

type ProjectDay = { projectId: string; localToday: string };

function localDateAt(instant: Date, timezone: string): string | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const part = (name: string) => parts.find((value) => value.type === name)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');
    return year && month && day ? `${year}-${month}-${day}` : undefined;
  } catch {
    // An invalid project timezone never acquires current access by guessing UTC.
    return undefined;
  }
}

function projectDays(
  sqlite: DatabaseSync,
  projectIds: readonly string[],
  instant: Date,
): ProjectDay[] {
  const ids = [...new Set(projectIds)];
  if (!ids.length || !Number.isFinite(instant.valueOf())) return [];
  const rows = sqlite
    .prepare(`SELECT id,timezone FROM project WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as Array<{ id: string; timezone: string | null }>;
  const days: ProjectDay[] = [];
  for (const row of rows) {
    if (!row.timezone) continue;
    const localToday = localDateAt(instant, row.timezone);
    if (localToday) days.push({ projectId: row.id, localToday });
  }
  return days;
}

function dayCte(days: readonly ProjectDay[]): string {
  return `WITH current_project_days(project_id,local_today) AS (VALUES ${days
    .map(() => '(?,?)')
    .join(',')})`;
}

function dayParameters(days: readonly ProjectDay[]): string[] {
  return days.flatMap(({ projectId, localToday }) => [projectId, localToday]);
}

/** Projects a PM's current, effective review assignments using each project's local date. */
export function accessibleWorkflowProjects(
  sqlite: DatabaseSync,
  userId: string,
  instant: Date,
): WorkflowProject[] {
  const projectIds = (
    sqlite
      .prepare(
        `SELECT DISTINCT project_id FROM project_member
          WHERE user_id=? AND status='active' AND can_review=1`,
      )
      .all(userId) as Array<{ project_id: string }>
  ).map((row) => row.project_id);
  const days = projectDays(sqlite, projectIds, instant);
  if (!days.length) return [];
  const rows = sqlite
    .prepare(
      `${dayCte(days)}
       SELECT DISTINCT p.id,p.project_number,p.name
         FROM current_project_days day
         JOIN project p ON p.id=day.project_id
         JOIN project_member pm ON pm.project_id=p.id
        WHERE p.status IN ('active','planned','paused','closing')
          AND pm.user_id=? AND pm.status='active' AND pm.can_review=1
          AND pm.starts_on<=day.local_today
          AND (pm.ends_on IS NULL OR pm.ends_on>=day.local_today)
        ORDER BY p.project_number,p.id`,
    )
    .all(...dayParameters(days), userId) as Array<{
    id: string;
    project_number: string | null;
    name: string | null;
  }>;
  return rows.map((row) => ({
    id: String(row.id),
    number: String(row.project_number ?? ''),
    name: String(row.name ?? ''),
  }));
}

/** Projects active, effective members for the Owner selector, deduplicated by member/project. */
export function workflowOwnersForProjects(
  sqlite: DatabaseSync,
  projects: readonly WorkflowProject[],
  instant: Date,
): WorkflowOwner[] {
  if (!projects.length) return [];
  const days = projectDays(sqlite, [...new Set(projects.map((project) => project.id))], instant);
  if (!days.length) return [];
  const rows = sqlite
    .prepare(
      `${dayCte(days)}
       SELECT DISTINCT p.id project_id,u.id,u.name,u.role
         FROM current_project_days day
         JOIN project p ON p.id=day.project_id
         JOIN project_member pm ON pm.project_id=p.id
         JOIN user u ON u.id=pm.user_id
        WHERE u.status='active' AND pm.status='active'
          AND pm.starts_on<=day.local_today
          AND (pm.ends_on IS NULL OR pm.ends_on>=day.local_today)
        ORDER BY u.name,u.id,p.id`,
    )
    .all(...dayParameters(days)) as Array<{
    project_id: string;
    id: string;
    name: string | null;
    role: string;
  }>;
  const owners = new Map<string, WorkflowOwner>();
  for (const row of rows) {
    let owner = owners.get(row.id);
    if (!owner) {
      owner = { id: row.id, name: row.name ?? row.id, role: row.role, projectIds: [] };
      owners.set(row.id, owner);
    }
    if (!owner.projectIds.includes(row.project_id)) owner.projectIds.push(row.project_id);
  }
  return [...owners.values()];
}
