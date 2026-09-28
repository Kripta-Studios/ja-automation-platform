import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Locator } from '@playwright/test';
import { e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

async function selectWizardStep(sheet: Locator, index: number): Promise<void> {
  const desktopSteps = sheet.locator('.billing-section__wizard-progress');
  if (await desktopSteps.isVisible()) {
    await desktopSteps.locator('li').nth(index).getByRole('button').click();
    return;
  }
  const mobileSteps = sheet.locator('.billing-section__wizard-mobile-progress');
  if (!(await mobileSteps.evaluate((details: HTMLDetailsElement) => details.open)))
    await mobileSteps.locator('summary').click();
  await mobileSteps.locator('li').nth(index).getByRole('button').click();
}

test('owner sees one actionable warning when closing a client with open projects', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const fixture = e2eLifecycleFixturesFor(info.project.name);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'owner');
    await page.goto(portal('/projects?lang=en'));
    const clientSection = page.locator('.client-management-list > details');
    if (!(await clientSection.evaluate((details: HTMLDetailsElement) => details.open)))
      await clientSection.locator('summary').click();
    const client = page.locator(`#client-controls-${fixture.client.id}`);
    await expect(client).toBeAttached();
    const closeForm = client
      .locator('form[action="?/transitionClient"]')
      .filter({ has: page.locator('input[name="status"][value="closed"]') });
    await expect(closeForm.getByRole('button', { name: 'Close client' })).toBeVisible();
    await closeForm.locator('input[name="reason"]').fill('QA closure with open project');
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' && candidate.url().includes('?/transitionClient'),
    );
    await closeForm.getByRole('button', { name: 'Close client' }).click();
    expect((await response).status()).toBe(409);
    const notice = page.locator('[data-problem-code="CLIENT_CLOSE_OPEN_PROJECTS"]');
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText('Close or archive');
    await expect(notice.getByRole('link', { name: 'Review client projects' })).toHaveAttribute(
      'href',
      /\/app\/projects\?view=clients$/u,
    );
    expect(db.prepare('SELECT status FROM client WHERE id=?').get(fixture.client.id)).toEqual({
      status: 'active',
    });
    await notice.getByRole('link', { name: 'Review client projects' }).click();
    await expect(page).toHaveURL(/\/projects\?view=clients/u);
  } finally {
    db.close();
  }
});

test('manager stale assignment form keeps dates and offers an allowed review link', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'manager');
    await page.goto(portal('/projects?lang=en&action=update-assignment'));
    const form = page
      .locator('[data-project-workflow="manage-assignment"] form[action="?/updateAssignment"]')
      .first();
    await expect(form).toBeVisible();
    const assignmentId = await form.locator('input[name="assignmentId"]').inputValue();
    const oldVersion = Number(await form.locator('input[name="version"]').inputValue());
    const startsOn = await form.locator('input[name="startsOn"]').inputValue();
    const endsOn = await form.locator('input[name="endsOn"]').inputValue();
    expect(assignmentId).toBeTruthy();
    expect(Number.isSafeInteger(oldVersion)).toBe(true);
    db.prepare('UPDATE project_member SET version=version+1 WHERE id=?').run(assignmentId);

    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' && candidate.url().includes('?/updateAssignment'),
    );
    await form.getByRole('button', { name: 'Update assignment' }).click();
    expect((await response).status()).toBe(409);
    const notice = page.locator('[data-problem-code="ASSIGNMENT_STALE"]');
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText('changed while you were editing');
    await expect(notice.getByRole('link', { name: 'Review assignments' })).toHaveAttribute(
      'href',
      /\/app\/projects\?action=update-assignment#project-assignment-list$/u,
    );
    await expect(form.locator('input[name="startsOn"]')).toHaveValue(startsOn);
    await expect(form.locator('input[name="endsOn"]')).toHaveValue(endsOn);
    expect(db.prepare('SELECT version FROM project_member WHERE id=?').get(assignmentId)).toEqual({
      version: oldVersion + 1,
    });
    await notice.getByRole('link', { name: 'Review assignments' }).click();
    await expect(page).toHaveURL(/action=update-assignment/u);
  } finally {
    db.close();
  }
});

test('owner checks an empty future billing period and gets a review path', async ({
  page,
}, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  test.setTimeout(90_000);
  await signIn(page, 'owner');
  await page.goto(portal('/billing?lang=en'));
  await page.getByRole('button', { name: 'Create invoice' }).click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('combobox', { name: 'Project and billing stream' })).toBeVisible();
  await selectWizardStep(sheet, 3);
  await sheet.getByLabel('Period start').fill('2099-01-01');
  await sheet.getByLabel('Period end').fill('2099-01-31');
  const readinessResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'GET' && candidate.url().includes('/api/billing/readiness'),
  );
  await sheet.getByRole('button', { name: 'Check selected period' }).click();
  const readiness = await readinessResponse;
  expect(readiness.status()).toBe(200);
  const preview = (await readiness.json()) as {
    includedSourceCount: number;
    hasPositiveDraftAmount: boolean;
  };
  expect(preview.includedSourceCount).toBe(0);
  expect(preview.hasPositiveDraftAmount).toBe(false);
  await selectWizardStep(sheet, 4);
  await expect(sheet.getByRole('alert').filter({ hasText: 'Choose another period' })).toBeVisible();
  await selectWizardStep(sheet, 5);
  await expect(sheet.getByRole('heading', { name: 'Excluded / pending' })).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Review pending records' })).toHaveAttribute(
    'href',
    /\/app\/approvals\?project=/u,
  );
  await expect(sheet.locator('[data-ui="problem-notice"]')).toHaveCount(0);
  await selectWizardStep(sheet, 11);
  await expect(sheet.getByRole('button', { name: 'Save invoice draft' })).toBeDisabled();
});
