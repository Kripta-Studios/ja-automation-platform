import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { portal, signIn } from './auth.js';

test.describe.configure({ timeout: 60_000 });
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(15_000);
});

async function captureRoundTwoEvidence(
  page: import('@playwright/test').Page,
  projectName: string,
  label: string,
): Promise<void> {
  const evidenceDirectory = process.env.JA_UX_ROUND2_WORK_EVIDENCE;
  if (!evidenceDirectory) return;
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({
    path: join(evidenceDirectory, `ux2-after-${label}-${projectName}.png`),
    animations: 'disabled',
  });
}

test('ux-round2-time-shortcuts keep the selected week and open a day-specific entry', async ({
  page,
}, testInfo) => {
  await signIn(page, 'worker');
  await page.goto(portal('/time?lang=en'), { waitUntil: 'networkidle' });
  const isPhone = (page.viewportSize()?.width ?? 1024) <= 650;
  await captureRoundTwoEvidence(page, testInfo.project.name, 'time');

  const shortcuts = page.getByRole('navigation', { name: 'Time page shortcuts' });
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts.getByRole('link', { name: 'Weekly view' })).toBeVisible();
  await expect(shortcuts.getByRole('link', { name: 'Submit this week' })).toBeVisible();
  await expect(shortcuts.getByRole('link', { name: 'Time register' })).toBeVisible();
  await expect(page.locator('.time-week-details')).toHaveJSProperty('open', !isPhone);

  const weekInput = page.locator('.timesheet-period input[name="week"]');
  const weekStart = await weekInput.inputValue();
  const weekRegister = shortcuts.getByRole('link', { name: /Review this week in the register/u });
  const weekRegisterUrl = new URL((await weekRegister.getAttribute('href'))!, portal(''));
  expect(weekRegisterUrl.searchParams.get('from')).toBe(weekStart);
  expect(weekRegisterUrl.searchParams.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  await weekRegister.click();
  await expect(page).toHaveURL(/#time-records$/u);

  const dayButton = page.locator('.time-day-shortcuts button').first();
  const dayLabel = (await dayButton.getAttribute('aria-label')) ?? '';
  const day = dayLabel.match(/\d{4}-\d{2}-\d{2}/u)?.[0];
  expect(day).toBeTruthy();
  await dayButton.click();
  const timeDialog = page.getByRole('dialog');
  await expect(timeDialog.locator('input[name="workDate"]')).toHaveValue(day!);
  await expect(timeDialog.getByRole('button', { name: 'Save draft' })).toBeVisible();
  await timeDialog.getByRole('button', { name: 'Cancel' }).click();
});

test('ux-round2-expense-form prioritizes amount and lets a selected receipt be removed', async ({
  page,
}, testInfo) => {
  await signIn(page, 'worker');
  await page.goto(portal('/expenses?lang=en'), { waitUntil: 'networkidle' });

  const shortcuts = page.getByRole('navigation', { name: 'Expense page shortcuts' });
  await expect(shortcuts.getByRole('link', { name: 'Expense register' })).toBeVisible();
  await page.getByRole('button', { name: 'Record expense', exact: true }).click();

  const form = page.locator('.expense-entry-form[data-expense-entry-surface]');
  await expect(form).toBeVisible();
  await expect(form.locator('.expense-form-steps')).toBeVisible();
  const project = form.locator('select[name="projectId"]');
  const projectId = await project
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).find(Boolean),
    );
  expect(projectId).toBeTruthy();
  await project.selectOption(projectId!);
  const preservedDescription = 'Draft text remains while jumping between expense sections';
  await form.locator('textarea[name="description"]').fill(preservedDescription);
  await form
    .locator('.expense-form-steps')
    .getByRole('link', { name: 'Amount and currency' })
    .click();
  await expect(form.locator('#expense-entry-amount')).toBeInViewport();
  await expect(form.locator('.expense-currency-context')).toContainText('Selected currency:');
  await expect(form).toBeVisible();
  await expect(project).toHaveValue(projectId!);
  await expect(form.locator('textarea[name="description"]')).toHaveValue(preservedDescription);

  await form.locator('input[name="receipt"]').setInputFiles({
    name: 'site-receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('synthetic receipt preview'),
  });
  await expect(form.locator('.expense-receipt-preview-name')).toHaveText('site-receipt.jpg');
  await expect(form.locator('.expense-receipt-preview-metadata')).toContainText('image/jpeg');
  await expect(form.locator('.expense-receipt-preview-metadata')).toContainText('B');
  await form.getByRole('button', { name: 'Remove selected receipt' }).click();
  await expect(form.locator('input[name="receipt"]')).toHaveValue('');

  await expect(form.getByText('Record another expense after saving')).toBeVisible();
  await expect(form.locator('details.expense-optional-details')).toHaveJSProperty('open', false);
  await captureRoundTwoEvidence(page, testInfo.project.name, 'expense-form');
  await form.getByRole('button', { name: 'Cancel' }).click();
});

