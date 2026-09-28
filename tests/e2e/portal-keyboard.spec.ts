import { expect, test } from '@playwright/test';
import {
  portalNavigationForRole,
  type PortalRole as NavigationRole,
} from '../../apps/portal/src/lib/portal-navigation.ts';
import { portal, signIn } from './auth.js';

const projects = [
  'phone-360',
  'phone-390',
  'phone-430',
  'tablet-768',
  'tablet-1024',
  'laptop-1280',
  'desktop',
  'wide-1920',
] as const;

const roles = ['worker', 'manager', 'finance', 'owner', 'auditor'] as const;
type TestRole = (typeof roles)[number];

const productionRoleByTestRole: Record<TestRole, NavigationRole> = {
  worker: 'worker',
  manager: 'project_manager',
  finance: 'finance_admin',
  owner: 'owner_admin',
  auditor: 'auditor_read_only',
};

function navigationContract(role: TestRole) {
  return portalNavigationForRole('/j-aautomation', productionRoleByTestRole[role]);
}

function assertProject(projectName: string): void {
  expect(projects).toContain(projectName as (typeof projects)[number]);
}

function captureRuntimeErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  const intentionalResponses: Array<{
    path: string;
    statuses: readonly number[];
    method?: string;
  }> = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) =>
    errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`),
  );
  page.on('response', (response) => {
    const url = new URL(response.url());
    const isApplicationPath =
      url.pathname.startsWith('/j-aautomation/app') || url.pathname.startsWith('/api/');
    if (!isApplicationPath || response.status() < 400) return;
    const allowed = intentionalResponses.some(
      (entry) =>
        url.pathname === entry.path &&
        entry.statuses.includes(response.status()) &&
        (!entry.method || entry.method === response.request().method()),
    );
    if (!allowed) errors.push(`response: ${response.status()} ${response.url()}`);
  });
  return errors;
}

function assertEffectiveFocusStyle(style: {
  outlineWidth: number;
  outlineStyle: string;
  boxShadow: string;
}): void {
  const hasOutline = style.outlineStyle !== 'none' && style.outlineWidth >= 2;
  const hasShadow =
    style.boxShadow !== 'none' &&
    style.boxShadow.split(',').some((layer) => {
      const lengths = [...layer.matchAll(/(-?\d*\.?\d+)px/g)].map((match) =>
        Number.parseFloat(match[1]),
      );
      const blur = lengths[2] ?? 0;
      const spread = lengths[3] ?? 0;
      return Math.max(blur, spread) >= 2;
    });
  expect(hasOutline || hasShadow).toBe(true);
}

async function expectDrawerClosed(
  page: import('@playwright/test').Page,
  menuButton: import('@playwright/test').Locator,
  navigation: import('@playwright/test').Locator,
  options: { focusReturn?: boolean } = {},
): Promise<void> {
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(navigation).not.toHaveClass(/(?:^|\s)open(?:\s|$)/);
  if (options.focusReturn) {
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
      .toBe('Toggle navigation');
  }
  const sequentialDescendants = await navigation
    .locator('a, button, select, input, textarea, [tabindex]')
    .evaluateAll(
      (elements) =>
        elements.filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.hasAttribute('disabled') &&
            !element.closest('[inert]') &&
            element.getAttribute('aria-hidden') !== 'true' &&
            getComputedStyle(element).display !== 'none' &&
            getComputedStyle(element).visibility !== 'hidden',
        ).length,
    );
  expect(sequentialDescendants).toBe(0);
}

async function expectDrawerOpen(
  menuButton: import('@playwright/test').Locator,
  navigation: import('@playwright/test').Locator,
): Promise<void> {
  // The mobile aside remains geometrically visible while it is translated
  // off-canvas. Its explicit state contract, not Locator.isVisible(), proves
  // that the drawer is open.
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation).toHaveClass(/(?:^|\s)open(?:\s|$)/);
  await expect(navigation).not.toHaveAttribute('aria-hidden', 'true');
}

async function expectFocusInside(
  page: import('@playwright/test').Page,
  navigation: import('@playwright/test').Locator,
): Promise<void> {
  await expect
    .poll(() => navigation.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
}

for (const role of roles) {
  test(`${role} responsive drawer has a trapped keyboard lifecycle`, async ({ page }, testInfo) => {
    assertProject(testInfo.project.name);
    const width = page.viewportSize()?.width ?? 0;
    const errors = captureRuntimeErrors(page);
    await signIn(page, role);
    const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
    const navigation = page.locator('#portal-navigation');

    // PortalChrome switches to the off-canvas drawer below 63.99rem
    // (1024px at the evidence root size), including the tablet project.
    if (width < 1024) {
      await expectDrawerClosed(page, menuButton, navigation);
      await expect(menuButton).toHaveAttribute('aria-controls', 'portal-navigation');
      await menuButton.press('Enter');
      await expectDrawerOpen(menuButton, navigation);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              getComputedStyle(document.documentElement).overflow === 'hidden' ||
              getComputedStyle(document.body).overflow === 'hidden',
          ),
        )
        .toBe(true);
      await expectFocusInside(page, navigation);

      const focusableCount = await navigation
        .locator('a, button, select, input, textarea, [tabindex]')
        .evaluateAll(
          (elements) =>
            elements.filter(
              (element) =>
                element.tabIndex >= 0 &&
                !element.hasAttribute('disabled') &&
                getComputedStyle(element).display !== 'none',
            ).length,
        );
      expect(focusableCount).toBeGreaterThan(0);
      for (let index = 0; index < focusableCount + 1; index += 1) {
        await page.keyboard.press('Tab');
        await expectFocusInside(page, navigation);
      }
      await page.keyboard.press('Shift+Tab');
      await expectFocusInside(page, navigation);

      await page.keyboard.press('Escape');
      await expectDrawerClosed(page, menuButton, navigation, { focusReturn: true });
    } else {
      await expect(navigation).toBeVisible();
      const labels = await navigation.locator('.nav-label').allTextContents();
      expect(labels.every((label) => label.trim().length > 1)).toBe(true);
      const firstLink = navigation.locator('a').first();
      await firstLink.focus();
      const focusStyle = await firstLink.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          outlineWidth: Number.parseFloat(style.outlineWidth),
          outlineStyle: style.outlineStyle,
          boxShadow: style.boxShadow,
        };
      });
      assertEffectiveFocusStyle(focusStyle);
    }
    expect(errors).toEqual([]);
  });
}

for (const role of ['worker', 'owner'] as const) {
  test(`${role} drawer closes through Space and the labelled backdrop`, async ({
    page,
  }, testInfo) => {
    assertProject(testInfo.project.name);
    const width = page.viewportSize()?.width ?? 0;
    const errors = captureRuntimeErrors(page);
    await signIn(page, role);
    const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
    const navigation = page.locator('#portal-navigation');
    if (width >= 1024) {
      await expect(navigation).toBeVisible();
      expect(
        (await navigation.locator('.nav-label').allTextContents()).every((label) => label.trim()),
      ).toBe(true);
      expect(errors).toEqual([]);
      return;
    }
    await expectDrawerClosed(page, menuButton, navigation);
    await expect(menuButton).toHaveAttribute('aria-controls', 'portal-navigation');
    await menuButton.press('Space');
    await expectDrawerOpen(menuButton, navigation);
    const backdrop = page.locator('.nav-backdrop');
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveAttribute('aria-label', expect.stringContaining('Close'));
    await backdrop.click({ position: { x: 8, y: 8 } });
    await expectDrawerClosed(page, menuButton, navigation, { focusReturn: true });
    expect(errors).toEqual([]);
  });

  test(`${role} following a drawer link closes the modal and preserves navigation`, async ({
    page,
  }, testInfo) => {
    assertProject(testInfo.project.name);
    const width = page.viewportSize()?.width ?? 0;
    const errors = captureRuntimeErrors(page);
    await signIn(page, role);
    const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
    const navigation = page.locator('#portal-navigation');
    if (width >= 1024) {
      await expect(navigation).toBeVisible();
      const contract = navigationContract(role);
      const target =
        contract.primary.find((item) => item.section === 'time') ?? contract.primary[0];
      if (!target) throw new Error(`No primary navigation target is defined for ${role}`);
      const targetLink = navigation.locator('nav[aria-label="Primary navigation"] a').filter({
        hasText: new RegExp(`^${target.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      });
      await expect(targetLink).toHaveCount(1);
      await targetLink.click();
      const targetHref =
        target.href ?? (target.section === 'today' ? portal('') : portal(`/${target.section}`));
      await expect(page).toHaveURL(targetHref);
      await expect(
        navigation.locator('a[aria-current="page"]').filter({ hasText: target.label }),
      ).toHaveCount(1);
      expect(errors).toEqual([]);
      return;
    }
    await menuButton.press('Enter');
    await expectDrawerOpen(menuButton, navigation);
    await expectFocusInside(page, navigation);
    const contract = navigationContract(role);
    const target = contract.primary.find((item) => item.section === 'time') ?? contract.primary[0];
    if (!target) throw new Error(`No primary navigation target is defined for ${role}`);
    const targetLink = navigation
      .locator('nav[aria-label="Primary navigation"] a')
      .filter({ hasText: new RegExp(`^${target.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
    await expect(targetLink).toHaveCount(1);
    await targetLink.click();
    const targetHref =
      target.href ?? (target.section === 'today' ? portal('') : portal(`/${target.section}`));
    await expect(page).toHaveURL(targetHref);
    await expectDrawerClosed(page, menuButton, navigation, { focusReturn: true });
    await expect(
      page.locator('#portal-navigation a[aria-current="page"]').filter({ hasText: target.label }),
    ).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

type ActiveElementSnapshot = {
  id: string;
  tag: string;
  text: string;
  ariaLabel: string;
  href: string;
  inNavigation: boolean;
  inField: boolean;
  inForm: boolean;
};

async function activeElementSnapshot(
  page: import('@playwright/test').Page,
): Promise<ActiveElementSnapshot> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return {
      id: element?.id ?? '',
      tag: element?.tagName ?? '',
      text: element?.textContent?.trim() ?? '',
      ariaLabel: element?.getAttribute('aria-label') ?? '',
      href: element?.getAttribute('href') ?? '',
      inNavigation: Boolean(element?.closest('#portal-navigation')),
      inField: Boolean(element?.closest('[data-ui="field"]')),
      inForm: Boolean(element?.closest('form')),
    };
  });
}

async function tabUntil(
  page: import('@playwright/test').Page,
  predicate: (snapshot: ActiveElementSnapshot) => boolean,
  description: string,
  maximumTabs = 80,
  sequence?: { absolute: number },
): Promise<{ snapshot: ActiveElementSnapshot; tabs: number; absoluteTabs: number }> {
  for (let tabs = 1; tabs <= maximumTabs; tabs += 1) {
    await page.keyboard.press('Tab');
    if (sequence) sequence.absolute += 1;
    const snapshot = await activeElementSnapshot(page);
    if (predicate(snapshot)) {
      return { snapshot, tabs, absoluteTabs: sequence?.absolute ?? tabs };
    }
  }
  throw new Error(`Tab sequence did not reach ${description} within ${maximumTabs} stops`);
}

async function expectVisibleFocus(locator: import('@playwright/test').Locator): Promise<void> {
  const style = await locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      outlineWidth: Number.parseFloat(computed.outlineWidth),
      outlineStyle: computed.outlineStyle,
      boxShadow: computed.boxShadow,
    };
  });
  assertEffectiveFocusStyle(style);
}

test('keyboard order reaches skip target, shell, navigation, fields, errors and actions', async ({
  page,
}, testInfo) => {
  assertProject(testInfo.project.name);
  const errors = captureRuntimeErrors(page);
  await signIn(page, 'owner');
  const skipLink = page.getByRole('link', { name: /skip to main/i });
  await expect(skipLink).toBeVisible();
  const skipHref = await skipLink.getAttribute('href');
  expect(skipHref).toMatch(/^#/);
  const skipTarget = page.locator(skipHref!);
  await expect(skipTarget).toHaveCount(1);
  await skipLink.focus();
  await skipLink.press('Enter');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? ''))
    .toBe(skipHref!.slice(1));
  await expectVisibleFocus(skipTarget);

  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const shellSequence = { absolute: 0 };
  const firstTab = await tabUntil(
    page,
    (snapshot) => snapshot.href === skipHref,
    'skip link',
    80,
    shellSequence,
  );
  expect(firstTab.snapshot.text.toLowerCase()).toContain('skip');
  const navigation = page.locator('#portal-navigation');
  const width = page.viewportSize()?.width ?? 0;
  if (width < 1024) {
    const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
    const menuStop = await tabUntil(
      page,
      (snapshot) => snapshot.ariaLabel === 'Toggle navigation',
      'navigation toggle',
      80,
      shellSequence,
    );
    expect(menuStop.absoluteTabs).toBeGreaterThan(firstTab.absoluteTabs);
    await expect(menuButton).toHaveAttribute('aria-controls', 'portal-navigation');
    await expect(menuButton).toBeFocused();
    await expectVisibleFocus(menuButton);
    await menuButton.press('Enter');
    await expectDrawerOpen(menuButton, navigation);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            getComputedStyle(document.documentElement).overflow === 'hidden' ||
            getComputedStyle(document.body).overflow === 'hidden',
        ),
      )
      .toBe(true);
    await expectFocusInside(page, navigation);
    const navLink = navigation.locator('a').first();
    await expect(navLink).toBeVisible();
    const openedFocus = await activeElementSnapshot(page);
    expect(openedFocus.inNavigation).toBe(true);
    await page.keyboard.press('Tab');
    expect((await activeElementSnapshot(page)).inNavigation).toBe(true);
    await expectVisibleFocus(page.locator('#portal-navigation :focus').first());
    await page.keyboard.press('Escape');
    await expectDrawerClosed(page, menuButton, navigation, { focusReturn: true });
  } else {
    await expect(navigation).toBeVisible();
    const navStop = await tabUntil(
      page,
      (snapshot) => snapshot.inNavigation,
      'navigation link',
      80,
      shellSequence,
    );
    expect(navStop.absoluteTabs).toBeGreaterThan(firstTab.absoluteTabs);
    await expectVisibleFocus(navigation.locator('a').first());
  }

  await page.goto(portal('/finance'));
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Project finance' })).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const financeSequence = { absolute: 0 };
  const fieldStop = await tabUntil(
    page,
    (snapshot) => snapshot.inField,
    'finance field',
    80,
    financeSequence,
  );
  const activeField = page
    .locator(
      '[data-ui="field"] :focus-visible, [data-ui="field"] input:focus, [data-ui="field"] select:focus, [data-ui="field"] textarea:focus',
    )
    .first();
  await expect(activeField).toBeVisible();
  await expectVisibleFocus(activeField);
  const actionStop = await tabUntil(
    page,
    (snapshot) => snapshot.inForm && snapshot.tag === 'BUTTON',
    'finance form action',
    80,
    financeSequence,
  );
  expect(actionStop.absoluteTabs).toBeGreaterThan(fieldStop.absoluteTabs);
  await expectVisibleFocus(page.locator('form button:focus').first());

  await page.goto(portal('/reports'));
  const fixtureLink = page.locator('main a[href*="/reports/"]').filter({
    hasText: 'Startup support, sensor timing investigation and customer handover notes.',
  });
  await expect(fixtureLink).toHaveCount(1);
  await fixtureLink.click();
  await page.waitForLoadState('networkidle');
  const reportForm = page.locator('form[action*="updateReport"]');
  await expect(reportForm).toBeVisible();
  const invalid = reportForm.locator('textarea[name="summary"]');
  const originalSummary = await invalid.inputValue();
  let invalidPostRequests = 0;
  const invalidRequestListener = (request: import('@playwright/test').Request): void => {
    if (request.method() === 'POST' && request.url().includes('/reports/'))
      invalidPostRequests += 1;
  };
  page.on('request', invalidRequestListener);
  await invalid.fill('');
  await reportForm.getByRole('button', { name: /Save changes and notify reviewers/i }).click();
  await expect.poll(() => invalidPostRequests).toBe(0);
  await expect(page.locator('[data-validation-summary]')).toBeVisible();
  await expect(invalid).toHaveAttribute('aria-invalid', 'true');
  const errorId = await page
    .locator('[data-field-error-for="' + (await invalid.getAttribute('id')) + '"]')
    .getAttribute('id');
  expect(errorId).toBeTruthy();
  await expect(invalid).toHaveAttribute('aria-describedby', expect.stringContaining(errorId!));
  await expectVisibleFocus(invalid);
  const reportSequence = { absolute: 0 };
  const reportAction = await tabUntil(
    page,
    (snapshot) => snapshot.inForm && snapshot.tag === 'BUTTON',
    'report action after invalid field',
    80,
    reportSequence,
  );
  expect(reportAction.absoluteTabs).toBeGreaterThan(0);
  await invalid.fill(originalSummary);
  await expect(
    page.locator('[data-field-error-for="' + (await invalid.getAttribute('id')) + '"]'),
  ).toHaveCount(0);
  page.off('request', invalidRequestListener);
  expect(errors).toEqual([]);
});
