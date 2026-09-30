import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const profileId = process.env.JA_PROD_QA_TAX_PROFILE_ID;
const profileName = process.env.JA_PROD_QA_TAX_PROFILE_NAME;
const sessions = {
  owner: process.env.JA_PROD_QA_OWNER_STATE,
  finance: process.env.JA_PROD_QA_FINANCE_STATE,
  auditor: process.env.JA_PROD_QA_AUDITOR_STATE,
};
const appRequire = createRequire(new URL('../../apps/portal/package.json', import.meta.url));
const kitRequire = createRequire(appRequire.resolve('@sveltejs/kit/package.json'));
const { stringify } = kitRequire('devalue') as { stringify: (value: unknown) => string };

async function clearViewport(target: Locator, page: Page, height: number) {
  await target.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  const headerBottom = await page
    .locator('.portal-layout > header')
    .evaluate((element) => element.getBoundingClientRect().bottom);
  await expect
    .poll(async () => (await target.boundingBox())!.y)
    .toBeGreaterThanOrEqual(headerBottom + 8);
  const bounds = await target.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height - 80);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}

test.setTimeout(60000);

test.beforeAll(() => {
  if (!profileId || !/^[0-9a-f-]{36}$/iu.test(profileId) || !profileName)
    throw new Error('An existing isolated unreferenced tax profile is required');
  if (Object.values(sessions).some((state) => !state))
    throw new Error('Existing Owner, Finance and Auditor sessions are required');
});

