import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('project day actions open the dated form in view', async ({ page }, info) => {
  test.skip(!['phone-390', 'desktop'].includes(info.project.name));
  await signIn(page, 'manager');
  await page.goto(portal('/projects'));
  const projectHref = await page.locator('main a[href*="/app/projects/"]').first().getAttribute('href');
  expect(projectHref).toBeTruthy();

  async function selectDay(): Promise<string> {
    await page.goto(new URL(projectHref!, portal('/')).href.replace(/\?.*$/, '') + '?tab=team');
    await page.locator('[data-ui="planning-calendar"] .calendar-day:not(.outside-month)').first().click();
    const href = await page.getByRole('link', { name: /Open planning for this day/ }).getAttribute('href');
    return new URL(href!, portal('/')).searchParams.get('date')!;
  }

  const date = await selectDay();
  await page.getByRole('link', { name: /Open planning for this day/ }).click();
  await expect(page).toHaveURL(/#planning-create-form$/);
  const planningStart = page.locator('#planning-create-form input[name="startsAt"]');
  await expect(planningStart).toHaveValue(`${date}T08:00`);
  await expect(planningStart).toBeFocused();
  await expect.poll(async () => (await planningStart.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((await planningStart.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height);

  await selectDay();
  await page.getByRole('link', { name: /Record time for this day/ }).click();
  const timeForm = page.locator('form[action="?/createTime"]');
  await expect(timeForm).toBeVisible();
  await expect(timeForm.locator('input[name="workDate"]')).toHaveValue(date);

  await selectDay();
  await page.getByRole('link', { name: /Add expense for this day/ }).click();
  const expenseForm = page.locator('form[action="?/createExpense"]');
  await expect(expenseForm).toBeVisible();
  await expect(expenseForm.locator('input[name="spentOn"]')).toHaveValue(date);
});

test('worker project day opens the dated planning agenda', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-390');
  await signIn(page, 'worker');
  await page.goto(portal('/projects'));
  const projectHref = await page.locator('main a[href*="/app/projects/"]').first().getAttribute('href');
  expect(projectHref).toBeTruthy();
  await page.goto(new URL(projectHref!, portal('/')).href.replace(/\?.*$/, '') + '?tab=team');
  await page.locator('[data-ui="planning-calendar"] .calendar-day:not(.outside-month)').first().click();
  const link = page.getByRole('link', { name: /Open planning for this day/ });
  const date = new URL((await link.getAttribute('href'))!, portal('/')).searchParams.get('date');
  await link.click();
  await expect(page).toHaveURL(/#planning-day-agenda$/);
  const agenda = page.locator('#planning-day-agenda');
  await expect(agenda).toBeFocused();
  await expect(agenda).toBeVisible();
  expect((await agenda.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect((await agenda.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height);
  await expect(page.locator('#planning-create-form')).toHaveCount(0);
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
