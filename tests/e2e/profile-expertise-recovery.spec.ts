import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('Worker removes expertise added through the UI and its removal survives reload', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const suffix = randomUUID();
  const name = `Browser profile expertise ${suffix}`;
  await signIn(page, 'owner');
  await page.goto(portal('/planning?lang=en'), { waitUntil: 'networkidle' });
  const create = page.locator('form[data-workforce-operation="createSkill"]');
  await page.locator('#planning-skills > details > summary').click();
  await page.locator('details').filter({ has: create }).last().locator(':scope > summary').click();
  await create.locator('[name="code"]').fill(`QA-${suffix.slice(0, 8)}`);
  await create.locator('[name="name"]').fill(name);
  await create.getByRole('button', { name: 'Save expertise', exact: true }).click();
  const worker = await browser.newPage();
  try {
    await worker.setViewportSize(page.viewportSize()!);
    await signIn(worker, 'worker');
    await worker.goto(portal('/profile?lang=en'), { waitUntil: 'networkidle' });
    const add = worker.locator('form[data-workforce-operation="setWorkerSkill"]');
    await worker.locator('details').filter({ has: add }).locator(':scope > summary').click();
    const option = add.locator('select[name="skillId"] option').filter({ hasText: name });
    const skillId = await option.getAttribute('value');
    expect(skillId).toMatch(/^[0-9a-f-]{36}$/u);
    await add.locator('[name="skillId"]').selectOption(skillId!);
    await add.locator('[name="proficiency"]').fill('5');
    await add.getByRole('button', { name: 'Add expertise', exact: true }).click();
    await expect(worker.getByRole('row').filter({ hasText: name })).toContainText('5/5');
    const remove = worker.locator('form[data-workforce-operation="deleteWorkerSkill"]');
    await worker.locator('details').filter({ has: remove }).locator(':scope > summary').click();
    const removeOption = remove.locator('select[name="skillId"] option').filter({ hasText: name });
    await expect(removeOption).toHaveAttribute('value', skillId!);
    await remove.locator('[name="skillId"]').selectOption(skillId!);
    const removed = worker.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/deleteWorkerSkill'),
    );
    await remove.getByRole('button', { name: 'Remove expertise', exact: true }).click();
    expect((await removed).status()).toBe(200);
    await expect(worker.getByRole('row').filter({ hasText: name })).toHaveCount(0);
    await worker.reload({ waitUntil: 'networkidle' });
    await expect(worker.getByRole('row').filter({ hasText: name })).toHaveCount(0);
    await expect(
      worker
        .locator('form[data-workforce-operation="deleteWorkerSkill"] option')
        .filter({ hasText: name }),
    ).toHaveCount(0);
  } finally {
    await worker.close();
  }
});