for (const locale of ['en', 'es', 'pt'] as const) {
  test(`tax metadata and supported controls preserve roles in ${locale}`, async ({
    browser,
  }, info) => {
    for (const [role, state] of Object.entries(sessions)) {
      const context = await browser.newContext({
        baseURL: info.project.use.baseURL,
        storageState: state,
        viewport: info.project.use.viewport,
      });
      try {
        const page = await context.newPage();
        const posts: string[] = [],
          errors: string[] = [];
        page.on('request', (request) => {
          if (request.method() === 'POST') posts.push(request.url());
        });
        page.on('pageerror', (error) => errors.push(error.message));
        const response = await page.goto(
          `/j-aautomation/app/billing?view=${role === 'auditor' ? 'invoices' : 'setup&setup=tax'}&lang=${locale}`,
        );
        await page.waitForLoadState('networkidle');
        expect(response!.status()).toBe(200);
        const directory = page.locator('[data-tax-profile-directory]');
        if (role === 'auditor') {
          await expect(directory).toHaveCount(0);
          await expect(
            page.getByRole('tab', { name: portalText(locale, 'Configure billing'), exact: true }),
          ).toHaveCount(0);
          await expect(page.locator('form[action$="TaxProfile"]')).toHaveCount(0);
          expect(await response!.text()).not.toContain('components_json');
        } else {
          await directory.locator(':scope > summary').click();
          const profile = page.locator(`[data-tax-profile="${profileId}"]`);
          await expect(profile).toBeVisible();
          await expect(profile.locator('.ui-card-heading')).toHaveText(profileName!);
          await expect(profile).toContainText('TEST-JUNKERS-USD');
          await expect(profile).toContainText('USD');
          await expect(profile).toContainText('2026-10-01');
          await expect(profile.locator('[data-tax-components]')).toContainText('1.25%');
          await expect(profile.locator('[data-tax-components]')).toContainText(
            portalText(locale, 'Non-compound tax'),
          );
          await expect(profile.locator('dt').first()).toHaveText(
            portalText(locale, 'Invoice issuer (J&A Automation)'),
          );
          await clearViewport(
            profile.locator('.record-facts'),
            page,
            info.project.use.viewport!.height,
          );
          await page.screenshot({ path: info.outputPath(`tax-${role}-${locale}.png`) });
          await profile.locator('details > summary').click();
          const rename = profile.locator('form[action="?/updateTaxProfile"]');
          const archive = profile.locator('form[action="?/archiveTaxProfile"]');
          await expect(rename).toBeVisible();
          await expect(archive).toBeVisible();
          await clearViewport(
            rename.locator('button[type="submit"]'),
            page,
            info.project.use.viewport!.height,
          );
          await page.screenshot({ path: info.outputPath(`tax-rename-${role}-${locale}.png`) });
          await expect(rename.locator('[name="name"]')).toHaveValue(profileName!);
          await expect(
            profile.locator(
              'input[name="currency"], input[name="effectiveFrom"], input[name="componentBasisPoints"]',
            ),
          ).toHaveCount(0);
          await rename.locator('button[type="submit"]').click();
          await expect(rename.locator('[type="checkbox"]')).toBeFocused();
          await rename.locator('[type="checkbox"]').check();
          const fields = await rename.evaluate((form: HTMLFormElement) =>
            Object.fromEntries(new FormData(form)),
          );
          expect(fields.taxProfileId).toBe(profileId);
          expect(fields.name).toBe(profileName);
          expect(fields).not.toHaveProperty('reason');
          await archive.locator('button[type="submit"]').click();
          await expect(archive.locator('[type="checkbox"]')).toBeFocused();
          await clearViewport(
            archive.locator('button[type="submit"]'),
            page,
            info.project.use.viewport!.height,
          );
          await page.screenshot({ path: info.outputPath(`tax-archive-${role}-${locale}.png`) });
          await expect(archive).toContainText(
            portalText(
              locale,
              'Streams using an archived profile cannot create new invoice drafts until a replacement profile is explicitly selected. An approved invoice using this profile must be issued or recalculated before archiving. Issued invoices stay unchanged.',
            ),
          );
          const create = page.locator('form[action="?/createTaxProfile"]');
          await create.locator('[name="componentPercent"]').fill('1.25');
          await expect(create.locator('[name="componentBasisPoints"]')).toHaveValue('125');
          await expect(create.locator('[name="legalEntityId"]')).toHaveAccessibleName(
            portalText(locale, 'Invoice issuer (J&A Automation)'),
          );
        }
        expect(posts).toEqual([]);
        expect(errors).toEqual([]);
        await info.attach(`read-only-${role}`, {
          body: JSON.stringify({ role, locale, posts, errors }),
          contentType: 'application/json',
        });
      } finally {
        await context.close();
      }
    }
  });

  test(`simulated tax failures retain names and focus without forwarding writes in ${locale}`, async ({
    browser,
  }, info) => {
    for (const scenario of ['unavailable', 'approved-invoice', 'forbidden'] as const) {
      const context = await browser.newContext({
        baseURL: info.project.use.baseURL,
        storageState: sessions.finance,
        viewport: info.project.use.viewport,
      });
      try {
        const page = await context.newPage();
        const errors: string[] = [],
          reads: string[] = [];
        let intercepted = 0,
          forwardedPosts = 0;
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => {
          if (request.url().includes('__data.json')) reads.push(request.url());
        });
        await page.goto(`/j-aautomation/app/billing?view=setup&setup=tax&lang=${locale}`);
        await page.waitForLoadState('networkidle');
        await page.locator('[data-tax-profile-directory] > summary').click();
        const profile = page.locator(`[data-tax-profile="${profileId}"]`);
        await profile.locator('details > summary').click();
        const operation =
          scenario === 'approved-invoice' ? 'archiveTaxProfile' : 'updateTaxProfile';
        const code =
          scenario === 'unavailable'
            ? 'BILLING_TAX_PROFILE_UNAVAILABLE'
            : scenario === 'approved-invoice'
              ? 'BILLING_TAX_PROFILE_APPROVED_INVOICE_BLOCKS_ARCHIVE'
              : 'BILLING_FINANCE_REQUIRED';
        const key =
          scenario === 'unavailable'
            ? 'problem.billing.taxProfileUnavailable'
            : scenario === 'approved-invoice'
              ? 'problem.billing.taxProfileApprovedInvoiceBlocksArchive'
              : 'problem.billing.financeRequired';
        const enteredName = 'QA-only-unsaved-'.padEnd(160, 'X');
        const form = profile.locator(`form[action="?/${operation}"]`);
        if (operation === 'updateTaxProfile') await form.locator('[name="name"]').fill(enteredName);
        await form.locator('[type="checkbox"]').check();
        const initialReads = reads.length;
        await page.route('**/*', async (route) => {
          if (route.request().method() !== 'POST') {
            await route.continue();
            return;
          }
          if (!route.request().url().includes(`/${operation}`)) {
            forwardedPosts++;
            await route.abort();
            return;
          }
          intercepted++;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              type: 'failure',
              status: scenario === 'forbidden' ? 403 : 409,
              data: stringify({
                success: false,
                code,
                messageKey: key,
                message: translate(locale, key),
                billingOperation: operation,
                values: {
                  taxProfileId: profileId,
                  ...(operation === 'updateTaxProfile' ? { name: enteredName } : {}),
                },
                params: {},
                fieldErrors: {},
                remedies: [
                  {
                    id: scenario === 'approved-invoice' ? 'review_invoice' : 'review_billing_setup',
                  },
                ],
                correlationId: `simulated-tax-${scenario}-${locale}`,
              }),
            }),
          });
        });
        await form.locator('button[type="submit"]').click();
        const notice = page.locator(`[data-tax-profile-directory] [data-problem-code="${code}"]`);
        await expect(notice).toBeFocused();
        await expect(notice).toContainText(translate(locale, key));
        if (scenario === 'unavailable') {
          await expect.poll(() => reads.length - initialReads).toBe(1);
          await expect(page.locator('[data-tax-recovery]')).toContainText(
            portalText(
              locale,
              'Current profile information has been refreshed. The submitted change was not retried. Copy any entered name before leaving this view.',
            ),
          );
        }
        if (scenario !== 'approved-invoice') {
          await expect(profile.locator('form')).toHaveCount(0);
          await expect(page.locator('[data-tax-retained-name]')).toContainText(enteredName);
          const retained = page.locator('[data-tax-retained-name] dd');
          expect(await retained.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe(
            'normal',
          );
        } else await expect(form.locator('[type="checkbox"]')).toBeChecked();
        await expect(notice).toBeFocused();
        await expect.poll(async () => (await notice.boundingBox())!.y).toBeGreaterThanOrEqual(72);
        const box = await notice.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
        await page.screenshot({ path: info.outputPath(`simulated-tax-${scenario}-${locale}.png`) });
        expect(intercepted).toBe(1);
        expect(forwardedPosts).toBe(0);
        expect(errors).toEqual([]);
        await page.unrouteAll({ behavior: 'wait' });
        await page.goto(`/j-aautomation/app/billing?view=setup&setup=tax&lang=${locale}`);
        await page.waitForLoadState('networkidle');
        await page.locator('[data-tax-profile-directory] > summary').click();
        await expect(profile.locator('.ui-card-heading')).toHaveText(profileName!);
        await expect(profile.locator('[data-tax-components]')).toContainText('1.25%');
        await info.attach(`simulated-${scenario}`, {
          body: JSON.stringify({ scenario, intercepted, forwardedPosts, reads, errors }),
          contentType: 'application/json',
        });
      } finally {
        await context.close();
      }
    }
  });
}
