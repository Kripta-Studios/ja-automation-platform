import { expect, test, type Page } from '@playwright/test';
import { createDatabase } from '@ja/database';
import { portal } from './auth.js';
import { e2eDatabasePath } from './environment.js';

const endpoint = '**/app/api/auth/sign-in/email';
const copy = {
  en: /^Too many sign-in attempts\. Try again in 1:0[01]\.$/,
  es: /^Demasiados intentos de inicio de sesión\. Vuelve a intentarlo en 1:0[01]\.$/,
  pt: /^Muitas tentativas de acesso\. Tente novamente em 1:0[01]\.$/,
} as const;

// These cases use intercepted responses and synthetic entries. They never
// send credentials to an authentication service or create a real session.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('login never puts credentials in the URL before hydration', async ({ browser }, info) => {
  test.skip(info.project.name !== 'phone-390');
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(portal('/login?lang=en'));
    const form = page.locator('form.login-card');
    await expect(form).toHaveAttribute('method', /post/i);
    await expect(form).toHaveAttribute('data-hydrated', 'false');
    await expect(form.locator('button.login-submit')).toBeDisabled();
    await page.locator('input[name=email]').fill('qa@example.test');
    await page.locator('input[name=password]').fill('synthetic-password');
    await page.route('**/app/login*', (route) => route.fulfill({ status: 200, body: 'Handled' }));
    const request = page.waitForRequest((item) => item.url().includes('/app/login'));
    await form.evaluate((element: HTMLFormElement) => element.submit());
    const submitted = await request;
    expect(submitted.method()).toBe('POST');
    expect(new URL(submitted.url()).searchParams.has('email')).toBe(false);
    expect(new URL(submitted.url()).searchParams.has('password')).toBe(false);
  } finally {
    await context.close();
  }
});

async function submitRateLimitedLogin(page: Page, locale: string, retryAfter?: string) {
  let posts = 0;
  await page.route(endpoint, async (route) => {
    posts += 1;
    await route.fulfill({
      status: 429,
      headers: {
        'content-type': 'application/json',
        ...(retryAfter === undefined ? {} : { 'retry-after': retryAfter }),
      },
      body: JSON.stringify({ error: 'rate_limited' }),
    });
  });
  await page.goto(portal(`/login?lang=${locale}`));
  await page.locator('input[name=email]').fill('qa@example.test');
  await page.locator('input[name=password]').fill('synthetic-password');
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/app/api/auth/sign-in/email') && response.status() === 429,
  );
  await page.locator('form.login-card button.login-submit').click();
  const response = await responsePromise;
  expect(response.status()).toBe(429);
  expect(posts).toBe(1);
  await expect(page.locator('input[name=email]')).toHaveValue('qa@example.test');
  await expect(page.locator('input[name=password]')).toHaveValue('synthetic-password');
  await expect(page.locator('.login-status')).toBeFocused();
  const noticeBox = await page.locator('.login-status').boundingBox();
  expect(noticeBox).not.toBeNull();
  expect(noticeBox!.y).toBeGreaterThanOrEqual(0);
  expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  return page.locator('.login-status');
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  for (const locale of ['en', 'es', 'pt'] as const) {
    test(`${locale} sign-in rate limit uses server wait at ${viewport}`, async ({ page }, info) => {
      test.skip(info.project.name !== viewport);
      const status = await submitRateLimitedLogin(page, locale, '61');
      await expect(status).toBeVisible();
      await expect(status).toHaveText(copy[locale]);
      await expect(page.locator('button.login-submit')).toBeDisabled();
    });
  }
}

for (const [caseName, header] of [
  ['missing', undefined],
  ['expired', '0'],
  ['invalid', 'not-a-time'],
  ['implausibly long', '86401'],
] as const) {
  test(`${caseName} Retry-After uses safe guidance`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone-390');
    const status = await submitRateLimitedLogin(page, 'en', header);
    await expect(status).toHaveText(
      'Too many sign-in attempts. Wait a few minutes before trying again.',
    );
  });
}

test('HTTP-date Retry-After supplies a countdown from the server date', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-390');
  const retryAt = new Date(Date.now() + 70_000).toUTCString();
  const status = await submitRateLimitedLogin(page, 'en', retryAt);
  const countdown = /in (\d+):(\d{2})\.$/.exec((await status.textContent()) ?? '');
  expect(countdown).not.toBeNull();
  const seconds = Number(countdown![1]) * 60 + Number(countdown![2]);
  expect(seconds).toBeGreaterThan(45);
  expect(seconds).toBeLessThanOrEqual(70);
});

