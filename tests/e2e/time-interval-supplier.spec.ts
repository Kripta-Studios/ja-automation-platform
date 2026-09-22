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
    await form.locator('[name="startTime"]').fill(start);
    await form.locator('[name="endTime"]').fill(end);
    await form.locator('[name="breakMinutes"]').fill('15');
    await form.locator('[name="summary"]').fill(summary);
    await expect(form.locator('output')).toHaveText('0 h 45 min');
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
    await expect(edit.locator('output')).toHaveText('1 h 15 min');
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
    await expect(report).toContainText('15');
    await page.screenshot({ path: testInfo.outputPath('supplier-report.png'), fullPage: true });
    const csv = await page.request.get(portal(`/supplier/report.csv?${query}`));
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain(start);
    expect(await csv.text()).toContain(editedEnd);
    const pdfPath = testInfo.outputPath('supplier-report.pdf');
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
    expect(text.replace(/\s+/g, ' ')).toContain(`${start} – ${editedEnd}`);
    expect(text).toContain(summary);
  } finally {
    db.close();
  }
});
