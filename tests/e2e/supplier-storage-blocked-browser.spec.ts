import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { portal } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { seedSupplierPersonas, signInManualPersona } from './manual-persona-fixture.js';

const evidenceDirectory = join(
  e2eRoot,
  'docs/evidence/error-warning-candidate/supplier-storage-blocked',
);

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`Supplier form recovers when session storage is blocked at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(120_000);
    const projectId = seedSupplierPersonas(readE2EFixturePointer().databasePath);
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
        consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 500 && !response.url().includes('/app/api/offline/identity'))
        serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await page.addInitScript(() => {
      const key = 'supplier-form-submission-position';
      for (const method of ['setItem', 'getItem', 'removeItem'] as const) {
        const original = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, {
          configurable: true,
          value: function (this: Storage, name: string, ...args: string[]) {
            if (name === key)
              throw new DOMException('Storage blocked by browser policy', 'SecurityError');
            return original.call(this, name, ...args);
          },
        });
      }
    });
    await signInManualPersona(page, 'supplierCoordinator');
    const date = viewport === 'desktop' ? '2026-12-22' : '2026-12-21';
    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=time&lang=en`));
    let form = page.locator('form[data-supplier-operation="createTimeBatch"]');
    await form.locator('.batch-technician input[type="checkbox"]').first().check();
    await form.locator('[name="workDate"]').fill(date);
    await form.getByLabel('Actual hours').fill('8');
    await form.locator('[name="summary"]').fill('Storage unavailable baseline');
    const accepted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createTimeBatch'),
    );
    await form.locator('button.primary-button').click();
    expect((await accepted).status()).toBe(200);
    await expect(page.locator('#supplier-workspace [role="status"]')).toContainText('1');

    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=time&lang=en`));
    form = page.locator('form[data-supplier-operation="createTimeBatch"]');
    await form.locator('.batch-technician input[type="checkbox"]').first().check();
    await form.locator('[name="workDate"]').fill(date);
    await form.locator('[name="category"]').selectOption('travel');
    await form.locator('[name="durationHours"]').fill('20');
    await form.locator('[name="summary"]').fill('Storage unavailable rejected');
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createTimeBatch'),
    );
    await form.locator('button.primary-button').click();
    expect((await rejected).status()).toBe(400);
    const notice = form.locator('[data-problem-code="SUPPLIER_BATCH_TECHNICIAN_DAILY_LIMIT"]');
    await expect(notice).toBeVisible();
    await expect(form.locator('[name="workDate"]')).toBeFocused();
    await expect(form.locator('[name="durationHours"]')).toHaveValue('20');
    await expect(form.locator('[name="summary"]')).toHaveValue('Storage unavailable rejected');
    await expect(page.locator('.supplier-jump-links .active')).toHaveText('Record team hours');
    expect(
      await form.locator('[name="workDate"]').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top >= -2 && bounds.bottom <= innerHeight + 2;
      }),
    ).toBe(true);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(
      join(evidenceDirectory, `${viewport}.json`),
      `${JSON.stringify({ viewport, storageBlocked: true, successStatus: 200, failureStatus: 400, problemCode: 'SUPPLIER_BATCH_TECHNICIAN_DAILY_LIMIT', focusedField: 'workDate', valuesRetained: true, pageErrors: pageErrors.length, unexpectedConsoleErrors: consoleErrors.length, unexpectedServerErrors: serverErrors.length }, null, 2)}\n`,
    );
  });
}