test('known retry deadline counts down and does not submit again until manually requested', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone-390');
  let posts = 0;
  await page.route(endpoint, async (route) => {
    posts += 1;
    await route.fulfill({
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '3' },
      body: JSON.stringify({ error: 'rate_limited' }),
    });
  });
  await page.goto(portal('/login?lang=en'));
  await page.locator('input[name=email]').fill('qa@example.test');
  await page.locator('input[name=password]').fill('synthetic-password');
  await page.locator('button.login-submit').click();
  await expect(page.locator('.login-status')).toHaveText(
    'Too many sign-in attempts. Try again in 0:03.',
  );
  await expect(page.locator('button.login-submit')).toBeDisabled();
  await page.evaluate(() =>
    (document.querySelector('button.login-submit') as HTMLButtonElement).click(),
  );
  expect(posts).toBe(1);
  await expect(page.locator('.login-status')).toHaveText(
    'Too many sign-in attempts. Try again in 0:02.',
  );
  await expect(page.locator('button.login-submit')).toBeEnabled({ timeout: 5_000 });
  expect(posts).toBe(1);
  await expect(page.locator('input[name=email]')).toHaveValue('qa@example.test');
  await expect(page.locator('input[name=password]')).toHaveValue('synthetic-password');
  await page.locator('button.login-submit').click();
  await expect.poll(() => posts).toBe(2);
});

const realCopy = {
  en: /^Too many sign-in attempts\. Try again in \d{1,2}:\d{2}\.$/,
  es: /^Demasiados intentos de inicio de sesión\. Vuelve a intentarlo en \d{1,2}:\d{2}\.$/,
  pt: /^Muitas tentativas de acesso\. Tente novamente em \d{1,2}:\d{2}\.$/,
} as const;

for (const viewport of ['phone-390', 'desktop'] as const) {
  for (const locale of ['en', 'es', 'pt'] as const) {
    test(`${locale} real auth hook returns retry window at ${viewport}`, async ({ page }, info) => {
      test.skip(process.env.JA_LOGIN_RATE_LIMIT_FIXTURE !== 'true');
      test.skip(info.project.name !== viewport);
      // The dedicated config owns this disposable database and runs with one worker.
      const { sqlite } = createDatabase(e2eDatabasePath);
      try {
        sqlite.exec('DELETE FROM rate_limit_bucket');
      } finally {
        sqlite.close();
      }

      let posts = 0;
      const pageErrors: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().includes('/app/api/auth/sign-in/email'))
          posts += 1;
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(portal(`/login?lang=${locale}`));
      await page.locator('input[name=email]').fill('qa-login-rate-limit@example.test');
      await page.locator('input[name=password]').fill('synthetic-invalid-password');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const responsePromise = page.waitForResponse((response) =>
          response.url().includes('/app/api/auth/sign-in/email'),
        );
        await page.locator('button.login-submit').click();
        const response = await responsePromise;
        expect(response.status()).toBe(attempt === 2 ? 429 : 401);
        if (attempt === 2) {
          const seconds = Number(response.headers()['retry-after']);
          expect(seconds).toBeGreaterThan(0);
          expect(seconds).toBeLessThanOrEqual(900);
          expect(await response.json()).toEqual({
            error: 'Too many authentication attempts',
            code: 'AUTH_SIGN_IN_RATE_LIMITED',
            messageKey: 'problem.auth.signInRateLimited',
            params: { retryAfterSeconds: seconds },
            fieldErrors: {},
            remedies: [{ id: 'wait_and_retry' }],
            correlationId: response.headers()['x-correlation-id'],
          });
        }
      }
      const status = page.locator('.login-status');
      await expect(status).toHaveText(realCopy[locale]);
      await expect(status).toBeFocused();
      await expect(page.locator('button.login-submit')).toBeDisabled();
      await expect(page.locator('input[name=email]')).toHaveValue(
        'qa-login-rate-limit@example.test',
      );
      await expect(page.locator('input[name=password]')).toHaveValue('synthetic-invalid-password');
      const noticeBox = await status.boundingBox();
      expect(noticeBox).not.toBeNull();
      expect(noticeBox!.y).toBeGreaterThanOrEqual(0);
      expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
      await page.evaluate(() =>
        (document.querySelector('button.login-submit') as HTMLButtonElement).click(),
      );
      await page.waitForTimeout(150);
      expect(posts).toBe(3);
      expect(pageErrors).toEqual([]);
    });
  }
}
