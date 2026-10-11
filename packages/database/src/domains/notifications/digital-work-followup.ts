import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';

type DueItem = {
  id: string;
  project_id: string;
  owner_id: string;
  due_on: string;
  kind: string;
  title: string;
  project_number: string;
  project_name: string;
  timezone: string;
  project_status: string;
  role: string;
};
type Notice = {
  id: string;
  kind: string;
  subject_id: string;
  read_at: string | null;
  created_at: string;
};
const ACTIVE = new Set(['open', 'in_progress', 'ready_for_review']);

function eligible(sqlite: DatabaseSync, row: DueItem, now: string): boolean {
  if (sqlite.prepare('SELECT 1 FROM supplier_user_profile WHERE user_id=?').get(row.owner_id))
    return false;
  if (row.kind === 'policy_review' && !['owner_admin', 'finance_admin'].includes(row.role))
    return false;
  if (['owner_admin', 'finance_admin'].includes(row.role)) return true;
  if (
    !['worker', 'project_manager'].includes(row.role) ||
    !['active', 'planned', 'paused', 'closing'].includes(row.project_status)
  )
    return false;
  let today: string;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: row.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(now));
    today = ['year', 'month', 'day']
      .map((type) => parts.find((part) => part.type === type)?.value)
      .join('-');
  } catch {
    return false;
  }
  return Boolean(
    sqlite
      .prepare(
        `SELECT 1 FROM project_member WHERE project_id=? AND user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) LIMIT 1`,
      )
      .get(row.project_id, row.owner_id, today, today),
  );
}

const SELECT = `SELECT w.id,w.project_id,w.owner_id,w.due_on,w.kind,w.title,w.status,
 p.project_number,p.name project_name,p.timezone,p.status project_status,u.role
 FROM digital_work_item w JOIN project p ON p.id=w.project_id JOIN user u ON u.id=w.owner_id
 WHERE u.status='active'`;

/** One in-app follow-up per owner, item and deadline; no mail or repeated daily nagging. */
export function dueDigitalWorkItems(sqlite: DatabaseSync, now: string): DueItem[] {
  const items = sqlite
    .prepare(
      `${SELECT} AND w.due_on IS NOT NULL AND w.status IN ('open','in_progress','ready_for_review')`,
    )
    .all() as Array<DueItem & { status: string }>;
  return items.filter((row) => {
    if (!eligible(sqlite, row, now)) return false;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: row.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(now));
      const today = ['year', 'month', 'day']
        .map((type) => parts.find((part) => part.type === type)?.value)
        .join('-');
      return row.due_on <= today;
    } catch {
      return false;
    }
  });
}

/** Re-authorize the current assignment and deadline at read time, including completed/reassigned items. */
export function digitalWorkNotification(
  sqlite: DatabaseSync,
  principal: Principal,
  notice: Notice,
  now: string,
) {
  const generic = {
    id: notice.id,
    kind: 'workspace_activity',
    subject_id: null,
    read_at: notice.read_at,
    created_at: notice.created_at,
    source_id: null,
    target: null,
    title: 'J&A Automation notification',
    actor_name: null,
    changed_fields: [] as string[],
    project_id: null,
    project_number: null,
    project_name: null,
    record_date: null,
    record_title: null,
  };
  const match = /^digital-work:([^:]+):(\d{4}-\d{2}-\d{2})$/u.exec(notice.subject_id);
  if (!match) return generic;
  const row = sqlite
    .prepare(`${SELECT} AND w.id=? AND w.owner_id=?`)
    .get(match[1]!, principal.userId) as (DueItem & { status: string }) | undefined;
  if (
    !row ||
    row.role !== principal.role ||
    !ACTIVE.has(row.status) ||
    row.due_on !== match[2] ||
    !eligible(sqlite, row, now)
  )
    return generic;
  return {
    ...notice,
    source_id: row.id,
    target: `/app/workflow?project=${encodeURIComponent(row.project_id)}#item-${encodeURIComponent(row.id)}`,
    title: 'Work item follow-up due',
    actor_name: null,
    changed_fields: [] as string[],
    project_id: row.project_id,
    project_number: row.project_number,
    project_name: row.project_name,
    record_date: row.due_on,
    record_title: row.title,
  };
}
