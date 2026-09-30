import { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workerOperationalProjectScope } from '../../packages/database/src/core/project-access';
import { PortalRepository } from '../../packages/database/src/repository';
import { TechnicalChangeRepository } from '../../packages/database/src/domains/technical-changes/technical-change-repository';

const instant = new Date('2026-09-30T02:00:00Z');
const worker: Principal = {
  userId: 'worker',
  role: 'worker',
  sessionId: 'worker-session',
  projectIds: new Set(['assigned']),
};
let sqlite: DatabaseSync;

beforeEach(() => {
  // Only isolated SQL contract rows; never opens the application database.
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE user(id TEXT PRIMARY KEY,role TEXT,status TEXT);
    CREATE TABLE session(id TEXT,token TEXT,user_id TEXT,expires_at TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY,status TEXT,timezone TEXT);
    CREATE TABLE project_member(id TEXT,project_id TEXT,user_id TEXT,status TEXT,starts_on TEXT,ends_on TEXT);
    CREATE TABLE supplier_user_profile(user_id TEXT,profile TEXT,supplier_id TEXT);
    CREATE TABLE supplier(id TEXT,status TEXT);
    CREATE TABLE supplier_project_grant(id TEXT,supplier_id TEXT,coordinator_id TEXT,project_id TEXT,status TEXT,starts_on TEXT,ends_on TEXT);
    CREATE TABLE daily_report(id TEXT,project_id TEXT,worker_id TEXT,work_date TEXT,created_at TEXT);
    INSERT INTO user VALUES('worker','worker','active'),('other','worker','active');
    INSERT INTO session VALUES('worker-session','worker-token','worker','2027-01-01T00:00:00Z');
    INSERT INTO project VALUES('assigned','active','UTC'),('unassigned','active','UTC');
    INSERT INTO project_member VALUES('assignment','assigned','worker','active','2026-09-01','2026-10-31'),('other-assignment','unassigned','other','active','2026-09-01',NULL);
  `);
});
afterEach(() => {
  sqlite.close();
  vi.useRealTimers();
});

function visibleProjects(at = instant) {
  const scope = workerOperationalProjectScope(sqlite, worker, 'current', at);
  return sqlite
    .prepare(
      `${scope.withClause} SELECT p.id FROM project p WHERE ${scope.predicate} ORDER BY p.id`,
    )
    .all(...scope.parameters)
    .map((row) => row.id);
}

function visibleDaily() {
  const scope = workerOperationalProjectScope(sqlite, worker, 'daily', instant);
  return sqlite
    .prepare(
      `${scope.withClause}
      SELECT d.id FROM daily_report d JOIN project p ON p.id=d.project_id
      WHERE ${scope.predicate} AND d.worker_id=?
        AND EXISTS(SELECT 1 FROM project_member pm WHERE pm.project_id=d.project_id
          AND pm.user_id=d.worker_id AND pm.status='active'
          AND pm.starts_on<=d.work_date AND (pm.ends_on IS NULL OR pm.ends_on>=d.work_date))
      ORDER BY d.created_at DESC LIMIT 200`,
    )
    .all(...scope.parameters, worker.userId)
    .map((row) => row.id);
}

function coordinator() {
  sqlite.exec(`
    INSERT INTO supplier VALUES('supplier','active');
    INSERT INTO supplier_user_profile VALUES('worker','supplier_coordinator','supplier');
    INSERT INTO supplier_project_grant VALUES('grant','supplier','worker','assigned','active','2026-09-01','2026-10-31');
  `);
}

describe('current operational Worker project SQL predicate', () => {
  it('includes only active own membership and current operational projects', () => {
    expect(visibleProjects()).toEqual(['assigned']);
    sqlite.exec("UPDATE project_member SET status='removed' WHERE user_id='worker'");
    expect(visibleProjects()).toEqual([]);
  });

  it.each(['planned', 'paused'])('preserves current %s project access', (status) => {
    sqlite.prepare('UPDATE project SET status=? WHERE id=?').run(status, 'assigned');
    expect(visibleProjects()).toEqual(['assigned']);
  });

  it.each(['draft', 'closing', 'closed', 'archived'])(
    'excludes %s projects without changing history',
    (status) => {
      sqlite.prepare('UPDATE project SET status=? WHERE id=?').run(status, 'assigned');
      expect(visibleProjects()).toEqual([]);
      expect(sqlite.prepare('SELECT count(*) n FROM project_member').get()?.n).toBe(2);
    },
  );

  it('uses each project local date at exactly the provided instant, not UTC today', () => {
    sqlite.exec(
      "UPDATE project SET timezone='America/New_York' WHERE id='assigned'; UPDATE project_member SET starts_on='2026-09-30' WHERE user_id='worker'",
    );
    expect(visibleProjects()).toEqual([]);
    expect(visibleProjects(new Date('2026-09-30T05:00:00Z'))).toEqual(['assigned']);
    sqlite.exec(
      "UPDATE project_member SET starts_on='2026-09-01',ends_on='2026-09-29' WHERE user_id='worker'",
    );
    expect(visibleProjects()).toEqual(['assigned']);
    expect(visibleProjects(new Date('2026-09-30T05:00:00Z'))).toEqual([]);
  });

  it.each(['Invalid/Zone', ''])(
    'fails closed for invalid timezone %s without UTC fallback',
    (timezone) => {
      sqlite.prepare('UPDATE project SET timezone=? WHERE id=?').run(timezone, 'assigned');
      expect(visibleProjects()).toEqual([]);
    },
  );

  it('allows separate current/future assignments while retaining own record-day membership', () => {
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-09-30' WHERE user_id='worker'; INSERT INTO project_member VALUES('future','assigned','worker','active','2026-10-05','2026-10-31'); INSERT INTO daily_report VALUES('future-record','assigned','worker','2026-10-10','2026-09-30'),('gap-record','assigned','worker','2026-10-02','2026-09-30'),('other-record','assigned','other','2026-10-10','2026-09-30')",
    );
    expect(visibleDaily()).toEqual(['future-record']);
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'");
    expect(visibleDaily()).toEqual([]);
  });

  it('filters before LIMIT so newer unassigned rows cannot crowd out authorized results', () => {
    const insert = sqlite.prepare('INSERT INTO daily_report VALUES(?,?,?,?,?)');
    insert.run('authorized-record', 'assigned', 'worker', '2026-09-20', '2026-09-20');
    for (let i = 0; i < 205; i++)
      insert.run(`unassigned-${i}`, 'unassigned', 'worker', '2026-09-20', '2026-09-30');
    expect(visibleDaily()).toEqual(['authorized-record']);
  });

  it('requires active supplier and current grant even when ordinary membership remains', () => {
    coordinator();
    expect(visibleProjects()).toEqual(['assigned']);
    sqlite.exec("UPDATE supplier_project_grant SET status='revoked'");
    expect(visibleProjects()).toEqual([]);
    sqlite.exec(
      "UPDATE supplier_project_grant SET status='active'; UPDATE supplier SET status='inactive'",
    );
    expect(visibleProjects()).toEqual([]);
  });

  it('requires supplier grants on current and requested record days', () => {
    coordinator();
    sqlite.exec(
      "UPDATE supplier_project_grant SET starts_on='2026-09-25',ends_on='2026-10-05'; INSERT INTO daily_report VALUES('before-grant','assigned','worker','2026-09-20','2026-09-30'),('during-grant','assigned','worker','2026-09-30','2026-09-30'),('after-grant','assigned','worker','2026-10-10','2026-09-30')",
    );
    expect(visibleDaily()).toEqual(['during-grant']);
    sqlite.exec("UPDATE supplier_project_grant SET ends_on='2026-09-29'");
    expect(visibleDaily()).toEqual([]);
  });

  it('does not authorize a cached former coordinator after Owner revokes its sessions', () => {
    coordinator();
    sqlite.exec("DELETE FROM supplier_user_profile; DELETE FROM session WHERE user_id='worker'");
    expect(() => visibleProjects()).toThrow('Live authenticated session required');
    // Deliberate fresh standard-worker login restores ordinary membership scope.
    sqlite.exec(
      "INSERT INTO session VALUES('worker-session','new-token','worker','2027-01-01T00:00:00Z')",
    );
    expect(visibleProjects()).toEqual(['assigned']);
  });

  it('checks current account/role and session without trusting principal project IDs', () => {
    sqlite.exec("UPDATE user SET status='suspended' WHERE id='worker'");
    expect(() => visibleProjects()).toThrow('Active account required');
    sqlite.exec("UPDATE user SET status='active',role='project_manager' WHERE id='worker'");
    expect(() => visibleProjects()).toThrow('Active account required');
    sqlite.exec(
      "UPDATE user SET role='worker' WHERE id='worker'; UPDATE session SET expires_at='2026-09-29T00:00:00Z'",
    );
    expect(() => visibleProjects()).toThrow('Live authenticated session required');
  });
});

function consumerSchema() {
  vi.useFakeTimers();
  vi.setSystemTime(instant);
  sqlite.exec(`
    ALTER TABLE user ADD COLUMN name TEXT;
    UPDATE user SET name=id;
    ALTER TABLE project ADD COLUMN name TEXT;
    ALTER TABLE project ADD COLUMN project_number TEXT;
    ALTER TABLE project ADD COLUMN start_date TEXT;
    ALTER TABLE project ADD COLUMN created_at TEXT;
    UPDATE project SET name=id,project_number=id;
    CREATE TABLE planning_assignment(id TEXT,project_id TEXT,worker_id TEXT,starts_at TEXT,ends_at TEXT,
      planned_minutes INTEGER,status TEXT,site TEXT,required_skill TEXT,version INTEGER,
      created_at TEXT,updated_at TEXT,planned_cost_minor INTEGER,created_by TEXT);
    CREATE TABLE technical_change(id TEXT,project_id TEXT,technical_report_id TEXT,author_id TEXT,
      component TEXT,change_made TEXT,safety_impact INTEGER,production_impact TEXT,validation TEXT,
      validation_result TEXT,open_risk TEXT,rollback_information TEXT,approval_state TEXT,
      created_at TEXT,updated_at TEXT,version INTEGER);
    ALTER TABLE daily_report ADD COLUMN summary TEXT;
    CREATE TABLE notification(id TEXT,user_id TEXT,kind TEXT,subject_id TEXT,read_at TEXT,created_at TEXT);
    CREATE TABLE audit_event(id TEXT,actor_id TEXT,action TEXT,entity_id TEXT,details_json TEXT,occurred_at TEXT);
    CREATE TABLE time_entry(id TEXT,project_id TEXT,worker_id TEXT,work_date TEXT,activity_summary TEXT);
    CREATE TABLE expense(id TEXT,project_id TEXT,worker_id TEXT,spent_on TEXT,description TEXT);
    CREATE TABLE technical_report(id TEXT,project_id TEXT,author_id TEXT,report_date TEXT,created_at TEXT,change_summary TEXT);
    CREATE TABLE period_report(id TEXT,project_id TEXT,period_start TEXT,report_type TEXT);
    CREATE TABLE invoice(id TEXT,project_id TEXT,due_at TEXT,issued_at TEXT,created_at TEXT,invoice_number TEXT);
    CREATE TABLE billing_rule(id TEXT,project_id TEXT);
    CREATE TABLE billing_period(id TEXT,billing_rule_id TEXT,period_start TEXT,state TEXT);
    CREATE TABLE compensation_settlement(id TEXT,project_id TEXT,worker_id TEXT,period_start TEXT);
  `);
}

function plan(id = 'plan', project = 'assigned', person = 'worker', date = '2026-09-20') {
  sqlite
    .prepare(
      `INSERT INTO planning_assignment VALUES(?,?,?,?,?,60,'planned','site','skill',1,?,?,987654321,'private-author')`,
    )
    .run(id, project, person, `${date}T09:00:00Z`, `${date}T10:00:00Z`, date, date);
}

function technical(id = 'change', project = 'assigned', person = 'worker', created = '2026-09-20') {
  sqlite
    .prepare(
      `INSERT INTO technical_change(id,project_id,author_id,component,change_made,approval_state,created_at,version)
    VALUES(?,?,?,'component','operational change','draft',?,1)`,
    )
    .run(id, project, person, created);
}

function technicalRepository() {
  const noOp = () => {};
  return new TechnicalChangeRepository({
    sqlite,
    transaction: (work) => work(),
    audit: noOp,
    assertActive: noOp,
    assertWritable: noOp,
    assertProjectAccess: noOp,
    canReviewProject: () => true,
    newId: () => 'new-id',
    timestamp: () => instant.toISOString(),
    requireText: (value) => value,
    errors: {
      accessDenied: (message) => new Error(message),
      conflict: (message) => new Error(message),
      validation: (message) => new Error(message),
    },
  });
}

const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
const finance: Principal = { userId: 'finance', role: 'finance_admin', projectIds: new Set() };
const manager: Principal = {
  userId: 'manager',
  role: 'project_manager',
  projectIds: new Set(['assigned']),
};

describe('real Worker planning and technical-change list methods', () => {
  beforeEach(consumerSchema);

  it('omits private planning cost/creator metadata only from Worker DTOs', () => {
    sqlite.exec(
      "INSERT INTO user(id,role,status,name) VALUES('owner','owner_admin','active','Owner'),('finance','finance_admin','active','Finance')",
    );
    plan();
    const repository = new PortalRepository(sqlite);
    const rows = repository.listPlanning(worker);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'plan',
      planned_minutes: 60,
      site: 'site',
      required_skill: 'skill',
      version: 1,
    });
    expect(rows[0]).not.toHaveProperty('planned_cost_minor');
    expect(rows[0]).not.toHaveProperty('created_by');
    expect(JSON.stringify(rows)).not.toMatch(/987654321|private-author/);
    for (const principal of [owner, finance])
      expect(repository.listPlanning(principal)[0]).toMatchObject({
        planned_cost_minor: 987654321,
        created_by: 'private-author',
      });
  });

  it('excludes formerly assigned planning rows but preserves their stored history', () => {
    plan();
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'");
    expect(new PortalRepository(sqlite).listPlanning(worker)).toEqual([]);
    expect(sqlite.prepare('SELECT count(*) n FROM planning_assignment').get()?.n).toBe(1);
  });

  it('keeps PM project/status eligibility while omitting internal planning metadata', () => {
    sqlite.exec(
      "INSERT INTO user(id,role,status,name) VALUES('manager','project_manager','active','Manager')",
    );
    plan('published');
    plan('unpublished');
    plan('cancelled');
    plan('other-project', 'unassigned', 'other');
    sqlite.exec(
      "UPDATE planning_assignment SET status='published' WHERE id='published'; UPDATE planning_assignment SET status='cancelled' WHERE id='cancelled'",
    );
    const repository = new PortalRepository(sqlite);
    const rows = repository.listPlanning(manager);
    expect(rows.map((row) => row.id).sort()).toEqual(['published', 'unpublished']);
    for (const row of rows) {
      expect(row).toMatchObject({
        project_id: 'assigned',
        planned_minutes: 60,
        site: 'site',
        required_skill: 'skill',
        version: 1,
      });
      expect(row).not.toHaveProperty('planned_cost_minor');
      expect(row).not.toHaveProperty('created_by');
    }
    expect(JSON.stringify(rows)).not.toMatch(/987654321|private-author/);
    expect(repository.listPlanning({ ...manager, projectIds: new Set() })).toEqual([]);
    expect(sqlite.prepare('SELECT count(*) n FROM planning_assignment').get()?.n).toBe(4);
  });

  it('retains requested planning span and separate current/future assignments', () => {
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-09-30' WHERE id='assignment'; INSERT INTO project_member VALUES('future','assigned','worker','active','2026-10-05','2026-10-31')",
    );
    plan('future', 'assigned', 'worker', '2026-10-10');
    plan('gap', 'assigned', 'worker', '2026-10-02');
    plan('other', 'assigned', 'other');
    expect(new PortalRepository(sqlite).listPlanning(worker).map((row) => row.id)).toEqual([
      'future',
    ]);
  });

  it('uses local current dates in both real consumers and fails closed for invalid zones', () => {
    plan();
    technical();
    sqlite.exec(
      "UPDATE project SET timezone='America/New_York' WHERE id='assigned'; UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'",
    );
    expect(new PortalRepository(sqlite).listPlanning(worker)).toHaveLength(1);
    expect(technicalRepository().listTechnicalChanges(worker)).toHaveLength(1);
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    expect(new PortalRepository(sqlite).listPlanning(worker)).toEqual([]);
    expect(technicalRepository().listTechnicalChanges(worker)).toEqual([]);
    sqlite.exec("UPDATE project SET timezone='Invalid/Zone'");
    expect(technicalRepository().listTechnicalChanges(worker)).toEqual([]);
  });

  it('filters technical changes by current scope and author before LIMIT200', () => {
    technical('authorized');
    technical('other-author', 'assigned', 'other');
    for (let i = 0; i < 205; i++)
      technical(`unassigned-${i}`, 'unassigned', 'worker', '2026-09-30');
    expect(
      technicalRepository()
        .listTechnicalChanges(worker)
        .map((row) => row.id),
    ).toEqual(['authorized']);
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'");
    expect(technicalRepository().listTechnicalChanges(worker)).toEqual([]);
  });

  it.each(['closed', 'archived'])('excludes %s project records in both consumers', (status) => {
    plan();
    technical();
    sqlite.prepare('UPDATE project SET status=? WHERE id=?').run(status, 'assigned');
    expect(new PortalRepository(sqlite).listPlanning(worker)).toEqual([]);
    expect(technicalRepository().listTechnicalChanges(worker)).toEqual([]);
  });

  it('retains Admin and scoped PM technical-change reads and PM queue rules', () => {
    technical('own');
    technical('outside', 'unassigned');
    expect(technicalRepository().listTechnicalChanges(owner)).toHaveLength(2);
    expect(
      technicalRepository()
        .listTechnicalChanges(manager)
        .map((row) => row.id),
    ).toEqual(['own']);
    expect(technicalRepository().listTechnicalChanges(manager, true)).toEqual([]);
    expect(() => technicalRepository().listTechnicalChanges(worker, true)).toThrow(
      'Technical change review required',
    );
  });

  it('enforces live coordinator supplier grants and requested planning dates', () => {
    coordinator();
    plan('outside-grant', 'assigned', 'worker', '2026-09-20');
    technical();
    sqlite.exec("UPDATE supplier_project_grant SET starts_on='2026-09-25'");
    expect(new PortalRepository(sqlite).listPlanning(worker)).toEqual([]);
    expect(technicalRepository().listTechnicalChanges(worker)).toHaveLength(1);
    sqlite.exec("UPDATE supplier_project_grant SET status='revoked'");
    expect(technicalRepository().listTechnicalChanges(worker)).toEqual([]);
    sqlite.exec(
      "UPDATE supplier_project_grant SET status='active'; UPDATE supplier SET status='inactive'",
    );
    expect(technicalRepository().listTechnicalChanges(worker)).toEqual([]);
    sqlite.exec('DELETE FROM session');
    expect(() => technicalRepository().listTechnicalChanges(worker)).toThrow(
      'Live authenticated session required',
    );
  });
});

function reportNotice(kind = 'report_daily_updated', source = 'secret-report') {
  sqlite.exec(
    "INSERT INTO daily_report(id,project_id,worker_id,work_date,created_at,summary) VALUES('secret-report','assigned','worker','2026-09-20','2026-09-20','private report title'); INSERT INTO audit_event VALUES('audit','other','report.daily_update','secret-report','{\"changedFields\":[\"summary\"]}','2026-09-30')",
  );
  sqlite
    .prepare('INSERT INTO notification VALUES(?,?,?,?,NULL,?)')
    .run('notice', 'worker', kind, source, '2026-09-30');
}

const genericNotice = {
  id: 'notice',
  kind: 'workspace_activity',
  subject_id: null,
  read_at: null,
  created_at: '2026-09-30',
  source_id: null,
  target: null,
  title: 'J&A Automation notification',
  actor_name: null,
  changed_fields: [],
  project_id: null,
  project_number: null,
  project_name: null,
  record_date: null,
  record_title: null,
};

describe('real notification safe DTO authorization', () => {
  beforeEach(consumerSchema);

  it('retains authorized own record context and excludes other users notices', () => {
    reportNotice();
    sqlite.exec(
      "INSERT INTO notification VALUES('other-notice','other','report_daily_updated','secret-report',NULL,'2026-09-30')",
    );
    expect(new PortalRepository(sqlite).listNotifications(worker)).toEqual([
      expect.objectContaining({
        id: 'notice',
        subject_id: 'secret-report',
        project_id: 'assigned',
        record_title: 'private report title',
        changed_fields: ['summary'],
      }),
    ]);
  });

  it.each(['ended', 'closed', 'invalid-zone', 'other-owner', 'revoked-grant'])(
    'redacts the entire denied %s DTO without changing notification rows',
    (condition) => {
      reportNotice();
      if (condition === 'ended')
        sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'");
      if (condition === 'closed')
        sqlite.exec("UPDATE project SET status='closed' WHERE id='assigned'");
      if (condition === 'invalid-zone')
        sqlite.exec("UPDATE project SET timezone='Invalid/Zone' WHERE id='assigned'");
      if (condition === 'other-owner') sqlite.exec("UPDATE daily_report SET worker_id='other'");
      if (condition === 'revoked-grant') {
        coordinator();
        sqlite.exec("UPDATE supplier_project_grant SET status='revoked'");
      }
      const rows = new PortalRepository(sqlite).listNotifications(worker);
      expect(rows).toEqual([genericNotice]);
      expect(JSON.stringify(rows)).not.toMatch(
        /secret-report|assigned|report_daily_updated|private report title|summary|other/,
      );
      expect(sqlite.prepare('SELECT subject_id,kind FROM notification').get()).toMatchObject({
        subject_id: 'secret-report',
        kind: 'report_daily_updated',
      });
    },
  );

  it('redacts unresolved sources including raw kind and identifiers for privileged roles', () => {
    reportNotice('report_unrecognized_internal_state', 'missing-secret-id');
    expect(new PortalRepository(sqlite).listNotifications(worker)).toEqual([genericNotice]);
    sqlite.exec(
      "INSERT INTO user(id,role,status) VALUES('owner','owner_admin','active'); UPDATE notification SET user_id='owner'",
    );
    expect(new PortalRepository(sqlite).listNotifications(owner)).toEqual([genericNotice]);
  });

  it('preserves privileged authorized source history after project closure', () => {
    reportNotice();
    sqlite.exec(
      "INSERT INTO user(id,role,status) VALUES('owner','owner_admin','active'); UPDATE notification SET user_id='owner'; UPDATE project SET status='closed'",
    );
    expect(new PortalRepository(sqlite).listNotifications(owner)[0]).toMatchObject({
      subject_id: 'secret-report',
      project_id: 'assigned',
    });
  });

  it('requires supplier current and source-day grants independently', () => {
    reportNotice();
    coordinator();
    expect(new PortalRepository(sqlite).listNotifications(worker)[0]).toHaveProperty(
      'source_id',
      'secret-report',
    );
    sqlite.exec("UPDATE supplier_project_grant SET starts_on='2026-09-25'");
    expect(new PortalRepository(sqlite).listNotifications(worker)).toEqual([genericNotice]);
  });

  it('uses project-local current dates for project notices and source dates for record notices', () => {
    reportNotice();
    sqlite.exec(
      "UPDATE project SET timezone='America/New_York' WHERE id='assigned'; UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'",
    );
    expect(new PortalRepository(sqlite).listNotifications(worker)[0]).toHaveProperty(
      'source_id',
      'secret-report',
    );
    sqlite.exec("UPDATE notification SET kind='assignment_published',subject_id='assigned'");
    expect(new PortalRepository(sqlite).listNotifications(worker)[0]).toHaveProperty(
      'source_id',
      'assigned',
    );
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    expect(new PortalRepository(sqlite).listNotifications(worker)).toEqual([genericNotice]);
  });

  it('keeps record-day eligibility with separate future membership and denies gaps', () => {
    reportNotice();
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-09-30' WHERE id='assignment'; INSERT INTO project_member VALUES('future','assigned','worker','active','2026-10-05','2026-10-31'); UPDATE daily_report SET work_date='2026-10-10'",
    );
    expect(new PortalRepository(sqlite).listNotifications(worker)[0]).toHaveProperty(
      'source_id',
      'secret-report',
    );
    sqlite.exec("UPDATE daily_report SET work_date='2026-10-02'");
    expect(new PortalRepository(sqlite).listNotifications(worker)).toEqual([genericNotice]);
  });

  it('blocks finance-only event details for Worker even with current project membership', () => {
    reportNotice('invoice_overdue', 'invoice:private-invoice:overdue:v1');
    sqlite.exec(
      "INSERT INTO invoice VALUES('private-invoice','assigned','2026-09-20',NULL,'2026-09-20','private-invoice-number')",
    );
    expect(new PortalRepository(sqlite).listNotifications(worker)).toEqual([genericNotice]);
  });
});

function ownReportsSchema() {
  consumerSchema();
  sqlite.exec(`
    ALTER TABLE user ADD COLUMN email TEXT;
    ALTER TABLE project ADD COLUMN client_id TEXT;
    CREATE TABLE client(id TEXT,display_name TEXT);
    INSERT INTO client VALUES('client','Operational client');
    UPDATE project SET client_id='client';
    ALTER TABLE audit_event ADD COLUMN entity_type TEXT;
    ALTER TABLE daily_report ADD COLUMN approval_state TEXT;
    ALTER TABLE daily_report ADD COLUMN version INTEGER;
    ALTER TABLE daily_report ADD COLUMN safety_related INTEGER;
    ALTER TABLE daily_report ADD COLUMN reviewed_by TEXT;
    ALTER TABLE technical_report ADD COLUMN system_name TEXT;
    ALTER TABLE technical_report ADD COLUMN approval_state TEXT;
    ALTER TABLE technical_report ADD COLUMN version INTEGER;
    ALTER TABLE technical_report ADD COLUMN safety_related INTEGER;
    ALTER TABLE technical_report ADD COLUMN reviewed_by TEXT;
  `);
}

function reports(suffix = '', person = 'worker', date = '2026-09-20', project = 'assigned') {
  sqlite
    .prepare(
      `INSERT INTO daily_report(id,project_id,worker_id,work_date,summary,approval_state,version)
    VALUES(?,?,?,?,?,'draft',1)`,
    )
    .run(`daily${suffix}`, project, person, date, `Daily ${suffix}`);
  sqlite
    .prepare(
      `INSERT INTO technical_report(id,project_id,author_id,report_date,system_name,approval_state,version)
    VALUES(?,?,?,?,?,'draft',1)`,
    )
    .run(`technical${suffix}`, project, person, date, `Technical ${suffix}`);
}

describe('real own report list current Worker project scope', () => {
  beforeEach(ownReportsSchema);

  it('retains own authorized operational report projection and excludes other authors', () => {
    reports();
    reports('-other', 'other');
    const rows = new PortalRepository(sqlite).listOwnReports(worker);
    expect(rows.map((row) => row.id).sort()).toEqual(['daily', 'technical']);
    expect(rows[0]).toMatchObject({
      project_id: 'assigned',
      worker_id: 'worker',
      approval_state: 'draft',
      version: 1,
      client_name: 'Operational client',
    });
    expect(rows[0]).not.toHaveProperty('summary');
    expect(rows[0]).not.toHaveProperty('change_summary');
  });

  it.each(['closed', 'archived', 'draft'])(
    'excludes %s current project reports without changing stored history',
    (status) => {
      reports();
      sqlite.prepare('UPDATE project SET status=? WHERE id=?').run(status, 'assigned');
      expect(new PortalRepository(sqlite).listOwnReports(worker)).toEqual([]);
      expect(
        sqlite.prepare('SELECT id,version,approval_state FROM daily_report').get(),
      ).toMatchObject({ id: 'daily', version: 1, approval_state: 'draft' });
      expect(
        sqlite.prepare('SELECT id,version,approval_state FROM technical_report').get(),
      ).toMatchObject({ id: 'technical', version: 1, approval_state: 'draft' });
    },
  );

  it('excludes past report rows when current assignment ends even though record dates remain covered', () => {
    reports();
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'");
    expect(new PortalRepository(sqlite).listOwnReports(worker)).toEqual([]);
  });

  it('preserves separate current and future assignments and record-day coverage', () => {
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-09-30' WHERE id='assignment'; INSERT INTO project_member VALUES('future','assigned','worker','active','2026-10-05','2026-10-31')",
    );
    reports('-future', 'worker', '2026-10-10');
    reports('-gap', 'worker', '2026-10-02');
    expect(
      new PortalRepository(sqlite)
        .listOwnReports(worker)
        .map((row) => row.id)
        .sort(),
    ).toEqual(['daily-future', 'technical-future']);
  });

  it('uses project local today consistently for both report types and fails closed on invalid timezone', () => {
    reports();
    sqlite.exec(
      "UPDATE project SET timezone='America/New_York' WHERE id='assigned'; UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'",
    );
    expect(new PortalRepository(sqlite).listOwnReports(worker)).toHaveLength(2);
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    expect(new PortalRepository(sqlite).listOwnReports(worker)).toEqual([]);
    sqlite.exec("UPDATE project SET timezone='Invalid/Zone'");
    expect(new PortalRepository(sqlite).listOwnReports(worker)).toEqual([]);
  });

  it('requires coordinator grant today and on each report date, retaining authorized separate membership periods', () => {
    coordinator();
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-09-30' WHERE id='assignment'; INSERT INTO project_member VALUES('future','assigned','worker','active','2026-10-05','2026-10-31'); UPDATE supplier_project_grant SET ends_on='2026-10-05'",
    );
    reports();
    reports('-future', 'worker', '2026-10-10');
    expect(
      new PortalRepository(sqlite)
        .listOwnReports(worker)
        .map((row) => row.id)
        .sort(),
    ).toEqual(['daily', 'technical']);
    sqlite.exec("UPDATE supplier_project_grant SET ends_on='2026-09-29'");
    expect(new PortalRepository(sqlite).listOwnReports(worker)).toEqual([]);
  });

  it('preserves Owner, Finance and Auditor historical reports and the original scoped PM branch', () => {
    sqlite.exec(
      "INSERT INTO user(id,role,status) VALUES('owner','owner_admin','active'),('finance','finance_admin','active'),('auditor','auditor_read_only','active'),('manager','project_manager','active'); INSERT INTO project_member VALUES('pm','assigned','manager','active','2026-09-01','2026-10-31')",
    );
    reports();
    reports('-other-project', 'worker', '2026-09-20', 'unassigned');
    sqlite.exec("UPDATE project SET status='closed' WHERE id='assigned'");
    const repository = new PortalRepository(sqlite);
    for (const principal of [
      owner,
      finance,
      {
        userId: 'auditor',
        role: 'auditor_read_only',
        projectIds: new Set<string>(),
      } satisfies Principal,
    ])
      expect(repository.listOwnReports(principal)).toHaveLength(4);
    expect(
      repository
        .listOwnReports(manager)
        .map((row) => row.id)
        .sort(),
    ).toEqual(['daily', 'technical']);
  });

  it('denies a stale Worker session instead of reusing historical principal grants', () => {
    reports();
    sqlite.exec('DELETE FROM session');
    expect(() => new PortalRepository(sqlite).listOwnReports(worker)).toThrow(
      'Live authenticated session required',
    );
  });
});

describe('Worker report detail and assigned-project list authorization coherence', () => {
  beforeEach(() => {
    ownReportsSchema();
    sqlite.exec(`
      ALTER TABLE project ADD COLUMN site_name TEXT;
      ALTER TABLE project ADD COLUMN currency TEXT;
      ALTER TABLE project ADD COLUMN planned_end_date TEXT;
      ALTER TABLE project ADD COLUMN actual_end_date TEXT;
      ALTER TABLE project ADD COLUMN version INTEGER;
      ALTER TABLE period_report ADD COLUMN state TEXT;
      CREATE TABLE report_source(report_id TEXT,source_type TEXT,source_id TEXT);
      CREATE TABLE approval_event(entity_type TEXT,entity_id TEXT);
      CREATE TABLE record_correction_link(record_type TEXT,original_id TEXT,correction_id TEXT);
      UPDATE project SET currency='USD',version=1;
    `);
    reports();
  });

  it('opens both listed report types at project-local Sep29 despite UTC Sep30 and stale cached project IDs', () => {
    sqlite.exec(
      "UPDATE project SET timezone='America/New_York' WHERE id='assigned'; UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'",
    );
    const stalePrincipal = { ...worker, projectIds: new Set<string>() };
    const repository = new PortalRepository(sqlite);
    expect(repository.listOwnReports(stalePrincipal)).toHaveLength(2);
    expect(repository.listAssignedProjects(stalePrincipal).map((row) => row.id)).toEqual([
      'assigned',
    ]);
    for (const id of ['daily', 'technical'])
      expect(repository.reportDetail(stalePrincipal, id)).toMatchObject({
        report: { id, version: 1 },
        canEdit: true,
      });
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    expect(repository.listOwnReports(stalePrincipal)).toEqual([]);
    expect(repository.listAssignedProjects(stalePrincipal)).toEqual([]);
    for (const id of ['daily', 'technical'])
      expect(() => repository.reportDetail(stalePrincipal, id)).toThrow('Report access required');
  });

  it.each(['closed', 'Invalid/Zone'])(
    'keeps list, options and direct access closed for %s project',
    (value) => {
      sqlite
        .prepare(`UPDATE project SET ${value === 'closed' ? 'status' : 'timezone'}=? WHERE id=?`)
        .run(value, 'assigned');
      const repository = new PortalRepository(sqlite);
      expect(repository.listOwnReports(worker)).toEqual([]);
      expect(repository.listAssignedProjects(worker)).toEqual([]);
      expect(() => repository.reportDetail(worker, 'daily')).toThrow('Report access required');
      expect(() => repository.reportDetail(worker, 'technical')).toThrow('Report access required');
      expect(sqlite.prepare('SELECT count(*) n FROM daily_report').get()?.n).toBe(1);
    },
  );

  it('allows future record membership separate from current membership and denies the uncovered gap', () => {
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-09-30' WHERE id='assignment'; INSERT INTO project_member VALUES('future','assigned','worker','active','2026-10-05','2026-10-31'); UPDATE daily_report SET work_date='2026-10-10'; UPDATE technical_report SET report_date='2026-10-10'",
    );
    const repository = new PortalRepository(sqlite);
    expect(repository.listOwnReports(worker)).toHaveLength(2);
    expect(repository.reportDetail(worker, 'daily')).toHaveProperty('canEdit', true);
    expect(repository.reportDetail(worker, 'technical')).toHaveProperty('canEdit', true);
    sqlite.exec(
      "UPDATE daily_report SET work_date='2026-10-02'; UPDATE technical_report SET report_date='2026-10-02'",
    );
    expect(repository.listOwnReports(worker)).toEqual([]);
    expect(() => repository.reportDetail(worker, 'daily')).toThrow('Report access required');
  });

  it('retains current-plus-record supplier grant requirements at the local-day boundary', () => {
    coordinator();
    sqlite.exec(
      "UPDATE project SET timezone='America/New_York' WHERE id='assigned'; UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'; UPDATE supplier_project_grant SET ends_on='2026-09-29'",
    );
    const repository = new PortalRepository(sqlite);
    expect(repository.listAssignedProjects(worker)).toHaveLength(1);
    expect(repository.reportDetail(worker, 'daily')).toHaveProperty('canEdit', true);
    sqlite.exec("UPDATE supplier_project_grant SET starts_on='2026-09-25'");
    expect(repository.listAssignedProjects(worker)).toHaveLength(1);
    expect(() => repository.reportDetail(worker, 'daily')).toThrow('Report access required');
    sqlite.exec("UPDATE supplier_project_grant SET status='revoked'");
    expect(repository.listAssignedProjects(worker)).toEqual([]);
    expect(() => repository.reportDetail(worker, 'technical')).toThrow('Report access required');
  });

  it('keeps report ownership separate from project membership and rejects stale sessions', () => {
    const repository = new PortalRepository(sqlite);
    sqlite.exec("UPDATE daily_report SET worker_id='other'");
    expect(() => repository.reportDetail(worker, 'daily')).toThrow('Report access required');
    sqlite.exec('DELETE FROM session');
    expect(repository.listAssignedProjects(worker)).toEqual([]);
    expect(() => repository.reportDetail(worker, 'technical')).toThrow('Report access required');
  });

  it('preserves privileged detail reads and PM prior assignment checks', () => {
    sqlite.exec(
      "INSERT INTO user(id,role,status) VALUES('owner','owner_admin','active'),('finance','finance_admin','active'),('manager','project_manager','active'); INSERT INTO project_member VALUES('pm','assigned','manager','active','2026-09-01','2026-10-31')",
    );
    const repository = new PortalRepository(sqlite);
    expect(repository.reportDetail(manager, 'daily')).toHaveProperty('canEdit', true);
    sqlite.exec("UPDATE project SET status='closed' WHERE id='assigned'");
    for (const principal of [owner, finance])
      expect(repository.reportDetail(principal, 'daily')).toHaveProperty('report.id', 'daily');
    expect(() => repository.reportDetail(manager, 'daily')).toThrow('Report access required');
  });

  it('constructs a live Worker principal with local project IDs for schedule, report and option reads', () => {
    sqlite.exec(`
      CREATE TABLE schedule(id TEXT,project_id TEXT,timezone TEXT,monday_minutes INTEGER,
        tuesday_minutes INTEGER,wednesday_minutes INTEGER,thursday_minutes INTEGER,
        friday_minutes INTEGER,saturday_minutes INTEGER,sunday_minutes INTEGER,
        effective_from TEXT,effective_to TEXT,version INTEGER);
      INSERT INTO schedule VALUES('schedule','assigned','America/New_York',480,480,480,480,480,0,0,'2026-09-01',NULL,1);
      UPDATE project SET timezone='America/New_York' WHERE id='assigned';
      UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment';
    `);
    const repository = new PortalRepository(sqlite);
    const principal = repository.principalFor('worker', 'worker-session', 'request-correlation');
    expect([...principal.projectIds]).toEqual(['assigned']);
    expect(principal.correlationId).toBe('request-correlation');
    expect(repository.listProjectSchedule(principal, 'assigned')).toHaveProperty('id', 'schedule');
    expect(repository.reportDetail(principal, 'daily')).toHaveProperty('report.id', 'daily');
    expect(repository.listAssignedProjects(principal).map((row) => row.id)).toEqual(['assigned']);
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    const expiredAssignment = repository.principalFor('worker', 'worker-session');
    expect([...expiredAssignment.projectIds]).toEqual([]);
    expect(() => repository.listProjectSchedule(expiredAssignment, 'assigned')).toThrow(
      'Project assignment access required',
    );
    expect(() => repository.reportDetail(expiredAssignment, 'daily')).toThrow(
      'Report access required',
    );
    expect(repository.listAssignedProjects(expiredAssignment)).toEqual([]);
  });

  it('does not construct access after the local date ends in Kiritimati, though UTC still covers membership', () => {
    vi.setSystemTime(new Date('2026-09-30T15:00:00Z'));
    sqlite.exec(
      "UPDATE project SET timezone='Pacific/Kiritimati' WHERE id='assigned'; UPDATE project_member SET ends_on='2026-09-30' WHERE id='assignment'",
    );
    const repository = new PortalRepository(sqlite);
    const principal = repository.principalFor('worker', 'worker-session');
    expect([...principal.projectIds]).toEqual([]);
    expect(repository.listAssignedProjects(principal)).toEqual([]);
    expect(() => repository.reportDetail(principal, 'technical')).toThrow('Report access required');
  });

  it('rejects expired or empty provided Worker sessions while preserving legacy no-session and non-Worker construction', () => {
    const repository = new PortalRepository(sqlite);
    sqlite.exec(
      "UPDATE session SET expires_at='2026-09-29T00:00:00Z'; INSERT INTO user(id,role,status) VALUES('manager','project_manager','active'); INSERT INTO project_member VALUES('pm','assigned','manager','active','2026-09-01','2026-10-31')",
    );
    expect(() => repository.principalFor('worker', 'worker-session')).toThrow(
      'Live authenticated session required',
    );
    expect(() => repository.principalFor('worker', '')).toThrow(
      'Live authenticated session required',
    );
    expect([...repository.principalFor('worker').projectIds]).toEqual(['assigned']);
    expect([...repository.principalFor('manager', 'legacy-pm-session').projectIds]).toEqual([
      'assigned',
    ]);
  });
});

function timeExpenseSchema() {
  ownReportsSchema();
  sqlite.exec(`
    CREATE TABLE crew_expense_recorder(expense_id TEXT,recorded_by_user_id TEXT,grant_id TEXT);
    CREATE TABLE crew_shared_expense_allocation_group(expense_id TEXT,completed INTEGER);
    CREATE TABLE record_correction_link(record_type TEXT,original_id TEXT,correction_id TEXT);
    ALTER TABLE time_entry ADD COLUMN category TEXT;
    ALTER TABLE time_entry ADD COLUMN activity_code TEXT;
    ALTER TABLE time_entry ADD COLUMN minutes INTEGER;
    ALTER TABLE time_entry ADD COLUMN start_time TEXT;
    ALTER TABLE time_entry ADD COLUMN end_time TEXT;
    ALTER TABLE time_entry ADD COLUMN break_minutes INTEGER;
    ALTER TABLE time_entry ADD COLUMN approval_state TEXT;
    ALTER TABLE time_entry ADD COLUMN billability_state TEXT;
    ALTER TABLE time_entry ADD COLUMN created_at TEXT;
    ALTER TABLE time_entry ADD COLUMN version INTEGER;
    ALTER TABLE time_entry ADD COLUMN invoice_id TEXT;
    ALTER TABLE expense ADD COLUMN occurred_time_local TEXT;
    ALTER TABLE expense ADD COLUMN time_entry_id TEXT;
    ALTER TABLE expense ADD COLUMN vendor TEXT;
    ALTER TABLE expense ADD COLUMN category TEXT;
    ALTER TABLE expense ADD COLUMN amount_minor INTEGER;
    ALTER TABLE expense ADD COLUMN currency TEXT;
    ALTER TABLE expense ADD COLUMN payment_method TEXT;
    ALTER TABLE expense ADD COLUMN approval_state TEXT;
    ALTER TABLE expense ADD COLUMN who_paid TEXT;
    ALTER TABLE expense ADD COLUMN receipt_document_id TEXT;
    ALTER TABLE expense ADD COLUMN receipt_required INTEGER;
    ALTER TABLE expense ADD COLUMN reimbursement_state TEXT;
    ALTER TABLE expense ADD COLUMN reimbursement_amount_minor INTEGER;
    ALTER TABLE expense ADD COLUMN expected_reimbursement_on TEXT;
    ALTER TABLE expense ADD COLUMN reimbursed_at TEXT;
    ALTER TABLE expense ADD COLUMN reimbursement_reference TEXT;
    ALTER TABLE expense ADD COLUMN version INTEGER;
    ALTER TABLE expense ADD COLUMN invoice_id TEXT;
    ALTER TABLE expense ADD COLUMN billing_lock_id TEXT;
    ALTER TABLE expense ADD COLUMN billing_state TEXT;
    ALTER TABLE expense ADD COLUMN created_at TEXT;
    ALTER TABLE expense ADD COLUMN billing_amount_minor INTEGER;
  `);
}

function operationalEntries(suffix = '', person = 'worker', date = '2026-09-20') {
  sqlite
    .prepare(
      `INSERT INTO time_entry(id,project_id,worker_id,work_date,activity_summary,minutes,approval_state,version)
    VALUES(?,'assigned',?,?, 'operational time',60,'draft',1)`,
    )
    .run(`time${suffix}`, person, date);
  sqlite
    .prepare(
      `INSERT INTO expense(id,project_id,worker_id,spent_on,description,amount_minor,currency,approval_state,version,billing_amount_minor)
    VALUES(?,'assigned',?,?,'operational expense',125,'USD','draft',1,987654321)`,
    )
    .run(`expense${suffix}`, person, date);
}

function projectOverviewSchema() {
  timeExpenseSchema();
  const additions: Record<string, readonly string[]> = {
    project: [
      'cost_center_code',
      'description',
      'project_alias',
      'currency',
      'site_name',
      'country',
      'project_manager_id',
      'expected_minutes_per_day',
      'planned_end_date',
      'actual_end_date',
      'weekly_close_enabled',
      'daily_report_required',
      'technical_reporting_required',
      'notes',
      'version',
      'updated_at',
    ],
    client: ['client_number'],
    project_member: ['assignment_role', 'planned_minutes'],
    expense: [
      'project_currency_amount_minor',
      'client_treatment',
      'billing_treatment',
      'markup_bps',
      'finance_approved_by',
      'finance_approved_at',
    ],
  };
  for (const [table, columns] of Object.entries(additions)) {
    const existing = new Set(
      sqlite
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => row.name),
    );
    for (const column of columns)
      if (!existing.has(column)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
  }
  sqlite.exec(`
    CREATE TABLE project_milestone(id TEXT,name TEXT,description TEXT,amount_minor INTEGER,currency TEXT,
      due_on TEXT,approval_state TEXT,invoice_id TEXT,version INTEGER,project_id TEXT);
    CREATE TABLE schedule(id TEXT,project_id TEXT,timezone TEXT,monday_minutes INTEGER,tuesday_minutes INTEGER,
      wednesday_minutes INTEGER,thursday_minutes INTEGER,friday_minutes INTEGER,saturday_minutes INTEGER,
      sunday_minutes INTEGER,effective_from TEXT,effective_to TEXT,version INTEGER);
    INSERT INTO user(id,role,status,name) VALUES('owner','owner_admin','active','Owner'),
      ('finance','finance_admin','active','Finance'),('manager','project_manager','active','Manager'),
      ('auditor','auditor_read_only','active','Auditor');
    INSERT INTO project_member(id,project_id,user_id,status,starts_on,ends_on)
      VALUES('manager-assignment','assigned','manager','active','2026-09-01','2026-10-31');
  `);
}

function overviewPlanning(principal: Principal = worker) {
  return new PortalRepository(sqlite).projectOverview(principal, 'assigned', {
    includeFinance: false,
  }).planning;
}

describe('real project overview planning scope and operational DTO privacy', () => {
  beforeEach(projectOverviewSchema);

  it('omits internal cost and creator from Worker and PM while preserving finance-role metadata', () => {
    plan();
    sqlite.exec("UPDATE planning_assignment SET status='published'");
    for (const principal of [worker, manager]) {
      const rows = overviewPlanning(principal);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'plan',
        status: 'published',
        planned_minutes: 60,
        version: 1,
        worker_name: 'worker',
      });
      expect(rows[0]).not.toHaveProperty('planned_cost_minor');
      expect(rows[0]).not.toHaveProperty('created_by');
      expect(JSON.stringify(rows)).not.toMatch(/987654321|private-author/);
    }
    const auditor: Principal = {
      userId: 'auditor',
      role: 'auditor_read_only',
      projectIds: new Set(),
    };
    for (const principal of [owner, finance, auditor])
      expect(overviewPlanning(principal)[0]).toMatchObject({
        planned_cost_minor: 987654321,
        created_by: 'private-author',
      });
    expect(
      sqlite.prepare('SELECT planned_cost_minor,created_by FROM planning_assignment').get(),
    ).toMatchObject({ planned_cost_minor: 987654321, created_by: 'private-author' });
  });

  it('shows Worker only own published rows and retains PM noncancelled row eligibility', () => {
    plan('published');
    plan('unpublished');
    plan('cancelled');
    plan('other-owner', 'assigned', 'other');
    sqlite.exec(
      "UPDATE planning_assignment SET status='published' WHERE id IN ('published','other-owner'); UPDATE planning_assignment SET status='cancelled' WHERE id='cancelled'",
    );
    expect(overviewPlanning().map((row) => row.id)).toEqual(['published']);
    expect(
      overviewPlanning(manager)
        .map((row) => row.id)
        .sort(),
    ).toEqual(['other-owner', 'published', 'unpublished']);
  });

  it('requires a membership spanning the whole planning occurrence independently of current membership', () => {
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-09-30' WHERE id='assignment'; INSERT INTO project_member(id,project_id,user_id,status,starts_on,ends_on) VALUES('future','assigned','worker','active','2026-10-05','2026-10-31')",
    );
    plan('future', 'assigned', 'worker', '2026-10-10');
    plan('gap', 'assigned', 'worker', '2026-10-02');
    plan('cross-gap', 'assigned', 'worker', '2026-09-30');
    sqlite.exec(
      "UPDATE planning_assignment SET status='published'; UPDATE planning_assignment SET ends_at='2026-10-05T10:00:00Z' WHERE id='cross-gap'",
    );
    expect(overviewPlanning().map((row) => row.id)).toEqual(['future']);
    expect(sqlite.prepare('SELECT count(*) n FROM planning_assignment').get()?.n).toBe(3);
  });

  it('uses project-local current dates and retains occurrence history at the NY midnight boundary', () => {
    plan();
    sqlite.exec(
      "UPDATE planning_assignment SET status='published'; UPDATE project SET timezone='America/New_York' WHERE id='assigned'; UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'",
    );
    expect(overviewPlanning()).toHaveLength(1);
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    expect(() => overviewPlanning()).toThrow('Project assignment access required');
    expect(overviewPlanning(finance)).toHaveLength(1);
  });

  it.each(['closed', 'expired', 'invalid-timezone', 'revoked-session'])(
    'denies Worker overview for %s without deleting planning history',
    (condition) => {
      plan();
      sqlite.exec("UPDATE planning_assignment SET status='published'");
      if (condition === 'closed')
        sqlite.exec("UPDATE project SET status='closed' WHERE id='assigned'");
      if (condition === 'expired')
        sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'");
      if (condition === 'invalid-timezone')
        sqlite.exec("UPDATE project SET timezone='Invalid/Zone' WHERE id='assigned'");
      if (condition === 'revoked-session') sqlite.exec('DELETE FROM session');
      expect(() => overviewPlanning()).toThrow('Project assignment access required');
      expect(sqlite.prepare('SELECT count(*) n FROM planning_assignment').get()?.n).toBe(1);
    },
  );

  it('requires live supplier authority on current and planning occurrence dates', () => {
    coordinator();
    plan('authorized');
    plan('outside-grant', 'assigned', 'worker', '2026-10-10');
    sqlite.exec(
      "UPDATE planning_assignment SET status='published'; UPDATE supplier_project_grant SET ends_on='2026-09-30'",
    );
    expect(overviewPlanning().map((row) => row.id)).toEqual(['authorized']);
    sqlite.exec("UPDATE supplier_project_grant SET status='revoked'");
    expect(() => overviewPlanning()).toThrow('Project assignment access required');
  });
});

describe('Worker Time and Expense scope queries use current project-local authorization', () => {
  beforeEach(timeExpenseSchema);

  it('retains own requested-date entries at the local-day boundary and excludes other owners', () => {
    operationalEntries();
    operationalEntries('-other', 'other');
    sqlite.exec(
      "UPDATE project SET timezone='America/New_York' WHERE id='assigned'; UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'",
    );
    const repository = new PortalRepository(sqlite);
    expect(repository.listTimeForScope(worker).map((row) => row.id)).toEqual(['time']);
    const expenses = repository.listExpensesForScope(worker);
    expect(expenses.map((row) => row.id)).toEqual(['expense']);
    expect(expenses[0]).toMatchObject({ amount_minor: 125, currency: 'USD' });
    expect(expenses[0]).not.toHaveProperty('billing_amount_minor');
    expect(JSON.stringify(expenses)).not.toContain('987654321');
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    expect(repository.listTimeForScope(worker)).toEqual([]);
    expect(repository.listExpensesForScope(worker)).toEqual([]);
  });

  it.each(['closed', 'archived', 'invalid-zone'])(
    'excludes own %s project data without modifying records',
    (condition) => {
      operationalEntries();
      sqlite
        .prepare(
          `UPDATE project SET ${condition === 'invalid-zone' ? 'timezone' : 'status'}=? WHERE id=?`,
        )
        .run(condition === 'invalid-zone' ? 'Invalid/Zone' : condition, 'assigned');
      expect(new PortalRepository(sqlite).listTimeForScope(worker)).toEqual([]);
      expect(new PortalRepository(sqlite).listExpensesForScope(worker)).toEqual([]);
      expect(sqlite.prepare('SELECT amount_minor,version FROM expense').get()).toMatchObject({
        amount_minor: 125,
        version: 1,
      });
    },
  );

  it('retains current plus future record-day memberships while denying gaps and expired current access', () => {
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-09-30' WHERE id='assignment'; INSERT INTO project_member VALUES('future','assigned','worker','active','2026-10-05','2026-10-31')",
    );
    operationalEntries('-future', 'worker', '2026-10-10');
    operationalEntries('-gap', 'worker', '2026-10-02');
    const repository = new PortalRepository(sqlite);
    expect(repository.listTimeForScope(worker).map((row) => row.id)).toEqual(['time-future']);
    expect(repository.listExpensesForScope(worker).map((row) => row.id)).toEqual([
      'expense-future',
    ]);
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment'");
    expect(repository.listTimeForScope(worker)).toEqual([]);
    expect(repository.listExpensesForScope(worker)).toEqual([]);
  });

  it('requires live coordinator current and occurrence-date grants in both queries', () => {
    coordinator();
    operationalEntries();
    const repository = new PortalRepository(sqlite);
    expect(repository.listTimeForScope(worker)).toHaveLength(1);
    expect(repository.listExpensesForScope(worker)).toHaveLength(1);
    sqlite.exec("UPDATE supplier_project_grant SET starts_on='2026-09-25'");
    expect(repository.listTimeForScope(worker)).toEqual([]);
    expect(repository.listExpensesForScope(worker)).toEqual([]);
    sqlite.exec("UPDATE supplier_project_grant SET starts_on='2026-09-01',status='revoked'");
    expect(repository.listTimeForScope(worker)).toEqual([]);
    expect(repository.listExpensesForScope(worker)).toEqual([]);
  });

  it('preserves non-Worker financial projection and existing filters', () => {
    operationalEntries();
    sqlite.exec(
      "INSERT INTO user(id,role,status) VALUES('owner','owner_admin','active'),('finance','finance_admin','active'); UPDATE project SET status='closed' WHERE id='assigned'",
    );
    const repository = new PortalRepository(sqlite);
    for (const principal of [owner, finance]) {
      expect(repository.listExpensesForScope(principal)[0]).toHaveProperty(
        'billing_amount_minor',
        987654321,
      );
      expect(repository.listTimeForScope(principal)).toHaveLength(1);
      expect(repository.listTimeForScope(principal, { from: '2026-09-21' })).toEqual([]);
    }
  });
});

describe('current project access without a requested record date', () => {
  beforeEach(() => {
    consumerSchema();
    sqlite.exec(`
      CREATE TABLE schedule(id TEXT,project_id TEXT,timezone TEXT,monday_minutes INTEGER,
        tuesday_minutes INTEGER,wednesday_minutes INTEGER,thursday_minutes INTEGER,
        friday_minutes INTEGER,saturday_minutes INTEGER,sunday_minutes INTEGER,
        effective_from TEXT,effective_to TEXT,version INTEGER);
      INSERT INTO schedule VALUES('schedule','assigned','America/New_York',480,480,480,480,480,0,0,'2026-09-01',NULL,1);
      UPDATE project SET timezone='America/New_York' WHERE id='assigned';
      UPDATE project_member SET ends_on='2026-09-29' WHERE id='assignment';
    `);
  });

  it('uses local today for the real public schedule read with an omitted object date', () => {
    const repository = new PortalRepository(sqlite);
    expect(repository.listProjectSchedule(worker, 'assigned')).toMatchObject({
      id: 'schedule',
      monday_minutes: 480,
      version: 1,
    });
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    expect(() => repository.listProjectSchedule(worker, 'assigned')).toThrow(
      'Project assignment access required',
    );
    expect(sqlite.prepare('SELECT count(*) n FROM schedule').get()?.n).toBe(1);
  });

  it('retains operational project and live session checks on the public schedule read', () => {
    const repository = new PortalRepository(sqlite);
    sqlite.exec("UPDATE project SET status='closed' WHERE id='assigned'");
    expect(() => repository.listProjectSchedule(worker, 'assigned')).toThrow(
      'Project assignment access required',
    );
    sqlite.exec("UPDATE project SET status='active' WHERE id='assigned'; DELETE FROM session");
    expect(() => repository.listProjectSchedule(worker, 'assigned')).toThrow(
      'Project assignment access required',
    );
  });

  it('preserves privileged access and the PM original UTC current-date rule', () => {
    sqlite.exec(
      "INSERT INTO user(id,role,status) VALUES('owner','owner_admin','active'),('manager','project_manager','active'); INSERT INTO project_member VALUES('pm','assigned','manager','active','2026-09-01','2026-09-29')",
    );
    const repository = new PortalRepository(sqlite);
    expect(repository.listProjectSchedule(owner, 'assigned')).toHaveProperty('id', 'schedule');
    expect(() => repository.listProjectSchedule(manager, 'assigned')).toThrow(
      'Project assignment access required',
    );
    sqlite.exec("UPDATE project_member SET ends_on='2026-09-30' WHERE id='pm'");
    expect(repository.listProjectSchedule(manager, 'assigned')).toHaveProperty('id', 'schedule');
  });
});

function searchSchema() {
  timeExpenseSchema();
  sqlite.exec(`
    ALTER TABLE project ADD COLUMN po_number TEXT;
    ALTER TABLE client ADD COLUMN client_number TEXT;
    ALTER TABLE invoice ADD COLUMN stream_type TEXT;
    UPDATE project SET po_number='operational reference';
  `);
  reports();
  operationalEntries();
}

describe('Worker global search and serialized suggestions follow current local access', () => {
  beforeEach(searchSchema);

  it('retains assigned projects and own operational report/expense results only', () => {
    reports('-other', 'other');
    operationalEntries('-other', 'other');
    const rows = new PortalRepository(sqlite).search(worker, '');
    expect(rows.map((row) => row.id)).toEqual(['assigned', 'daily', 'technical', 'expense']);
    expect(new PortalRepository(sqlite).searchSuggestions(worker)).toEqual(rows);
  });

  it('excludes all formerly assigned project metadata after local expiry even while UTC still eligible', () => {
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    sqlite.exec(
      "UPDATE project SET timezone='Pacific/Kiritimati' WHERE id='assigned'; UPDATE project_member SET ends_on='2026-09-30' WHERE user_id='worker'",
    );
    expect(new PortalRepository(sqlite).search(worker, '')).toEqual([]);
    expect(new PortalRepository(sqlite).searchSuggestions(worker)).toEqual([]);
    expect(sqlite.prepare('SELECT count(*) n FROM expense').get()?.n).toBe(1);
  });

  it('retains NY local-day access independently of UTC midnight and denies after local midnight', () => {
    sqlite.exec(
      "UPDATE project SET timezone='America/New_York' WHERE id='assigned'; UPDATE project_member SET ends_on='2026-09-29' WHERE user_id='worker'",
    );
    expect(new PortalRepository(sqlite).search(worker, '')).toHaveLength(4);
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
    expect(new PortalRepository(sqlite).search(worker, '')).toEqual([]);
  });

  it.each(['closed', 'archived'])(
    'omits %s project suggestions without deleting own history',
    (status) => {
      sqlite.prepare('UPDATE project SET status=? WHERE id=?').run(status, 'assigned');
      expect(new PortalRepository(sqlite).searchSuggestions(worker)).toEqual([]);
      expect(sqlite.prepare('SELECT count(*) n FROM daily_report').get()?.n).toBe(1);
    },
  );

  it('requires live account/session and valid timezone for suggestions', () => {
    sqlite.exec("UPDATE project SET timezone='Invalid/Zone' WHERE id='assigned'");
    expect(new PortalRepository(sqlite).searchSuggestions(worker)).toEqual([]);
    sqlite.exec("UPDATE session SET expires_at='2026-09-29T00:00:00Z'");
    expect(() => new PortalRepository(sqlite).searchSuggestions(worker)).toThrow(
      'Live authenticated session required',
    );
  });

  it('preserves distinct current/future memberships and requested occurrence membership', () => {
    sqlite.exec(
      "UPDATE project_member SET ends_on='2026-09-30' WHERE user_id='worker'; INSERT INTO project_member VALUES('future','assigned','worker','active','2026-10-05','2026-10-31'); UPDATE daily_report SET work_date='2026-10-10'; UPDATE technical_report SET report_date='2026-10-02'; UPDATE expense SET spent_on='2026-10-10'",
    );
    expect(new PortalRepository(sqlite).search(worker, '').map((row) => row.id)).toEqual([
      'assigned',
      'daily',
      'expense',
    ]);
  });

  it('enforces coordinator current and requested-day grants before returning source identities', () => {
    coordinator();
    sqlite.exec("UPDATE supplier_project_grant SET starts_on='2026-09-25'");
    expect(new PortalRepository(sqlite).search(worker, '').map((row) => row.id)).toEqual([
      'assigned',
    ]);
    sqlite.exec("UPDATE supplier_project_grant SET status='revoked'");
    expect(new PortalRepository(sqlite).search(worker, '')).toEqual([]);
  });

  it('filters unassigned matching expenses before the result limit', () => {
    const insert = sqlite.prepare(
      "INSERT INTO expense(id,project_id,worker_id,spent_on,description) VALUES(?,'unassigned','worker','2026-09-20','private search sentinel')",
    );
    for (let i = 0; i < 60; i++) insert.run(`hidden-${i}`);
    expect(
      new PortalRepository(sqlite).search(worker, 'operational expense').map((row) => row.id),
    ).toEqual(['expense']);
    expect(JSON.stringify(new PortalRepository(sqlite).search(worker, ''))).not.toContain(
      'private search sentinel',
    );
  });

  it('preserves privileged and PM project restriction behavior', () => {
    const repository = new PortalRepository(sqlite);
    expect(
      repository
        .search({ userId: 'worker', role: 'owner_admin', projectIds: new Set() }, '')
        .some((row) => row.id === 'unassigned'),
    ).toBe(true);
    expect(
      repository
        .search(
          { userId: 'worker', role: 'project_manager', projectIds: new Set(['assigned']) },
          '',
        )
        .some((row) => row.id === 'unassigned'),
    ).toBe(false);
  });
});
