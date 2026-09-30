import { expect, test } from '@playwright/test';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const invoiceId = process.env.JA_PROD_QA_INVOICE_ID;
const ownerState = process.env.JA_PROD_QA_OWNER_STATE;

test.beforeAll(() => {
  if (!invoiceId || !/^[0-9a-f-]{36}$/iu.test(invoiceId))
    throw new Error(
      'JA_PROD_QA_INVOICE_ID must identify the existing disposable USD 3.61 QA invoice',
    );
  if (!ownerState)
    throw new Error('JA_PROD_QA_OWNER_STATE must identify an existing Owner session');
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`Finance failed credit retains inputs and focuses the localized error in ${locale}`, async ({
    page,
    browser,
  }, testInfo) => {
    const errors: string[] = [];
    const posts: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url());
    });
    const path = `/j-aautomation/app/billing?view=invoices&invoice=${invoiceId}&lang=${locale}`;
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const drawer = page.locator('[data-ui="responsive-sheet"]');
    await expect(drawer).toBeVisible();
    // This original amount makes 3.62 invalid even when earlier credits reduce its remainder.
    await expect(drawer.locator('.billing-section__invoice-heading')).toContainText(/3[.,]61/u);
    await expect(drawer.locator('.billing-section__invoice-heading')).toContainText('USD');
    await expect(drawer.locator('form[action="?/voidInvoice"]')).toHaveCount(0);
    const before = await page.locator(`tr[data-invoice-row="${invoiceId}"]`).innerText();
    const form = drawer.locator('form[action="?/createInvoiceAdjustment"]');
    await form.locator('xpath=ancestor::details').locator(':scope > summary').click();
    await expect(form.locator('[name="amount"]')).not.toHaveAttribute('max', /.+/u);
    await form.locator('[name="amount"]').fill('3.62');
    const reason = `QA validation only (${locale}): over remaining synthetic invoice amount; no credit should be created.`;
    await form.locator('[name="reason"]').fill(reason);
    const response = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).search === '?/createInvoiceAdjustment',
    );
    await form.locator('button[type="submit"]').click();
    expect((await response).status()).toBe(400);
    await page.waitForLoadState('networkidle');
    const notice = drawer.locator(
      '[data-billing-invoice-problem] [data-problem-code="BILLING_ADJUSTMENT_AMOUNT_BLOCKED"]',
    );
    await expect(notice.locator('strong')).toHaveText(
      portalText(locale, 'problem.notice.actionNeeded'),
    );
    await expect(notice.locator('p')).toHaveText(
      portalText(locale, 'problem.billing.adjustmentAmountBlocked'),
    );
    await expect(notice.getByRole('link')).toHaveText(portalText(locale, 'Review invoice'));
    await expect(notice).toBeFocused();
    await expect(notice).toHaveAttribute('role', 'alert');
    await expect(notice).toHaveAttribute('aria-live', 'assertive');
    await expect(form.locator('[name="adjustmentType"]')).toHaveValue('credit');
    await expect(form.locator('[name="amount"]')).toHaveValue('3.62');
    await expect(form.locator('[name="reason"]')).toHaveValue(reason);
    expect(errors).toEqual([]);
    expect(posts).toHaveLength(1);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`tr[data-invoice-row="${invoiceId}"]`)).toHaveText(before, {
      useInnerText: true,
    });

    const owner = await browser.newContext({
      storageState: ownerState,
      viewport: testInfo.project.use.viewport,
      baseURL: testInfo.project.use.baseURL,
    });
    try {
      const ownerPage = await owner.newPage();
      const ownerPosts: string[] = [];
      ownerPage.on('request', (request) => {
        if (request.method() === 'POST') ownerPosts.push(request.url());
      });
      await ownerPage.goto(path);
      await ownerPage.waitForLoadState('networkidle');
      const voidForm = ownerPage.locator('form[action="?/voidInvoice"]');
      await expect(voidForm).toHaveCount(1);
      await voidForm.locator('xpath=ancestor::details').locator(':scope > summary').click();
      await expect(
        voidForm.getByRole('button', { name: portalText(locale, 'Void'), exact: true }),
      ).toBeVisible();
      await expect(voidForm.locator('[name="reason"]')).toHaveAttribute('required', '');
      expect(ownerPosts).toEqual([]);
    } finally {
      await owner.close();
    }
  });
}
