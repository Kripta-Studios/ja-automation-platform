import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createDatabase, PortalRepository, V3Repository } from '@ja/database';
import {
  e2eCredentials,
  e2eLifecycleFixturesFor,
  e2eLifecycleProjectNames,
  portal,
  signIn,
} from './auth.js';
import { readE2EFixturePointer } from './environment.js';

let workDate = '2026-08-24';
const PERIOD_START = '2026-08-01';
const PERIOD_END = '2026-08-31';
const SIX_HOURS_MINUTES = 360;

type Worker = Readonly<{ id: string; name: string }>;

type IsolatedProject = Readonly<{
  id: string;
  name: string;
  owner: Worker;
  hourlyWorker: Worker;
  dailyWorker: Worker;
}>;

type TimeRow = Readonly<{
  id: string;
  project_id: string;
  worker_id: string;
  minutes: number;
  approval_state: string;
  approved_by: string | null;
  approved_at: string | null;
}>;

type CompensationRuleRow = Readonly<{
  worker_id: string;
  project_id: string | null;
  currency: string;
  rate_minor: string;
  rate_basis: string;
  rule_type: string;
  effective_from: string;
}>;

type AssignmentRow = Readonly<{
  user_id: string;
  project_id: string;
  status: string;
  starts_on: string;
  ends_on: string | null;
}>;

function readUser(database: ReturnType<typeof createDatabase>, email: string): Worker {
  const user = database.sqlite
    .prepare("SELECT id,name FROM user WHERE email=? AND status='active'")
    .get(email) as Worker | undefined;
  if (!user) throw new Error(`Active E2E user is missing: ${email}`);
  return user;
}

/**
 * Project creation is fixture setup only. The test deliberately performs the
 * two assignments and both compensation configurations through the visible
 * Owner forms below.
 */
function createIsolatedProject(projectName: string): IsolatedProject {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const owner = readUser(database, e2eCredentials.owner.email);
    const hourlyWorker = readUser(database, e2eCredentials.worker.email);
    const dailyWorker = readUser(database, e2eCredentials.worker2.email);
    const lifecycle = e2eLifecycleFixturesFor(projectName);
    const repository = new PortalRepository(database.sqlite);
    const name = `Manual same-project compensation ${randomUUID()}`;
    const created = repository.createProject(repository.principalFor(owner.id), {
      clientId: lifecycle.client.id,
      name,
      timezone: lifecycle.project.timezone,
      currency: 'USD',
      billingModel: 'tm',
      startDate: workDate,
      expectedMinutesPerDay: 600,
    });
    return { id: created.id, name, owner, hourlyWorker, dailyWorker };
  } finally {
    database.sqlite.close();
  }
}

function readTimeEntry(projectId: string, workerId: string, summary: string): TimeRow {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const rows = database.sqlite
      .prepare(
        `SELECT id,project_id,worker_id,minutes,approval_state,approved_by,approved_at
           FROM time_entry
          WHERE project_id=? AND worker_id=? AND work_date=? AND activity_summary=?`,
      )
      .all(projectId, workerId, workDate, summary) as TimeRow[];
    expect(rows, 'one isolated time entry must persist for this worker').toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error('Isolated time entry was not persisted');
    return row;
  } finally {
    database.sqlite.close();
  }
}

function readCompensationRules(projectId: string): CompensationRuleRow[] {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    return database.sqlite
      .prepare(
        `SELECT worker_id,project_id,currency,CAST(rate_minor AS TEXT) rate_minor,
                rate_basis,rule_type,effective_from
           FROM compensation_rule
          WHERE project_id=?
          ORDER BY worker_id,effective_from,id`,
      )
      .all(projectId) as CompensationRuleRow[];
  } finally {
    database.sqlite.close();
  }
}

function readProjectAssignments(projectId: string): AssignmentRow[] {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    return database.sqlite
      .prepare(
        `SELECT user_id,project_id,status,starts_on,ends_on
           FROM project_member
          WHERE project_id=?
          ORDER BY user_id`,
      )
      .all(projectId) as AssignmentRow[];
  } finally {
    database.sqlite.close();
  }
}

function readWorkerProjectPay(
  projectId: string,
  workerId: string,
): {
  approvedMinutes: number;
  estimatedApprovedMinor: string;
  estimatedPendingMinor: string;
} {
  const fixture = readE2EFixturePointer();
  const database = createDatabase(fixture.databasePath);
  try {
    const repository = new PortalRepository(database.sqlite);
    const pay = new V3Repository(database.sqlite).workerPay(
      repository.principalFor(workerId),
      PERIOD_START,
      PERIOD_END,
    );
    const project = pay.projectProgress.find((candidate) => candidate.projectId === projectId);
    if (!project) throw new Error(`My Pay omitted isolated project ${projectId}`);
    return {
      approvedMinutes: project.approvedMinutes,
      estimatedApprovedMinor: project.estimatedApprovedMinor,
      estimatedPendingMinor: project.estimatedPendingMinor,
    };
  } finally {
    database.sqlite.close();
  }
}

