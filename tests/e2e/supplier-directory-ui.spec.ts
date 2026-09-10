import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { createDatabase, PortalRepository, SupplierWorkforceRepository } from '@ja/database';
import { signIn, portal, e2eCredentials, e2eLifecycleFixturesFor } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

async function verifyNavigation(page: Page) {
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    const drawer = page.getByRole('dialog', { name: 'Portal navigation' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Toggle navigation' })).toBeFocused();
  } else {
    await expect(page.locator('#portal-navigation')).toBeVisible();
    await expect(
      page.locator('#portal-navigation').getByRole('link', { name: 'Projects', exact: true }),
    ).toBeVisible();
  }
}

test('supplier directory edits, cancels, removes and restores with shared navigation', async ({
  page,
}, testInfo) => {
  await signIn(page, 'owner');
  const db = createDatabase(readE2EFixturePointer().databasePath);
  let supplierId: string;
  let technicianId: string;
  const name = `Directory ${randomUUID()}`;
  const projectId = e2eLifecycleFixturesFor(testInfo.project.name).project.id;
  try {
    const repo = new PortalRepository(db.sqlite);
    const userId = String(
      db.sqlite.prepare('SELECT id FROM user WHERE email=?').get(e2eCredentials.owner.email)!.id,
    );
    const supplier = new SupplierWorkforceRepository(db.sqlite);
    const owner = repo.principalFor(userId);
    supplierId = supplier.createSupplier(owner, { name }).id;
    technicianId = supplier.addTechnician(owner, {
      supplierId,
      projectId,
      name: `${name} technician`,
      startsOn: '2026-01-01',
    }).id;
  } finally {
    db.sqlite.close();
  }
  await page.goto(portal(`/supplier?projectId=${projectId}&lang=en`));
  await verifyNavigation(page);
  const record = page.locator(`[data-supplier-id="${supplierId}"]`);
  await record.getByRole('button', { name: 'Edit', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Edit', exact: true });
  await dialog.getByLabel('Name', { exact: true }).fill(`${name} updated`);
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(record).toContainText(`${name} updated`);
  const tech = page.locator(`[data-technician-id="${technicianId}"]`);
  await tech.getByRole('button', { name: 'Edit', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit', exact: true });
  await dialog.getByLabel('Name', { exact: true }).fill(`${name} renamed technician`);
  await dialog.getByLabel('Email (optional)').fill(`directory-${technicianId}@example.test`);
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tech).toContainText('renamed technician');
  await tech.getByRole('button', { name: 'Remove', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Remove', exact: true });
  await dialog
    .locator('.form-actions')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(tech).toBeVisible();
  await tech.getByRole('button', { name: 'Remove', exact: true }).click();
  await dialog.getByLabel('I confirm this change').check();
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(tech).toHaveCount(0);
  await page
    .locator('.directory-filters')
    .getByRole('combobox', { name: 'State', exact: true })
    .selectOption('inactive');
  await tech.getByRole('button', { name: 'Restore', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Restore', exact: true });
  await dialog.getByLabel('I confirm this change').check();
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .locator('.directory-filters')
    .getByRole('combobox', { name: 'State', exact: true })
    .selectOption('active');
  await expect(tech).toBeVisible();
  await record.getByRole('button', { name: 'Remove', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Remove', exact: true });
  await dialog.getByLabel('I confirm this change').check();
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(record).toHaveCount(0);
  await page
    .locator('.directory-filters')
    .getByRole('combobox', { name: 'State', exact: true })
    .selectOption('inactive');
  await record.getByRole('button', { name: 'Restore', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Restore', exact: true });
  await dialog.getByLabel('I confirm this change').check();
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .locator('.directory-filters')
    .getByRole('combobox', { name: 'State', exact: true })
    .selectOption('active');
  await expect(record).toBeVisible();
  const editTypography = await record
    .getByRole('button', { name: 'Edit', exact: true })
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        borderRadius: style.borderRadius,
      };
    });
  const removeTypography = await record
    .getByRole('button', { name: 'Remove', exact: true })
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        borderRadius: style.borderRadius,
      };
    });
  expect(removeTypography).toEqual(editTypography);
  for (const control of await record.getByRole('button').all()) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await page.screenshot({ path: testInfo.outputPath('supplier-directory.png'), fullPage: false });
});

for (const role of ['owner', 'finance'] as const) {
  test(`commercial configuration spacing and readable instructions for ${role}`, async ({
    page,
  }, testInfo) => {
    await signIn(page, role);
    await page.goto(portal('/finance?view=commercial&lang=en'));
    const panel = page.locator('.finance-config-panel');
    await expect(panel).toBeVisible();
    const intro = panel.locator('.finance-config-intro');
    const authority = panel.locator('[data-project-legal-entity]');
    const policy = panel.locator('[data-project-commercial-policy]');
    const introBox = await intro.boundingBox();
    const authorityBox = await authority.boundingBox();
    const policyBox = await policy.boundingBox();
    expect(authorityBox!.y - (introBox!.y + introBox!.height)).toBeGreaterThanOrEqual(23);
    expect(policyBox!.y - (authorityBox!.y + authorityBox!.height)).toBeGreaterThanOrEqual(23);
    for (const section of [authority, policy]) {
      const heading = await section.locator(':scope > h3').boundingBox();
      const description = await section.locator(':scope > .ui-section-description').boundingBox();
      const box = await section.boundingBox();
      expect(description!.y - (heading!.y + heading!.height)).toBeGreaterThanOrEqual(16);
      expect(heading!.x - box!.x).toBeGreaterThanOrEqual(16);
      expect(description!.x + description!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    await intro.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`commercial-config-${role}.png`),
      fullPage: false,
    });
  });
}
