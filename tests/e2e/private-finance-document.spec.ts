import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { e2eCredentials, portal, signIn } from './auth.js';
import { createDatabase } from '@ja/database';
import { e2eDatabasePath } from './environment.js';

test('Owner uploads financial evidence through the form and operational roles cannot retrieve it', async ({
  browser,
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/documents?lang=en'));
  const project = page.getByRole('combobox', { name: 'Project', exact: true });
  const { sqlite } = createDatabase(e2eDatabasePath);
  let projectId: string | undefined;
  try {
    projectId = (
      sqlite
        .prepare(
          `SELECT pm.project_id FROM project_member pm JOIN user u ON u.id=pm.user_id JOIN project p ON p.id=pm.project_id WHERE u.email IN (?,?) AND pm.status='active' AND pm.starts_on<=date('now') AND (pm.ends_on IS NULL OR pm.ends_on>=date('now')) AND p.status='active' GROUP BY pm.project_id HAVING COUNT(DISTINCT u.id)=2 LIMIT 1`,
        )
        .get(e2eCredentials.manager.email, e2eCredentials.worker.email) as
        | { project_id: string }
        | undefined
    )?.project_id;
  } finally {
    sqlite.close();
  }
  expect(projectId).toBeTruthy();
  await project.selectOption(projectId!);
  await page.getByRole('textbox', { name: 'Artifact type', exact: true }).fill('payroll');
  await page.getByLabel('Document access', { exact: true }).selectOption('finance');
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Restricted financial evidence');
  const filename = `finance-${randomUUID()}.txt`;
  await page.locator('#doc-file').setInputFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Synthetic financial evidence ${filename}`),
  });
  await page.getByRole('button', { name: 'Upload and register hash', exact: true }).click();
  const row = page.locator('.invoice-row').filter({ hasText: filename });
  await expect(row).toBeVisible();
  const download = await row
    .getByRole('link', { name: 'Download', exact: true })
    .getAttribute('href');
  expect(download).toBeTruthy();
  for (const role of ['manager', 'worker'] as const) {
    const context = await browser.newContext();
    try {
      const operational = await context.newPage();
      await signIn(operational, role);
      await operational.goto(portal('/documents?lang=en'));
      await expect(operational.locator(`#doc-project option[value="${projectId}"]`)).toHaveCount(1);
      await expect(operational.getByLabel('Document access', { exact: true })).toHaveCount(0);
      await expect(operational.getByText(filename, { exact: true })).toHaveCount(0);
      const response = await context.request.get(new URL(download!, page.url()).href);
      expect(response.status()).toBe(404);
    } finally {
      await context.close();
    }
  }
});
