import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerRecordManagement } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { load } from '../../apps/portal/src/routes/app/manage/+page.server';

vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository: vi.fn() }));

let sqlite: DatabaseSync;
let close: ReturnType<typeof vi.spyOn>;
type LoadedView = {
  projects: Record<string, unknown>[];
  records: Record<string, unknown>[];
  technicalReports: Record<string, unknown>[];
  workers: Record<string, unknown>[];
  catalogRows: Record<string, unknown>[];
  focusId: string;
  domains: { counts: { table: string; count: number }[] }[];
};
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE project(id TEXT PRIMARY KEY,project_number TEXT,name TEXT,status TEXT);
    INSERT INTO project VALUES('current','P-1','QA active work','active'),('archive','P-2','Retained work','archived');
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);
    INSERT INTO user VALUES('owner','Owner','owner@example.test','owner_admin','active'),('worker','Worker','worker@example.test','worker','active'),('inactive','Past worker','past@example.test','worker','inactive');
    CREATE TABLE client(id TEXT PRIMARY KEY,status TEXT);
    INSERT INTO client VALUES('current-client','active'),('past-client','archived');
    CREATE TABLE client_contact(id TEXT PRIMARY KEY,client_id TEXT);
    INSERT INTO client_contact VALUES('current-contact','current-client'),('past-contact','past-client');
    CREATE TABLE supplier(id TEXT PRIMARY KEY,status TEXT);
    INSERT INTO supplier VALUES('current-supplier','active'),('past-supplier','inactive');
    CREATE TABLE supplier_user_profile(id TEXT PRIMARY KEY,user_id TEXT);
    INSERT INTO supplier_user_profile VALUES('current-profile','worker'),('past-profile','inactive');
    CREATE TABLE supplier_project_grant(id TEXT PRIMARY KEY,project_id TEXT,supplier_id TEXT);
    CREATE TABLE technical_report(id TEXT PRIMARY KEY,project_id TEXT,system_name TEXT,created_at TEXT);
    INSERT INTO technical_report VALUES('current-report','current','Current PLC','2026-10-05'),('past-report','archive','Past PLC','2026-10-04');
    CREATE TABLE document(id TEXT PRIMARY KEY,project_id TEXT,created_at TEXT);
    INSERT INTO document VALUES('current-document','current','2026-10-05'),('past-document','archive','2026-10-04'),('global-document',NULL,'2026-10-03');
    CREATE TABLE worker_availability(id TEXT PRIMARY KEY,worker_id TEXT,created_at TEXT);
    CREATE TABLE worker_skill(id TEXT PRIMARY KEY,worker_id TEXT);
    INSERT INTO worker_availability VALUES('current-availability','worker','2026-10-05'),('past-availability','inactive','2026-10-04');
    CREATE TABLE compensation_rule(id TEXT PRIMARY KEY,project_id TEXT);
    INSERT INTO compensation_rule VALUES('current-rule','current'),('past-rule','archive'),('global-rule',NULL);
    CREATE TABLE expense(id TEXT PRIMARY KEY,project_id TEXT);
    INSERT INTO expense VALUES('current-expense','current'),('past-expense','archive');
    CREATE TABLE invoice(id TEXT PRIMARY KEY,project_id TEXT);
    INSERT INTO invoice VALUES('current-invoice','current'),('past-invoice','archive');
  `);
  for (const table of [
    'project_member',
    'project_milestone',
    'schedule',
    'invitation',
    'planning_assignment',
    'skill',
    'time_entry',
    'daily_report',
    'technical_change',
    'period_report',
    'internal_cost_rule',
    'client_labor_rate',
    'assignment_rate_override',
    'billing_rule',
    'billing_period',
    'legal_entity',
    'tax_profile',
    'invoice_number_policy',
    'payment',
    'compensation_settlement',
    'accounting_pack_run',
    'accounting_pack_revision',
  ])
    sqlite.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY)`);
  close = vi.spyOn(sqlite, 'close').mockImplementation(() => {});
  vi.spyOn(OwnerRecordManagement.prototype, 'assertOwner').mockImplementation(() => {});
  vi.spyOn(OwnerRecordManagement.prototype, 'list').mockReturnValue([
    {
      id: 'current-expense',
      project_id: 'current',
      worker_id: 'worker',
      work_date: '2026-10-05',
      approval_state: 'draft',
      version: 1,
      managementBlock: null,
    },
    {
      id: 'past-expense',
      project_id: 'archive',
      worker_id: 'inactive',
      work_date: '2026-10-04',
      approval_state: 'approved',
      version: 1,
      managementBlock: null,
    },
  ]);
  vi.mocked(openPortalRepository).mockReturnValue({
    sqlite,
    principal: {
      userId: 'owner',
      role: 'owner_admin',
      sessionId: 'owner-session',
      projectIds: new Set(),
    },
    repository: { listAssignedProjects: () => sqlite.prepare('SELECT * FROM project').all() },
  } as never);
});
afterEach(() => {
  close.mockRestore();
  sqlite.close();
  vi.restoreAllMocks();
});