async function submitAction(
  page: Page,
  action: string,
  submit: () => Promise<void>,
): Promise<void> {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(`?/${action}`),
  );
  await submit();
  const response = await responsePromise;
  expect(response.status(), `${action} must return a successful action response`).toBeLessThan(400);
}

async function switchRole(
  page: Page,
  role: keyof typeof e2eCredentials,
  sessions: Map<keyof typeof e2eCredentials, Awaited<ReturnType<Page['context']>['cookies']>>,
): Promise<void> {
  await page.context().clearCookies();
  const cached = sessions.get(role);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto(portal(''), { waitUntil: 'networkidle' });
    if (!new URL(page.url()).pathname.endsWith('/login')) return;
    sessions.delete(role);
    await page.context().clearCookies();
  }
  await signIn(page, role);
  sessions.set(role, await page.context().cookies());
}

async function assignWorker(page: Page, projectId: string, workerId: string): Promise<void> {
  await page.goto(portal('/projects'), { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Assign Worker', exact: true }).click();
  const form = page.locator(
    '[data-project-workflow="assign-worker"] form[action="?/assignWorker"]',
  );
  await expect(form).toBeVisible();
  await form.locator('select[name="projectId"]').selectOption(projectId);
  await form.locator('select[name="workerId"]').selectOption(workerId);
  await expect(form.locator('input[name="assignmentRole"]')).toHaveValue('worker');
  await form.locator('input[name="startsOn"]').fill(workDate);
  await submitAction(page, 'assignWorker', () =>
    form.getByRole('button', { name: 'Assign' }).click(),
  );
  await expect(page.getByRole('status').filter({ hasText: /assignment created/i })).toBeVisible();
}

async function createCompensationRule(
  page: Page,
  projectId: string,
  workerId: string,
  input: Readonly<{
    decimalRate: string;
    ruleType: 'Hourly' | 'Daily';
    rateBasis: 'hourly' | 'daily';
  }>,
): Promise<void> {
  await page.goto(portal('/finance?view=commercial'), { waitUntil: 'networkidle' });
  const form = page.locator('form[action="?/createCompensationRule"]');
  await expect(form).toBeVisible();
  await form.locator('select[name="workerId"]').selectOption(workerId);
  await form.locator('select[name="projectId"]').selectOption(projectId);
  await form.locator('select[name="currency"]').selectOption('USD');
  await form.locator('select[name="ruleType"]').selectOption('PercentageOfEligibleClientLabor');
  await expect(form.locator('#finance-comp-percentage')).toBeVisible();
  await form.locator('select[name="ruleType"]').selectOption(input.ruleType);
  await expect(form.locator('input[name="percentageBps"]')).toHaveCount(0);
  await form.locator('select[name="rateBasis"]').selectOption(input.rateBasis);
  const visibleRate = form.locator('input[data-minor-target="rateMinor"]');
  await visibleRate.fill(input.decimalRate);
  await expect(form.locator('input[name="rateMinor"]')).toHaveValue(
    input.decimalRate === '25.00' ? '2500' : '18000',
  );
  await form.locator('input[name="effectiveFrom"]').fill(workDate);
  await submitAction(page, 'createCompensationRule', () =>
    form.getByRole('button', { name: 'Save compensation rule' }).click(),
  );
  await expect(
    page.getByRole('status').filter({ hasText: /compensation rule saved/i }),
  ).toBeVisible();
}

async function clearOptionalAssignmentFields(page: Page, project: IsolatedProject): Promise<void> {
  for (const clear of [false, true]) {
    await page.goto(portal('/projects'), { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Update Assignment', exact: true }).click();
    const form = page
      .locator('form[action="?/updateAssignment"]')
      .filter({ hasText: project.name })
      .filter({ hasText: project.hourlyWorker.name });
    await expect(form).toBeVisible();
    await form.locator('input[name="endsOn"]').fill(clear ? '' : '2099-12-31');
    await form.locator('input[name="plannedMinutes"]').fill(clear ? '' : '60');
    await form.locator('input[name="canReview"][type="checkbox"]').setChecked(!clear);
    await submitAction(page, 'updateAssignment', () =>
      form.getByRole('button', { name: 'Update assignment', exact: true }).click(),
    );
    const database = createDatabase(readE2EFixturePointer().databasePath);
    try {
      expect(
        database.sqlite
          .prepare(
            'SELECT ends_on,planned_minutes,can_review FROM project_member WHERE project_id=? AND user_id=?',
          )
          .get(project.id, project.hourlyWorker.id),
      ).toEqual(
        clear
          ? { ends_on: null, planned_minutes: null, can_review: 0 }
          : { ends_on: '2099-12-31', planned_minutes: 60, can_review: 1 },
      );
    } finally {
      database.sqlite.close();
    }
  }
}

async function recordAndSubmitOwnTime(
  page: Page,
  project: IsolatedProject,
  worker: Worker,
  summary: string,
): Promise<string> {
  await page.goto(portal('/time'), { waitUntil: 'networkidle' });
  await page.locator('[data-time-primary-cta]').click();
  const form = page.locator('form[data-time-entry-surface]').first();
  await expect(form).toBeVisible();
  await form.locator('select[name="projectId"]').selectOption(project.id);
  await form.locator('input[name="workDate"]').fill(workDate);
  await form.locator('select[name="category"]').selectOption('regular');
  await form.locator('input[name="minutes"]').fill(String(SIX_HOURS_MINUTES));
  await form.locator('textarea[name="summary"]').fill(summary);
  await submitAction(page, 'createTime', () =>
    form.getByRole('button', { name: 'Save draft', exact: true }).click(),
  );
  await expect(page.getByRole('status').filter({ hasText: /time draft saved/i })).toBeVisible();

  const draft = readTimeEntry(project.id, worker.id, summary);
  expect(draft.minutes).toBe(SIX_HOURS_MINUTES);
  expect(draft.approval_state).toBe('draft');

  await page.goto(portal('/time'), { waitUntil: 'networkidle' });
  const row = page.locator('.time-record').filter({ hasText: summary });
  await expect(row).toBeVisible();
  await submitAction(page, 'submitTime', () =>
    row.locator('form[action="?/submitTime"]').getByRole('button', { name: 'Submit' }).click(),
  );
  await expect(page.getByRole('status').filter({ hasText: /time submitted/i })).toBeVisible();
  expect(readTimeEntry(project.id, worker.id, summary).approval_state).toBe('submitted');
  return draft.id;
}

async function approveTime(page: Page, id: string): Promise<void> {
  await page.goto(portal('/approvals'), { waitUntil: 'networkidle' });
  const row = page.locator(`[data-approval-row="${id}"]`);
  await expect(row).toBeVisible();
  await submitAction(page, 'approveRecord', () =>
    row.locator('form[action="?/approveRecord"]').getByRole('button', { name: 'Approve' }).click(),
  );
  await expect(page.getByRole('status').filter({ hasText: /decision recorded/i })).toBeVisible();
}

function projectPayRow(page: Page, projectName: string): Locator {
  return page
    .getByRole('region', { name: 'Assignment budget context', exact: true })
    .locator('tr')
    .filter({ hasText: projectName });
}

test.describe('Manual evidence · two workers on one project retain distinct compensation and privacy', () => {
  test('Owner-configured hourly and daily rules resolve only each worker’s approved six-hour entry', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    // Viewports share fixture users: separate work dates preserve the real 24-hour cap.
    const viewportIndex = e2eLifecycleProjectNames.indexOf(
      testInfo.project.name as (typeof e2eLifecycleProjectNames)[number],
    );
    expect(viewportIndex).toBeGreaterThanOrEqual(0);
    workDate = `2026-08-${String(16 + viewportIndex).padStart(2, '0')}`;
    page.setDefaultTimeout(10_000);

    // Validates the disposable fixture pointer before any setup read or write.
    readE2EFixturePointer();
    const project = createIsolatedProject(testInfo.project.name);
    const sessions = new Map<
      keyof typeof e2eCredentials,
      Awaited<ReturnType<Page['context']>['cookies']>
    >();

    await switchRole(page, 'owner', sessions);
    await assignWorker(page, project.id, project.hourlyWorker.id);
    await assignWorker(page, project.id, project.dailyWorker.id);
    const assignments = readProjectAssignments(project.id);
    expect(assignments).toHaveLength(2);
    expect(assignments).toEqual(
      expect.arrayContaining([
        {
          user_id: project.hourlyWorker.id,
          project_id: project.id,
          status: 'active',
          starts_on: workDate,
          ends_on: null,
        },
        {
          user_id: project.dailyWorker.id,
          project_id: project.id,
          status: 'active',
          starts_on: workDate,
          ends_on: null,
        },
      ]),
    );
    await clearOptionalAssignmentFields(page, project);
    await createCompensationRule(page, project.id, project.hourlyWorker.id, {
      decimalRate: '25.00',
      ruleType: 'Hourly',
      rateBasis: 'hourly',
    });
    await createCompensationRule(page, project.id, project.dailyWorker.id, {
      decimalRate: '180.00',
      ruleType: 'Daily',
      rateBasis: 'daily',
    });

    const rules = readCompensationRules(project.id);
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          worker_id: project.hourlyWorker.id,
          project_id: project.id,
          currency: 'USD',
          rate_minor: '2500',
          rate_basis: 'hourly',
          rule_type: 'Hourly',
          effective_from: workDate,
        }),
        expect.objectContaining({
          worker_id: project.dailyWorker.id,
          project_id: project.id,
          currency: 'USD',
          rate_minor: '18000',
          rate_basis: 'daily',
          rule_type: 'Daily',
          effective_from: workDate,
        }),
      ]),
    );
    expect(rules).toHaveLength(2);

    const hourlySummary = `Manual hourly worker six-hour entry ${randomUUID()}`;
    const dailySummary = `Manual daily worker six-hour entry ${randomUUID()}`;
    await switchRole(page, 'worker', sessions);
    const hourlyTimeId = await recordAndSubmitOwnTime(
      page,
      project,
      project.hourlyWorker,
      hourlySummary,
    );
    await switchRole(page, 'worker2', sessions);
    const dailyTimeId = await recordAndSubmitOwnTime(
      page,
      project,
      project.dailyWorker,
      dailySummary,
    );

    await switchRole(page, 'owner', sessions);
    await approveTime(page, hourlyTimeId);
    await approveTime(page, dailyTimeId);
    for (const [id, worker] of [
      [hourlyTimeId, project.hourlyWorker],
      [dailyTimeId, project.dailyWorker],
    ] as const) {
      const entry = readTimeEntry(
        project.id,
        worker.id,
        worker.id === project.hourlyWorker.id ? hourlySummary : dailySummary,
      );
      expect(entry.id).toBe(id);
      expect(entry.minutes).toBe(SIX_HOURS_MINUTES);
      expect(entry.approval_state).toBe('approved');
      expect(entry.approved_by).toBe(project.owner.id);
      expect(entry.approved_at).not.toBeNull();
    }

    const hourlyPay = readWorkerProjectPay(project.id, project.hourlyWorker.id);
    expect(hourlyPay).toEqual({
      approvedMinutes: SIX_HOURS_MINUTES,
      estimatedApprovedMinor: '15000',
      estimatedPendingMinor: '0',
    });
    const dailyPay = readWorkerProjectPay(project.id, project.dailyWorker.id);
    expect(dailyPay).toEqual({
      approvedMinutes: SIX_HOURS_MINUTES,
      estimatedApprovedMinor: '18000',
      estimatedPendingMinor: '0',
    });

    await switchRole(page, 'worker', sessions);
    const hourlyOwnResponse = await page.request.get(portal(`/time/${hourlyTimeId}`));
    expect(hourlyOwnResponse.status(), 'a Worker must read their own time entry').toBe(200);
    const hourlyOtherResponse = await page.request.get(portal(`/time/${dailyTimeId}`));
    expect(hourlyOtherResponse.status(), 'a Worker must not read another Worker’s time entry').toBe(
      404,
    );
    await page.goto(portal(`/pay?start=${PERIOD_START}&end=${PERIOD_END}`), {
      waitUntil: 'networkidle',
    });
    const hourlyPayRow = projectPayRow(page, project.name);
    await expect(hourlyPayRow).toBeVisible();
    await expect(hourlyPayRow).toContainText('$150.00');
    await expect(hourlyPayRow).not.toContainText('$180.00');
    await expect(page.getByText(dailySummary, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Rafael Santos', { exact: true })).toHaveCount(0);
    await expect(page.getByText('180.00', { exact: false })).toHaveCount(0);

    await switchRole(page, 'worker2', sessions);
    const dailyOwnResponse = await page.request.get(portal(`/time/${dailyTimeId}`));
    expect(dailyOwnResponse.status(), 'the second Worker must read their own time entry').toBe(200);
    const dailyOtherResponse = await page.request.get(portal(`/time/${hourlyTimeId}`));
    expect(
      dailyOtherResponse.status(),
      'the second Worker must not read the first Worker’s time entry',
    ).toBe(404);
    await page.goto(portal(`/pay?start=${PERIOD_START}&end=${PERIOD_END}`), {
      waitUntil: 'networkidle',
    });
    const dailyPayRow = projectPayRow(page, project.name);
    await expect(dailyPayRow).toBeVisible();
    await expect(dailyPayRow).toContainText('$180.00');
    await expect(dailyPayRow).not.toContainText('$150.00');
    await expect(page.getByText(hourlySummary, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Alex Rivera', { exact: true })).toHaveCount(0);
    await expect(page.getByText('25.00', { exact: false })).toHaveCount(0);
  });
});
