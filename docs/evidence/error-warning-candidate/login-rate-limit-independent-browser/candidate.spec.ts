import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase } from '@ja/database';
import { expect, test } from '@playwright/test';
import { portal } from '../../../../tests/e2e/auth.js';
import { e2eDatabasePath } from '../../../../tests/e2e/environment.js';

const root = import.meta.dirname;
const candidate = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: join(root, '../../../../'),
  encoding: 'utf8',
}).trim();
const noticePattern = {
  en: /^Too many sign-in attempts\. Try again in \d{1,2}:\d{2}\.$/u,
  es: /^Demasiados intentos de inicio de sesión\. Vuelve a intentarlo en \d{1,2}:\d{2}\.$/u,
  pt: /^Muitas tentativas de acesso\. Tente novamente em \d{1,2}:\d{2}\.$/u,
} as const;

for (const viewport of ['phone-390', 'desktop'] as const) {
  for (const locale of ['en', 'es', 'pt'] as const) {
    test(`${viewport} ${locale} typed auth rate limit`, async ({ page }, info) => {
      test.skip(info.project.name !== viewport);
      const database = createDatabase(e2eDatabasePath);
      try {
        database.sqlite.exec('DELETE FROM rate_limit_bucket');
      } finally {
        database.sqlite.close();
      }

      const statusCodes: number[] = [];
      const pageErrors: string[] = [];
      const unexpectedConsoleErrors: string[] = [];
      let posts = 0;
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().includes('/app/api/auth/sign-in/email'))
          posts += 1;
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
          unexpectedConsoleErrors.push(message.text());
      });

      await page.goto(portal(`/login?lang=${locale}`));
      await page.locator('input[name=email]').fill('qa-auth-429@example.test');
      await page.locator('input[name=password]').fill('synthetic-invalid-password');
      let body: Record<string, unknown> | undefined;
      let retryAfter = 0;
      let headerCorrelationMatchesBody = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const responsePromise = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url().includes('/app/api/auth/sign-in/email'),
        );
        await page.locator('button.login-submit').click();
        const response = await responsePromise;
        statusCodes.push(response.status());
        if (attempt === 2) {
          body = (await response.json()) as Record<string, unknown>;
          retryAfter = Number(response.headers()['retry-after']);
          headerCorrelationMatchesBody =
            typeof body.correlationId === 'string' &&
            body.correlationId.length > 0 &&
            body.correlationId === response.headers()['x-correlation-id'];
        }
      }

      const notice = page.locator('.login-status');
      await expect(notice).toBeVisible();
      await expect(notice).toHaveText(noticePattern[locale]);
      await expect(notice).toBeFocused();
      const noticeText = await notice.textContent();
      const noticeBox = await notice.boundingBox();
      const viewportSize = page.viewportSize();
      const valuesRetained =
        (await page.locator('input[name=email]').inputValue()) === 'qa-auth-429@example.test' &&
        (await page.locator('input[name=password]').inputValue()) === 'synthetic-invalid-password';
      const submitDisabled = await page.locator('button.login-submit').isDisabled();
      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
        documentLanguage: document.documentElement.lang,
      }));
      await notice.screenshot({ path: join(root, `${viewport}-${locale}-notice.png`) });
      await page.evaluate(() =>
        (document.querySelector('button.login-submit') as HTMLButtonElement).click(),
      );
      await page.waitForTimeout(150);
      const result = {
        candidate,
        locale,
        viewport: viewportSize,
        statusCodes,
        typed429: {
          error: body?.error,
          code: body?.code,
          messageKey: body?.messageKey,
          retryAfterSeconds: retryAfter,
          paramsMatchHeader:
            (body?.params as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ===
            retryAfter,
          fieldErrorsEmpty: JSON.stringify(body?.fieldErrors) === '{}',
          remedies: body?.remedies,
          headerCorrelationMatchesBody,
        },
        noticeText,
        noticeFocused: true,
        noticeBox,
        valuesRetained,
        submitDisabled,
        postsAfterForcedDisabledClick: posts,
        layout,
        pageErrorCount: pageErrors.length,
        unexpectedConsoleErrorCount: unexpectedConsoleErrors.length,
      };
      writeFileSync(
        join(root, `${viewport}-${locale}-results.json`),
        `${JSON.stringify(result, null, 2)}\n`,
      );

      expect(statusCodes).toEqual([401, 401, 429]);
      expect(body).toMatchObject({
        error: 'Too many authentication attempts',
        code: 'AUTH_SIGN_IN_RATE_LIMITED',
        messageKey: 'problem.auth.signInRateLimited',
        fieldErrors: {},
        remedies: [{ id: 'wait_and_retry' }],
      });
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(900);
      expect(result.typed429.paramsMatchHeader).toBe(true);
      expect(headerCorrelationMatchesBody).toBe(true);
      expect(noticeBox).not.toBeNull();
      expect(noticeBox!.y).toBeGreaterThanOrEqual(0);
      expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(viewportSize!.height);
      expect(valuesRetained).toBe(true);
      expect(submitDisabled).toBe(true);
      expect(posts).toBe(3);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
      expect(layout.documentLanguage.toLowerCase().startsWith(locale)).toBe(true);
      expect(pageErrors).toEqual([]);
      expect(unexpectedConsoleErrors).toEqual([]);
    });
  }
}
