import { expect, test } from '@playwright/test';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const expenseId = process.env.JA_PROD_QA_HOLD_EXPENSE_ID;
const classifiedId = process.env.JA_PROD_QA_CLASSIFIED_EXPENSE_ID;
const projectId = process.env.JA_PROD_QA_PROJECT_ID;
const missingFxId = process.env.JA_PROD_QA_MISSING_FX_EXPENSE_ID;
const missingFxProjectId = process.env.JA_PROD_QA_MISSING_FX_PROJECT_ID;
const sameCurrencyFallbackId = process.env.JA_PROD_QA_SAME_CURRENCY_FALLBACK_EXPENSE_ID;
const sessions = {
  owner: process.env.JA_PROD_QA_OWNER_STATE,
  finance: process.env.JA_PROD_QA_FINANCE_STATE,
  supplier: process.env.JA_PROD_QA_SUPPLIER_STATE,
  manager: process.env.JA_PROD_QA_MANAGER_STATE,
  worker: process.env.JA_PROD_QA_WORKER_STATE,
};

test.beforeAll(() => {
  for (const id of [
    expenseId,
    classifiedId,
    projectId,
    missingFxId,
    missingFxProjectId,
    sameCurrencyFallbackId,
  ])
    if (!id || !/^[0-9a-f-]{36}$/iu.test(id))
      throw new Error('Existing isolated QA expense and project IDs are required');
  for (const [role, state] of Object.entries(sessions))
    if (!state) throw new Error(`An existing isolated ${role} session is required`);
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`Owner and Finance see a classification hold and exact review link in ${locale}`, async ({
    browser,
  }, testInfo) => {
    for (const role of ['owner', 'finance'] as const) {
      const context = await browser.newContext({
        storageState: sessions[role],
        baseURL: testInfo.project.use.baseURL,
        viewport: testInfo.project.use.viewport,
      });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        const posts: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => {
          if (request.method() === 'POST') posts.push(request.url());
        });
        await page.goto(`/j-aautomation/app/expenses/${expenseId}?q=QA&lang=${locale}`);
        await page.waitForLoadState('networkidle');
        const hold = page.locator('[data-expense-finance-classification-hold]');
        await expect(hold).toBeVisible();
        await expect(hold.locator('strong')).toHaveText(
          portalText(locale, 'Needs Finance classification'),
        );
        await expect(hold.locator('p')).toHaveText(
          portalText(locale, 'problem.expenseDetail.financeClassificationHold'),
        );
        await expect(hold.locator('[data-ui="problem-notice"]')).toHaveAttribute('role', 'status');
        if (role === 'finance' && locale === 'en') {
          await hold.scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath('finance-classification-hold.png') });
        }
        for (const label of ['CLIENT TREATMENT', 'REIMBURSEMENT'])
          await expect(
            page
              .locator('.record-detail-grid article')
              .filter({ hasText: portalText(locale, label) })
              .locator('strong'),
          ).toHaveText(portalText(locale, 'Needs Finance classification'));
        const review = hold.getByRole('link', {
          name: portalText(locale, 'Review expense classification'),
          exact: true,
        });
        const href = new URL((await review.getAttribute('href'))!, page.url());
        expect(href.pathname).toBe('/j-aautomation/app/finance');
        expect(Object.fromEntries(href.searchParams)).toEqual({
          view: 'commercial',
          project: projectId,
          expense: expenseId,
          lang: locale,
          q: 'QA',
        });
        expect(href.hash).toBe('#expense-classification');
        await review.click();
        await page.waitForLoadState('networkidle');
        const classification = page.locator(
          `[data-finance-expense-id="${expenseId}"] form[data-finance-expense-classification]`,
        );
        await expect(classification).toBeVisible();
        await expect(classification.locator('[name="expenseId"]')).toHaveValue(expenseId!);
        await page.goto(`/j-aautomation/app/expenses/${classifiedId}?lang=${locale}`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('[data-expense-finance-classification-hold]')).toHaveCount(0);
        await expect(page.locator('.record-detail-grid')).not.toContainText(
          portalText(locale, 'Needs Finance classification'),
        );
        await expect(page.locator('[data-expense-project-amount] dd')).toContainText(/2[.,]50/u);
        await expect(page.locator('[data-expense-conversion-required]')).toHaveCount(0);
        expect(errors).toEqual([]);
        expect(posts).toEqual([]);
      } finally {
        await context.close();
      }
    }
  });
}

