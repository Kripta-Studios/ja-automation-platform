import { afterEach, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

let fixture: B5LifecycleSecurityFixture | undefined;
afterEach(() => {
  if (fixture) closeB5LifecycleSecurityFixture(fixture);
  fixture = undefined;
});

it('excludes archived operational totals while retaining authorized accounting history', () => {
  const f = createB5LifecycleSecurityFixture();
  fixture = f;
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'archive-summary');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'archive-summary');
  const time = f.repository.createTimeEntry(worker, {
    projectId: f.project.id,
    workDate: '2026-08-20',
    category: 'regular',
    minutes: 60,
    summary: 'Historical work',
  });
  f.repository.submitTime(worker, time.id, time.version);
  const expense = f.repository.createExpense(worker, {
    projectId: f.project.id,
    spentOn: '2026-08-20',
    vendor: 'Historical supplier',
    category: 'hotel',
    description: 'Historical expense',
    currency: 'EUR',
    amountMinor: 1200n,
    whoPaid: 'worker',
    clientTreatment: 'reimbursable',
    receiptRequired: false,
  });
  const report = f.repository.createDailyReport(worker, {
    projectId: f.project.id,
    workDate: '2026-08-20',
    summary: 'Historical report',
    tasksCompleted: 'Completed work',
    downtimeMinutes: 0,
    safetyRelated: false,
  });
  f.repository.submitReport(worker, 'daily', report.id, report.version);
  expect(f.repository.dashboard(owner)).toMatchObject({ actualMinutes: 60, pendingReports: 1 });
  // Model an already archived historical fixture; runtime lifecycle writes remain unchanged.
  f.sqlite.prepare("UPDATE project SET status='archived' WHERE id=?").run(f.project.id);
  expect(f.repository.dashboard(owner)).toMatchObject({
    activeProjects: 0,
    actualMinutes: 0,
    pendingReports: 0,
    expenseTotalsByCurrency: [],
  });
  expect(
    f.v3.financePortfolio(owner, undefined, undefined, { includeArchived: false }).projects,
  ).toEqual([]);
  expect(f.v3.financePortfolio(owner).projects).toEqual([
    expect.objectContaining({ projectId: f.project.id }),
  ]);
  const overview = f.repository.projectOverview(owner, f.project.id);
  expect(overview.actualMinutes).toBe(60);
  expect(overview.expenses).toEqual([expect.objectContaining({ id: expense.id })]);
  expect(overview.reports).toEqual([expect.objectContaining({ id: report.id })]);
  expect(f.repository.search(owner, 'Historical', { includeArchived: false })).toEqual([]);
  expect(f.repository.search(owner, 'Historical')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: expense.id, type: 'expense' }),
      expect.objectContaining({ id: report.id, type: 'report' }),
    ]),
  );
});

it('submits only current-project week drafts and leaves archived drafts unchanged', () => {
  const f = createB5LifecycleSecurityFixture();
  fixture = f;
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'archive-week');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'archive-week');
  const archived = f.repository.createTimeEntry(worker, {
    projectId: f.project.id,
    workDate: '2026-08-20',
    category: 'regular',
    minutes: 60,
    summary: 'Historical draft',
  });
  f.sqlite.prepare("UPDATE project SET status='archived' WHERE id=?").run(f.project.id);
  const currentProject = f.repository.createProject(owner, {
    costCenterCode: 'CURRENT-WEEK-2',
    clientId: f.client.id,
    name: 'Current project',
    timezone: 'Europe/Madrid',
    currency: 'EUR',
    billingModel: 'tm',
    startDate: '2026-01-01',
  });
  f.repository.assignWorker(owner, {
    projectId: currentProject.id,
    workerId: worker.userId,
    startsOn: '2026-01-01',
  });
  const currentWorker = f.repository.principalFor(worker.userId, worker.sessionId);
  const current = f.repository.createTimeEntry(currentWorker, {
    projectId: currentProject.id,
    workDate: '2026-08-20',
    category: 'regular',
    minutes: 90,
    summary: 'Current draft',
  });
  expect(() =>
    f.repository.submitTimeWeek(owner, worker.userId, '2026-08-17', [current, archived]),
  ).toThrow('Week changed');
  expect(
    f.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(current.id)
      ?.approval_state,
  ).toBe('draft');
  f.repository.submitTimeWeek(owner, worker.userId, '2026-08-17', [current]);
  expect(
    f.sqlite.prepare('SELECT approval_state FROM time_entry WHERE id=?').get(current.id)
      ?.approval_state,
  ).toBe('submitted');
  expect(
    f.sqlite.prepare('SELECT approval_state,version FROM time_entry WHERE id=?').get(archived.id),
  ).toMatchObject({ approval_state: 'draft', version: archived.version });
});
