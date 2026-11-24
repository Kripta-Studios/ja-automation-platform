import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortalRepository } from '../../packages/database/src/repository';
import { auditFilterFrom, auditTypeGroups } from '../../apps/portal/src/lib/server/audit-page';

const owner: Principal = {
  userId: 'owner',
  role: 'owner_admin',
  sessionId: 'owner-session',
  projectIds: new Set(),
};
const manager: Principal = { ...owner, userId: 'pm', role: 'project_manager', sessionId: 'pm-session' };
let sqlite: DatabaseSync;

beforeEach(() => {
  // Isolated contract rows only; never opens the application database.
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE user(id TEXT PRIMARY KEY,role TEXT,status TEXT,name TEXT);
    CREATE TABLE session(id TEXT,token TEXT,user_id TEXT,expires_at TEXT);
    CREATE TABLE supplier_user_profile(user_id TEXT,profile TEXT,supplier_id TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY,status TEXT,timezone TEXT,name TEXT,project_number TEXT,start_date TEXT,created_at TEXT);
    CREATE TABLE notification(id TEXT,user_id TEXT,kind TEXT,subject_id TEXT,read_at TEXT,created_at TEXT);
    CREATE TABLE audit_event(id TEXT,actor_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,occurred_at TEXT,details_json TEXT,actor_kind TEXT);
    CREATE TABLE time_entry(id TEXT,project_id TEXT,worker_id TEXT,work_date TEXT,activity_summary TEXT);
    CREATE TABLE expense(id TEXT,project_id TEXT,worker_id TEXT,spent_on TEXT,description TEXT);
    CREATE TABLE daily_report(id TEXT,project_id TEXT,worker_id TEXT,work_date TEXT,summary TEXT);
    CREATE TABLE technical_report(id TEXT,project_id TEXT,author_id TEXT,report_date TEXT,created_at TEXT,change_summary TEXT);
    CREATE TABLE technical_change(id TEXT,project_id TEXT,author_id TEXT,created_at TEXT,component TEXT);
    CREATE TABLE period_report(id TEXT,project_id TEXT,period_start TEXT,report_type TEXT);
    CREATE TABLE invoice(id TEXT,project_id TEXT,due_at TEXT,issued_at TEXT,created_at TEXT,invoice_number TEXT);
    CREATE TABLE billing_rule(id TEXT,project_id TEXT);
    CREATE TABLE billing_period(id TEXT,billing_rule_id TEXT,period_start TEXT,state TEXT);
    CREATE TABLE compensation_settlement(id TEXT,project_id TEXT,worker_id TEXT,period_start TEXT);
    INSERT INTO user VALUES('owner','owner_admin','active','Owner'),('pm','project_manager','active','PM');
    INSERT INTO session VALUES('owner-session','t','owner','2099-01-01T00:00:00Z'),('pm-session','t2','pm','2099-01-01T00:00:00Z');
  `);
  const notice = sqlite.prepare('INSERT INTO notification VALUES(?,?,?,?,?,?)');
  for (let index = 0; index < 30; index += 1)
    notice.run(
      `n${String(index).padStart(2, '0')}`,
      'owner',
      'period_ready',
      `s${index}`,
      index % 3 === 0 ? '2026-11-01T00:00:00Z' : null,
      `2026-11-${String(1 + (index % 28)).padStart(2, '0')}T08:00:00Z`,
    );
  notice.run('other', 'pm', 'period_ready', 'x', null, '2026-11-20T00:00:00Z');
  const audit = sqlite.prepare('INSERT INTO audit_event VALUES(?,?,?,?,?,?,?,?)');
  audit.run('a1', 'owner', 'invoice.issue', 'invoice', 'inv-1', '2026-11-10T10:00:00.000Z', '{"number":"SCL-2026-0007"}', 'user');
  audit.run('a2', 'pm', 'time.approve', 'time_entry', 'te-1', '2026-11-12T10:00:00.000Z', '{}', 'user');
  audit.run('a3', null, 'service_job.run', 'service_job', 'job-1', '2026-11-12T11:00:00.000Z', '{}', 'service');
  audit.run('a4', 'owner', 'time.approve', 'time_entry', 'te_2', '2026-10-01T10:00:00.000Z', '{"note":"100%"}', 'user');
});
afterEach(() => sqlite.close());

describe('notification inbox paging', () => {
  it('returns unread first, newest first, 25 per page with SQL counts for the own user only', () => {
    const repository = new PortalRepository(sqlite);
    const first = repository.listNotificationPage(owner, { page: 1, pageSize: 25 });
    expect(first).toMatchObject({ total: 30, all: 30, unread: 20, page: 1, pages: 2, pageSize: 25 });
    expect(first.rows).toHaveLength(25);
    const unreadFlags = first.rows.map((row) => row.read_at === null);
    expect(unreadFlags.slice(0, 20).every(Boolean)).toBe(true);
    expect(unreadFlags.slice(20).some(Boolean)).toBe(false);
    const second = repository.listNotificationPage(owner, { page: 9 });
    expect(second.page).toBe(2);
    expect(second.rows).toHaveLength(5);
    const unreadOnly = repository.listNotificationPage(owner, { unreadOnly: true });
    expect(unreadOnly.total).toBe(20);
    expect(unreadOnly.rows.every((row) => row.read_at === null)).toBe(true);
    expect([...first.rows, ...second.rows].some((row) => row.id === 'other')).toBe(false);
  });

  it('marks all of the signed-in person notifications read and nobody else', () => {
    const repository = new PortalRepository(sqlite);
    expect(repository.markAllNotificationsRead(owner)).toBe(20);
    expect(repository.listNotificationPage(owner).unread).toBe(0);
    expect(repository.listNotificationPage(manager).unread).toBe(1);
  });
});

describe('audit register filters', () => {
  it('filters by view, date range, actor, entity type and literal search', () => {
    const repository = new PortalRepository(sqlite);
    const count = (options: Parameters<PortalRepository['countAuditEvents']>[1]) =>
      repository.countAuditEvents(owner, options);
    expect(count({ view: 'all' })).toBe(4);
    expect(count({ view: 'business' })).toBe(3);
    expect(count({ view: 'service' })).toBe(1);
    expect(count({ view: 'all', from: '2026-11-01T00:00:00.000Z', to: '2026-11-13T00:00:00.000Z' })).toBe(3);
    expect(count({ view: 'all', actorId: 'pm' })).toBe(1);
    expect(count({ view: 'all', actorId: 'service' })).toBe(1);
    expect(count({ view: 'all', entityType: 'time_entry' })).toBe(2);
    // Z2: record kinds that read the same are filtered together.
    expect(count({ view: 'all', entityTypes: ['time_entry', 'invoice'] })).toBe(3);
    expect(count({ view: 'all', search: 'SCL-2026-0007' })).toBe(1);
    expect(count({ view: 'all', search: 'inv-1' })).toBe(1);
    // LIKE wildcards are literal: "_" and "%" do not match arbitrary characters.
    expect(count({ view: 'all', search: 'te_' })).toBe(1);
    expect(count({ view: 'all', search: '100%' })).toBe(1);
    const page = repository.listAuditEvents(owner, { view: 'all', limit: 2, offset: 1 });
    expect(page.map((row) => row.id)).toEqual(['a2', 'a1']);
  });

  it('offers one record-type choice per label (no duplicate "Issuing company")', () => {
    const groups = auditTypeGroups([
      'canonical_legal_entity',
      'client',
      'legal_entity',
      'project_legal_entity',
      'time_entry',
    ]);
    expect([...groups.keys()]).toEqual(['canonical_legal_entity', 'client', 'time_entry']);
    expect(groups.get('canonical_legal_entity')).toEqual([
      'canonical_legal_entity',
      'legal_entity',
      'project_legal_entity',
    ]);
  });

  it('lists audit entity types with an index skip-scan, not a full scan (T40)', () => {
    sqlite.exec('CREATE INDEX audit_entity_time_idx ON audit_event(entity_type, entity_id, occurred_at)');
    const repository = new PortalRepository(sqlite);
    expect(repository.listAuditEntityTypes(owner)).toEqual([
      'invoice',
      'service_job',
      'time_entry',
    ]);
    expect(() => repository.listAuditEntityTypes(manager)).toThrow('Audit access required');
    const source = readFileSync(resolve('packages/database/src/repository.ts'), 'utf8');
    const method = source.slice(source.indexOf('  listAuditEntityTypes('));
    const sql = method.slice(method.indexOf('`') + 1, method.indexOf('`', method.indexOf('`') + 1));
    const plan = (
      sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>
    ).map((row) => row.detail);
    expect(plan.some((detail) => /SEARCH a USING COVERING INDEX audit_entity_time_idx/u.test(detail))).toBe(true);
    expect(plan.some((detail) => /^SCAN audit_event/u.test(detail))).toBe(false);
  });

  it('reaches business events through the entity index, never a full scan (T40)', () => {
    sqlite.exec(`
      CREATE INDEX audit_entity_time_idx ON audit_event(entity_type, entity_id, occurred_at);
      CREATE INDEX audit_event_occurred_idx ON audit_event(occurred_at, id);
    `);
    sqlite
      .prepare('INSERT INTO audit_event VALUES(?,?,?,?,?,?,?,?)')
      .run('a5', null, 'service_job.succeed', 'job_run', 'run-1', '2026-11-12T12:00:00.000Z', '{"password":"x"}', 'service');
    const repository = new PortalRepository(sqlite);
    const business = repository.listAuditEvents(owner, { view: 'business', limit: 10 });
    expect(business.map((row) => row.id)).toEqual(['a2', 'a1', 'a4']);
    expect(repository.countAuditEvents(owner, { view: 'business' })).toBe(3);
    expect(repository.countAuditEvents(owner, { view: 'service' })).toBe(2);
    const plan = (
      sqlite
        .prepare(
          `EXPLAIN QUERY PLAN SELECT id FROM audit_event WHERE action NOT LIKE 'service_job.%' AND (entity_type<'job_run' OR entity_type>'job_run') ORDER BY +occurred_at DESC,id DESC LIMIT 25`,
        )
        .all() as Array<{ detail: string }>
    ).map((row) => row.detail);
    expect(plan.join(' / ')).toMatch(/audit_entity_time_idx/u);
    expect(plan.join(' / ')).not.toMatch(/SCAN audit_event/u);
  });

  it('keeps audit access to owner and auditor', () => {
    const repository = new PortalRepository(sqlite);
    expect(() => repository.countAuditEvents(manager, {})).toThrow('Audit access required');
    expect(() => repository.listAuditEvents(manager, {})).toThrow('Audit access required');
  });

  it('defaults to the last 7 days of business events and validates parameters', () => {
    const today = '2026-11-17';
    expect(auditFilterFrom(new URLSearchParams(), today)).toMatchObject({
      view: 'business',
      range: '7',
      from: '2026-11-11',
      to: '2026-11-17',
      page: 1,
    });
    expect(auditFilterFrom(new URLSearchParams('range=all&view=service'), today)).toMatchObject({
      view: 'service',
      range: 'all',
      from: '',
      to: '',
    });
    expect(
      auditFilterFrom(new URLSearchParams('from=2026-11-05&to=2026-11-01&actor=x%27--&type=a b'), today),
    ).toMatchObject({ range: 'custom', from: '2026-11-01', to: '2026-11-05', actor: '', type: '' });
  });
});
