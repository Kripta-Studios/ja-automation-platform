import { DatabaseSync } from 'node:sqlite';
import { PortalRepository } from '../../packages/database/src/repository';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openPortalRepository } = vi.hoisted(() => ({ openPortalRepository: vi.fn() }));
vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));
vi.mock('@ja/database', () => ({
  MailIdentityRepository: class {},
  CrewLeaderRepository: class {
    projects() {
      return [];
    }
  },
}));
vi.mock('$lib/server/mail-directory', () => ({ listMailboxAccounts: vi.fn() }));
const { sectionLoad } = await import('../../apps/portal/src/routes/app/[section]/section-load.ts');
let sqlite: DatabaseSync;
let repository: ReturnType<typeof setupRepository>;
const historicalPay = {
  currency: 'USD',
  approvedMinutes: 60,
  pendingMinutes: 15,
  estimatedApprovedMinor: '9007199254740993',
  estimatedPendingMinor: '25',
  currencyBreakdown: [
    {
      currency: 'USD',
      estimatedApprovedMinor: '9007199254740993',
      estimatedPendingMinor: '25',
      approvedReimbursementMinor: '100',
      pendingReimbursementMinor: '125',
    },
  ],
  projectIds: ['expired-project'],
  projectProgress: [
    {
      projectId: 'expired-project',
      projectName: 'Private expired project',
      budgetMinor: '999999',
      plannedMinutes: 600,
    },
  ],
};
type LoadedSection = {
  projects: Array<{ id: string }>;
  timesheet: { days: Array<{ expectedMinutes: number | null }> };
  weeklyPay: { estimatedApprovedMinor: string };
  pay: typeof historicalPay;
  payExpenses: ReturnType<ReturnType<typeof setupRepository>['listWorkerStatementExpenses']>;
};
function setupRepository() {
  return {
    searchSuggestions: vi.fn(() => []),
    search: vi.fn(() => []),
    listAssignedProjects: vi.fn(() => [{ id: 'current-project' }]),
    listOwnTimeWeek: vi.fn(() => ({ weekStart: '2026-09-28', weekEnd: '2026-10-04', rows: [] })),
    listTimeForScope: vi.fn(() => []),
    listExpensesForScope: vi.fn(() => []),
    listWorkerStatementTime: vi.fn(() => []),
    listWorkerStatementExpenses: vi.fn(() => [
      {
        id: 'historic-expense',
        projectNumber: 'Historical own project',
        spentOn: '2026-09-20',
        vendor: 'Own receipt',
        description: 'Own historical reimbursement',
        category: 'meals',
        reimbursementAmountMinor: '9007199254740993',
        currency: 'USD',
        approvalState: 'approved',
        reimbursementState: 'paid',
        expectedReimbursementOn: '2026-09-25',
        reimbursedAt: '2026-09-25T12:00:00Z',
      },
    ]),
    expenseDetail: vi.fn(() => {
      throw new Error('Current operational access denied');
    }),
  };
}
function event(section: string) {
  return {
    locals: {
      user: { id: 'worker', role: 'worker', status: 'active' },
      session: { id: 'worker-session' },
    },
    params: { section },
    url: new URL(
      `http://localhost/j-aautomation/app/${section}?week=2026-09-28&start=2026-09-01&end=2026-09-30`,
    ),
  } as never;
}
beforeEach(() => {
  vi.clearAllMocks();
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE user(id TEXT,role TEXT,status TEXT);
    INSERT INTO user VALUES('worker','worker','active');
    CREATE TABLE session(id TEXT,token TEXT,user_id TEXT,expires_at TEXT);
    INSERT INTO session VALUES('worker-session','token','worker','2027-01-01T00:00:00Z');
    CREATE TABLE supplier_user_profile(user_id TEXT,profile TEXT,supplier_id TEXT);
    CREATE TABLE supplier(id TEXT,status TEXT);
    CREATE TABLE supplier_project_grant(supplier_id TEXT,coordinator_id TEXT,project_id TEXT,status TEXT,starts_on TEXT,ends_on TEXT);
    CREATE TABLE daily_report(id TEXT,project_id TEXT,worker_id TEXT,work_date TEXT,summary TEXT);
    CREATE TABLE technical_report(id TEXT,project_id TEXT,author_id TEXT,report_date TEXT,system_name TEXT,change_summary TEXT);
    CREATE TABLE expense(id TEXT,project_id TEXT,worker_id TEXT,spent_on TEXT,vendor TEXT,description TEXT,category TEXT,receipt_document_id TEXT);
    CREATE TABLE project(id TEXT,status TEXT);
    CREATE TABLE project_member(project_id TEXT,user_id TEXT,status TEXT,starts_on TEXT,ends_on TEXT);
    CREATE TABLE schedule(project_id TEXT,effective_from TEXT,effective_to TEXT,monday_minutes INTEGER,tuesday_minutes INTEGER,wednesday_minutes INTEGER,thursday_minutes INTEGER,friday_minutes INTEGER,saturday_minutes INTEGER,sunday_minutes INTEGER);
    INSERT INTO project VALUES('current-project','active'),('expired-project','active');
    INSERT INTO project_member VALUES('current-project','worker','active','2026-09-30','2026-10-03'),('expired-project','worker','active','2026-09-01','2026-09-30');
    INSERT INTO schedule VALUES('current-project','2026-09-01',NULL,480,480,480,480,480,0,0),('expired-project','2026-09-01',NULL,600,600,600,600,600,0,0);
  `);
  sqlite.exec(`
    ALTER TABLE project ADD COLUMN timezone TEXT;
    ALTER TABLE project ADD COLUMN name TEXT;
    ALTER TABLE project ADD COLUMN project_number TEXT;
    ALTER TABLE project ADD COLUMN po_number TEXT;
    UPDATE project SET timezone='UTC',name=id,project_number=id;
    INSERT INTO expense VALUES('expired-expense','expired-project','worker','2026-09-30','','Expired expense summary','meals',NULL);
    INSERT INTO daily_report VALUES('expired-report','expired-project','worker','2026-09-30','Expired report summary');
    ALTER TABLE expense ADD COLUMN approval_state TEXT DEFAULT 'draft';
  `);
  repository = setupRepository();
  openPortalRepository.mockReturnValue({
    sqlite,
    principal: { userId: 'worker', role: 'worker', projectIds: new Set(['current-project']) },
    repository,
    v3: { workerPay: vi.fn(() => historicalPay), listCompensationSettlements: vi.fn(() => []) },
  });
});
afterEach(() => {
  if (sqlite.isOpen) sqlite.close();
  vi.useRealTimers();
});

describe('operational section loader safe Worker DTOs', () => {
  it('only derives visible schedule targets on effective days without ambiguous own memberships', async () => {
    const data = (await sectionLoad(event('time'))) as unknown as LoadedSection;
    expect(data.timesheet.days.map((day) => day.expectedMinutes)).toEqual([
      null,
      null,
      null,
      480,
      480,
      0,
      null,
    ]);
    expect(JSON.stringify(data)).not.toContain('expired-project');
    expect(JSON.stringify(data)).not.toContain('Private expired project');
    expect(data.weeklyPay).toEqual({
      currency: 'USD',
      approvedMinutes: 60,
      pendingMinutes: 15,
      estimatedApprovedMinor: '9007199254740993',
      estimatedPendingMinor: '25',
      currencyBreakdown: [
        {
          currency: 'USD',
          estimatedApprovedMinor: '9007199254740993',
          estimatedPendingMinor: '25',
        },
      ],
    });
  });

  it.each([
    ['overlapping', '2026-10-04'],
    ['hidden-only', '2026-10-01'],
  ])(
    'returns no expected target for an %s future hidden project without widening operational DTOs',
    async (_scenario, currentEndsOn) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
      sqlite.exec(`
        UPDATE project_member SET status='inactive' WHERE project_id='expired-project';
        UPDATE project_member SET starts_on='2026-09-28',ends_on='${currentEndsOn}' WHERE project_id='current-project';
        INSERT INTO project VALUES('future-hidden-project','active','UTC','Private future project','Future project number',NULL);
        INSERT INTO project_member VALUES('future-hidden-project','worker','active','2026-10-02','2026-10-04');
        INSERT INTO schedule VALUES('future-hidden-project','2026-09-01',NULL,600,600,600,600,600,0,0);
      `);
      const data = (await sectionLoad(event('time'))) as unknown as LoadedSection;
      expect(data.timesheet.days.map((day) => day.expectedMinutes)).toEqual([
        480,
        480,
        480,
        480,
        null,
        null,
        null,
      ]);
      expect(data.projects).toEqual([{ id: 'current-project' }]);
      expect(repository.listTimeForScope).toHaveBeenCalled();
      for (const hidden of [
        'future-hidden-project',
        'Private future project',
        'Future project number',
      ])
        expect(JSON.stringify(data)).not.toContain(hidden);
    },
  );

  it.each([
    ['another worker', 'another-worker', 'active', 'active'],
    ['inactive membership', 'worker', 'inactive', 'active'],
    ['archived project', 'worker', 'active', 'archived'],
  ])(
    'does not count an unrelated %s as a competing target',
    async (_scenario, workerId, memberStatus, projectStatus) => {
      sqlite.exec(`
      UPDATE project_member SET status='inactive' WHERE project_id='expired-project';
      UPDATE project_member SET starts_on='2026-09-28',ends_on='2026-10-04' WHERE project_id='current-project';
      INSERT INTO project VALUES('unrelated-project','${projectStatus}','UTC','Private unrelated project','Unrelated number',NULL);
      INSERT INTO project_member VALUES('unrelated-project','${workerId}','${memberStatus}','2026-10-02','2026-10-04');
    `);
      const data = (await sectionLoad(event('time'))) as unknown as LoadedSection;
      expect(data.timesheet.days.map((day) => day.expectedMinutes)).toEqual([
        480, 480, 480, 480, 480, 0, 0,
      ]);
      expect(JSON.stringify(data)).not.toContain('unrelated-project');
    },
  );

  it.each(['external_technician', 'supplier_coordinator'])(
    'preserves the existing dated operational scope for a %s profile',
    async (profile) => {
      sqlite.exec(`
        INSERT INTO supplier_user_profile VALUES('worker','${profile}','supplier');
        INSERT INTO supplier VALUES('supplier','active');
        INSERT INTO supplier_project_grant VALUES('supplier','worker','current-project','active','2026-09-30','2026-10-03');
        INSERT INTO project VALUES('future-hidden-project','active','UTC','Private future project','Future project number',NULL);
        INSERT INTO project_member VALUES('future-hidden-project','worker','active','2026-10-02','2026-10-04');
      `);
      const data = (await sectionLoad(event('time'))) as unknown as LoadedSection;
      expect(data.timesheet.days.map((day) => day.expectedMinutes)).toEqual([
        null,
        null,
        480,
        480,
        480,
        0,
        null,
      ]);
      expect(data.projects).toEqual([{ id: 'current-project' }]);
      expect(data.weeklyPay).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('estimatedApprovedMinor');
      expect(JSON.stringify(data)).not.toContain('future-hidden-project');
      expect(JSON.stringify(data)).not.toContain('expired-project');
    },
  );

  it('returns no past schedule targets for authoritative empty current assignment scope', async () => {
    repository.listAssignedProjects.mockReturnValue([]);
    const data = (await sectionLoad(event('time'))) as unknown as LoadedSection;
    expect(data.projects).toEqual([]);
    expect(data.timesheet.days.every((day) => day.expectedMinutes === null)).toBe(true);
    expect(JSON.stringify(data)).not.toContain('expired-project');
    expect(data.weeklyPay.estimatedApprovedMinor).toBe('9007199254740993');
  });

  it('does not serialize statement/pay payloads on the Expenses route', async () => {
    const data = (await sectionLoad(event('expenses'))) as unknown as LoadedSection;
    expect(data).not.toHaveProperty('pay');
    expect(data).not.toHaveProperty('weeklyPay');
    expect(data).not.toHaveProperty('payExpenses');
    expect(JSON.stringify(data)).not.toContain('historic-expense');
    expect(repository.listWorkerStatementExpenses).not.toHaveBeenCalled();
  });

  it('preserves own historical My Pay reimbursement fields without requiring current expense detail access', async () => {
    const data = (await sectionLoad(event('pay'))) as unknown as LoadedSection;
    expect(data.pay).toEqual(historicalPay);
    expect(data.payExpenses).toEqual(repository.listWorkerStatementExpenses.mock.results[0]?.value);
    expect(data.payExpenses[0]).toMatchObject({
      reimbursementAmountMinor: '9007199254740993',
      expectedReimbursementOn: '2026-09-25',
      reimbursedAt: '2026-09-25T12:00:00Z',
    });
    expect(repository.expenseDetail).not.toHaveBeenCalled();
  });
});

describe('actual search result serialization in Worker operational loaders', () => {
  it.each(['time', 'expenses'])(
    '%s excludes expired project/record metadata at the project-local boundary',
    async (section) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
      sqlite.exec("UPDATE project SET timezone='Pacific/Kiritimati' WHERE id='expired-project'");
      const principal = {
        userId: 'worker',
        role: 'worker' as const,
        sessionId: 'worker-session',
        projectIds: new Set(['current-project']),
      };
      const actual = new PortalRepository(sqlite);
      repository.searchSuggestions.mockImplementation(
        () => actual.searchSuggestions(principal) as never[],
      );
      repository.search.mockImplementation(() => actual.search(principal, 'Expired') as never[]);
      const input = event(section) as unknown as { url: URL };
      input.url.searchParams.set('q', 'Expired');
      const data = await sectionLoad(input as never);
      const serialized = JSON.stringify(data);
      for (const secret of [
        'expired-project',
        'expired-expense',
        'Expired expense summary',
        'expired-report',
        'Expired report summary',
      ])
        expect(serialized).not.toContain(secret);
    },
  );

  it.each(['time', 'expenses'])(
    '%s retains legitimate current project suggestions and own record result before expiry',
    async (section) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-30T02:00:00Z'));
      sqlite.exec("UPDATE project SET timezone='America/New_York' WHERE id='expired-project'");
      const principal = {
        userId: 'worker',
        role: 'worker' as const,
        sessionId: 'worker-session',
        projectIds: new Set(['current-project', 'expired-project']),
      };
      const actual = new PortalRepository(sqlite);
      repository.searchSuggestions.mockImplementation(
        () => actual.searchSuggestions(principal) as never[],
      );
      const data = await sectionLoad(event(section));
      expect(JSON.stringify(data)).toContain('expired-project');
      expect(JSON.stringify(data)).toContain('expired-expense');
    },
  );
});
