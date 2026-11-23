/**
 * T17: make the audit register usable as evidence without changing a stored
 * event. For the 25 rows of one page the server resolves
 *  - `subject_label`: whose record it is ("Gabriel Lamoglia · C-0020-P-001")
 *    instead of a truncated id;
 *  - `display_details`: the recorded details with person/project/client ids
 *    replaced by names and, for pay-rate events, the rate, currency and
 *    effective date read from the (append-only, effective-dated) rule rows,
 *    including the previous rate for a superseding rule (before → after).
 * The raw `details_json` stays untouched under "Technical details".
 * Presentation only; the audit page is owner/auditor only (listAuditEvents).
 */
import type { DatabaseSync } from 'node:sqlite';
import { personDisplayName } from '$lib/portal/display-name';

type Row = Readonly<{
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details_json: string;
}>;

export type AuditSubjectFields = Readonly<{
  subject_label: string;
  display_details: string;
}>;

const PERSON_KEYS = new Set([
  'workerid',
  'userid',
  'projectmanagerid',
  'technicianid',
  'recipientid',
  'reviewerid',
  'targetuserid',
  'chiefid',
  'leaderid',
  'memberid',
]);
const PROJECT_KEYS = new Set(['projectid']);
const CLIENT_KEYS = new Set(['clientid']);
const PERSON_ENTITIES = new Set(['user', 'worker']);

const normalized = (key: string) => key.replace(/[_\s-]/gu, '').toLocaleLowerCase();
const text = (value: unknown) => (value == null ? '' : String(value));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function parse(details: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(details) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function inChunks<T>(ids: readonly string[], read: (batch: string[]) => T[]): T[] {
  const out: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 400)
    out.push(...read(ids.slice(offset, offset + 400)));
  return out;
}

const marks = (count: number) => Array.from({ length: count }, () => '?').join(',');

/** Visit every value of the details (top level, before/after/fields one level deep). */
function eachIdField(
  details: Record<string, unknown>,
  visit: (key: string, value: string) => void,
): void {
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string') visit(normalized(key), value);
    else if (isRecord(value))
      for (const [inner, innerValue] of Object.entries(value))
        if (typeof innerValue === 'string') visit(normalized(inner), innerValue);
  }
}

function replaceIds(
  details: Record<string, unknown>,
  lookup: (key: string, value: string) => string | undefined,
): Record<string, unknown> {
  const map = (key: string, value: unknown): unknown =>
    typeof value === 'string' ? (lookup(normalized(key), value) ?? value) : value;
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      isRecord(value)
        ? Object.fromEntries(
            Object.entries(value).map(([inner, innerValue]) => [inner, map(inner, innerValue)]),
          )
        : map(key, value),
    ]),
  );
}