test('ux-round2-report-tabs stay above filters and detail returns to the filtered list safely', async ({
  page,
}, testInfo) => {
  await signIn(page, 'worker');
  await page.goto(portal('/reports?lang=en&view=daily&status=draft'), {
    waitUntil: 'networkidle',
  });
  await captureRoundTwoEvidence(page, testInfo.project.name, 'reports-list');

  const tabs = page.getByRole('tablist', { name: 'Report page shortcuts' });
  await expect(tabs.getByRole('tab', { name: /Daily reports/u })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: /Technical reports/u })).toBeVisible();
  const tabTop = await tabs.evaluate((element) => element.getBoundingClientRect().top);
  const filterTop = await page
    .locator('.report-register-filters')
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(tabTop).toBeLessThan(filterTop);

  const firstReport = page.locator('.report-register-card .report-register-link').first();
  await expect(firstReport).toBeVisible();
  const detailHref = await firstReport.getAttribute('href');
  expect(detailHref).toBeTruthy();
  await firstReport.click();
  await expect(page).toHaveURL(/returnTo=/u);
  const returnLink = page.getByRole('link', {
    name: 'Return to the filtered report list',
    exact: true,
  });
  await expect(returnLink).toBeVisible();
  const returnHref = new URL((await returnLink.getAttribute('href'))!, portal(''));
  expect(returnHref.origin).toBe(new URL(portal('')).origin);
  expect(returnHref.pathname).toBe('/j-aautomation/app/reports');
  expect(returnHref.searchParams.get('status')).toBe('draft');
  expect(returnHref.searchParams.get('view')).toBe('daily');
  await returnLink.click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('status') === 'draft' && url.searchParams.get('view') === 'daily',
  );
  await expect(page.locator('.report-register-filters select[name="status"]')).toHaveValue('draft');
  await expect(page.locator('[data-filter-summary]')).toContainText('Status: Draft');

  const maliciousReturn = new URL(detailHref!, portal(''));
  maliciousReturn.searchParams.set('returnTo', 'https://attacker.example/');
  await page.goto(maliciousReturn.href, { waitUntil: 'networkidle' });
  await expect(
    page.getByRole('link', { name: 'Return to the filtered report list', exact: true }),
  ).toHaveAttribute('href', '/j-aautomation/app/reports');
});

test('ux-round2-report-editor keeps save actions above the fixed mobile navigation', async ({
  page,
}, testInfo) => {
  await signIn(page, 'worker');
  await page.goto(portal('/reports?lang=en&view=daily&status=draft'), {
    waitUntil: 'networkidle',
  });
  const firstReport = page.locator('.report-register-card .report-register-link').first();
  await expect(firstReport).toBeVisible();
  await firstReport.click();

  const modify = page.getByRole('link', { name: 'Modify report', exact: true });
  await expect(modify).toBeVisible();
  await modify.click();
  const actions = page.locator('.report-form-actions');
  await expect(actions).toHaveCSS('position', 'sticky');
  await actions.scrollIntoViewIfNeeded();
  await captureRoundTwoEvidence(page, testInfo.project.name, 'report-editor');
  await expect(actions.getByRole('button', { name: 'Save changes' })).toBeVisible();
  const actionBounds = await actions.boundingBox();
  const mobileNav = page.locator('.bottom-nav');
  expect(actionBounds).toBeTruthy();
  if ((page.viewportSize()?.width ?? 1024) <= 620 && (await mobileNav.isVisible())) {
    const navBounds = await mobileNav.boundingBox();
    expect(navBounds).toBeTruthy();
    expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(navBounds!.y);
  }
  await expect(page.locator('.report-detail-context')).toContainText('Project');
  await expect(page.locator('.report-detail-page h1')).toHaveCSS('overflow-wrap', 'anywhere');
});

