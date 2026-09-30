import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const draftId = process.env.JA_PROD_QA_PRESENTATION_DRAFT_ID;
const projectId = process.env.JA_PROD_QA_PRESENTATION_PROJECT_ID;
const issuedId = process.env.JA_PROD_QA_PRESENTATION_ISSUED_ID;
const expenseRuleId = process.env.JA_PROD_QA_PRESENTATION_EXPENSE_RULE_ID;
const laborRuleId = process.env.JA_PROD_QA_PRESENTATION_LABOR_RULE_ID;
const laborProjectId = process.env.JA_PROD_QA_PRESENTATION_LABOR_PROJECT_ID;
const sessions = {
  owner: process.env.JA_PROD_QA_OWNER_STATE,
  finance: process.env.JA_PROD_QA_FINANCE_STATE,
  auditor: process.env.JA_PROD_QA_AUDITOR_STATE,
};
const previewHelp =
  'Preview is available before issuance. The final PDF is generated after issuance.';
const groupingHelp =
  'Grouping cannot be customized here. Invoice layout follows the selected template.';
const appRequire = createRequire(new URL('../../apps/portal/package.json', import.meta.url));
const kitRequire = createRequire(appRequire.resolve('@sveltejs/kit/package.json'));
const { stringify } = kitRequire('devalue') as { stringify: (value: unknown) => string };

