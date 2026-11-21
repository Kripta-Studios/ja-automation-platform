import { expect, test } from '@playwright/test';
import { portal } from './auth.js';

test('two-factor sign-in returns to the selected workspace and filters', async ({ page }) => {
  const destination = new URL(portal('/expenses?status=draft&lang=es'));
  const login = new URL(portal('/login?lang=en'));
  login.searchParams.set('returnTo', destination.pathname + destination.search);
  // Isolate browser navigation from the credential and OTP providers.
  await page.route('**/api/auth/sign-in/email', (route) =>
    route.fulfill({ json: { twoFactorRedirect: true } }),
  );
  await page.route('**/api/auth/two-factor/verify-totp', (route) => route.fulfill({ json: {} }));
  await page.route(destination.href, (route) =>
    route.fulfill({ contentType: 'text/html', body: 'OK' }),
  );
  await page.goto(login.href);
  await page.locator('input[name=email]').fill('worker@example.test');
  await page.locator('input[name=password]').fill('synthetic-browser-input');
  await page.locator('.login-submit').click();
  await expect(page.locator('input[name=code]')).toBeVisible();
  await page.locator('input[name=code]').fill('123456');
  await page.locator('.login-submit').click();
  await expect(page).toHaveURL(destination.href);
});

test.describe('before the verification page hydrates', () => {
  test.use({ javaScriptEnabled: false });
  test('the code form cannot submit a verification code in the URL', async ({ page }) => {
    await page.goto(portal('/login/two-factor'));
    await expect(page.locator('form.login-card')).toHaveAttribute('method', /post/i);
    await expect(page.locator('.login-submit')).toBeDisabled();
  });
});

test('both sign-in steps use the retry interval returned by the authentication provider', async ({
  page,
}) => {
  await page.route('**/api/auth/**', (route) =>
    route.fulfill({ status: 429, headers: { 'X-Retry-After': '60' }, json: {} }),
  );
  await page.goto(portal('/login?lang=en'));
  await page.locator('input[name=email]').fill('worker@example.test');
  await page.locator('input[name=password]').fill('synthetic-browser-input');
  await page.locator('.login-submit').click();
  await expect(page.locator('.login-submit')).toBeDisabled();
  await expect(page.locator('.login-status')).toContainText(/Try again in \d+:\d+/);
  await page.goto(portal('/login/two-factor?lang=en'));
  await page.locator('input[name=code]').fill('123456');
  await page.locator('.login-submit').click();
  await expect(page.locator('.login-submit')).toBeDisabled();
  await expect(page.getByText(/Try again in \d+ seconds/)).toBeVisible();
});
