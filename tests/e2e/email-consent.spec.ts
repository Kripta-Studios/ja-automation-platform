import { createDatabase } from '@ja/database';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eDatabasePath } from './environment.js';

test('owner chooses separately whether each invitation is emailed', async ({ page }, testInfo) => {
  await signIn(page, 'owner');
  const { sqlite } = createDatabase(e2eDatabasePath);
  try {
    for (const choice of ['no', 'yes']) {
      await page.goto(portal('/projects?view=team'));
      await page.getByRole('button', { name: 'Create user', exact: true }).click();
      const form = page.locator('form[action="?view=team&/createInvitation"]');
      const email = `consent-${choice}-${testInfo.project.name}@example.test`;
      await form.locator('input[name="email"]').fill(email);
      const select = form.locator('select[name="emailChoice"]');
      await expect(select).toBeVisible();
      await expect(select).toHaveValue('');
      await select.selectOption(choice);
      await form.getByRole('button', { name: 'Create invitation', exact: true }).click();
      await expect(page.locator('[data-invitation-result] a')).toHaveAttribute(
        'href',
        /\/app\/invite\//,
      );
      const invitation = sqlite.prepare('SELECT id FROM invitation WHERE email=?').get(email);
      expect(invitation).toBeTruthy();
      const outbox = sqlite
        .prepare('SELECT payload_json FROM outbox_event WHERE aggregate_id=?')
        .get(String(invitation!.id));
      if (choice === 'no') expect(outbox).toBeUndefined();
      else
        expect(JSON.parse(String(outbox!.payload_json))).toMatchObject({
          emailConfirmed: true,
          email,
        });
    }
    await page.screenshot({ path: testInfo.outputPath('invitation-email-choice.png') });
  } finally {
    sqlite.close();
  }
});
