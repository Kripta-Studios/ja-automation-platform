import { expect, test } from '@playwright/test';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const sessions = {
  owner: process.env.JA_PROD_QA_OWNER_STATE,
  finance: process.env.JA_PROD_QA_FINANCE_STATE,
};
const expenseId = process.env.JA_PROD_QA_PACK_FX_EXPENSE_ID;
const projectId = process.env.JA_PROD_QA_PACK_FX_PROJECT_ID;
const languages = { en: 'English', es: 'Español', pt: 'Português (Brasil)' };

test.beforeAll(() => {
  if (!sessions.owner || !sessions.finance)
    throw new Error('Existing isolated Owner and Finance sessions are required');
  for (const id of [expenseId, projectId])
    if (!id || !/^[0-9a-f-]{36}$/iu.test(id))
      throw new Error('Existing isolated missing-conversion expense and project IDs are required');
  if (process.env.JA_PROD_QA_ALLOW_PACK_CONFLICT_RETRY !== '1')
    throw new Error('Explicit authorization for the known September pack conflict is required');
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`locale codes, accessible names and keyboard navigation remain usable in ${locale}`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      storageState: sessions.owner,
      viewport: testInfo.project.use.viewport,
    });
    try {
      const page = await context.newPage();
      const posts: string[] = [];
      const errors: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST') posts.push(request.url());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/j-aautomation/app/accounting?lang=${locale}`);
      await page.waitForLoadState('networkidle');
      const selector = page.locator('.locale-switcher select');
      await expect(selector).toHaveAccessibleName(portalText(locale, 'Language'));
      await expect(selector).toHaveValue(locale);
      for (const [code, name] of Object.entries(languages)) {
        await expect(selector.locator(`option[value="${code}"]`)).toHaveAccessibleName(
          portalText(locale, name),
        );
        await expect(selector.locator(`option[value="${code}"]`)).toHaveText(
          code === 'pt' ? 'PT-BR' : code.toUpperCase(),
        );
      }
      const cdp = await context.newCDPSession(page);
      const ax = await cdp.send('Accessibility.getFullAXTree');
      const optionNames = ax.nodes
        .filter((node) => node.role?.value === 'option')
        .map((node) => node.name?.value);
      for (const name of Object.values(languages))
        expect(optionNames).toContain(portalText(locale, name));
      await cdp.detach();
      const metrics = await selector.evaluate((select: HTMLSelectElement) => {
        const box = select.getBoundingClientRect();
        const css = getComputedStyle(select);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        ctx.font = css.font;
        const textWidth = ctx.measureText(select.selectedOptions[0]!.text).width;
        const available =
          box.width -
          parseFloat(css.paddingLeft) -
          parseFloat(css.paddingRight) -
          parseFloat(css.borderLeftWidth) -
          parseFloat(css.borderRightWidth);
        return { height: box.height, textWidth, available, left: box.left, right: box.right };
      });
      expect(metrics.height).toBeGreaterThanOrEqual(44);
      expect(metrics.available).toBeGreaterThanOrEqual(metrics.textWidth);
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(testInfo.project.use.viewport!.width);
      await page.screenshot({ path: testInfo.outputPath(`locale-${locale}.png`) });

      // Exercise the existing native select with keys, including its change handler.
      await selector.focus();
      await selector.press('End');
      await expect(selector).toHaveValue('pt');
      await expect(page).toHaveURL(/lang=pt/u);
      await selector.press('Home');
      if (locale !== 'en') {
        await selector.press('ArrowDown');
        if (locale === 'pt') await selector.press('ArrowDown');
      }
      await selector.press('Escape');
      await expect(selector).toHaveValue(locale);
      await expect(page).toHaveURL(new RegExp(`lang=${locale}`, 'u'));
      await selector.press('Tab');
      const account = page.locator('header .account-trigger');
      await expect(account).toBeFocused();
      await account.press('Enter');
      const menu = page.locator('#account-menu');
      await expect(menu).toBeVisible();
      await expect(menu.locator('a[href$="/app/help"]')).toBeVisible();
      const webmail = menu.locator('a[href="https://webmail.j-aautomation.com/"]');
      await expect(webmail).toHaveAttribute('target', '_blank');
      await expect(webmail.locator('.ui-direction-icon')).toHaveAttribute('aria-hidden', 'true');
      await page.keyboard.press('Escape');
      await expect(menu).not.toBeVisible();
      await expect(account).toBeFocused();
      const navigation = page.locator('header .menu-button');
      if (await navigation.isVisible()) {
        await navigation.click();
        const sidebar = page.locator('#portal-navigation');
        await expect(sidebar).toBeVisible();
        await expect(sidebar.locator('.portal-external-nav-link .ui-direction-icon')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(navigation).toBeFocused();
      }
      await page.reload();
      await expect(selector).toHaveValue(locale);
      expect(posts).toEqual([]);
      expect(errors).toEqual([]);
      await testInfo.attach('locale-metrics', {
        body: JSON.stringify({ locale, metrics, optionNames, posts, errors }),
        contentType: 'application/json',
      });
    } finally {
      await context.close();
    }
  });

  test(`known pack conflict gives truthful conversion guidance and retains inputs in ${locale}`, async ({
    browser,
  }, testInfo) => {
    const role = locale === 'es' ? 'finance' : 'owner';
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      storageState: sessions[role],
      viewport: testInfo.project.use.viewport,
    });
    try {
      const page = await context.newPage();
      const posts: string[] = [];
      const errors: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST') posts.push(request.url());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/j-aautomation/app/accounting?lang=${locale}`);
      await page.waitForLoadState('networkidle');
      const register = page.locator('#accounting-register');
      const before = await register.innerText();
      const packIdsBefore = await register
        .locator('article[id^="accounting-pack-"]')
        .evaluateAll((articles) => articles.map((article) => article.id));
      const form = page.locator('form[action="?/createAccountingPack"]');
      await form.locator('xpath=ancestor::details').locator(':scope > summary').click();
      await form.locator('[name="periodStart"]').fill('2026-09-01');
      await form.locator('[name="periodEnd"]').fill('2026-09-30');
      await form.locator('[name="reportLocale"]').selectOption(locale);
      const pending = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('/createAccountingPack'),
      );
      await form.locator('button[type="submit"]').click();
      const response = await pending;
      const result = JSON.parse(await response.text()) as {
        type: string;
        status: number;
        data: string;
      };
      expect(result.type).toBe('failure');
      expect(result.status).toBe(409);
      expect(result.data).toContain('ACCOUNTING_PACK_EXPENSE_CURRENCY_REVIEW_REQUIRED');
      expect(result.data).toContain(expenseId!);
      expect(result.data).toContain(projectId!);
      const notice = page.locator('#accounting-generate [data-ui="problem-notice"]').first();
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(
        translate(locale, 'problem.billing.packExpenseCurrencyReviewRequired'),
      );
      await expect(notice).toBeFocused();
      await expect(form.locator('[name="periodStart"]')).toHaveValue('2026-09-01');
      await expect(form.locator('[name="periodEnd"]')).toHaveValue('2026-09-30');
      await expect(form.locator('[name="reportLocale"]')).toHaveValue(locale);
      const review = notice.getByRole('link');
      const target = new URL((await review.getAttribute('href'))!, page.url());
      expect(target.pathname).toBe('/j-aautomation/app/approvals');
      expect(target.searchParams.get('stage')).toBe('finance');
      expect(target.searchParams.get('project')).toBe(projectId);
      expect(target.searchParams.get('q')).toBe(expenseId);
      expect(target.hash).toBe('#finance-review');
      const box = await notice.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(testInfo.project.use.viewport!.width);
      await page.screenshot({ path: testInfo.outputPath(`pack-warning-${locale}.png`) });
      await review.click();
      await expect(page).toHaveURL(target.href);
      await expect(page.locator('main')).toBeVisible();
      await page.goto(`/j-aautomation/app/accounting?lang=${locale}`);
      await page.waitForLoadState('networkidle');
      // The real conflict must leave the fresh visible pack register unchanged.
      expect(await register.innerText()).toBe(before);
      expect(
        await register
          .locator('article[id^="accounting-pack-"]')
          .evaluateAll((articles) => articles.map((article) => article.id)),
      ).toEqual(packIdsBefore);
      expect(posts).toHaveLength(1);
      expect(errors).toEqual([]);
      await testInfo.attach('actual-pack-conflict', {
        body: JSON.stringify({ role, locale, result, target: target.href, posts, errors }),
        contentType: 'application/json',
      });
    } finally {
      await context.close();
    }
  });
}
