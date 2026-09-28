import { expect, test } from '@playwright/test';

const base = '/j-aautomation/app';
const qaProjectId = process.env.JA_PROD_QA_PROJECT_ID;
const qaWorkerId = process.env.JA_PROD_QA_WORKER_ID;
const expertiseCode = 'QA-INSTALL-SUPERVISION';
const expertiseName = 'QA installation supervision';

test('owner creates and assigns QA expertise, then filters project workers', async ({ page }) => {
  if (!qaProjectId || !qaWorkerId)
    throw new Error('Designated QA project and worker IDs are required');

  await page.goto(`${base}/planning`);
  await page.locator('.planning-skill-tools > details > summary').click();
  const skillOption = page.locator(`select[name="skillId"] option`, { hasText: expertiseCode }).first();
  if ((await skillOption.count()) === 0) {
    await page.getByText('New expertise', { exact: true }).click();
    const create = page.locator('form[action="?/createSkill"]');
    await create.locator('[name="code"]').fill(expertiseCode);
    await create.locator('[name="name"]').fill(expertiseName);
    await create.getByRole('button', { name: 'Save expertise' }).click();
    await page.goto(`${base}/planning`);
    await page.locator('.planning-skill-tools > details > summary').click();
  }

  await page.locator('.planning-skill-tools summary').filter({ hasText: 'Assign expertise' }).click();
  const assign = page.locator('form[action="?/setWorkerSkill"]').first();
  await assign.locator('[name="workerId"]').selectOption(qaWorkerId);
  const expertiseOption = assign.locator('select[name="skillId"] option', {
    hasText: expertiseCode,
  });
  const expertiseId = await expertiseOption.getAttribute('value');
  if (!expertiseId) throw new Error('QA expertise was not saved');
  await assign.locator('select[name="skillId"]').selectOption(expertiseId);
  await assign.locator('select[name="proficiency"]').selectOption('4');
  await assign.getByRole('button', { name: 'Update expertise matrix' }).click();

  await page.goto(`${base}/projects?action=assign-worker&project=${qaProjectId}`);
  const form = page.locator('[data-project-workflow="assign-worker"] form[action="?/assignWorker"]');
  await expect(form).toBeVisible();
  const filter = form.getByLabel('Filter workers by expertise');
  await filter.selectOption(expertiseId);
  await expect(form.locator(`select[name="workerId"] option[value="${qaWorkerId}"]`)).toHaveCount(1);
  const viewport = page.viewportSize();
  if (viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width + 1,
    );
});