function view(query = '') {
  return load({
    locals: { user: { id: 'owner', role: 'owner_admin' } },
    url: new URL(`http://local.test/j-aautomation/app/manage?${query}`),
  } as never) as LoadedView;
}
function count(result: ReturnType<typeof view>, table: string): number {
  return result.domains.flatMap((domain) => domain.counts).find((row) => row.table === table)!
    .count;
}

describe('Owner management current and historical presentation', () => {
  it('filters real SQL options and counts, retaining global configuration and all invoice history', () => {
    const result = view();
    expect(result.projects.map((row) => row.id)).toEqual(['current']);
    expect(result.records.map((row) => row.id)).toEqual(['current-expense']);
    expect(result.technicalReports.map((row) => row.id)).toEqual(['current-report']);
    expect(result.workers.map((row) => row.id)).toEqual(['worker']);
    expect(count(result, 'expense')).toBe(1);
    expect(count(result, 'compensation_rule')).toBe(2);
    expect(count(result, 'invoice')).toBe(2);
    expect(count(result, 'client')).toBe(1);
    expect(count(result, 'client_contact')).toBe(1);
    expect(count(result, 'supplier')).toBe(1);
    expect(count(result, 'supplier_user_profile')).toBe(1);
    expect(close).toHaveBeenCalled();
  });

  it('preserves global documents while excluding archived project documents by default', () => {
    expect(view('area=document').catalogRows.map((row) => row.id)).toEqual([
      'current-document',
      'global-document',
    ]);
    expect(view('area=document&includeArchived=1').catalogRows.map((row) => row.id)).toEqual([
      'current-document',
      'past-document',
      'global-document',
    ]);
  });

  it('includes historical projects and inactive workers only through explicit modes', () => {
    const result = view('includeArchived=1&includeInactive=1');
    expect(result.records).toHaveLength(2);
    expect(result.workers).toHaveLength(2);
    expect(count(result, 'expense')).toBe(2);
    expect(count(result, 'client')).toBe(2);
    expect(count(result, 'supplier')).toBe(2);
    expect(view('area=worker_availability').catalogRows).toHaveLength(1);
    expect(view('area=worker_availability&includeInactive=1').catalogRows).toHaveLength(2);
  });

  it('normalizes archived project and hidden focus links without implicitly including history', () => {
    expect(() => view('project=archive&focus=past-expense')).toThrow(
      expect.objectContaining({ status: 303, location: '/j-aautomation/app/manage' }),
    );
    expect(() => view('focus=past-expense')).toThrow(
      expect.objectContaining({ status: 303, location: '/j-aautomation/app/manage' }),
    );
    expect(view('project=archive&focus=past-expense&includeArchived=1').focusId).toBe(
      'past-expense',
    );
  });
});
