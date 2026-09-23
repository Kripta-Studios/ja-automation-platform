import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '@ja/database';
import { expect, test } from '@playwright/test';
import { e2eDatabasePath } from './environment.js';
import { e2eCredentials, portal, signIn } from './auth.js';

test('unread inbox preserves failures, marks only the selected notice and remains accessible', async ({
  page,
}, info) => {
  await signIn(page, 'worker');
  const ids = [randomUUID(), randomUUID()];
  const { sqlite } = createDatabase(e2eDatabasePath);
  try {
    const worker = sqlite
      .prepare('SELECT id FROM user WHERE email=?')
      .get(e2eCredentials.worker.email) as { id: string };
    for (const id of ids)
      sqlite
        .prepare(
          'INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
        )
        .run(id, worker.id, 'missing_time', `missing-time:inbox-${id}`, new Date().toISOString());
  } finally {
    sqlite.close();
  }
  try {
    await page.goto(portal('/notifications?lang=es&read=unread'));
    const row = page.locator(`[data-notification-id="${ids[0]}"]`);
    await expect(row).toBeVisible();
    const mark = row.getByRole('button', { name: 'Marcar como leído' });
    // Route action query also includes the selected language/filter; match the action by URL.
    await page.route(
      (url) => url.search.includes('/markNotificationRead'),
      (route) => route.abort(),
      { times: 1 },
    );
    await mark.click();
    await expect(page.locator('.inbox-feedback')).toContainText('No se pudo actualizar');
    await expect(row).toBeVisible();
    await page.unrouteAll({ behavior: 'wait' });
    await mark.click();
    await expect(row).toHaveCount(0);
    await expect(page.locator(`[data-notification-id="${ids[1]}"]`)).toBeVisible();
    await expect(page.locator('.inbox-feedback')).toBeFocused();
    const db = createDatabase(e2eDatabasePath);
    try {
      expect(
        (
          db.sqlite.prepare('SELECT read_at FROM notification WHERE id=?').get(ids[0]) as {
            read_at: string;
          }
        ).read_at,
      ).toBeTruthy();
      expect(
        (
          db.sqlite.prepare('SELECT read_at FROM notification WHERE id=?').get(ids[1]) as {
            read_at: string | null;
          }
        ).read_at,
      ).toBeNull();
    } finally {
      db.sqlite.close();
    }
    const nav = page.getByRole('navigation', { name: 'Filtros de notificaciones' });
    await nav.getByRole('link', { name: /^Todas/ }).click();
    await expect(page.locator(`[data-notification-id="${ids[0]}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-notification-id="${ids[0]}"]`).getByRole('button'),
    ).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).include('.notification-inbox').analyze()).violations,
    ).toEqual([]);
    for (const button of await page.locator('.notification-inbox button').all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('notification-inbox.png'), fullPage: false });
  } finally {
    const cleanup = createDatabase(e2eDatabasePath);
    try {
      for (const id of ids) cleanup.sqlite.prepare('DELETE FROM notification WHERE id=?').run(id);
    } finally {
      cleanup.sqlite.close();
    }
  }
});

test('operational sheets protect changed text on cancel, Escape and navigation', async ({
  page,
}, info) => {
  await signIn(page, 'worker');
  await page.goto(portal('/time?lang=en'));
  await page
    .getByRole('navigation', { name: 'Quick date filters' })
    .getByRole('link', { name: 'Today', exact: true })
    .click();
  await page.getByRole('button', { name: 'Log time', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Log time', exact: true });
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await page.getByRole('button', { name: 'Log time', exact: true }).click();
  const notes = sheet.locator('textarea').first();
  await notes.fill('Keep my field notes');
  for (const close of [
    () => sheet.getByRole('button', { name: 'Cancel', exact: true }).click(),
    () => page.keyboard.press('Escape'),
    () => sheet.getByRole('button', { name: 'Close time form' }).click(),
  ]) {
    const dialogPromise = page.waitForEvent('dialog');
    const click = close();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('unsaved changes');
    await dialog.dismiss();
    await click;
    await expect(sheet).toBeVisible();
    await expect(notes).toHaveValue('Keep my field notes');
  }
  const originalUrl = page.url();
  const backDialog = page.waitForEvent('dialog');
  await page.evaluate(() => history.back());
  const confirmation = await backDialog;
  expect(confirmation.message()).toContain('unsaved changes');
  await confirmation.dismiss();
  await expect(page).toHaveURL(originalUrl);
  await expect(notes).toHaveValue('Keep my field notes');
  await expect(sheet).toBeVisible();
  const reloadDialog = page.waitForEvent('dialog');
  const reload = page.evaluate(() => window.location.reload());
  const unloadConfirmation = await reloadDialog;
  expect(unloadConfirmation.type()).toBe('beforeunload');
  await unloadConfirmation.dismiss();
  await reload;
  await expect(notes).toHaveValue('Keep my field notes');
  // A repeated navigation shortcut cannot steal focus from the modal.
  await notes.focus();
  await page.keyboard.press('Control+k');
  await expect(notes).toBeFocused();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('protected-time-form.png') });
  page.once('dialog', (dialog) => dialog.accept());
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sheet).not.toBeVisible();
});

test('project register uses one search and status filter', async ({ page }) => {
  await signIn(page, 'manager');
  await page.goto(portal('/projects?lang=en'));
  const section = page.locator('[data-ui="project-section"]');
  await expect(section.getByRole('searchbox')).toHaveCount(1);
  await expect(section.getByRole('combobox', { name: 'Status', exact: true })).toHaveCount(1);
  await section.getByRole('searchbox').fill('NO_MATCH_PROJECT_000');
  await expect(section.getByText('No projects found', { exact: true })).toBeVisible();
  await section.getByRole('link', { name: 'Clear filters', exact: true }).click();
  await expect(section.getByRole('searchbox')).toHaveValue('');
  await expect(section.getByText('No projects found', { exact: true })).toHaveCount(0);
});
