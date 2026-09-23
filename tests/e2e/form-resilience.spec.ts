import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';

const viewports = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);

async function contextualProject(page: Page, section: 'expenses' | 'reports'): Promise<string> {
  await page.goto(portal(`/${section}?lang=en&q=`), { waitUntil: 'networkidle' });
  const projectId = await page
    .locator(`form select[name="project"]`)
    .first()
    .evaluate(
      (select: HTMLSelectElement) =>
        Array.from(select.options).find((option) => option.value)?.value,
    );
  if (!projectId) throw new Error('The operational fixture must have an authorized project.');
  await page.goto(portal(`/${section}?lang=en&q=&project=${encodeURIComponent(projectId)}`), {
    waitUntil: 'networkidle',
  });
  return projectId;
}

async function expectContext(form: Locator, projectId: string, dateField: string): Promise<void> {
  await expect(form.locator('[name="projectId"]')).toHaveValue(projectId);
  const today = await form.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  await expect(form.locator(`[name="${dateField}"]`)).toHaveValue(today);
}

async function fillExpense(form: Locator, vendor: string): Promise<void> {
  await form.locator('[name="vendor"]').fill(vendor);
  await form.locator('[name="amount"]').fill('12.50');
  await form.locator('[name="description"]').fill('Travel receipt retained through a failed save.');
}

