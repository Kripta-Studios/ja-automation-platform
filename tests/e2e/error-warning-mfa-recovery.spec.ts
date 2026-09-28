import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';
import { e2eRoot } from './environment.js';

const evidenceDirectory = join(e2eRoot, 'docs/evidence/error-warning-candidate/mfa');
const mfaEndpoint = '**/app/api/security/mfa';
const roleNames = ['owner', 'worker'] as const;
const localeCopy = {
  en: {
    uncertain: 'may have taken effect',
    review: 'Review current MFA status',
    warning: 'Disabling MFA removes the authenticator check',
  },
  es: {
    uncertain: 'podría haberse aplicado',
    review: 'Revisar el estado actual de MFA',
    warning: 'Al desactivar MFA',
  },
  pt: {
    uncertain: 'pode ter sido aplicada',
    review: 'Revisar o estado atual da MFA',
    warning: 'Desativar a MFA',
  },
} as const;

// These tests visit the one-time setup view. A retained trace, page screenshot,
// or video could contain the authenticator URI or recovery codes.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

function runtimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
      errors.push(message.text());
  });
  return errors;
}

async function openProfile(page: Page, role: (typeof roleNames)[number], locale: string) {
  await signIn(page, role);
  await page.goto(portal(`/profile?lang=${locale}#account-mfa`));
  const security = page.locator('#account-mfa');
  await expect(security).toBeVisible();
  await expect(security.locator('.state-tag')).toBeVisible();
  return security;
}

function problemResponse(code: string, messageKey: string, status: number) {
  return {
    status,
    contentType: 'application/json',
    headers: { 'cache-control': 'private, no-store' },
    body: JSON.stringify({
      success: false,
      code,
      messageKey,
      params: {},
      fieldErrors: {},
      remedies: [{ id: 'review_mfa_status' }, { id: 'contact_owner' }],
      correlationId: 'disposable-browser-qa',
    }),
  };
}

function syntheticSetupResponse() {
  // Only for exercising the UI state; the disposable server is not enrolled.
  // Never persist or screenshot these synthetic setup values.
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      enabled: false,
      requiresVerification: true,
      totpURI: 'otpauth://totp/DisposableQA?secret=AAAAAAAAAAAAAAAA',
      backupCodes: ['DISPOSABLE-UI-ONLY'],
    }),
  };
}

