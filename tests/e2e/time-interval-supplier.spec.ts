import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { portal } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { seedSupplierPersonas, signInManualPersona } from './manual-persona-fixture.js';

test('supplier clocks persist through edit, web report, CSV and printed PDF', async ({
  page,
}, testInfo) => {
  const widths = ['phone-360', 'phone-390', 'tablet-768', 'desktop'];
  test.skip(!widths.includes(testInfo.project.name));
  const pointer = readE2EFixturePointer();
  const projectId = seedSupplierPersonas(pointer.databasePath);
  const index = widths.indexOf(testInfo.project.name);
  const start = `${String(1 + index * 2).padStart(2, '0')}:00`;
  const end = `${String(2 + index * 2).padStart(2, '0')}:00`;
  const editedEnd = end.replace(':00', ':30');
  const summary = `Supplier clock ${testInfo.project.name}`;
  const db = new DatabaseSync(pointer.databasePath);
  try {
    await signInManualPersona(page, 'supplierCoordinator');
    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=time&lang=en`));
    const form = page.locator('form[action*="createTimeBatch"]');
    const today = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    });
    await expect(form.locator('[name="workDate"]')).toHaveValue(today);
    await form.locator('input[type="checkbox"]').first().check();
    await form.getByLabel('Add start and end times').check();
    await form.locator('[name="startTime"]').fill(start);
    await form.locator('[name="endTime"]').fill(end);
    await form.locator('[name="breakHours"]').fill('0.25');
    await form.locator('[name="summary"]').fill(summary);
    await expect(form.locator('output')).toHaveText('0.75 h');
    await form.locator('button[type="submit"],button.primary-button').click();
    await expect
      .poll(
        () =>
          db.prepare('SELECT minutes FROM time_entry WHERE activity_summary=?').get(summary)
            ?.minutes,
      )
      .toBe(45);
    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=report&lang=en`));
    const article = page.locator('article').filter({ hasText: summary });
    await article.locator('details > summary').click();
    const edit = article.locator('form[action*="updateTime"]');
    await expect(edit.locator('[name="startTime"]')).toHaveValue(start);
    await edit.locator('[name="endTime"]').fill(editedEnd);
    await expect(edit.locator('output')).toHaveText('1.25 h');
    await edit.locator('button').click();
    await expect
      .poll(
        () =>
          db.prepare('SELECT minutes FROM time_entry WHERE activity_summary=?').get(summary)
            ?.minutes,
      )
      .toBe(75);
    const query = `projectId=${projectId}&from=${today}&to=${today}&lang=en`;
    await page.goto(portal(`/supplier/report?${query}`));
    const report = page.locator('article').filter({ hasText: summary });
    await expect(report).toContainText(`${start} – ${editedEnd}`);
    await expect(report).toContainText('Break (decimal hours)');
    await expect(report).toContainText('0.25');
    await expect(report).toContainText('Actual hours');
    await expect(report).toContainText('1.25');
    await page.screenshot({ path: testInfo.outputPath('supplier-report.png'), fullPage: true });
    const csv = await page.request.get(portal(`/supplier/report.csv?${query}`));
    expect(csv.status()).toBe(200);
    const csvText = await csv.text();
    expect(csvText).toContain(start);
    expect(csvText).toContain(editedEnd);
    expect(csvText).toContain(
      '"Break (decimal hours)","Break (minutes)","Actual hours","Actual minutes"',
    );
    expect(csvText).toContain('"0.25","15","1.25","75"');
    const pdfPath = testInfo.outputPath('supplier-report.pdf');
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
    expect(text.replace(/\s+/g, ' ')).toContain(`${start} – ${editedEnd}`);
    expect(text).toContain(summary);
  } finally {
    db.close();
  }
});

test('chief saves a shared duration without invented start and end times', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const pointer = readE2EFixturePointer();
  const projectId = seedSupplierPersonas(pointer.databasePath);
  const summary = `Shared duration ${Date.now()}`;
  const db = new DatabaseSync(pointer.databasePath);
  try {
    await signInManualPersona(page, 'supplierCoordinator');
    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=time&lang=en`));
    const form = page.locator('form[action*="createTimeBatch"]');
    await form.locator('.batch-technician input[type="checkbox"]').first().check();
    await form.getByLabel('Actual hours').fill('7.5');
    await form.getByLabel('Work performed').fill(summary);
    await form.getByRole('button', { name: 'Save selected drafts' }).click();
    await expect(page.getByRole('status')).toContainText('Batch saved: 1 draft');
    expect(
      db
        .prepare(
          'SELECT minutes,start_time startTime,end_time endTime FROM time_entry WHERE activity_summary=?',
        )
        .get(summary),
    ).toEqual({ minutes: 450, startTime: null, endTime: null });
    const entry = page.locator('article').filter({ hasText: summary });
    await entry.locator('details > summary').click();
    const edit = entry.locator('form[action*="updateTime"]');
    await expect(edit.locator('[name="durationHours"]')).toHaveValue('7.50');
    await edit.getByRole('button', { name: 'Save draft' }).click();
    await expect
      .poll(
        () =>
          db.prepare('SELECT minutes FROM time_entry WHERE activity_summary=?').get(summary)
            ?.minutes,
      )
      .toBe(450);
  } finally {
    db.close();
  }
});

test('chief records different duration hours for two technicians in one browser batch', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const pointer = readE2EFixturePointer();
  const projectId = seedSupplierPersonas(pointer.databasePath);
  const summary = `Individual installation hours ${Date.now()}`;
  const db = new DatabaseSync(pointer.databasePath);
  try {
    await signInManualPersona(page, 'supplierCoordinator');
    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=personnel&lang=en`));
    const personnel = page.locator('form[action*="addTechnician"]');
    await personnel.getByLabel('Name', { exact: true }).fill(`Second technician ${Date.now()}`);
    await personnel.getByRole('button').click();
    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=time&lang=en`));
    const form = page.locator('form[action*="createTimeBatch"]');
    await expect(form.locator('.batch-technician input[type="checkbox"]')).toHaveCount(2);
    await form.getByRole('button', { name: 'Add visible to selection' }).click();
    await form.getByLabel('Different hours for each person').check();
    const hours = form.locator('input[inputmode="decimal"]');
    await expect(hours).toHaveCount(2);
    await hours.nth(0).fill('7.5');
    await hours.nth(1).fill('6.25');
    await form.getByLabel('Work performed').fill(summary);
    await form.getByRole('button', { name: 'Save selected drafts' }).click();
    await expect(page.getByRole('status')).toContainText('Batch saved: 2 drafts');
    expect(
      db
        .prepare(
          'SELECT minutes,start_time startTime,end_time endTime FROM time_entry WHERE activity_summary=? ORDER BY minutes DESC',
        )
        .all(summary),
    ).toEqual([
      { minutes: 450, startTime: null, endTime: null },
      { minutes: 375, startTime: null, endTime: null },
    ]);
  } finally {
    db.close();
  }
});
