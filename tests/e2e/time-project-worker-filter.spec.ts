import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { e2eCredentials, e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

const requiredViewports = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function seedTimeRecords(viewport: string) {
  const database = createDatabase(readE2EFixturePointer().databasePath);
  const today = new Date().toISOString().slice(0, 10);
  const marker = `Time filters ${randomUUID()}`;
  try {
    const repository = new PortalRepository(database.sqlite);
    const userId = (email: string) =>
      String(database.sqlite.prepare('SELECT id FROM user WHERE email=?').get(email)!.id);
    const ownerId = userId(e2eCredentials.owner.email);
    const session = database.sqlite
      .prepare('SELECT id FROM session WHERE user_id=? ORDER BY created_at DESC LIMIT 1')
      .get(ownerId) as { id: string } | undefined;
    if (!session) throw new Error('Owner browser session is missing');
    const owner = repository.principalFor(ownerId, session.id);
    const workerOne = userId(e2eCredentials.worker.email);
    const workerTwo = userId(e2eCredentials.worker2.email);
    const projectOne = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Time filter project one ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QATIME', 26, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    });
    const projectTwo = repository.createProject(owner, {
      clientId: e2eLifecycleFixturesFor(viewport).client.id,
      name: `Time filter project two ${randomUUID()}`,
      costCenterCode: e2eCostCenter('QATIME', 27, viewport),
      currency: 'USD',
      timezone: 'UTC',
      billingModel: 'tm',
      startDate: today,
    });
    repository.assignWorker(owner, {
      projectId: projectOne.id,
      workerId: workerOne,
      startsOn: today,
    });
    repository.assignWorker(owner, {
      projectId: projectOne.id,
      workerId: workerTwo,
      startsOn: today,
    });
    repository.assignWorker(owner, {
      projectId: projectTwo.id,
      workerId: workerTwo,
      startsOn: today,
    });

    for (let index = 0; index < 9; index += 1) {
      repository.createTimeEntry(
        owner,
        {
          projectId: projectOne.id,
          workDate: addDays(today, index),
          category: 'regular',
          minutes: 60,
          summary: `${marker} worker two ${String(index + 1).padStart(2, '0')}`,
        },
        workerTwo,
      );
    }
    repository.createTimeEntry(
      owner,
      {
        projectId: projectOne.id,
        workDate: addDays(today, 10),
        category: 'regular',
        minutes: 60,
        summary: `${marker} worker one`,
      },
      workerOne,
    );
    repository.createTimeEntry(
      owner,
      {
        projectId: projectTwo.id,
        workDate: addDays(today, 11),
        category: 'regular',
        minutes: 60,
        summary: `${marker} worker two other project`,
      },
      workerTwo,
    );

    return { marker, projectId: projectOne.id, projectTwoId: projectTwo.id, workerOne, workerTwo };
  } finally {
    database.sqlite.close();
  }
}

test('owner combines visible project and worker filters, resets paging, and clears them', async ({
  page,
}, info) => {
  test.skip(!requiredViewports.has(info.project.name));
  await signIn(page, 'owner');
  const fixture = seedTimeRecords(info.project.name);
  await page.goto(portal('/time?lang=en'));

  const filters = page.getByRole('form', { name: 'Filter time entries' });
  const search = filters.getByRole('searchbox', { name: 'Search register' });
  const project = filters.getByRole('combobox', { name: 'Project', exact: true });
  const worker = filters.getByRole('combobox', { name: 'Worker', exact: true });
  await expect(search).toBeVisible();
  await expect(project).toBeVisible();
  await expect(worker).toBeVisible();
  await expect(project.locator(`option[value="${fixture.projectId}"]`)).toHaveCount(1);
  await expect(worker.locator(`option[value="${fixture.workerOne}"]`)).toHaveCount(1);
  await expect(worker.locator(`option[value="${fixture.workerTwo}"]`)).toHaveCount(1);

  await search.fill(fixture.marker);
  const count = page.locator('[data-filter-summary] [role="status"]');
  await expect(count).toContainText('11 matching records');
  const pager = page.getByRole('navigation', { name: 'Time register pages' });
  await expect(pager).toContainText('Page 1 of 2');
  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(pager).toContainText('Page 2 of 2');

  await project.selectOption(fixture.projectId);
  await expect(count).toContainText('10 matching records');
  await expect(pager).toContainText('Page 1 of 2');
  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(pager).toContainText('Page 2 of 2');

  await worker.selectOption(fixture.workerOne);
  await expect(count).toContainText('1 matching records');
  await expect(pager).toHaveCount(0);
  await expect(page.locator('.time-record-summary')).toHaveText(`${fixture.marker} worker one`);

  await worker.selectOption(fixture.workerTwo);
  await expect(count).toContainText('9 matching records');
  await expect(pager).toContainText('Page 1 of 2');
  const visibleSummaries = await page.locator('.time-record-summary').allTextContents();
  expect(visibleSummaries).toHaveLength(8);
  for (const summary of visibleSummaries)
    expect(summary).toMatch(new RegExp(`${fixture.marker} worker two`, 'u'));
  await expect(
    page.locator('.time-record-summary').filter({ hasText: 'other project' }),
  ).toHaveCount(0);

  await filters.getByRole('link', { name: 'Clear filters', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(project).toHaveValue('');
  await expect(worker).toHaveValue('');
  await expect(page).toHaveURL((url) =>
    ['q', 'project', 'worker'].every((key) => !url.searchParams.get(key)),
  );
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Expected a configured browser viewport');
  for (const control of [search, project, worker]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  }
  await page.locator('[data-time-primary-cta]').click();
  const entryForm = page.locator('form[data-time-entry-surface]');
  await entryForm.locator('[name="workDate"]').fill(new Date().toISOString().slice(0, 10));
  await entryForm.locator('[name="projectId"]').selectOption(fixture.projectId);
  const assignedWorkers = entryForm.locator('[name="workerId"]');
  await expect
    .poll(() =>
      assignedWorkers
        .locator('option[value]:not([value=""])')
        .evaluateAll((options) =>
          options.map((option) => (option as HTMLOptionElement).value).sort(),
        ),
    )
    .toEqual([fixture.workerOne, fixture.workerTwo].sort());
  await assignedWorkers.selectOption(fixture.workerOne);
  await entryForm.locator('[name="projectId"]').selectOption(fixture.projectTwoId);
  await expect
    .poll(() =>
      assignedWorkers
        .locator('option[value]:not([value=""])')
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
    )
    .toEqual([fixture.workerTwo]);
  await expect(assignedWorkers).not.toHaveValue(fixture.workerOne);
});
