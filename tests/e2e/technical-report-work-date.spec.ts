import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('technical report detail displays the recorded work date after reload', async ({ page }) => {
  await signIn(page, 'worker');
  await page.goto(portal('/reports?view=technical&lang=en'), { waitUntil: 'networkidle' });
  await page
    .getByRole('tabpanel', { name: 'Technical / PLC', exact: true })
    .getByRole('button', { name: 'New technical report', exact: true })
    .click();
  const form = page.locator('form[data-report-entry-surface="technical"]');
  const project = form.locator('select[name="projectId"]');
  const projectId = await project
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).find(Boolean),
    );
  if (!projectId) throw new Error('Worker needs an assigned project to record a technical report.');
  await project.selectOption(projectId);
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  const workDate = date.toISOString().slice(0, 10);
  const systemName = `UI work date audit ${randomUUID()}`;
  await form.getByLabel('Work date', { exact: true }).fill(workDate);
  await form.getByLabel('System / machine', { exact: true }).fill(systemName);
  for (const label of [
    'Problem / symptom',
    'Diagnosis / root cause',
    'Change performed',
    'Validation result',
  ])
    await form.getByLabel(label, { exact: true }).fill('Synthetic browser audit only.');
  await form.getByRole('button', { name: 'Save PLC report', exact: true }).click();
  await expect(form).toBeHidden();
  await page.getByRole('tab', { name: 'Technical / PLC', exact: true }).click();
  await page.getByLabel('Search register', { exact: true }).fill(systemName);
  const record = page.locator('.report-register-link').filter({ hasText: systemName });
  await expect(record).toHaveCount(1);
  await expect(record).toContainText(workDate);
  await record.click();
  await expect(page.locator('.record-detail-header')).toContainText(workDate);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.record-detail-header')).toContainText(workDate);
});
