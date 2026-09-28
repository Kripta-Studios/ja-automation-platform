import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('finance users see owner-only issuer controls as unavailable', async ({ page }) => {
  await signIn(page, 'finance');
  await page.goto(portal('/billing?view=setup&lang=en'));
  await page.getByRole('tab', { name: 'Configure billing' }).click();

  const setup = page.locator('.billing-section__config-body');
  await expect(setup.getByRole('button', { name: 'New legal entity' })).toBeDisabled();
  await expect(setup.getByRole('button', { name: 'Invoice numbering policy' })).toBeDisabled();
  await expect(setup).toContainText(
    'Legal entities and invoice numbering policies require owner access.',
  );
  await expect(setup.locator('form[action="?/createLegalEntity"]')).toHaveCount(0);
  await expect(setup.locator('form[action="?/createInvoiceNumberPolicy"]')).toHaveCount(0);

  await setup.getByRole('button', { name: 'New tax profile' }).click();
  await expect(setup.locator('form[action="?/createTaxProfile"]')).toBeVisible();
});