test('operational roles receive no financial classification state or remedy', async ({
  browser,
}, testInfo) => {
  for (const role of ['supplier', 'manager', 'worker'] as const) {
    const context = await browser.newContext({
      storageState: sessions[role],
      baseURL: testInfo.project.use.baseURL,
      viewport: testInfo.project.use.viewport,
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      const posts: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (request.method() === 'POST') posts.push(request.url());
      });
      if (role === 'worker') {
        await page.goto('/j-aautomation/app/profile?lang=en');
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(/\/app\/profile\?lang=en$/u);
        await expect(page.locator('.user-copy b')).toHaveText('QA Worker 1');
        await expect(page.locator('.user-copy small')).toHaveText('Worker');
        await expect(page.locator('#portal-global-search')).toHaveCount(1);
      }
      const response = await page.goto(`/j-aautomation/app/expenses/${expenseId}?lang=en`);
      await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?lang=en$`, 'u'));
      expect(response?.status()).toBe(role === 'worker' ? 403 : 200);
      const html = await response!.text();
      expect(html).not.toContain('commercial_classification_state');
      expect(html).not.toContain('expense_policy_required');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-expense-finance-classification-hold]')).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Review expense classification', exact: true }),
      ).toHaveCount(0);
      if (role !== 'worker') {
        await expect(page.locator('.record-detail-grid')).not.toContainText('CLIENT TREATMENT');
        await expect(page.locator('.record-detail-grid')).not.toContainText('REIMBURSEMENT');
      }
      expect(errors).toEqual([]);
      expect(posts).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test('exact classification remedy overrides only filters hiding its target and retains navigation context', async ({
  browser,
}, testInfo) => {
  for (const role of ['owner', 'finance'] as const) {
    const context = await browser.newContext({
      storageState: sessions[role],
      baseURL: testInfo.project.use.baseURL,
      viewport: testInfo.project.use.viewport,
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      const posts: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (request.method() === 'POST') posts.push(request.url());
      });
      const query = 'definitely-unmatched-qa-expense';
      const savedSearch = 'another-unmatched-saved-finance-filter';
      const detail = `/j-aautomation/app/expenses/${expenseId}?q=${query}&lang=en`;
      const untargeted = `/j-aautomation/app/finance?view=commercial&project=${projectId}&lang=en&q=${query}#expense-classification`;
      const search = page.getByRole('searchbox', {
        name: 'Search: Expense treatment and planning',
        exact: true,
      });
      const form = page.locator(
        `[data-finance-expense-id="${expenseId}"] form[data-finance-expense-classification]`,
      );
      const card = page.locator(`[data-finance-expense-id="${expenseId}"]`);
      await page.goto(untargeted);
      await page.waitForLoadState('networkidle');
      await search.fill(savedSearch);
      await expect(card).toHaveCount(0);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(search).toHaveValue(savedSearch);
      await expect(card).toHaveCount(0);

      await page.goto(detail);
      await page.waitForLoadState('networkidle');
      const review = page.getByRole('link', { name: 'Review expense classification', exact: true });
      await review.click();
      await expect(page).toHaveURL(/\/app\/finance\?/u);
      await page.waitForLoadState('networkidle');
      await expect(form).toBeVisible();
      await search.fill(savedSearch);
      await expect(form).toHaveCount(0);
      await page.waitForFunction(
        (value) =>
          Object.values(sessionStorage).some((entry) => {
            try {
              return JSON.parse(entry).search === value;
            } catch {
              return false;
            }
          }),
        savedSearch,
      );
      await page.goto(detail);
      await page.waitForLoadState('networkidle');
      await review.click();
      await expect(page).toHaveURL(/\/app\/finance\?/u);
      await page.waitForLoadState('networkidle');
      const targeted = page.url();
      const url = new URL(targeted);
      expect(url.searchParams.get('q')).toBe(query);
      expect(url.searchParams.get('project')).toBe(projectId);
      expect(url.searchParams.get('expense')).toBe(expenseId);
      expect(url.searchParams.get('lang')).toBe('en');
      await expect(form).toBeVisible();
      await expect(form.locator('[name="expenseId"]')).toHaveValue(expenseId!);
      await expect(search).toHaveValue('');
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(form).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?`, 'u'));
      await page.goForward();
      await expect(page).toHaveURL(targeted);
      await expect(form).toBeVisible();

      await page.goto(untargeted);
      await page.waitForLoadState('networkidle');
      await expect(search).toHaveValue(savedSearch);
      await expect(card).toHaveCount(0);
      expect(errors).toEqual([]);
      expect(posts).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`missing foreign conversion never relabels source money in ${locale}`, async ({
    browser,
  }, testInfo) => {
    for (const role of ['owner', 'finance'] as const) {
      const context = await browser.newContext({
        storageState: sessions[role],
        baseURL: testInfo.project.use.baseURL,
        viewport: testInfo.project.use.viewport,
      });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        const posts: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => {
          if (request.method() === 'POST') posts.push(request.url());
        });
        await page.goto(
          `/j-aautomation/app/expenses/${missingFxId}?q=definitely-unmatched-fx&lang=${locale}`,
        );
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(new RegExp(`/expenses/${missingFxId}\\?`, 'u'));
        const source = page
          .locator('.record-detail-grid article')
          .filter({ hasText: portalText(locale, 'AMOUNT') });
        await expect(source).toContainText(/1[.,]23/u);
        await expect(source).toContainText(/\$|USD/u);
        await expect(source).not.toContainText('€');
        const projectAmount = page.locator('[data-expense-project-amount]');
        await expect(projectAmount.locator('[data-expense-conversion-required]')).toHaveText(
          portalText(locale, 'Verified currency conversion needed'),
        );
        await expect(projectAmount.locator('[data-expense-conversion-explanation]')).toHaveText(
          portalText(
            locale,
            'No verified conversion is recorded. This expense keeps its original currency. A conversion cannot currently be entered here.',
          ),
        );
        await expect(projectAmount.locator('dd')).not.toContainText(/1[.,]23|€/u);
        const explanation = projectAmount.locator('[data-expense-conversion-explanation]');
        expect(
          await explanation.evaluate((element) => ({
            wraps: getComputedStyle(element).whiteSpace !== 'nowrap',
            fits: element.scrollWidth <= element.clientWidth,
          })),
        ).toEqual({ wraps: true, fits: true });
        const review = projectAmount.getByRole('link', {
          name: portalText(locale, 'Review expense classification'),
          exact: true,
        });
        const href = new URL((await review.getAttribute('href'))!, page.url());
        expect(href.searchParams.get('project')).toBe(missingFxProjectId);
        expect(href.searchParams.get('expense')).toBe(missingFxId);
        expect(href.searchParams.get('lang')).toBe(locale);
        expect(href.searchParams.get('q')).toBe('definitely-unmatched-fx');
        await projectAmount.scrollIntoViewIfNeeded();
        if (role === 'finance' && locale === 'en')
          await page.screenshot({ path: testInfo.outputPath('expense-missing-conversion.png') });
        await review.click();
        await expect(page).toHaveURL(/\/app\/finance\?/u);
        const form = page.locator(
          `[data-finance-expense-id="${missingFxId}"] form[data-finance-expense-classification]`,
        );
        await expect(form).toBeVisible();
        await expect(form.locator('[name="expenseId"]')).toHaveValue(missingFxId!);

        await page.goto(`/j-aautomation/app/expenses/${sameCurrencyFallbackId}?lang=${locale}`);
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(new RegExp(`/expenses/${sameCurrencyFallbackId}\\?`, 'u'));
        const sameCurrencySource = page
          .locator('.record-detail-grid article')
          .filter({ hasText: portalText(locale, 'AMOUNT') });
        await expect(sameCurrencySource).toContainText(/48[.,]00/u);
        await expect(sameCurrencySource).toContainText(/\$|USD/u);
        const fallback = page.locator('[data-expense-project-amount] dd');
        await expect(fallback).toContainText(/48[.,]00/u);
        await expect(fallback).toContainText(/\$|USD/u);
        await expect(page.locator('[data-expense-conversion-required]')).toHaveCount(0);
        expect(errors).toEqual([]);
        expect(posts).toEqual([]);
      } finally {
        await context.close();
      }
    }
  });
}
