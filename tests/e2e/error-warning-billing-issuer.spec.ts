import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { readE2EFixturePointer } from './environment.js';

for (const viewport of ['phone-390', 'tablet-768', 'desktop'] as const) {
  test(`Owner issuer validation explains an overlong identifier at ${viewport}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== viewport);
    test.setTimeout(120_000);

    const code = `QA-ISS-${viewport}-${randomUUID().slice(0, 8)}`.toUpperCase();
    const initialIdentifier = 'QA-ORIGINAL-ID';
    const overlongIdentifier = 'X'.repeat(1001);
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
        consoleErrors.push(message.text());
    });

    await signIn(page, 'owner');
    await page.goto(portal('/billing?lang=en'));
    await page.getByRole('tab', { name: 'Configure billing' }).click();
    await page.getByRole('button', { name: 'New invoice issuer' }).click();
    const createForm = page.locator('form[action="?/createLegalEntity"]');
    await createForm.locator('[name="code"]').fill(code);
    await createForm.locator('[name="legalName"]').fill(`${code} Test Issuer`);
    await createForm.locator('[name="currency"]').selectOption('USD');
    await createForm.locator('[name="billingAddress"]').fill('QA-only billing address');
    await createForm.locator('[name="companyIdentifiers"]').fill(initialIdentifier);
    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('?/createLegalEntity'),
    );
    await createForm.getByRole('button', { name: 'Save legal entity' }).click();
    expect((await createResponse).status()).toBe(200);

    const db = new DatabaseSync(readE2EFixturePointer().databasePath);
    try {
      await expect
        .poll(() =>
          db.prepare('SELECT company_identifiers FROM legal_entity WHERE code=?').get(code),
        )
        .toMatchObject({ company_identifiers: initialIdentifier });

      await page.goto(portal('/billing?lang=en'));
      await page.getByRole('tab', { name: 'Configure billing' }).click();
      await page.getByText('Invoice issuers (J&A Automation)').click();
      let row = page.locator('tr').filter({ hasText: code });
      await expect(row).toBeVisible();
      await row.getByText('Edit issuer').click();
      let form = row.locator('form[action="?/updateLegalEntity"]');
      await expect(form).toBeVisible();
      const legalName = await form.locator('[name="legalName"]').inputValue();
      const address = await form.locator('[name="billingAddress"]').inputValue();
      await form.locator('[name="companyIdentifiers"]').fill(overlongIdentifier);
      const beforeScroll = await page.evaluate(() => window.scrollY);

      const updateResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('?/updateLegalEntity'),
      );
      await form.getByRole('button', { name: 'Save issuer' }).click();
      const response = await updateResponse;
      expect(response.status()).toBe(400);
      expect(await response.text()).toContain('BILLING_ISSUER_IDENTIFIER_TOO_LONG');

      row = page.locator('tr').filter({ hasText: code });
      form = row.locator('form[action="?/updateLegalEntity"]');
      const notice = row.locator('[data-problem-code="BILLING_ISSUER_IDENTIFIER_TOO_LONG"]');
      const identifier = form.locator('[name="companyIdentifiers"]');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('1,000 characters or fewer');
      await expect(notice).toContainText('Shorten it before saving the issuer');
      await expect(notice).toContainText('Correct the highlighted field');
      const noticeBounds = await notice.boundingBox();
      expect(noticeBounds).not.toBeNull();
      expect(noticeBounds!.width).toBeGreaterThanOrEqual(240);
      expect(noticeBounds!.x).toBeGreaterThanOrEqual(0);
      expect(noticeBounds!.x + noticeBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await expect(identifier).toHaveAttribute('aria-invalid', 'true');
      await expect(identifier).toHaveValue(overlongIdentifier);
      await expect(identifier).toBeFocused();
      const focusedBounds = await identifier.boundingBox();
      expect(focusedBounds).not.toBeNull();
      expect(focusedBounds!.y).toBeGreaterThanOrEqual(64);
      expect(focusedBounds!.y + focusedBounds!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height - 64,
      );
      await expect(form.locator('[name="legalName"]')).toHaveValue(legalName);
      await expect(form.locator('[name="billingAddress"]')).toHaveValue(address);
      await expect(row.locator('details')).toHaveAttribute('open', '');
      await expect(page.getByRole('tab', { name: 'Configure billing' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.locator('[data-issue-blocker]')).toHaveCount(0);
      await notice.evaluate((element) =>
        element.scrollIntoView({ behavior: 'instant', block: 'center' }),
      );
      const noticeCoveredByToast = await page.evaluate(() => {
        const noticeElement = document.querySelector(
          '[data-problem-code="BILLING_ISSUER_IDENTIFIER_TOO_LONG"]',
        );
        if (!noticeElement) return true;
        const noticeRect = noticeElement.getBoundingClientRect();
        return [...document.querySelectorAll('[data-ui="toast"]')].some((toast) => {
          const toastRect = toast.getBoundingClientRect();
          return (
            noticeRect.left < toastRect.right &&
            noticeRect.right > toastRect.left &&
            noticeRect.top < toastRect.bottom &&
            noticeRect.bottom > toastRect.top
          );
        });
      });
      expect(noticeCoveredByToast).toBe(false);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      expect(beforeScroll).toBeGreaterThan(0);
      expect(
        db.prepare('SELECT company_identifiers FROM legal_entity WHERE code=?').get(code),
      ).toMatchObject({ company_identifiers: initialIdentifier });
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      db.close();
    }
  });
}
