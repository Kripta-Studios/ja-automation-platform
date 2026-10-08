import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { e2eLifecycleFixturesFor, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

for (const role of ['owner', 'finance'] as const) {
  test(`${role} confirms both missing contact fields before saving the originating client`, async ({
    page,
  }, info) => {
    await signIn(page, role);
    const fixture = e2eLifecycleFixturesFor(info.project.name);
    const db = createDatabase(readE2EFixturePointer().databasePath);
    const name = `Guided contact ${role} ${randomUUID()}`;
    try {
      await page.goto(portal('/projects?view=clients&lang=en'));
      await page.locator('#client-directory-filters input').fill(fixture.client.displayName);
      const card = page.locator(`[data-client-directory] [data-client-id="${fixture.client.id}"]`);
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: 'Add contact', exact: true }).click();
      const form = card.locator(`form#client-contact-new-${fixture.client.id}`);
      await form.locator('[name="email"]').fill('incorrect-email');
      await form.locator('[name="phone"]').fill('+34 600 100 200');
      await form.locator('[name="contactType"]').selectOption('onsite');
      await form.getByRole('button', { name: 'Save contact', exact: true }).click();
      const dialog = page.locator('[data-ui="guided-recovery"]');
      await expect(dialog).toBeVisible();
      const requested = new Set<string>();
      for (let step = 0; step < 2; step++) {
        const label = await dialog.locator('label[for="guided-recovery-field"]').innerText();
        requested.add(label);
        await dialog
          .locator('#guided-recovery-field')
          .fill(/email/i.test(label) ? 'guided-contact@example.test' : name);
        await dialog.getByRole('button', { name: 'Next', exact: true }).click();
      }
      expect([...requested].sort()).toEqual(['Email', 'Name']);
      await expect(form.locator('[name="name"]')).toHaveValue('');
      await expect(form.locator('[name="email"]')).toHaveValue('incorrect-email');
      expect(
        db.sqlite.prepare('SELECT id FROM client_contact WHERE name=?').get(name),
      ).toBeUndefined();
      await dialog.getByRole('button', { name: /^Apply answers and retry/ }).click();
      await expect(dialog).not.toBeVisible();
      await expect
        .poll(() =>
          db.sqlite
            .prepare('SELECT client_id,email,phone,contact_type FROM client_contact WHERE name=?')
            .get(name),
        )
        .toEqual({
          client_id: fixture.client.id,
          email: 'guided-contact@example.test',
          phone: '+34 600 100 200',
          contact_type: 'onsite',
        });
      await expect(card).toContainText(name);
    } finally {
      db.sqlite.close();
    }
  });
}