test.beforeAll(() => {
  for (const id of [draftId, projectId, issuedId, expenseRuleId, laborRuleId, laborProjectId])
    if (!id || !/^[0-9a-f-]{36}$/iu.test(id))
      throw new Error('Existing isolated QA IDs are required');
  for (const [role, state] of Object.entries(sessions))
    if (!state) throw new Error(`An existing isolated ${role} session is required`);
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`draft editor permissions and PDF preview remain truthful in ${locale}`, async ({
    browser,
  }, testInfo) => {
    for (const [role, state] of Object.entries(sessions)) {
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        storageState: state,
        viewport: testInfo.project.use.viewport,
      });
      const page = await context.newPage();
      const posts: string[] = [];
      const errors: string[] = [];
      context.on('request', (request) => {
        if (request.method() === 'POST') posts.push(request.url());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(
        `/j-aautomation/app/billing?view=invoices&stage=drafts&project=${projectId}&lang=${locale}`,
      );
      await page.waitForLoadState('networkidle');
      const row = page.locator(`[data-invoice-row="${draftId}"]`);
      const phone = (testInfo.project.use.viewport?.width ?? 1440) < 768;
      const visibleRow = phone
        ? page.locator(`[data-table-region-cards] [data-row="${draftId}"]`)
        : row;
      await expect(visibleRow).toBeVisible();
      await expect(row.locator('[data-invoice-pdf-status]')).toHaveAttribute(
        'data-invoice-pdf-status',
        'preview',
      );
      await expect(row.locator('[data-invoice-pdf-status]')).toContainText(
        portalText(locale, 'Preview'),
      );
      await expect(row.locator('a[href$="/pdf"]')).toHaveCount(0);
      if (phone) {
        await expect(visibleRow.locator('[data-label="PDF"]')).toContainText(
          portalText(locale, 'Preview'),
        );
        await visibleRow
          .getByRole('link', { name: portalText(locale, 'Manage'), exact: true })
          .click();
      } else
        await row.getByRole('button', { name: portalText(locale, 'Manage'), exact: true }).click();
      const toolbar = page.locator('.billing-section__invoice-toolbar');
      await expect(toolbar.locator('[data-invoice-pdf-status]')).toHaveAttribute(
        'data-invoice-pdf-status',
        'preview',
      );
      await expect(toolbar.locator('[data-invoice-preview-help]')).toHaveText(
        portalText(locale, previewHelp),
      );
      await toolbar.getByRole('link', { name: portalText(locale, 'Preview'), exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/billing/invoices/${draftId}$`, 'u'));
      await page.goto(`/j-aautomation/app/billing/invoices/${draftId}?lang=${locale}`);
      await page.waitForLoadState('networkidle');
      const edit = page.locator('form[action="?/updateInvoiceDraftDetails"]');
      await expect(edit).toHaveCount(role === 'auditor' ? 0 : 1);
      if (role !== 'auditor') {
        await page.locator('.draft-edit-summary').click();
        await expect(
          edit.getByRole('button', { name: portalText(locale, 'Save Details'), exact: true }),
        ).toBeEnabled();
        await page.locator('.draft-edit-summary').click();
      }
      const preview = page.locator('a[href*="/draft-preview?"]');
      await expect(preview).toBeVisible();
      const href = new URL((await preview.getAttribute('href'))!, page.url());
      expect(href.searchParams.get('lang')).toBe(locale);
      const downloadPromise = page.waitForEvent('download');
      await preview.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`draft-preview-${draftId}-${locale}.pdf`);
      const path = await download.path();
      expect((await readFile(path!)).subarray(0, 5).toString()).toBe('%PDF-');

      // Advance the browser timer deterministically; a draft preview has no artifact job to poll.
      await page.clock.install();
      let refreshes = 0;
      page.on('request', (request) => {
        if (request.url().includes('/__data.json')) refreshes += 1;
      });
      await page.reload();
      await page.waitForLoadState('networkidle');
      const initialRefreshes = refreshes;
      await page.clock.runFor(5200);
      expect(refreshes).toBe(initialRefreshes);
      if (role === 'auditor' && locale === 'en')
        await page.screenshot({ path: testInfo.outputPath('auditor-draft-readonly.png') });

      await page.goto(`/j-aautomation/app/billing/invoices/${issuedId}?lang=${locale}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-invoice-pdf-status="ready"]')).toBeVisible();
      await expect(page.locator('#invoice-issued-pdf-download')).toBeVisible();
      await expect(page.locator('form[action="?/updateInvoiceDraftDetails"]')).toHaveCount(0);
      expect(posts).toEqual([]);
      expect(errors).toEqual([]);
      await context.close();
    }
  });

  test(`grouping choices preserve saved metadata and template controls in ${locale}`, async ({
    browser,
  }, testInfo) => {
    for (const role of ['owner', 'finance'] as const) {
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        storageState: sessions[role],
        viewport: testInfo.project.use.viewport,
      });
      const page = await context.newPage();
      const posts: string[] = [];
      const errors: string[] = [];
      context.on('request', (request) => {
        if (request.method() === 'POST') posts.push(request.url());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      for (const [ruleId, scopeId, template, grouping] of [
        [expenseRuleId, projectId, 'expenses-detailed', 'Summary'],
        [laborRuleId, laborProjectId, 'labor-detailed', 'By worker'],
      ]) {
        await page.goto(
          `/j-aautomation/app/billing?view=streams&project=${scopeId}&focus=${ruleId}&lang=${locale}#billing-stream-${ruleId}`,
        );
        await page.waitForLoadState('networkidle');
        const editor = page.locator(`#billing-stream-${ruleId}`);
        const form = editor.locator('form[action="?/updateBillingRule"]');
        await expect(form).toBeVisible();
        await expect(form.locator('[name="groupingMode"]')).toHaveCount(0);
        expect(
          await form.evaluate((element) =>
            new FormData(element as HTMLFormElement).has('groupingMode'),
          ),
        ).toBe(false);
        await expect(form.locator('[data-billing-saved-grouping]')).toContainText(
          portalText(locale, grouping!),
        );
        await expect(form.locator('[data-billing-grouping-help]')).toHaveText(
          portalText(locale, groupingHelp),
        );
        await expect(form.locator('select[name="templateId"]')).toHaveValue(template!);
        await editor.locator(':scope > summary').click();
        await expect(form).not.toBeVisible();
        await page.reload();
        await expect(form.locator('select[name="templateId"]')).toHaveValue(template!);
        await expect(form.locator('[data-billing-saved-grouping]')).toContainText(
          portalText(locale, grouping!),
        );
      }
      await page.goto(`/j-aautomation/app/billing?view=setup&setup=stream&lang=${locale}`);
      const create = page.locator('form[action="?/createBillingRule"]');
      await expect(create).toBeVisible();
      for (const stream of ['labor', 'expense', 'milestone', 'other']) {
        await create.locator('[name="streamType"]').selectOption(stream);
        await expect(create.locator('[name="groupingMode"]')).toHaveCount(0);
        expect(
          await create.evaluate((element) =>
            new FormData(element as HTMLFormElement).has('groupingMode'),
          ),
        ).toBe(false);
        await expect(create.locator('[data-billing-grouping-help]')).toHaveText(
          portalText(locale, groupingHelp),
        );
        await expect(create.locator('[name="templateId"]')).toBeEnabled();
      }
      if (role === 'finance' && locale === 'en')
        await page.screenshot({ path: testInfo.outputPath('billing-grouping-help.png') });
      expect(posts).toEqual([]);
      expect(errors).toEqual([]);
      await context.close();
    }
  });
  test(`simulated rejected customization retains values and focuses localized guidance in ${locale}`, async ({
    browser,
  }, testInfo) => {
    for (const role of ['owner', 'finance'] as const) {
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        storageState: sessions[role],
        viewport: testInfo.project.use.viewport,
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const path = `/j-aautomation/app/billing/invoices/${draftId}?lang=${locale}`;
      for (const scenario of [
        {
          status: 400,
          code: 'BILLING_DISCOUNT_INVALID',
          key: 'problem.billing.discountInvalid',
          locked: false,
        },
        {
          status: 403,
          code: 'ACTION_ERROR_FORBIDDEN',
          key: 'action.error.forbidden',
          locked: true,
        },
        {
          status: 409,
          code: 'BILLING_INVOICE_HISTORICAL_ISSUE_MARKERS',
          key: 'problem.billing.historicalIssueMarkers',
          locked: true,
        },
      ]) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const paperBefore = await page.locator('.invoice-paper').innerText();
        await page.locator('.draft-edit-summary').click();
        const form = page.locator('form[action="?/updateInvoiceDraftDetails"]');
        const values = {
          invoiceId: draftId!,
          purchaseNo: `QA simulated ${scenario.status} ${locale}; never forwarded${scenario.status === 409 ? ' QA' + 'X'.repeat(1200) : ''}`,
          discount: scenario.status === 400 ? 'invalid-QA-only' : '0.00',
          bankSwiftNumber: '',
          bankAccountNumber: '',
          bankName: 'QA unsaved bank',
          beneficiary: 'QA unsaved beneficiary',
          pastDueNotice: 'QA unsaved instructions',
        };
        for (const [name, value] of Object.entries(values))
          if (name !== 'invoiceId') await form.locator(`[name="${name}"]`).fill(value);
        let intercepted = 0;
        await page.route(
          (url) =>
            url.pathname.endsWith(`/billing/invoices/${draftId}`) &&
            url.search === '?/updateInvoiceDraftDetails',
          async (route) => {
            expect(route.request().method()).toBe('POST');
            intercepted += 1;
            // Only the action failure is simulated. No business DTO or command reaches the server.
            await route.fulfill({
              status: scenario.status,
              contentType: 'application/json',
              body: JSON.stringify({
                type: 'failure',
                status: scenario.status,
                data: stringify({
                  success: false,
                  code: scenario.code,
                  messageKey: scenario.key,
                  params: {},
                  fieldErrors: scenario.status === 400 ? { discount: ['Invalid amount'] } : {},
                  remedies: [{ id: 'review_invoice' }],
                  correlationId: 'qa-simulated-customization-failure',
                  billingOperation: 'updateInvoiceDraftDetails',
                  values,
                }),
              }),
            });
          },
        );
        await form
          .getByRole('button', { name: portalText(locale, 'Save Details'), exact: true })
          .click();
        const notice = page.locator(`[data-problem-code="${scenario.code}"]`);
        await expect(notice).toBeVisible();
        await expect(notice.locator('p').first()).toHaveText(portalText(locale, scenario.key));
        await expect(notice).toBeFocused();
        const noticeBox = await notice.boundingBox();
        const bannerBox = await page.getByRole('banner').boundingBox();
        expect(noticeBox!.y).toBeGreaterThanOrEqual((bannerBox?.y ?? 0) + (bannerBox?.height ?? 0));
        await expect(notice).toHaveAttribute('role', 'alert');
        expect(intercepted).toBe(1);
        if (scenario.locked) {
          await expect(form).toHaveCount(0);
          await expect(page.locator('[data-invoice-retained-field="purchaseNo"] dd')).toHaveText(
            values.purchaseNo,
          );
          expect(
            await page
              .locator('[data-invoice-retained-field="purchaseNo"] dd')
              .evaluate((element) => element.scrollWidth <= element.clientWidth),
          ).toBe(true);
          await expect(page.locator('[data-invoice-retained-field="discount"] dd')).toHaveText(
            '0.00',
          );
          await expect(
            page.locator('[data-invoice-retained-field="bankSwiftNumber"] dd'),
          ).toHaveText('—');
          await expect(page.locator('[data-invoice-retained-customizations]')).toContainText(
            portalText(locale, 'Copy these values before reviewing the current invoice.'),
          );
        } else {
          for (const [name, value] of Object.entries(values))
            await expect(form.locator(`[name="${name}"]`)).toHaveValue(value);
          await expect(form.locator('[name="discount"]')).toHaveAttribute('aria-invalid', 'true');
          await expect(form.locator('[data-field-error-for="edit-discount"]')).toBeVisible();
        }
        await page.emulateMedia({ media: 'print' });
        await expect(notice).not.toBeVisible();
        if (scenario.locked)
          await expect(page.locator('[data-invoice-retained-customizations]')).not.toBeVisible();
        await page.emulateMedia({ media: 'screen' });
        if (role === 'finance' && locale === 'en' && scenario.status === 409)
          await page.screenshot({
            path: testInfo.outputPath('simulated-historical-customization-recovery.png'),
          });
        await page.unrouteAll();
        await notice
          .getByRole('link', { name: portalText(locale, 'Review invoice'), exact: true })
          .click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('[data-invoice-details-problem]')).toHaveCount(0);
        await expect(page.locator('.invoice-paper')).toHaveText(paperBefore, {
          useInnerText: true,
        });
        await expect(page.locator('form[action="?/updateInvoiceDraftDetails"]')).toHaveCount(1);
      }
      expect(errors).toEqual([]);
      await context.close();
    }
  });
}