type RuleRow = {
  id: string;
  worker_id: string;
  project_id: string | null;
  currency: string;
  rate_minor: string;
  rate_basis: string | null;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

export function auditSubjects(
  sqlite: DatabaseSync,
  rows: readonly Row[],
): Map<string, AuditSubjectFields> {
  const parsed = new Map(rows.map((row) => [row.id, parse(row.details_json)]));
  const personIds = new Set<string>();
  const projectIds = new Set<string>();
  const clientIds = new Set<string>();
  const ruleIds = new Set<string>();
  const byType = (type: string) => rows.filter((row) => row.entity_type === type);

  for (const row of rows) {
    if (PERSON_ENTITIES.has(row.entity_type)) personIds.add(row.entity_id);
    if (row.entity_type === 'project') projectIds.add(row.entity_id);
    if (row.entity_type === 'client') clientIds.add(row.entity_id);
    if (row.entity_type === 'compensation_rule') ruleIds.add(row.entity_id);
    const details = parsed.get(row.id);
    if (details)
      eachIdField(details, (key, value) => {
        if (PERSON_KEYS.has(key)) personIds.add(value);
        else if (PROJECT_KEYS.has(key)) projectIds.add(value);
        else if (CLIENT_KEYS.has(key)) clientIds.add(value);
      });
  }

  const rules = new Map(
    inChunks([...ruleIds], (batch) =>
      sqlite
        .prepare(
          `SELECT id,worker_id,project_id,currency,CAST(rate_minor AS TEXT) rate_minor,rate_basis,
                  effective_from,effective_to,created_at
             FROM compensation_rule WHERE id IN (${marks(batch.length)})`,
        )
        .all(...batch) as RuleRow[],
    ).map((rule) => [rule.id, rule]),
  );
  for (const rule of rules.values()) {
    personIds.add(rule.worker_id);
    if (rule.project_id) projectIds.add(rule.project_id);
  }

  const members = new Map(
    inChunks(
      byType('project_member').map((row) => row.entity_id),
      (batch) =>
        sqlite
          .prepare(
            `SELECT id,user_id,project_id FROM project_member WHERE id IN (${marks(batch.length)})`,
          )
          .all(...batch) as Array<{ id: string; user_id: string; project_id: string }>,
    ).map((member) => [member.id, member]),
  );
  for (const member of members.values()) {
    personIds.add(member.user_id);
    projectIds.add(member.project_id);
  }

  const records = new Map<string, { worker_id: string; project_id: string; day: string }>();
  for (const [type, table, day] of [
    ['time_entry', 'time_entry', 'work_date'],
    ['expense', 'expense', 'spent_on'],
  ] as const)
    for (const record of inChunks(
      byType(type).map((row) => row.entity_id),
      (batch) =>
        sqlite
          .prepare(
            `SELECT id,worker_id,project_id,${day} day FROM ${table} WHERE id IN (${marks(batch.length)})`,
          )
          .all(...batch) as Array<{ id: string; worker_id: string; project_id: string; day: string }>,
    )) {
      records.set(record.id, record);
      personIds.add(record.worker_id);
      projectIds.add(record.project_id);
    }

  const invoices = new Map(
    inChunks(
      byType('invoice').map((row) => row.entity_id),
      (batch) =>
        sqlite
          .prepare(
            `SELECT id,invoice_number FROM invoice WHERE id IN (${marks(batch.length)})`,
          )
          .all(...batch) as Array<{ id: string; invoice_number: string | null }>,
    ).map((invoice) => [invoice.id, text(invoice.invoice_number)]),
  );

  const people = new Map(
    inChunks([...personIds], (batch) =>
      sqlite
        .prepare(`SELECT id,name,email FROM user WHERE id IN (${marks(batch.length)})`)
        .all(...batch) as Array<{ id: string; name: string | null; email: string | null }>,
    ).map((person) => [person.id, personDisplayName(person.name, person.email) || text(person.name)]),
  );
  const projects = new Map(
    inChunks([...projectIds], (batch) =>
      sqlite
        .prepare(
          `SELECT id,project_number,name FROM project WHERE id IN (${marks(batch.length)})`,
        )
        .all(...batch) as Array<{ id: string; project_number: string | null; name: string | null }>,
    ).map((project) => [
      project.id,
      [project.project_number, project.name].filter(Boolean).map(text).join(' · '),
    ]),
  );
  const projectNumbers = new Map(
    [...projects.entries()].map(([id, label]) => [id, label.split(' · ')[0] ?? label]),
  );
  const clients = new Map(
    inChunks([...clientIds], (batch) =>
      sqlite
        .prepare(`SELECT id,display_name FROM client WHERE id IN (${marks(batch.length)})`)
        .all(...batch) as Array<{ id: string; display_name: string | null }>,
    ).map((client) => [client.id, text(client.display_name)]),
  );

  const lookup = (key: string, value: string): string | undefined => {
    if (PERSON_KEYS.has(key)) return people.get(value) || undefined;
    if (PROJECT_KEYS.has(key)) return projects.get(value) || undefined;
    if (CLIENT_KEYS.has(key)) return clients.get(value) || undefined;
    return undefined;
  };
  const join = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(' · ');

  const out = new Map<string, AuditSubjectFields>();
  for (const row of rows) {
    const details = parsed.get(row.id);
    let display: Record<string, unknown> | null = details ? replaceIds(details, lookup) : null;
    let subject = '';
    switch (row.entity_type) {
      case 'user':
      case 'worker':
        subject = people.get(row.entity_id) ?? '';
        break;
      case 'project':
        subject = projects.get(row.entity_id) ?? '';
        break;
      case 'client':
        subject = clients.get(row.entity_id) ?? '';
        break;
      case 'project_member': {
        const member = members.get(row.entity_id);
        if (member)
          subject = join(people.get(member.user_id), projectNumbers.get(member.project_id));
        break;
      }
      case 'time_entry':
      case 'expense': {
        const record = records.get(row.entity_id);
        if (record)
          subject = join(people.get(record.worker_id), projectNumbers.get(record.project_id), record.day);
        break;
      }
      case 'invoice':
        subject = invoices.get(row.entity_id) ?? '';
        break;
      case 'compensation_rule': {
        const rule = rules.get(row.entity_id);
        if (!rule) break;
        subject = join(
          people.get(rule.worker_id),
          rule.project_id ? projectNumbers.get(rule.project_id) : undefined,
        );
        display = payRateDisplay(sqlite, row, details, display ?? {}, rule);
        break;
      }
      default:
        break;
    }
    out.set(row.id, {
      subject_label: subject,
      display_details: display ? JSON.stringify(display) : row.details_json,
    });
  }
  return out;
}

/**
 * Pay-rate events (compensation_rule.*): show the rate, currency and dates, and
 * the change as "old → new". A rule is effective-dated; its rate changes in
 * place only through "replace same day", which records before/after itself, so
 * the rate a create event wrote is the first replace's "before" (or the row).
 */
function payRateDisplay(
  sqlite: DatabaseSync,
  row: Row,
  details: Record<string, unknown> | null | undefined,
  recorded: Record<string, unknown>,
  rule: RuleRow,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...recorded, currency: recorded.currency ?? rule.currency };
  delete out.previousId;
  if (row.action === 'compensation_rule.replace_same_day') {
    const before = isRecord(details?.before) ? details.before : {};
    const after = isRecord(details?.after) ? details.after : {};
    out.before = { rateMinor: before.hourly ?? before.rateMinor, rateBasis: before.basis };
    out.after = { rateMinor: after.minor ?? after.rateMinor, rateBasis: after.basis };
    return out;
  }
  if (row.action === 'compensation_rule.deactivate') {
    out.rateMinor = rule.rate_minor;
    out.effectiveFrom = rule.effective_from;
    return out;
  }
  const firstReplace = sqlite
    .prepare(
      `SELECT details_json FROM audit_event
        WHERE entity_type='compensation_rule' AND entity_id=? AND action='compensation_rule.replace_same_day'
        ORDER BY occurred_at,id LIMIT 1`,
    )
    .get(rule.id) as { details_json: string } | undefined;
  const replacedBefore = firstReplace ? parse(firstReplace.details_json)?.before : undefined;
  const created = text(
    recorded.rateMinor ??
      (isRecord(replacedBefore) ? replacedBefore.hourly : undefined) ??
      rule.rate_minor,
  );
  const previousId = typeof details?.previousId === 'string' ? details.previousId : undefined;
  const previous = (
    previousId
      ? sqlite
          .prepare(
            'SELECT CAST(rate_minor AS TEXT) rate_minor,effective_from FROM compensation_rule WHERE id=?',
          )
          .get(previousId)
      : sqlite
          .prepare(
            `SELECT CAST(rate_minor AS TEXT) rate_minor,effective_from FROM compensation_rule
              WHERE worker_id=? AND project_id IS ? AND id<>? AND effective_from<? AND created_at<=?
              ORDER BY effective_from DESC,created_at DESC LIMIT 1`,
          )
          .get(rule.worker_id, rule.project_id, rule.id, rule.effective_from, rule.created_at)
  ) as { rate_minor: string; effective_from: string } | undefined;
  out.effectiveFrom = recorded.effectiveFrom ?? rule.effective_from;
  out.rateBasis = recorded.rateBasis ?? rule.rate_basis ?? undefined;
  if (previous && previous.rate_minor !== created) {
    out.before = { rateMinor: previous.rate_minor };
    out.after = { rateMinor: created };
    delete out.rateMinor;
  } else out.rateMinor = created;
  return out;
}
