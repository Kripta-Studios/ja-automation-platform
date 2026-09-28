import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eRoot, readE2EFixturePointer } from './environment.js';
import { seedSupplierPersonas, signInManualPersona } from './manual-persona-fixture.js';

const evidenceDirectory = join(
  e2eRoot,
  'docs/evidence/error-warning-candidate/accessibility-audit',
);

function captureRuntime(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function assertNoticeInViewport(notice: Locator) {
  await expect(notice).toBeVisible();
  await expect
    .poll(() =>
      notice.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top >= -2 && bounds.bottom <= innerHeight + 2;
      }),
    )
    .toBe(true);
}

async function assertAxeAndSave(
  page: Page,
  notice: Locator,
  scenario: string,
  viewport: string,
  responseStatus: number,
) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const evidence = {
    scenario,
    viewport,
    responseStatus,
    problemCode: await notice.getAttribute('data-problem-code'),
    focused: await notice.evaluate(
      (element) => element === document.activeElement || element.contains(document.activeElement),
    ),
    focusedField: await page.evaluate(() => document.activeElement?.getAttribute('name') ?? null),
    axeViolationCount: result.violations.length,
    axeRules: result.violations.map((violation) => violation.id),
    screenshot: `${scenario}-${viewport}.png`,
    scope: 'isolated warning only, without account or record details',
  };
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(
    join(evidenceDirectory, `${scenario}-${viewport}.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  // The sticky account chrome can cover the warning in an element screenshot.
  // Remove it after the focus, viewport and axe assertions, only for redacted capture.
  await page
    .getByRole('banner')
    .first()
    .evaluate((element) => element.remove());
  writeFileSync(
    join(evidenceDirectory, `${scenario}-${viewport}.png`),
    await notice.screenshot({
      mask: scenario.startsWith('supplier-') ? [notice.locator('p').first()] : [],
    }),
  );
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  test(`Owner changed-management notice is accessible at ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(90_000);
    const errors = captureRuntime(page);
    await signIn(page, 'owner');
    await page.goto(portal('/manage?type=expense&lang=en'));
    const form = page.locator('form[action^="?/manageRecord"]').last();
    await expect(form).toBeAttached();
    const recordId = await form.getAttribute('data-management-record-id');
    expect(recordId).toBeTruthy();
    await form.locator('xpath=ancestor::details/summary').click();
    await form.locator('[name="reason"]').fill('Review updated record');
    await form.locator('[name="confirmed"]').check();
    await form.locator('[name="version"]').evaluate((input: HTMLInputElement) => {
      input.value = String(Number(input.value) + 99);
    });
    await form.scrollIntoViewIfNeeded();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/manageRecord'),
    );
    await form.getByRole('button', { name: 'Delete' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(409);
    const retained = page.locator(`form[data-management-record-id="${recordId}"]`);
    const notice = retained.locator(
      '[data-management-inline-problem] [data-problem-code="ACTION_MANAGEMENT_CHANGED"]',
    );
    await expect(notice).toBeFocused();
    await assertNoticeInViewport(notice);
    await expect(retained.locator('[name="reason"]')).toHaveValue('Review updated record');
    await expect(
      page.locator('[data-ui="problem-notice"][role="alert"][aria-live="assertive"]:visible'),
    ).toHaveCount(1);
    await expect(notice.getByRole('link', { name: 'Review updated record' })).toBeVisible();
    await assertAxeAndSave(page, notice, 'owner-management-changed', viewport, response.status());
    expect(errors).toEqual([]);
  });

  test(`Supplier coordinator daily-limit notice is accessible at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(120_000);
    const projectId = seedSupplierPersonas(readE2EFixturePointer().databasePath);
    const errors = captureRuntime(page);
    await signInManualPersona(page, 'supplierCoordinator');
    const date = viewport === 'desktop' ? '2026-11-22' : '2026-11-21';
    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=time&lang=en`));
    let form = page.locator('form[data-supplier-operation="createTimeBatch"]');
    await form.locator('.batch-technician input[type="checkbox"]').first().check();
    await form.locator('[name="workDate"]').fill(date);
    await form.getByLabel('Actual hours').fill('8');
    await form.locator('[name="summary"]').fill(`Supplier accessibility baseline ${randomUUID()}`);
    await form.locator('button.primary-button').click();
    await expect(page.locator('#supplier-workspace [role="status"]')).toContainText('1');

    await page.goto(portal(`/supplier?projectId=${projectId}&workspaceAction=time&lang=en`));
    form = page.locator('form[data-supplier-operation="createTimeBatch"]');
    await form.locator('.batch-technician input[type="checkbox"]').first().check();
    await form.locator('[name="workDate"]').fill(date);
    await form.locator('[name="category"]').selectOption('travel');
    await form.locator('[name="durationHours"]').fill('20');
    await form.locator('[name="summary"]').fill('Review daily time limit');
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createTimeBatch'),
    );
    await form.locator('button.primary-button').click();
    const response = await responsePromise;
    expect(response.status()).toBe(400);
    const notice = form.locator('[data-problem-code="SUPPLIER_BATCH_TECHNICIAN_DAILY_LIMIT"]');
    await expect(notice).toBeVisible();
    await expect(form.locator('[data-validation-summary]')).not.toContainText('{technicianName}');
    await expect(notice).toBeFocused();
    await expect(form.locator('[name="durationHours"]')).toHaveValue('20');
    await expect(form.locator('[name="summary"]')).toHaveValue('Review daily time limit');
    await expect(page.locator('.supplier-jump-links .active')).toHaveText('Record team hours');
    await expect
      .poll(() =>
        notice.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top >= -2 && bounds.bottom <= innerHeight + 2;
        }),
      )
      .toBe(true);
    await assertAxeAndSave(page, notice, 'supplier-daily-limit', viewport, response.status());
    expect(errors).toEqual([]);
  });
}
