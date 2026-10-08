import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readE2EFixturePointer } from './environment.js';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eCostCenter } from './project-cost-center.js';

for (const role of ['owner', 'finance'] as const) {
  test(`${role} fixes project fields one at a time and saves only after confirmation`, async ({
    page,
  }, info) => {
    await signIn(page, role);
    await page.goto(portal('/projects?lang=en'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    const form = page.locator('form[action="?/createProject"]');
    const client = await form
      .locator('[name="clientId"] option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    await form.locator('[name="clientId"]').selectOption(client!);
    await form.locator('[name="startDate"]').fill('2026-10-15');
    const name = `Guided project ${role} ${info.project.name} ${randomUUID()}`;
    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    const dialog = page.locator('[data-ui="guided-recovery"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-assistant-launcher]')).toBeHidden();
    // Required fields are requested individually, without changing the underlying form.
    for (
      let step = 0;
      step < 6 && (await dialog.locator('#guided-recovery-field').count());
      step++
    ) {
      const label = await dialog.locator('label').innerText();
      const input = dialog.locator('#guided-recovery-field');
      if (/cost center/i.test(label))
        await input.fill(e2eCostCenter('GUIDE', role === 'owner' ? 93 : 94, info.project.name));
      else if (/name/i.test(label)) await input.fill(name);
      else throw new Error(`Unexpected required field: ${label}`);
      await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await expect(form.locator('[name="name"]')).toHaveValue('');
    await expect(page.locator('[data-project-setup-next]')).toHaveCount(0);
    const apply = dialog.getByRole('button', { name: /^Apply answers and retry/ });
    const box = await apply.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await apply.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('[data-project-setup-next]')).toBeVisible();
    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    try {
      expect(db.prepare('SELECT name FROM project WHERE name=?').get(name)).toEqual({ name });
    } finally {
      db.close();
    }
  });
}

test('cancel discards staged answers and leaves the original form intact', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'));
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  const form = page.locator('form[action="?/createProject"]');
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  const dialog = page.locator('[data-ui="guided-recovery"]');
  await expect(dialog).toBeVisible();
  const input = dialog.locator('#guided-recovery-field');
  if ((await input.evaluate((el) => el.tagName)) === 'SELECT')
    await input.selectOption({ index: 1 });
  else await input.fill('Discarded answer');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(form).toBeVisible();
  await expect(form.locator('[name="name"]')).toHaveValue('');
  await expect(page.locator('[data-project-setup-next]')).toHaveCount(0);
});

test('worker corrects a real server rejection without losing the time draft', async ({ page }) => {
  await signIn(page, 'worker');
  await page.goto(portal('/time?lang=en'));
  await page.locator('[data-time-primary-cta]').click();
  const form = page.locator('form[data-time-entry-surface]');
  const projectId = await form
    .locator('[name="projectId"] option[value]:not([value=""])')
    .first()
    .getAttribute('value');
  await form.locator('[name="projectId"]').selectOption(projectId!);
  await form.locator('[name="durationHours"]').fill('1.25');
  // Native length accepts spaces; the real server trims and rejects them.
  await form.locator('[name="summary"]').fill('   ');
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  const dialog = page.locator('[data-ui="guided-recovery"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('label')).toContainText('Activity summary');
  await expect(form.locator('[name="durationHours"]')).toHaveValue('1.25');
  const summary = `Guided worker time ${randomUUID()}`;
  await dialog.locator('#guided-recovery-field').fill(summary);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(form.locator('[name="summary"]')).toHaveValue('   ');
  await dialog.getByRole('button', { name: /^Apply answers and retry/ }).click();
  await expect(dialog).not.toBeVisible();
  const db = new DatabaseSync(readE2EFixturePointer().databasePath);
  try {
    await expect
      .poll(() =>
        db.prepare('SELECT count(*) count FROM time_entry WHERE activity_summary=?').get(summary),
      )
      .toEqual({ count: 1 });
  } finally {
    db.close();
  }
});

test('secret validation names the field without copying its value into the assistant', async ({
  page,
}) => {
  await page.goto(portal('/login?lang=en'));
  const password = page.getByLabel('Password', { exact: true });
  await page.getByLabel('Work email', { exact: true }).fill('validation@demo.jaautomation.test');
  await password.fill('');
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  const dialog = page.locator('[data-ui="guided-recovery"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-recovery-manual]')).toContainText('Password');
  await expect(dialog.locator('#guided-recovery-field')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(password).toBeFocused();
});