test('ux-round2-report section anchors retain daily and technical draft text', async ({ page }) => {
  await signIn(page, 'worker');
  await page.goto(portal('/reports?lang=en&view=daily'), { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New daily report' }).first().click();

  const dailyForm = page.locator('form[data-report-entry-surface="daily"]');
  const dailyText = 'Daily draft survives a section jump';
  await dailyForm.locator('textarea[name="summary"]').fill(dailyText);
  await dailyForm.locator('.report-form-steps a[href="#daily-report-handover"]').click();
  await expect(dailyForm).toBeVisible();
  await expect(dailyForm.locator('textarea[name="summary"]')).toHaveValue(dailyText);
  page.once('dialog', async (dialog) => dialog.accept());
  await dailyForm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.report-entry-sheet')).toBeHidden();

  await page.getByRole('tab', { name: /Technical reports/u }).click();
  await page.getByRole('button', { name: 'New technical report' }).first().click();
  const technicalForm = page.locator('form[data-report-entry-surface="technical"]');
  const technicalText = 'Technical draft survives a section jump';
  await technicalForm.locator('textarea[name="problemSymptom"]').fill(technicalText);
  await technicalForm.locator('.report-form-steps a[href="#technical-report-handover"]').click();
  await expect(technicalForm).toBeVisible();
  await expect(technicalForm.locator('textarea[name="problemSymptom"]')).toHaveValue(technicalText);
  page.once('dialog', async (dialog) => dialog.accept());
  await technicalForm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.report-entry-sheet')).toBeHidden();
});

test('ux-round2-expense-save-another resets only after success and preserves a failed entry', async ({
  page,
}) => {
  await signIn(page, 'worker');
  await page.goto(portal('/expenses?lang=en'), { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Record expense', exact: true }).click();

  const form = page.locator('form.expense-entry-form[data-expense-entry-surface]');
  await expect(form).toBeVisible();
  const project = form.locator('select[name="projectId"]');
  const projectId = await project
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).find(Boolean),
    );
  expect(projectId).toBeTruthy();
  await project.selectOption(projectId!);
  const date = form.locator('input[name="spentOn"]');
  if (!(await date.inputValue())) {
    await date.fill(new Date().toISOString().slice(0, 10));
  }
  await form.locator('select[name="category"]').selectOption('meals');
  await form.locator('input[name="amount"]').fill('12.34');
  const currency = form.locator('select[name="currency"]');
  await currency.selectOption('USD');
  const payer = form.locator('select[name="whoPaid"]');
  await payer.selectOption('worker');
  const worker = form.locator('select[name="workerId"]');
  const workerBefore = (await worker.count()) > 0 ? await worker.inputValue() : null;
  const savedDate = await date.inputValue();
  const category = form.locator('select[name="category"]');
  const firstDescription = `UX2 disposable first ${randomUUID()}`;
  await form.locator('textarea[name="description"]').fill(firstDescription);
  await form.getByRole('checkbox', { name: 'Record another expense after saving' }).check();
  const firstRequestId = await form.locator('input[name="requestId"]').inputValue();
  let createPosts = 0;
  const createRequestBodies: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('createExpense')) {
      createPosts += 1;
      createRequestBodies.push(
        request.postData() ?? request.postDataBuffer()?.toString('utf8') ?? '',
      );
    }
  });

  const successResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('createExpense'),
  );
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  const firstAction = await successResponse;
  expect(firstAction.status()).toBe(200);
  expect(((await firstAction.json()) as { type?: string }).type).toBe('success');
  expect(createRequestBodies[0]).toContain(firstRequestId);
  await expect(form.locator('[data-expense-another-status]')).toContainText('Expense saved');
  await expect(form.locator('input[name="amount"]')).toHaveValue('');
  await expect(form.locator('textarea[name="description"]')).toHaveValue('');
  await expect(project).toHaveValue(projectId!);
  await expect(date).toHaveValue(savedDate);
  await expect(currency).toHaveValue('USD');
  await expect(payer).toHaveValue('worker');
  await expect(category).toHaveValue('hotel');
  if (workerBefore !== null) await expect(worker).toHaveValue(workerBefore);
  const secondRequestId = await form.locator('input[name="requestId"]').inputValue();
  expect(secondRequestId).not.toBe(firstRequestId);
  await expect(
    form.getByRole('checkbox', { name: 'Record another expense after saving' }),
  ).toBeChecked();
  const firstPersistedExpense = page
    .locator('.calendar-day li')
    .filter({ hasText: firstDescription });
  await expect(firstPersistedExpense).toHaveCount(1);
  const firstRecordHref = await firstPersistedExpense
    .getByRole('link', { name: 'View expense' })
    .getAttribute('href');
  const firstRecordId = firstRecordHref?.split('/').at(-1);
  expect(firstRecordId).toBeTruthy();
  expect(createPosts).toBe(1);
  await page.waitForTimeout(250);
  expect(createPosts).toBe(1);

  const secondDescription = `UX2 disposable second ${randomUUID()}`;
  await category.selectOption('meals');
  await form.locator('input[name="amount"]').fill('22.45');
  await form.locator('textarea[name="description"]').fill(secondDescription);
  const secondSuccessResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('createExpense'),
  );
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  const secondAction = await secondSuccessResponse;
  expect(secondAction.status()).toBe(200);
  expect(((await secondAction.json()) as { type?: string }).type).toBe('success');
  expect(createRequestBodies[1]).toContain(secondRequestId);
  await expect(form.locator('[data-expense-another-status]')).toContainText('Expense saved');
  await expect(form.locator('input[name="amount"]')).toHaveValue('');
  await expect(form.locator('textarea[name="description"]')).toHaveValue('');
  await expect(project).toHaveValue(projectId!);
  await expect(date).toHaveValue(savedDate);
  await expect(currency).toHaveValue('USD');
  await expect(payer).toHaveValue('worker');
  if (workerBefore !== null) await expect(worker).toHaveValue(workerBefore);
  const failedRequestId = await form.locator('input[name="requestId"]').inputValue();
  expect(failedRequestId).not.toBe(firstRequestId);
  expect(failedRequestId).not.toBe(secondRequestId);
  const secondPersistedExpense = page
    .locator('.calendar-day li')
    .filter({ hasText: secondDescription });
  await expect(secondPersistedExpense).toHaveCount(1);
  const secondRecordHref = await secondPersistedExpense
    .getByRole('link', { name: 'View expense' })
    .getAttribute('href');
  const secondRecordId = secondRecordHref?.split('/').at(-1);
  expect(secondRecordId).toBeTruthy();
  expect(secondRecordId).not.toBe(firstRecordId);
  await expect(firstPersistedExpense).toHaveCount(1);
  expect(createPosts).toBe(2);
  await page.waitForTimeout(250);
  expect(createPosts).toBe(2);

  const failedDescription = `UX2 disposable failed receipt ${randomUUID()}`;
  await form.locator('input[name="amount"]').fill('18.75');
  await form.locator('textarea[name="description"]').fill(failedDescription);
  const receipt = form.locator('input[name="receipt"]');
  await receipt.setInputFiles({
    name: 'ux2-invalid-receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('Not a real PNG file.'),
  });
  const failureResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('createExpense'),
  );
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  const failedAction = await failureResponse;
  expect(failedAction.status()).toBe(200);
  const failedActionResult = (await failedAction.json()) as {
    type?: string;
    status?: number;
    data?: unknown;
  };
  expect(failedActionResult.type).toBe('failure');
  expect(failedActionResult.status).toBe(400);
  expect(JSON.stringify(failedActionResult.data)).toContain('EXPENSE_RECEIPT_CONTENT_INVALID');
  await expect(form.locator('input[name="amount"]')).toHaveValue('18.75');
  await expect(form.locator('textarea[name="description"]')).toHaveValue(failedDescription);
  expect(await receipt.evaluate((input: HTMLInputElement) => input.files?.[0]?.name ?? '')).toBe(
    'ux2-invalid-receipt.png',
  );
  await expect(form.locator('input[name="requestId"]')).toHaveValue(failedRequestId);
  await expect(page.locator('.calendar-day li').filter({ hasText: failedDescription })).toHaveCount(
    0,
  );
  expect(createPosts).toBe(3);
  await page.waitForTimeout(250);
  expect(createPosts).toBe(3);

  const guidedRecovery = page.locator('dialog[data-ui="guided-recovery"]');
  if (await guidedRecovery.isVisible()) {
    await guidedRecovery.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(guidedRecovery).toBeHidden();
  }
  const discardConfirmation = page.waitForEvent('dialog');
  const cancelClick = form.getByRole('button', { name: 'Cancel', exact: true }).click();
  const dialog = await discardConfirmation;
  expect(dialog.type()).toBe('confirm');
  expect(dialog.message()).toMatch(/Discard your unsaved changes/u);
  await dialog.accept();
  await cancelClick;
  await expect(form).toBeHidden();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.calendar-day li').filter({ hasText: firstDescription })).toHaveCount(
    1,
  );
  await expect(page.locator('.calendar-day li').filter({ hasText: secondDescription })).toHaveCount(
    1,
  );
  await expect(page.locator('.calendar-day li').filter({ hasText: failedDescription })).toHaveCount(
    0,
  );
});
