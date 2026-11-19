import type { openPortalRepository } from '$lib/server/portal-repository';
import { personDisplayName } from '$lib/portal/display-name';
import { auditEntityTypeText } from '$lib/portal/audit-action-labels';
import { isSystemAccount } from '$lib/portal/system-accounts';
import { AUDIT_RANGES, type AuditFilter, type AuditRange } from '$lib/portal/audit-log';

/**
 * Audit register at scale (hundreds of thousands of events): the server
 * applies every filter and returns one page of 25 rows plus the exact count.
 * Default scope is the last 7 days of business & security events.
 */
export const AUDIT_PAGE_SIZE = 25;

export type AuditPageData = {
  audit: Array<{
    id: string;
    actor_id: string;
    actor_name: string;
    action: string;
    entity_type: string;
    entity_id: string;
    occurred_at: string;
    details_json: string;
  }>;
  auditView: 'all' | 'business' | 'service';
  auditFilter: AuditFilter;
  auditTotal: number;
  auditPage: number;
  auditPages: number;
  auditPageSize: number;
  auditActors: Array<{ id: string; name: string }>;
  auditEntityTypes: string[];
};

const isoDay = /^\d{4}-\d{2}-\d{2}$/u;

function validDay(value: string | null): string {
  const day = (value ?? '').trim();
  return isoDay.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : '';
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function auditFilterFrom(params: URLSearchParams, today = new Date().toISOString().slice(0, 10)) {
  const requestedView = params.get('view');
  const view: AuditPageData['auditView'] =
    requestedView === 'all' || requestedView === 'service' ? requestedView : 'business';
  let from = validDay(params.get('from'));
  let to = validDay(params.get('to'));
  const requestedRange = params.get('range') ?? '';
  let range: AuditRange;
  if (from || to) range = 'custom';
  else if ((AUDIT_RANGES as readonly string[]).includes(requestedRange))
    range = requestedRange as AuditRange;
  else range = '7';
  if (range !== 'custom' && range !== 'all') {
    from = addDays(today, -(Number(range) - 1));
    to = today;
  }
  if (from && to && from > to) [from, to] = [to, from];
  const actor = (params.get('actor') ?? '').trim();
  const type = (params.get('type') ?? '').trim();
  const find = (params.get('find') ?? '').trim().slice(0, 120);
  return {
    view,
    range,
    from,
    to,
    actor: actor === 'service' || /^[0-9a-z-]{8,64}$/iu.test(actor) ? actor : '',
    type: /^[a-z0-9_.-]{1,64}$/iu.test(type) ? type : '',
    find,
    page: Math.max(1, Math.trunc(Number(params.get('page'))) || 1),
  };
}

// The set of entity types changes only with new features; re-read every 10 min.
let entityTypeCache: { at: number; types: string[] } | null = null;
function entityTypes(context: ReturnType<typeof openPortalRepository>): string[] {
  const types = entityTypeCache && Date.now() - entityTypeCache.at < 600_000
    ? entityTypeCache.types
    : context.repository.listAuditEntityTypes(context.principal);
  if (!entityTypeCache || entityTypeCache.types !== types) entityTypeCache = { at: Date.now(), types };
  return types;
}

/**
 * Z2: record kinds that read the same ("Mailbox", "Issuing company") are one
 * filter choice. The option value is the group's first stored type; the
 * filter expands it to every stored type with the same label.
 */
export function auditTypeGroups(types: readonly string[]): Map<string, string[]> {
  const byLabel = new Map<string, string[]>();
  for (const type of types) {
    const label = auditEntityTypeText(type, 'en').toLocaleLowerCase();
    const group = byLabel.get(label) ?? [];
    group.push(type);
    byLabel.set(label, group);
  }
  return new Map([...byLabel.values()].map((group) => [group[0]!, group]));
}

export function buildAuditPage(
  context: ReturnType<typeof openPortalRepository>,
  params: URLSearchParams,
): AuditPageData {
  const filter = auditFilterFrom(params);
  const typeGroups = auditTypeGroups(entityTypes(context));
  const typeGroup = filter.type
    ? (typeGroups.get(filter.type) ??
      [...typeGroups.values()].find((group) => group.includes(filter.type)) ?? [filter.type])
    : [];
  const query = {
    view: filter.view,
    from: filter.from ? `${filter.from}T00:00:00.000Z` : undefined,
    // Inclusive end day: everything before the next day's midnight (UTC).
    to: filter.to ? `${addDays(filter.to, 1)}T00:00:00.000Z` : undefined,
    actorId: filter.actor || undefined,
    entityType: filter.type || undefined,
    entityTypes: typeGroup.length > 1 ? typeGroup : undefined,
    search: filter.find || undefined,
  };
  // Count and page are two cheap reads: a top-25 heap scan and a count,
  // instead of sorting every matching event.
  const total = context.repository.countAuditEvents(context.principal, query);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(pages, filter.page);
  const rows = total
    ? context.repository.listAuditEvents(context.principal, {
        ...query,
        limit: AUDIT_PAGE_SIZE,
        offset: (page - 1) * AUDIT_PAGE_SIZE,
      })
    : [];
  // Display names, never raw ids, for every actor on this page.
  const people = context.sqlite
    .prepare('SELECT id,name,email FROM user ORDER BY name COLLATE NOCASE')
    .all() as Array<{ id: string; name: string | null; email: string | null }>;
  // Z2: the Person filter lists only people who actually appear in the log
  // (index lookup per user on audit_event_actor_time_idx), never mailboxes.
  const hasEvents = context.sqlite.prepare('SELECT 1 FROM audit_event WHERE actor_id=? LIMIT 1');
  const names = new Map(
    people.map((person) => [String(person.id), personDisplayName(person.name, person.email)]),
  );
  return {
    audit: rows.map((row) => ({
      ...row,
      actor_name: row.actor_id ? (names.get(String(row.actor_id)) ?? '') : '',
    })),
    auditView: filter.view,
    auditFilter: {
      range: filter.range,
      from: filter.from,
      to: filter.to,
      actor: filter.actor,
      type: typeGroup[0] ?? filter.type,
      find: filter.find,
    },
    auditTotal: total,
    auditPage: page,
    auditPages: pages,
    auditPageSize: AUDIT_PAGE_SIZE,
    auditActors: people
      .filter(
        (person) =>
          String(person.id) === filter.actor ||
          (!isSystemAccount(person) && Boolean(hasEvents.get(String(person.id)))),
      )
      .map((person) => ({ id: String(person.id), name: names.get(String(person.id)) ?? '' }))
      .filter((person) => person.name)
      .sort((left, right) => left.name.localeCompare(right.name)),
    auditEntityTypes: [...typeGroups.keys()].sort((left, right) =>
      auditEntityTypeText(left, 'en').localeCompare(auditEntityTypeText(right, 'en')),
    ),
  };
}
