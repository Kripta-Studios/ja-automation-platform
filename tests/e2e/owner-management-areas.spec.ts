import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { signIn, portal, e2eLifecycleFixturesFor } from './auth.js';

test('Owner management areas load and navigation remains usable', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signIn(page, 'owner');
  for (const route of [
    '/manage',
    '/projects?view=clients',
    '/projects?view=team',
    '/supplier',
    '/planning',
    '/documents',
    '/finance?view=commercial',
    '/billing',
    '/ledger',
    '/accounting',
    '/reports',
    '/time',
    '/expenses',
  ]) {
    const response = await page.goto(portal(route));
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('main').first()).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain('Internal Error');
  }
  await page.goto(portal('/manage?lang=es'));
  await expect(page.getByRole('heading', { name: 'Gestión de datos', exact: true })).toBeVisible();
  if (page.viewportSize()!.width < 1024) {
    await page
      .getByRole('button', { name: /navegación|navigation/i })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  mkdirSync('docs/evidence/owner-finance-20260910', { recursive: true });
  await page.screenshot({
    path: `docs/evidence/owner-finance-20260910/owner-management-${testInfo.project.name}.png`,
    fullPage: false,
  });
});

for (const kind of ['project_milestone', 'technical_change'] as const) {
  test(`Owner creates, edits and deletes ${kind} using labelled forms`, async ({
    page,
  }, testInfo) => {
    await signIn(page, 'owner');
    const projectId = e2eLifecycleFixturesFor(testInfo.project.name).project.id;
    const name = `Owner management ${randomUUID()}`;
    await page.goto(portal(`/manage?area=${kind}&lang=en`));
    const activeArea = page
      .getByRole('navigation', { name: 'Management areas' })
      .locator('[aria-current="page"]');
    await expect(activeArea).toHaveCount(1);
    await expect(activeArea).toHaveAttribute('href', `?area=${kind}`);
    const addRecord = page.getByText('Add record', { exact: true });
    await expect(addRecord).toHaveCSS('border-top-style', 'solid');
    expect(
      await addRecord.evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    await addRecord.click();
    const create = page
      .locator('form[action^="?/manageCatalog"]')
      .filter({ has: page.locator('input[name="id"][value=""]') });
    const save = create.getByRole('button', { name: 'Save changes' });
    await expect(save).toHaveCSS('border-top-style', 'solid');
    expect(await save.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
    expect(await save.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(
      44,
    );
    await create.locator('select[name="project_id"]').selectOption(projectId);
    await create
      .locator(`input[name="${kind === 'project_milestone' ? 'name' : 'component'}"]`)
      .fill(name);
    if (kind === 'project_milestone') await create.locator('input[name="amount"]').fill('123.45');
    else await create.locator('input[name="change_made"]').fill('Verified operational change');
    await create.locator('textarea[name="reason"]').fill('Create browser test record');
    await create.locator('input[name="confirmed"]').check();
    await create.getByRole('button', { name: 'Save changes' }).click();
    let row = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(row).toBeVisible();
    await row.getByText('Edit', { exact: true }).click();
    await row
      .locator(`input[name="${kind === 'project_milestone' ? 'name' : 'component'}"]`)
      .fill(name + ' updated');
    await row.locator('textarea[name="reason"]').fill('Correct browser record');
    await row.locator('input[name="confirmed"]').check();
    await row.getByRole('button', { name: 'Save changes' }).click();
    row = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: name + ' updated', exact: true }) });
    await expect(row).toBeVisible();
    await row.getByText('Edit', { exact: true }).click();
    await row.locator('textarea[name="reason"]').fill('Delete browser record');
    await row.locator('input[name="confirmed"]').check();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('heading', { name: name + ' updated', exact: true })).toHaveCount(
      0,
    );
  });
}