for (const viewport of ['phone-390', 'desktop'] as const) {
  for (const role of roleNames) {
    test(`${role} sees a typed MFA code error and retains the field at ${viewport}`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== viewport);
      test.setTimeout(90_000);
      const errors = runtimeErrors(page);
      const security = await openProfile(page, role, 'en');
      const endpointResponses: Array<{ status: number; code: string }> = [];
      await page.route(mfaEndpoint, async (route) => {
        const submitted = JSON.parse(route.request().postData() ?? '{}') as { action?: string };
        if (submitted.action === 'enable') {
          await route.fulfill(syntheticSetupResponse());
          return;
        }
        // The UI submits a complete six-digit entry; force the actual server
        // validation branch without creating or verifying an authenticator.
        const upstream = await route.fetch({
          postData: JSON.stringify({ action: 'verify', code: '12' }),
        });
        const payload = (await upstream.json()) as { code?: string };
        endpointResponses.push({ status: upstream.status(), code: payload.code ?? '' });
        await route.fulfill({ response: upstream });
      });
      await security.locator('.inline-actions button').click();
      const code = security.locator('#profile-mfa-code');
      await expect(code).toBeVisible();
      await code.fill('123456');
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/app/api/security/mfa') &&
          response.request().method() === 'POST' &&
          response.status() === 400,
      );
      await security.locator('.security-setup button[type="submit"]').click();
      const response = await responsePromise;
      expect(((await response.json()) as { code?: string }).code).toBe('MFA_CODE_INVALID');
      const notice = security.locator('[data-profile-mfa-problem] [data-ui="problem-notice"]');
      await expect(notice).toHaveAttribute('data-problem-code', 'MFA_CODE_INVALID');
      await expect(notice).toBeFocused();
      await expect(notice).toContainText('Enter the six-digit code from your authenticator app.');
      await expect(code).toHaveValue('123456');
      await expect(code).toHaveAttribute('aria-invalid', 'true');
      await expect(security.locator('#profile-mfa-code-error')).toContainText(
        'Enter the six-digit code from your authenticator app.',
      );
      await expect(
        notice.getByRole('link', { name: 'Check the authenticator code' }),
      ).toHaveAttribute('href', '#profile-mfa-code');
      expect(endpointResponses).toEqual([{ status: 400, code: 'MFA_CODE_INVALID' }]);
      expect(errors).toEqual([]);
    });

    for (const locale of ['en', 'es', 'pt'] as const) {
      test(`${role} receives ${locale} MFA state-review guidance and disable warning at ${viewport}`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== viewport);
        test.setTimeout(90_000);
        const errors = runtimeErrors(page);
        const security = await openProfile(page, role, locale);
        const responses: Array<{ status: number; code: string }> = [];
        await page.route(mfaEndpoint, async (route) => {
          const payload = problemResponse(
            'MFA_CHANGE_STATE_UNCERTAIN',
            'problem.mfa.changeStateUncertain',
            503,
          );
          responses.push({ status: payload.status, code: 'MFA_CHANGE_STATE_UNCERTAIN' });
          await route.fulfill(payload);
        });
        const enable = security.locator('.inline-actions button');
        await enable.scrollIntoViewIfNeeded();
        const scrollBefore = await page.evaluate(() => window.scrollY);
        const responsePromise = page.waitForResponse(
          (response) =>
            response.url().includes('/app/api/security/mfa') &&
            response.request().method() === 'POST' &&
            response.status() === 503,
        );
        await enable.click();
        const response = await responsePromise;
        expect(((await response.json()) as { code?: string }).code).toBe(
          'MFA_CHANGE_STATE_UNCERTAIN',
        );
        const notice = security.locator('[data-profile-mfa-problem] [data-ui="problem-notice"]');
        await expect(notice).toHaveAttribute('data-problem-code', 'MFA_CHANGE_STATE_UNCERTAIN');
        await expect(notice).toHaveAttribute('data-kind', 'service');
        await expect(notice).toBeFocused();
        await expect(notice).toContainText(localeCopy[locale].uncertain);
        const reviewUrl = new URL(portal(`/profile?lang=${locale}#account-mfa`));
        await expect(security.locator('a[data-sveltekit-reload]')).toHaveAttribute(
          'href',
          `${reviewUrl.pathname}${reviewUrl.search}${reviewUrl.hash}`,
        );
        await expect(security.locator('a[data-sveltekit-reload]')).toHaveText(
          localeCopy[locale].review,
        );
        await expect(security.locator('.state-tag')).toBeVisible();
        await expect(enable).toBeDisabled();
        const scrollAfter = await page.evaluate(() => window.scrollY);
        expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(
          page.viewportSize()?.height ?? 900,
        );
        await expect
          .poll(() =>
            notice.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.top >= -2 && bounds.bottom <= innerHeight + 2;
            }),
          )
          .toBe(true);
        if (viewport === 'phone-390') {
          const noticeBounds = await notice.boundingBox();
          const navigationBounds = await page.locator('.bottom-nav').boundingBox();
          expect(noticeBounds).not.toBeNull();
          expect(navigationBounds).not.toBeNull();
          expect(noticeBounds!.y + noticeBounds!.height).toBeLessThanOrEqual(
            navigationBounds!.y - 4,
          );
          for (const toast of await page.locator('[data-ui="toast"]').all()) {
            const toastBounds = await toast.boundingBox();
            if (!toastBounds) continue;
            const overlaps =
              noticeBounds!.x < toastBounds.x + toastBounds.width &&
              noticeBounds!.x + noticeBounds!.width > toastBounds.x &&
              noticeBounds!.y < toastBounds.y + toastBounds.height &&
              noticeBounds!.y + noticeBounds!.height > toastBounds.y;
            expect(overlaps).toBe(false);
          }
        }
        expect(responses).toEqual([{ status: 503, code: 'MFA_CHANGE_STATE_UNCERTAIN' }]);

        // The disposable offline-sync fixture is unrelated to the MFA notice.
        for (const dismiss of await page
          .locator('[data-ui="toast-region"] .ui-toast-dismiss')
          .all()) {
          await dismiss.click();
        }
        await expect(page.locator('[data-ui="toast-region"]')).toHaveCount(0);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        mkdirSync(evidenceDirectory, { recursive: true });
        writeFileSync(
          join(evidenceDirectory, `${role}-${locale}-${viewport}-uncertain.png`),
          await notice.screenshot(),
        );
        writeFileSync(
          join(evidenceDirectory, `${role}-${locale}-${viewport}-uncertain.json`),
          `${JSON.stringify(
            {
              role,
              locale,
              viewport,
              status: 503,
              code: 'MFA_CHANGE_STATE_UNCERTAIN',
              noticeFocused: true,
              reviewLink: true,
              scrollDelta: scrollAfter - scrollBefore,
              screenshotScope: 'notice only; no setup URI, recovery code, cookie, or credential',
            },
            null,
            2,
          )}\n`,
        );

        await page.unroute(mfaEndpoint);
        await page.route(mfaEndpoint, async (route) => {
          const submitted = JSON.parse(route.request().postData() ?? '{}') as { action?: string };
          if (submitted.action === 'enable') await route.fulfill(syntheticSetupResponse());
          else
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ enabled: true, verified: true }),
            });
        });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
          security.locator('a[data-sveltekit-reload]').click(),
        ]);
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(reviewUrl.href);
        await expect(enable).toBeEnabled();
        const setupResponsePromise = page.waitForResponse(
          (response) =>
            response.url().includes('/app/api/security/mfa') &&
            response.request().method() === 'POST' &&
            response.request().postDataJSON()?.action === 'enable',
        );
        await enable.click();
        expect((await setupResponsePromise).status()).toBe(200);
        await security.locator('#profile-mfa-code').fill('123456');
        await security.locator('.security-setup button[type="submit"]').click();
        await expect(security.locator('.state-tag')).toBeVisible();
        await expect(security.locator('[data-mfa-disable-warning]')).toContainText(
          localeCopy[locale].warning,
        );
        await expect(security.locator('.inline-actions button')).toBeVisible();
        // The warning must precede the destructive control in document order.
        expect(
          await security.locator('[data-mfa-disable-warning]').evaluate((warning) => {
            const button = warning.parentElement?.querySelector('.inline-actions button');
            return button
              ? Boolean(warning.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
              : false;
          }),
        ).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
}
