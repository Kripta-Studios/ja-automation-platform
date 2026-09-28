import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { e2eCostCenter } from './project-cost-center.js';

test('project actions remain reachable from the list, detail, and selected calendar day', async ({
  page,
}, testInfo) => {
  test.skip(!['phone-390', 'desktop'].includes(testInfo.project.name));
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.locator('form[action="?/createProject"]')).toBeVisible();
    await page.getByRole('button', { name: 'All projects' }).click();
    await expect(page.locator('#project-register')).toContainText('Authorized projects');
    await expect(page.locator('#project-register .project-list-link').first()).toBeVisible();

    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const create = page.locator('form[action="?/createProject"]');
    const impc = create.locator('[name="clientId"] option').filter({ hasText: 'IMPC Gmbh' });
    await expect(impc).toHaveCount(1);
    const impcId = await impc.getAttribute('value');
    if (!impcId) throw new Error('The seeded IMPC client needs a selectable identifier');
    await create.locator('[name="clientId"]').selectOption(impcId);
    const name = `Project actions ${testInfo.project.name} ${randomUUID()}`;
    await create.locator('[name="name"]').fill(name);
    await create
      .locator('[name="costCenterCode"]')
      .fill(e2eCostCenter('QA-PROJECT-ACTIONS', 3, testInfo.project.name));
    await create.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect
      .poll(() => db.prepare('SELECT id FROM project WHERE name=?').get(name))
      .toBeTruthy();
    expect(db.prepare('SELECT client_id FROM project WHERE name=?').get(name)).toEqual({
      client_id: impcId,
    });
    const project = db.prepare('SELECT id FROM project WHERE name=?').get(name) as { id: string };

    await page.goto(portal('/projects'));
    await page.locator('summary').filter({ hasText: 'Create Milestone' }).click();
    const milestoneName = `Milestone actions ${randomUUID()}`;
    const milestoneForm = page.locator('form[action="?/createMilestone"]');
    await milestoneForm.locator('[name="projectId"]').selectOption(project.id);
    await milestoneForm.locator('[name="name"]').fill(milestoneName);
    await milestoneForm.locator('[name="amountMinor"]').fill('100');
    await milestoneForm.getByRole('button', { name: 'Save milestone' }).click();
    await expect
      .poll(() => db.prepare('SELECT id FROM project_milestone WHERE name=?').get(milestoneName))
      .toBeTruthy();
    const milestone = db
      .prepare('SELECT id FROM project_milestone WHERE name=?')
      .get(milestoneName) as { id: string };

    await page.goto(portal(`/projects/${project.id}`));
    await expect(page.getByRole('link', { name: /View all expenses/ })).toHaveAttribute(
      'href',
      new RegExp(`expenses\\?project=${project.id}`),
    );
    await page.goto(portal(`/projects/${project.id}?tab=team`));
    await page
      .locator('.planning-calendar .calendar-day')
      .filter({ hasText: /^25/ })
      .first()
      .click();
    await expect(page.getByRole('link', { name: /Open planning for this day/ })).toHaveAttribute(
      'href',
      new RegExp(`date=2026-09-25`),
    );
    await page.getByRole('link', { name: /Open planning for this day/ }).click();
    await expect(page.locator('form[action="?/createPlanning"] [name="startsAt"]')).toHaveValue(
      '2026-09-25T08:00',
    );

    await page.goto(portal(`/projects/${project.id}?tab=commercial`));
    await expect(page.getByRole('link', { name: /Configure commercial terms/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Edit economics inputs/ })).toBeVisible();
    await page.getByRole('link', { name: /Create or edit milestones/ }).click();
    await expect(page).toHaveURL(/\/manage\?area=project_milestone/);
    await expect(page.getByText('Add record')).toBeVisible();
    await page.getByText('Add record').click();
    await expect(
      page
        .locator('form[action="?/manageCatalog&area=project_milestone"] select[name="project_id"]')
        .first(),
    ).toHaveValue(project.id);
    await page.goto(portal(`/manage?area=project_milestone&focus=${milestone.id}`));
    await page
      .locator('.management-records article')
      .filter({ hasText: milestoneName })
      .getByRole('button', { name: 'Submit for approval now' })
      .click();
    await expect
      .poll(() =>
        db.prepare('SELECT approval_state FROM project_milestone WHERE id=?').get(milestone.id),
      )
      .toEqual({ approval_state: 'submitted' });
  } finally {
    db.close();
  }
});

test('finance and audit viewers see milestones without an owner-only management link', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'owner');
    await page.goto(portal('/projects'));
    await page.locator('summary').filter({ hasText: 'Create Milestone' }).click();
    const form = page.locator('form[action="?/createMilestone"]');
    const projectId = await form.locator('[name="projectId"] option').nth(1).getAttribute('value');
    if (!projectId) throw new Error('The fixture needs a project for milestone access checks');
    const milestoneName = `Read-only milestone ${randomUUID()}`;
    await form.locator('[name="projectId"]').selectOption(projectId);
    await form.locator('[name="name"]').fill(milestoneName);
    await form.locator('[name="amountMinor"]').fill('100');
    await form.getByRole('button', { name: 'Save milestone' }).click();
    await expect
      .poll(() => db.prepare('SELECT id FROM project_milestone WHERE name=?').get(milestoneName))
      .toBeTruthy();

    for (const role of ['finance', 'auditor'] as const) {
      await page.context().clearCookies();
      await signIn(page, role);
      await page.goto(portal(`/projects/${projectId}?tab=commercial`));
      const row = page
        .locator('.compact-record-list .compact-record')
        .filter({ hasText: milestoneName });
      await expect(row).toBeVisible();
      await expect(row).toHaveJSProperty('tagName', 'DIV');
      await expect(row).not.toHaveAttribute('href', /manage/);
    }
  } finally {
    db.close();
  }
});