test('expense validation retains the receipt and values, then creation and editing succeed', async ({
  page,
}, info) => {
  test.skip(!viewports.has(info.project.name));
  await signIn(page, 'worker');
  const projectId = await contextualProject(page, 'expenses');
  await page.locator('[data-expense-primary-cta]').click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  const form = sheet.locator('[data-expense-entry-surface]');
  await expectContext(form, projectId, 'spentOn');
  const vendor = `Resilient receipt ${randomUUID()}`;
  await fillExpense(form, vendor);
  await form.locator('[name="receipt"]').setInputFiles({
    name: 'invalid-receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('invalid PDF bytes'),
  });
  // Native format checking is deliberately removed in this isolated DOM to exercise the
  // server's amountMinor field contract and its mapping back to the visible amount input.
  await form.locator('[name="amount"]').evaluate((input) => input.removeAttribute('pattern'));
  await form.locator('[name="amount"]').fill('12,50');
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(sheet.locator('[data-operational-form-error]')).toBeVisible();
  await expect(form.locator('[name="amount"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('[name="vendor"]')).toHaveValue(vendor);
  await expect(form.locator('[name="amount"]')).toHaveValue('12,50');
  expect(
    await form
      .locator('[name="receipt"]')
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe('invalid-receipt.pdf');
  await form.locator('[name="amount"]').fill('12.50');
  await expect(form.locator('[name="amount"]')).not.toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(sheet.locator('[data-operational-form-error]')).toContainText('Receipt');
  await expect(form.locator('[name="vendor"]')).toHaveValue(vendor);
  expect(
    await form
      .locator('[name="receipt"]')
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe('invalid-receipt.pdf');
  await form.locator('[name="receipt"]').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    // Each viewport/retry needs its own valid content: the repository correctly rejects
    // a receipt hash already registered by another fixture record.
    buffer: await sharp(Buffer.from(randomUUID().replaceAll('-', ''), 'hex'), {
      raw: { width: 2, height: 2, channels: 4 },
    })
      .png()
      .toBuffer(),
  });
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.locator('.expense-filters [name="q"]').fill(vendor);
  const row = page.locator('[data-expense-record]').filter({ hasText: vendor });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(form).toBeVisible();
  const newVendor = `${vendor} corrected`;
  await form.locator('[name="vendor"]').fill(newVendor);
  await form.locator('[name="amount"]').evaluate((input) => input.removeAttribute('pattern'));
  await form.locator('[name="amount"]').fill('bad amount');
  await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(form.locator('[name="amount"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('[name="vendor"]')).toHaveValue(newVendor);
  await form.locator('[name="amount"]').fill('15.25');
  await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row).toContainText(newVendor);
});

for (const kind of ['daily', 'technical'] as const) {
  test(`${kind} report retains all fields after server validation and saves after correction`, async ({
    page,
  }, info) => {
    test.skip(!viewports.has(info.project.name));
    await signIn(page, 'worker');
    const projectId = await contextualProject(page, 'reports');
    const title = kind === 'daily' ? 'New daily report' : 'New technical report';
    await page.getByRole('button', { name: title, exact: true }).first().click();
    const sheet = page.locator('[data-ui="responsive-sheet"]');
    const form = sheet.locator(`[data-report-entry-surface="${kind}"]`);
    await expectContext(form, projectId, kind === 'daily' ? 'workDate' : 'reportDate');
    const marker = `Resilient ${kind} ${randomUUID()}`;
    if (kind === 'daily') {
      await form.locator('[name="summary"]').fill('   ');
      await form.locator('[name="tasksCompleted"]').fill(marker);
      await form.locator('[name="openItems"]').fill('Preserve this pending task.');
    } else {
      await form.locator('[name="systemName"]').fill(marker);
      await form.locator('[name="problemSymptom"]').fill('Intermittent sensor input.');
      await form.locator('[name="diagnosisRootCause"]').fill('Loose connection.');
      await form.locator('[name="changePerformed"]').fill('Replaced the connector.');
      await form.locator('[name="safetyRelated"]').check();
    }
    await form.locator('button[type="submit"]').click();
    await expect(sheet.locator('[data-operational-form-error]')).toBeVisible();
    await expect(form).toHaveAttribute('aria-busy', 'false');
    const validationAccessibility = await new AxeBuilder({ page })
      .include('[data-ui="responsive-sheet"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(validationAccessibility.violations).toEqual([]);
    if (kind === 'daily') {
      await expect(form.locator('[name="summary"]')).toHaveAttribute('aria-invalid', 'true');
      await expect(form.locator('[name="tasksCompleted"]')).toHaveValue(marker);
      await expect(form.locator('[name="openItems"]')).toHaveValue('Preserve this pending task.');
      await form.locator('[name="summary"]').fill('Completed operational validation.');
    } else {
      await expect(form.locator('[name="validation"]')).toHaveAttribute('aria-invalid', 'true');
      await expect(form.locator('[name="rollbackPlan"]')).toHaveAttribute('aria-invalid', 'true');
      await expect(form.locator('[name="systemName"]')).toHaveValue(marker);
      await expect(form.locator('[name="safetyRelated"]')).toBeChecked();
      await form.locator('[name="validation"]').fill('Validated stop and restart with the lead.');
      await form
        .locator('[name="rollbackPlan"]')
        .fill('Restore the previous connector and configuration.');
    }
    await form.locator('button[type="submit"]').click();
    await expect(sheet).toHaveCount(0);
  });
}

test('owner expense save blocks duplicate submits and retains the form after network and server errors', async ({
  page,
}, info) => {
  test.skip(!viewports.has(info.project.name));
  await signIn(page, 'owner');
  const projectId = await contextualProject(page, 'expenses');
  await page.locator('[data-expense-primary-cta]').click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  const form = sheet.locator('[data-expense-entry-surface]');
  await expectContext(form, projectId, 'spentOn');
  const worker = form.locator('[name="workerId"]');
  const workerId = await worker.evaluate((select: HTMLSelectElement) => select.options[1]?.value);
  if (!workerId) throw new Error('Owner fixture needs an available worker.');
  await worker.selectOption(workerId);
  await fillExpense(form, 'Preserved during network failure');
  await form.locator('[name="receipt"]').setInputFiles({
    name: 'retained-network-receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('network fixture'),
  });
  let requests = 0;
  let release: (() => void) | undefined;
  await page.route('**/app/expenses?*/createExpense', async (route) => {
    requests += 1;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'error', status: 500, error: { message: 'Synthetic error' } }),
    });
  });
  await form.locator('button[type="submit"]').click();
  await expect(form).toHaveAttribute('aria-busy', 'true');
  await expect(form.locator('button[type="submit"]')).toBeDisabled();
  await expect(form.locator('[name="vendor"]')).toBeDisabled();
  await expect(form.locator('[name="receipt"]')).toBeDisabled();
  await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
  await expect.poll(() => requests).toBe(1);
  await expect.poll(() => Boolean(release)).toBe(true);
  release!();
  await expect(sheet.locator('[data-operational-form-error]')).toBeVisible();
  await expect(form).toHaveAttribute('aria-busy', 'false');
  await expect(form.locator('[name="vendor"]')).toBeEnabled();
  await expect(form.locator('[name="receipt"]')).toBeEnabled();
  await expect(form.locator('[name="vendor"]')).toHaveValue('Preserved during network failure');
  expect(
    await form
      .locator('[name="receipt"]')
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe('retained-network-receipt.pdf');
  await page.unroute('**/app/expenses?*/createExpense');
  await page.route('**/app/expenses?*/createExpense', (route) => route.abort('failed'));
  await form.locator('button[type="submit"]').click();
  await expect(sheet.locator('[data-operational-form-error]')).toBeVisible();
  await expect(form).toHaveAttribute('aria-busy', 'false');
  await expect(form.locator('[name="vendor"]')).toHaveValue('Preserved during network failure');
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/expenses'));
  const failureAccessibility = await new AxeBuilder({ page })
    .include('[data-ui="responsive-sheet"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(failureAccessibility.violations).toEqual([]);
  await sheet.locator('[data-operational-form-error]').scrollIntoViewIfNeeded();
  await sheet.screenshot({ path: info.outputPath('expense-preserved-after-failure.png') });
});

test('disabled offline mode keeps expense values and receipt with explicit reconnect feedback', async ({
  page,
  context,
}, info) => {
  test.skip(!viewports.has(info.project.name));
  await signIn(page, 'worker');
  const projectId = await contextualProject(page, 'expenses');
  await page.locator('[data-expense-primary-cta]').click();
  const sheet = page.locator('[data-ui="responsive-sheet"]');
  const form = sheet.locator('[data-expense-entry-surface]');
  await expectContext(form, projectId, 'spentOn');
  await fillExpense(form, 'Keep this offline expense');
  await form.locator('[name="receipt"]').setInputFiles({
    name: 'offline-receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('offline fixture'),
  });
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/createExpense')) posts++;
  });
  await context.setOffline(true);
  try {
    await form.locator('button[type="submit"]').click();
    await expect(sheet.locator('[data-operational-form-error]')).toHaveText(
      'Reconnect to save changes. Your entries are still here.',
    );
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(form.locator('[name="vendor"]')).toHaveValue('Keep this offline expense');
    expect(
      await form
        .locator('[name="receipt"]')
        .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
    ).toBe('offline-receipt.pdf');
    expect(posts).toBe(0);
  } finally {
    await context.setOffline(false);
  }
});
