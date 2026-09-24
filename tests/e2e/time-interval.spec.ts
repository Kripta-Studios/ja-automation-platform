import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

test.use({ timezoneId: 'America/Los_Angeles' });

test('worker records decimal hours without invented clock times', async ({ page }, testInfo) => {
  const widths = ['phone-360', 'phone-390', 'tablet-768', 'desktop'];
  test.skip(!widths.includes(testInfo.project.name));
  const workDate = `2026-09-${20 + widths.indexOf(testInfo.project.name)}`;
  const summary = `Duration only ${testInfo.project.name}`;
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await signIn(page, 'worker');
    await page.goto(portal(`/time?from=${workDate}&to=${workDate}`));
    await page.locator('[data-time-primary-cta]').click();
    const form = page.locator('form[data-time-entry-surface]');
    const projectId = await form
      .locator('[name="projectId"] option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    if (!projectId) throw new Error('Worker needs an assigned project');
    await form.locator('[name="projectId"]').selectOption(projectId);
    await form.locator('[name="workDate"]').fill(workDate);
    await expect(form.locator('[name="startTime"]')).toHaveCount(0);
    await form.getByLabel('Actual hours').fill('7.5');
    await expect(form.locator('[name="minutes"]')).toHaveValue('450');
    await form.locator('[name="summary"]').fill(summary);
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect
      .poll(
        () =>
          db.prepare('SELECT minutes FROM time_entry WHERE activity_summary=?').get(summary)
            ?.minutes,
      )
      .toBe(450);
    expect(
      db
        .prepare('SELECT start_time,end_time FROM time_entry WHERE activity_summary=?')
        .get(summary),
    ).toEqual({ start_time: null, end_time: null });
  } finally {
    db.close();
  }
});

