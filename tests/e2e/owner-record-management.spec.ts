import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createDatabase, PortalRepository } from '@ja/database';
import { signIn, portal, e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test('Owner reopens, edits and deletes an approved expense from the interface', async ({
  page,
}, testInfo) => {
  await signIn(page, 'owner');
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const vendor = `Owner CRUD ${randomUUID()}`;
  let id: string;
  try {
    const repo = new PortalRepository(db.sqlite);
    const ownerId = String(
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email)!.id,
    );
    const owner = repo.principalFor(ownerId);
    const projectId = e2eLifecycleFixturesFor(testInfo.project.name).project.id;
    const worker = db.sqlite
      .prepare('SELECT id FROM user WHERE email=?')
      .get(e2eCredentials.worker.email)!;
    repo.assignWorker(owner, { projectId, workerId: String(worker.id), startsOn: '2026-01-01' });
    const entry = repo.createExpense(repo.principalFor(String(worker.id)), {
      projectId,
      spentOn: '2026-08-10',
      category: 'hotel',
      currency: 'EUR',
      amountMinor: 12000n,
      vendor,
      description: 'Owner browser regression',
      whoPaid: 'worker',
      receiptRequired: false,
    });
    id = entry.id;
    repo.submitExpense(repo.principalFor(String(worker.id)), id, 1);
    repo.operationalApproveExpense(owner, id, 'approved');
  } finally {
    db.sqlite.close();
  }
  await page.goto(portal('/manage?type=expense&lang=en'));
  await expect(page.getByRole('heading', { name: 'Data management', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill(vendor);
  let row = page.locator(`article[id="${id}"]`);
  await expect(row).toBeVisible();
  await row.getByText('Manage record', { exact: true }).click();
  await row.getByLabel('Correction reason').fill('Remove incorrect demo approval');
  await row.getByLabel('I confirm this change to the selected record.').check();
  await row.getByRole('button', { name: 'Reopen as draft' }).click();
  row = page.locator(`article[id="${id}"]`);
  await expect(row).toContainText('Draft');
  await row.getByRole('link', { name: 'Open record →' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Vendor', { exact: true }).fill(vendor + ' corrected');
  await sheet.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator(`[data-expense-record="${id}"]`)).toContainText(vendor + ' corrected');
  await page.goto(portal('/manage?type=expense&lang=en'));
  row = page.locator(`article[id="${id}"]`);
  await row.getByText('Manage record', { exact: true }).click();
  await row.getByLabel('Correction reason').fill('Delete browser test record');
  await row.getByLabel('I confirm this change to the selected record.').check();
  const box = await row.getByRole('button', { name: 'Delete', exact: true }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator(`article[id="${id}"]`)).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Changes saved');
});

test('Worker cannot open Owner data management', async ({ page }) => {
  await signIn(page, 'worker');
  const response = await page.goto(portal('/manage'));
  expect(response?.status()).toBe(403);
  await expect(page.getByRole('heading', { name: 'Data management', exact: true })).toHaveCount(0);
});

test('project pickers search ignoring case and accents and retain selected values', async ({
  page,
}, testInfo) => {
  await signIn(page, 'owner');
  const db = createDatabase(readE2EFixturePointer().databasePath);
  const projectId = e2eLifecycleFixturesFor(testInfo.project.name).project.id;
  try {
    db.sqlite
      .prepare('UPDATE project SET name=? WHERE id=?')
      .run('Málaga Automation Search ' + testInfo.project.name, projectId);
  } finally {
    db.sqlite.close();
  }
  await page.goto(portal('/expenses?lang=en'));
  await page.getByRole('button', { name: 'Record expense', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const picker = dialog.locator('select[name="projectId"]');
  const search = dialog.getByRole('searchbox', { name: 'Search: Project', exact: true });
  await expect(search).toBeVisible();
  await search.fill('mALaGA');
  await expect(picker.locator(`option[value="${projectId}"]`)).toHaveJSProperty('hidden', false);
  await picker.selectOption(projectId);
  await search.fill('no matching project');
  await expect(picker).toHaveValue(projectId);
  await expect(
    dialog
      .locator('.searchable-select-field')
      .filter({ has: page.locator('select[name="projectId"]') })
      .getByRole('status'),
  ).toContainText('0 results');
  await search.fill('');
  await expect(picker).toHaveValue(projectId);
  await expect(picker.locator('option[hidden]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
