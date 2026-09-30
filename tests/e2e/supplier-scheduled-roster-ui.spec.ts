import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const supplierState = process.env.JA_UI_SUPPLIER_STATE;
const projectId = process.env.JA_UI_SUPPLIER_PROJECT;
test.use({ storageState: supplierState || undefined });

test('Supplier records future team hours only within the UI-created technician assignment', async ({
  page,
}) => {
  test.skip(
    !supplierState || !projectId,
    'Requires an existing UI-authenticated Supplier and authorized project; no seeded Supplier fixture.',
  );
  test.setTimeout(90_000);
  const name = `UI scheduled technician ${randomUUID()}`;
  const dates = await page.evaluate(() => {
    const date = new Date();
    const day = (offset: number) => {
      const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    };
    return { before: day(0), start: day(1), end: day(3), after: day(4) };
  });
  const query = new URLSearchParams({
    projectId: projectId!,
    lang: 'en',
    workspaceAction: 'personnel',
  });
  await page.goto(`/j-aautomation/app/supplier?${query}`, { waitUntil: 'networkidle' });
  const create = page.locator('form[data-supplier-operation="addTechnician"]');
  await create.locator('[name="projectId"]').selectOption(projectId!);
  await create.locator('[name="name"]').fill(name);
  await create.locator('[name="startsOn"]').fill(dates.start);
  await create.locator('[name="endsOn"]').fill(dates.end);
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('/addTechnician'),
  );
  await create.getByRole('button', { name: 'Add technician', exact: true }).click();
  expect((await created).status()).toBe(200);
  const personnel = page.locator('li').filter({ hasText: name });
  await expect(personnel).toContainText('Future');
  await expect(personnel).toContainText(dates.start);
  await page.getByRole('button', { name: 'Record team hours', exact: true }).click();
  const batch = page.locator('form[data-supplier-operation="createTimeBatch"]');
  const choice = batch
    .locator('.batch-technician')
    .filter({ hasText: name })
    .locator('input[type="checkbox"]');
  await batch.locator('[name="workDate"]').fill(dates.before);
  await expect(choice).toHaveCount(0);
  await batch.locator('[name="workDate"]').fill(dates.start);
  await expect(choice).toHaveCount(1);
  await choice.check();
  await batch.locator('[name="workDate"]').fill(dates.end);
  await expect(choice).toBeChecked();
  await batch.locator('[name="workDate"]').fill(dates.after);
  await expect(choice).toHaveCount(0);
  await expect(batch.locator('[name="workerIds"]')).toHaveValue('');
  await batch.locator('[name="workDate"]').fill(dates.start);
  await choice.check();
  await batch.locator('[name="durationHours"]').fill('0.5');
  await batch.locator('[name="summary"]').fill(`Future assignment UI regression ${name}`);
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('/createTimeBatch'),
  );
  await batch.getByRole('button', { name: 'Save selected drafts', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.locator('.supplier-page')).toContainText(name);
  await expect(page.locator('.supplier-page')).toContainText(dates.start);
  const reportQuery = new URLSearchParams({
    projectId: projectId!,
    from: dates.start,
    to: dates.start,
    lang: 'en',
    workspaceAction: 'report',
  });
  await page.goto(`/j-aautomation/app/supplier?${reportQuery}`, { waitUntil: 'networkidle' });
  const draft = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: `${name} · ${dates.start}`, exact: true }) });
  await expect(draft).toContainText('0.5');
  await expect(draft).toContainText('Draft');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(draft).toContainText('0.5');
});
