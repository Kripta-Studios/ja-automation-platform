import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('mailbox choice is checked, translated, retained after errors and can be opted out', async ({
  page,
}, info) => {
  await signIn(page, 'owner');
  for (const [locale, label] of [
    ['es', 'Crear un buzón de correo para este usuario'],
    ['pt', 'Criar uma caixa de correio para este usuário'],
    ['en', 'Create a mailbox for this user'],
  ]) {
    await page.goto(portal(`/projects?view=team&assistantPane=team-create&lang=${locale}`));
    const checkbox = page.getByRole('checkbox', { name: label, exact: true });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();
    await checkbox.scrollIntoViewIfNeeded();
    const bounds = await checkbox.locator('..').boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  const form = page.locator('#assistant-team-create');
  await form.locator('[name=name]').fill('Mailbox opt-out browser test');
  await form.locator('[name=email]').fill(`mail-optout-${randomUUID()}@example.test`);
  await form.locator('[name=password]').fill('Browser-fixture-password-2026!');
  await form.locator('[type=submit]').click();
  await expect(
    page
      .getByText('To create a mailbox, use a valid @j-aautomation.com address', { exact: false })
      .first(),
  ).toBeVisible();
  await expect(form.locator('[name=createMailbox]')).toBeChecked();
  await expect(form.locator('[name=name]')).toHaveValue('Mailbox opt-out browser test');
  await page
    .locator('dialog[data-ui="guided-recovery"]')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await form.locator('[name=createMailbox]').uncheck();
  await form.locator('[name=password]').fill('Browser-fixture-password-2026!');
  await form.locator('[type=submit]').click();
  await expect(
    page.getByText('Local portal access created.', { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('mailbox-opt-out.png'), fullPage: true });
});

test('mail failure opens recovery with the original alias and auditor role', async ({
  page,
}, info) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?view=team&assistantPane=team-create&lang=en'));
  const form = page.locator('#assistant-team-create');
  const username = `audit.${randomUUID().slice(0, 8)}`;
  await form.locator('[name=name]').fill('Mailbox retry browser test');
  await form.locator('[name=email]').fill(`${username}@j-aautomation.com`);
  await form.locator('[name=role]').selectOption('auditor_read_only');
  await form.locator('[name=password]').fill('Browser-fixture-password-2026!');
  await form.locator('[type=submit]').click();
  const recovery = page.locator('#create-mailbox-sheet-form');
  await expect(recovery).toBeVisible();
  await expect(recovery.locator('[name=username]')).toHaveValue(username);
  await expect(recovery.locator('[name=provisionRole]')).toHaveValue('auditor_read_only');
  await expect(recovery.locator('[name=password]')).toHaveValue('');
  await expect(recovery.locator('[name=idempotencyKey]')).toHaveValue(/^portal-account-mailbox:/);
  await expect(
    recovery.getByText('Do not create the user again.', { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('mailbox-recovery.png'), fullPage: true });
});
