import { expect, test } from '@playwright/test';
import { e2eCredentials, portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';
import { seedSupplierPersonas, signInManualPersona } from './manual-persona-fixture.js';
import { createDatabase } from '@ja/database';

for (const role of ['owner', 'supplierCoordinator'] as const) {
  test(`supplier ${role} failure keeps its workspace and entered values`, async ({
    page,
  }, info) => {
    test.skip(!['phone-390', 'desktop'].includes(info.project.name));
    test.setTimeout(120_000);
    const projectId = seedSupplierPersonas(readE2EFixturePointer().databasePath);
    const locale = info.project.name === 'desktop' ? 'es' : 'en';
    if (role === 'owner') {
      await signIn(page, 'owner');
      await page.goto(
        portal(`/supplier?projectId=${projectId}&workspaceAction=personnel&lang=${locale}`),
      );
      const db = createDatabase(readE2EFixturePointer().databasePath);
      let technicianId: string;
      try {
        technicianId = String(
          (
            db.sqlite
              .prepare('SELECT id FROM user WHERE email=?')
              .get(e2eCredentials.worker2.email) as { id: string }
          ).id,
        );
      } finally {
        db.sqlite.close();
      }
      const form = page.locator('form[data-supplier-operation="assignTechnician"]');
      await form.locator('[name="workerId"]').selectOption(technicianId);
      await form.locator('[name="projectId"]').selectOption(projectId);
      await form.locator('[name="startsOn"]').fill('2026-01-01');
      await form.locator('[name="endsOn"]').fill('2026-10-25');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const beforeScroll = await page.evaluate(() => window.scrollY);
      const response = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('?/assignTechnician'),
      );
      await form.getByRole('button').click();
      expect((await response).status()).toBe(409);
      await expect(form.locator('[data-ui="problem-notice"]')).toHaveAttribute(
        'data-problem-code',
        'SUPPLIER_ASSIGNMENT_EXISTS',
      );
      await expect(form.locator('[data-ui="problem-notice"]')).toBeFocused();
      await expect(form.locator('[name="workerId"]')).toHaveValue(technicianId);
      await expect(form.locator('[name="projectId"]')).toHaveValue(projectId);
      await expect(form.locator('[name="startsOn"]')).toHaveValue('2026-01-01');
      await expect(form.locator('[name="endsOn"]')).toHaveValue('2026-10-25');
      await expect(page.locator('.supplier-jump-links .active')).toHaveText(/Personnel|Personal/u);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      expect(beforeScroll).toBeGreaterThan(0);

      // The directory editor uses SvelteKit enhancement; it must recover the
      // same typed problem and field focus without closing the sheet.
      await page.goto(
        portal(`/supplier?projectId=${projectId}&workspaceAction=directory&lang=${locale}`),
      );
      await page
        .locator('[data-supplier-id]')
        .first()
        .locator('.directory-actions button')
        .first()
        .click();
      const editor = page.locator('form[data-supplier-operation="updateSupplier"]');
      await expect(editor).toBeVisible();
      await editor.locator('[name="name"]').fill('   ');
      const enhancedResponse = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('?/updateSupplier'),
      );
      await editor.locator('button.primary-button').click();
      const enhanced = await enhancedResponse;
      expect(enhanced.status()).toBe(200);
      expect(await enhanced.text()).toContain('SUPPLIER_NAME_REQUIRED');
      await expect(editor.locator('[data-ui="problem-notice"]')).toHaveAttribute(
        'data-problem-code',
        'SUPPLIER_NAME_REQUIRED',
      );
      await expect(editor.locator('[name="name"]')).toHaveValue('   ');
      await expect(editor.locator('[name="name"]')).toBeFocused();
      await expect(editor).toBeVisible();
      return;
    }

    await signInManualPersona(page, 'supplierCoordinator');
    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=time&lang=${locale}`));
    let form = page.locator('form[data-supplier-operation="createTimeBatch"]');
    const date = info.project.name === 'desktop' ? '2026-11-12' : '2026-11-11';
    await form.locator('.batch-technician input[type="checkbox"]').first().check();
    await form.locator('[name="workDate"]').fill(date);
    await form.getByLabel(locale === 'es' ? 'Horas reales' : 'Actual hours').fill('8');
    await form.locator('[name="summary"]').fill(`Supplier recovery baseline ${info.project.name}`);
    await form.locator('button.primary-button').click();
    await expect(page.locator('#supplier-workspace [role="status"]')).toContainText('1');
    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=time&lang=${locale}`));
    form = page.locator('form[data-supplier-operation="createTimeBatch"]');
    await form.locator('.batch-technician input[type="checkbox"]').first().check();
    await form.locator('[name="workDate"]').fill(date);
    await form.locator('[name="category"]').selectOption('travel');
    await form.locator('[name="durationHours"]').fill('20');
    await form.locator('[name="summary"]').fill(`Supplier recovery rejected ${info.project.name}`);
    const requestId = await form.locator('[name="requestId"]').inputValue();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const response = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('?/createTimeBatch'),
    );
    await form.locator('button.primary-button').click();
    expect((await response).status()).toBe(400);
    await expect(form.locator('[data-ui="problem-notice"]')).toHaveAttribute(
      'data-problem-code',
      'SUPPLIER_BATCH_TECHNICIAN_DAILY_LIMIT',
    );
    await expect(form.locator('[data-ui="problem-notice"]')).toBeFocused();
    await expect(form.locator('[name="durationHours"]')).toHaveValue('20');
    await expect(form.locator('[name="minutes"]')).toHaveValue('1200');
    await expect(form.locator('[name="category"]')).toHaveValue('travel');
    await expect(form.locator('[name="summary"]')).toHaveValue(
      `Supplier recovery rejected ${info.project.name}`,
    );
    await expect(form.locator('[name="requestId"]')).toHaveValue(requestId);
    await expect(form.locator('.batch-technician input[type="checkbox"]').first()).toBeChecked();
    await expect(page.locator('.supplier-jump-links .active')).toHaveText(
      /Record team hours|Registrar horas/u,
    );
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const noticeRect = await form.locator('[data-ui="problem-notice"]').boundingBox();
    expect(noticeRect).not.toBeNull();
    expect(noticeRect!.y).toBeGreaterThanOrEqual(0);
    expect(noticeRect!.y + noticeRect!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  });
}