for (const role of ['worker', 'owner'] as const) {
  test(`${role}: current local date, clock interval, pause and edit`, async ({
    page,
  }, testInfo) => {
    const widths = ['phone-360', 'phone-390', 'tablet-768', 'desktop'];
    test.skip(!widths.includes(testInfo.project.name));
    const index = widths.indexOf(testInfo.project.name) * 2 + Number(role === 'owner');
    const workDate = `2026-09-${10 + index}`;
    const summary = `Clock interval ${role} ${testInfo.project.name}`;
    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    try {
      await signIn(page, role);
      await page.goto(portal(`/time?from=${workDate}&to=${workDate}`));
      await page.clock.setFixedTime(new Date('2026-09-22T00:30:00Z'));
      await page.locator('[data-time-primary-cta]').click();
      let form = page.locator('form[data-time-entry-surface]');
      const today = await page.evaluate(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      });
      expect(today).toBe('2026-09-21');
      await expect(form.locator('[name="workDate"]')).toHaveValue(today);
      const worker = db
        .prepare('SELECT id FROM user WHERE email=?')
        .get('worker@demo.jaautomation.test') as { id: string };
      if (role === 'owner') await form.locator('[name="workerId"]').selectOption(worker.id);
      const project = db
        .prepare(
          'SELECT project_id FROM project_member WHERE user_id=? ORDER BY project_id LIMIT 1',
        )
        .get(worker.id) as { project_id: string };
      await form.locator('[name="projectId"]').selectOption(project.project_id);
      await form.locator('[name="workDate"]').fill(workDate);
      await form.getByRole('checkbox', { name: 'Add start and end times' }).check();
      await form.locator('[name="startTime"]').fill('09:00');
      await form.locator('[name="endTime"]').fill('08:00');
      await expect
        .poll(() =>
          form
            .locator('[name="endTime"]')
            .evaluate((el: HTMLInputElement) => el.validity.customError),
        )
        .toBe(true);
      await form.locator('[name="endTime"]').fill('13:00');
      await form.locator('[name="breakMinutes"]').fill('15');
      await expect(form.locator('output')).toHaveText('3 h 45 min');
      await form.locator('[name="summary"]').fill(summary);
      for (const label of ['Start time', 'End time', 'Break (minutes)']) {
        const control = form.getByLabel(label, { exact: true });
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box?.width).toBeGreaterThan(100);
        expect(box?.height).toBeGreaterThanOrEqual(40);
      }
      if (testInfo.project.name.startsWith('phone')) {
        const start = await form.getByLabel('Start time', { exact: true }).boundingBox();
        const end = await form.getByLabel('End time', { exact: true }).boundingBox();
        expect(end!.y).toBeGreaterThanOrEqual(start!.y + start!.height);
      }
      await page.screenshot({ path: testInfo.outputPath('clock-form.png'), fullPage: true });
      await form.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect
        .poll(
          () =>
            db.prepare('SELECT minutes FROM time_entry WHERE activity_summary=?').get(summary)
              ?.minutes,
        )
        .toBe(225);
      const stored = db
        .prepare(
          'SELECT id,start_time,end_time,break_minutes FROM time_entry WHERE activity_summary=?',
        )
        .get(summary);
      expect(stored).toMatchObject({ start_time: '09:00', end_time: '13:00', break_minutes: 15 });
      await page.goto(portal(`/time?from=${workDate}&to=${workDate}`));
      const row = page.locator('article.time-record').filter({ hasText: summary });
      await expect(row).toContainText('09:00');
      await expect(row).toContainText('13:00');
      // A server-side overlap rejection must keep the sheet and all entered values.
      await page.locator('[data-time-primary-cta]').click();
      form = page.locator('form[data-time-entry-surface]');
      if (role === 'owner') await form.locator('[name="workerId"]').selectOption(worker.id);
      await form.locator('[name="projectId"]').selectOption(project.project_id);
      await form.locator('[name="workDate"]').fill(workDate);
      await form.getByRole('checkbox', { name: 'Add start and end times' }).check();
      await form.locator('[name="startTime"]').fill('09:00');
      await form.locator('[name="endTime"]').fill('13:00');
      await form.locator('[name="breakMinutes"]').fill('15');
      await form.locator('[name="summary"]').fill(`${summary} overlap`);
      await form.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(page.locator('.time-form-error')).toBeVisible();
      await expect(form.locator('[name="startTime"]')).toHaveValue('09:00');
      await expect(form.locator('[name="summary"]')).toHaveValue(`${summary} overlap`);
      expect(
        db.prepare('SELECT id FROM time_entry WHERE activity_summary=?').get(`${summary} overlap`),
      ).toBeUndefined();
      const discard = page.waitForEvent('dialog');
      const cancel = form.getByRole('button', { name: 'Cancel', exact: true }).click();
      const confirmation = await discard;
      expect(confirmation.message()).toContain('unsaved changes');
      await confirmation.accept();
      await cancel;
      await expect(form).not.toBeVisible();
      await row.getByRole('button', { name: 'Edit draft', exact: true }).click();
      form = page.locator('form[data-time-entry-surface]');
      await expect(form.locator('[name="startTime"]')).toHaveValue('09:00');
      await expect(form.locator('[name="breakMinutes"]')).toHaveValue('15');
      await form.locator('[name="endTime"]').fill('14:00');
      await expect(form.locator('output')).toHaveText('4 h 45 min');
      await form.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect
        .poll(
          () =>
            db.prepare('SELECT minutes FROM time_entry WHERE activity_summary=?').get(summary)
              ?.minutes,
        )
        .toBe(285);
      await page.goto(portal(`/time/${stored!.id}`));
      await expect(page.locator('main')).toContainText('09:00');
      await expect(page.locator('main')).toContainText('14:00');
      // Model an existing duration-only record in this disposable fixture only.
      db.prepare(
        'UPDATE time_entry SET start_time=NULL,end_time=NULL,break_minutes=0 WHERE id=?',
      ).run(String(stored!.id));
      await page.goto(portal(`/time?from=${workDate}&to=${workDate}`));
      await row.getByRole('button', { name: 'Edit draft', exact: true }).click();
      form = page.locator('form[data-time-entry-surface]');
      await expect(form.getByLabel('Actual hours')).toHaveValue('4.75');
      await expect(form.locator('input[name="minutes"]')).toHaveValue('285');
      await expect(form.locator('[name="startTime"]')).toHaveCount(0);
      await form.getByRole('checkbox', { name: 'Add start and end times' }).check();
      await form.locator('[name="startTime"]').fill('10:00');
      await form.locator('[name="endTime"]').fill('11:00');
      await form.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect
        .poll(
          () =>
            db.prepare('SELECT minutes FROM time_entry WHERE id=?').get(String(stored!.id))
              ?.minutes,
        )
        .toBe(60);
    } finally {
      db.close();
    }
  });
}
