import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';
import {
  portalNavigationForRole,
  type PortalRole,
} from '../../apps/portal/src/lib/portal-navigation.ts';

const auditorRoleLabel = 'Read-only Auditor';
const readOnlyRoutes = [
  { path: '/finance?view=overview', marker: '[data-ui="finance-overview"]' },
  { path: '/finance?view=economic', marker: '[data-ui="finance-overview"]' },
  { path: '/ledger', marker: '[data-ui="collections-ledger-section"]' },
  { path: '/accounting', marker: '[data-ui="accounting-section"]' },
  { path: '/audit', marker: 'main' },
  { path: '/profile', marker: '.security-panel' },
] as const;

function captureBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) =>
    errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`),
  );
  return errors;
}

function expectedNavigationLabels(role: PortalRole): string[] {
  const navigation = portalNavigationForRole('/j-aautomation', role);
  return [
    ...navigation.primary,
    ...navigation.secondary,
    ...navigation.admin,
    ...navigation.security,
  ]
    .map((item) => item.label)
    .concat('Company Webmail');
}

async function expectNoBusinessMutationForms(page: Page): Promise<void> {
  const mutationForms = await page.locator('form').evaluateAll((forms) =>
    forms
      .map((form) => ({
        method: (form.getAttribute('method') ?? 'get').toLowerCase(),
        action: form.getAttribute('action') ?? '',
      }))
      .filter(
        ({ method, action }) =>
          method === 'post' ||
          /\?\/(?:create|update|delete|approve|review|issue|void|record|save|set|toggle|finalize|close|build|send|revoke)/iu.test(
            action,
          ),
      ),
  );
  expect(mutationForms, 'Auditor business surfaces must not expose server write forms').toEqual([]);

  const submitButtons = await page.locator('button[type="submit"]').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const form = (button as HTMLButtonElement).form;
        if (!form) return true;
        const method = (
          button.getAttribute('formmethod') ??
          form.getAttribute('method') ??
          'get'
        ).toLowerCase();
        const action = button.getAttribute('formaction') ?? form.getAttribute('action') ?? '';
        return (
          method === 'post' ||
          /\?\/(?:create|update|delete|approve|review|issue|void|record|save|set|toggle|finalize|close|build|send|revoke)/iu.test(
            action,
          )
        );
      })
      .map((button) => button.textContent?.trim() ?? '')
      .filter(Boolean),
  );
  expect(
    submitButtons,
    'Auditor business surfaces must not expose mutation submit controls',
  ).toEqual([]);
}

type MotionSnapshot = {
  elements: number;
  animated: number;
  transitioned: number;
  violations: Array<{
    tag: string;
    className: string;
    animationName: string;
    animationDuration: string;
    transitionProperty: string;
    transitionDuration: string;
  }>;
};

function parseTimeMs(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return value.trim().endsWith('s') && !value.trim().endsWith('ms') ? parsed * 1000 : parsed;
}

async function motionSnapshot(page: Page): Promise<MotionSnapshot> {
  return page.evaluate(() => {
    const parseTimeMs = (value: string): number => {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) return 0;
      return value.trim().endsWith('s') && !value.trim().endsWith('ms') ? parsed * 1000 : parsed;
    };
    const durationMax = (value: string): number =>
      value
        .split(',')
        .map((part) => parseTimeMs(part.trim()))
        .reduce((max, candidate) => Math.max(max, candidate), 0);
    const elements = [...document.querySelectorAll<HTMLElement>('body *')];
    const snapshots = elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        transitionProperty: style.transitionProperty,
        transitionDuration: style.transitionDuration,
        animationMs: durationMax(style.animationDuration),
        transitionMs: durationMax(style.transitionDuration),
      };
    });
    const motionElements = snapshots.filter(
      (snapshot) =>
        snapshot.animationName !== 'none' ||
        (snapshot.transitionProperty !== 'none' && snapshot.transitionMs > 0),
    );
    return {
      elements: elements.length,
      animated: snapshots.filter((snapshot) => snapshot.animationName !== 'none').length,
      transitioned: snapshots.filter(
        (snapshot) => snapshot.transitionProperty !== 'none' && snapshot.transitionMs > 0,
      ).length,
      violations: motionElements
        .filter((snapshot) => snapshot.animationMs > 0.01 || snapshot.transitionMs > 0.01)
        .map(
          ({
            tag,
            className,
            animationName,
            animationDuration,
            transitionProperty,
            transitionDuration,
          }) => ({
            tag,
            className,
            animationName,
            animationDuration,
            transitionProperty,
            transitionDuration,
          }),
        ),
    };
  });
}

test('Auditor authenticates into the authorized read-only workspace', async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await signIn(page, 'auditor');
  await expect(page).toHaveURL(/\/j-aautomation\/app\/finance\?view=overview$/u);

  const account = page.getByRole('button', { name: 'Account options' });
  await expect(account).toBeVisible();
  await account.click();
  const accountMenu = page.getByRole('menu', { name: 'Account options' });
  await expect(accountMenu).toBeVisible();
  await expect(accountMenu).toContainText(auditorRoleLabel);
  await account.press('Escape');

  const expectedLabels = expectedNavigationLabels('auditor_read_only');
  const navigation = page.locator('#portal-navigation');
  await expect(navigation).toBeVisible();
  await expect(navigation.locator('.nav-label').allTextContents()).resolves.toEqual(expectedLabels);
  await expect(navigation.locator('.nav-label', { hasText: 'My Pay' })).toHaveCount(0);
  await expect(navigation.locator('.nav-label', { hasText: 'Billing' })).toHaveCount(0);
  await expect(navigation.locator('.nav-label', { hasText: 'Approvals' })).toHaveCount(0);

  for (const route of readOnlyRoutes) {
    const response = await page.goto(portal(route.path), { waitUntil: 'networkidle' });
    expect(response?.status(), `Auditor route ${route.path} should be readable`).toBe(200);
    await expect(page.locator(route.marker)).toBeVisible();
    await expectNoBusinessMutationForms(page);
  }

  const workerPayResponse = await page.request.get(portal('/pay'));
  expect(workerPayResponse.status(), 'Auditor must not access private Worker Pay').toBe(403);
  const workerStatementResponse = await page.request.get(portal('/api/worker-statement'));
  expect(
    workerStatementResponse.status(),
    'Auditor must not access private Worker Statements',
  ).toBe(403);
  expect(await workerStatementResponse.text()).not.toMatch(/artifact|compensation|statement/iu);
  expect(errors).toEqual([]);
});

test('Auditor surfaces honor prefers-reduced-motion dynamically', async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await signIn(page, 'auditor');
  await page.goto(portal('/finance?view=overview'), { waitUntil: 'networkidle' });
  await expect(page.locator('[data-ui="finance-overview"]')).toBeVisible();
  const baseline = await motionSnapshot(page);
  expect(baseline.elements).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
    .toBe(true);

  for (const route of readOnlyRoutes.slice(0, 4)) {
    await page.goto(portal(route.path), { waitUntil: 'networkidle' });
    await expect(page.locator(route.marker)).toBeVisible();
    const reduced = await motionSnapshot(page);
    expect(reduced.elements).toBeGreaterThan(0);
    expect(
      reduced.violations,
      `Reduced-motion violations on ${route.path}: ${JSON.stringify(reduced.violations)}`,
    ).toEqual([]);
  }

  // On a phone the navigation drawer is the most motion-sensitive surface. Its computed style
  // must also collapse to the reduced-motion budget when opened after emulation changes.
  if ((page.viewportSize()?.width ?? 0) <= 430) {
    const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    const drawerMotion = await page.locator('#portal-navigation').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        transitionDuration: style.transitionDuration,
        animationDuration: style.animationDuration,
      };
    });
    expect(parseTimeMs(drawerMotion.transitionDuration)).toBeLessThanOrEqual(0.01);
    expect(parseTimeMs(drawerMotion.animationDuration)).toBeLessThanOrEqual(0.01);
  }
  expect(errors).toEqual([]);
});
