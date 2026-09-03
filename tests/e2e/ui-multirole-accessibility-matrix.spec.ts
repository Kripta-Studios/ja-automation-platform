import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  portalNavigationForRole,
  type PortalRole,
} from '../../apps/portal/src/lib/portal-navigation.ts';
import { portal, signIn } from './auth.js';

/**
 * Client Essential UI evidence is intentionally limited to the four release
 * widths.  The Playwright config also contains risk-smoke projects (430,
 * 1024, 1280 and 1920); the focused matrix must not silently turn those into
 * additional release requirements.
 */
const requiredProjects = new Set(['phone-360', 'phone-390', 'tablet-768', 'desktop']);

// Each role intentionally audits four or five authenticated surfaces with a
// full axe scan plus layout, focus and touch-target checks. Production builds
// on Windows can legitimately exceed Playwright's 30-second default without
// any individual assertion timing out.
test.describe.configure({ timeout: 60_000 });

const knownSvelteKitHistoryWarning =
  "Avoid using `history.pushState(...)` and `history.replaceState(...)` as these will conflict with SvelteKit's router. Use the `pushState` and `replaceState` imports from `$app/navigation` instead.";

type TestRole = 'worker' | 'manager' | 'finance' | 'owner' | 'auditor';

type Surface = Readonly<{
  path: string;
  marker: string;
  heading?: RegExp;
}>;

const productionRole: Record<TestRole, PortalRole> = {
  worker: 'worker',
  manager: 'project_manager',
  finance: 'finance_admin',
  owner: 'owner_admin',
  auditor: 'auditor_read_only',
};

/**
 * These are role-owned surfaces, not a list of every route the server happens
 * to expose.  Keeping the map explicit prevents an axe pass for a route that
 * the role is not entitled to use from being mistaken for role coverage.
 */
const surfaces: Record<TestRole, readonly Surface[]> = {
  worker: [
    { path: '/', marker: 'main', heading: /Today/u },
    { path: '/time', marker: 'main', heading: /Time entries|Time/u },
    { path: '/expenses', marker: 'main', heading: /Expenses/u },
    { path: '/reports', marker: 'main', heading: /Reports/u },
    { path: '/pay', marker: 'main', heading: /Worker statement|My Pay/u },
  ],
  manager: [
    { path: '/projects', marker: '[data-ui="project-section"]', heading: /Projects/u },
    { path: '/projects?view=team', marker: '[data-team-directory]', heading: /Team/u },
    { path: '/approvals', marker: 'main', heading: /Approvals/u },
    { path: '/reports', marker: 'main', heading: /Reports/u },
  ],
  finance: [
    {
      path: '/finance?view=overview',
      marker: '[data-ui="finance-overview"]',
      heading: /Finance overview/u,
    },
    { path: '/billing', marker: '[data-ui="billing-section"]', heading: /Billing/u },
    {
      path: '/ledger',
      marker: '[data-ui="collections-ledger-section"]',
      heading: /Collections \/ Ledger/u,
    },
    { path: '/accounting', marker: '[data-ui="accounting-section"]', heading: /Accounting/u },
  ],
  owner: [
    {
      path: '/projects?view=clients',
      marker: '[data-client-directory]',
      heading: /Clients/u,
    },
    { path: '/projects?view=team', marker: '[data-team-directory]', heading: /Team/u },
    {
      path: '/finance?view=overview',
      marker: '[data-ui="finance-overview"]',
      heading: /Finance overview/u,
    },
    { path: '/billing', marker: '[data-ui="billing-section"]', heading: /Billing/u },
    { path: '/accounting', marker: '[data-ui="accounting-section"]', heading: /Accounting/u },
  ],
  auditor: [
    {
      path: '/finance?view=overview',
      marker: '[data-ui="finance-overview"]',
      heading: /Finance overview/u,
    },
    {
      path: '/ledger',
      marker: '[data-ui="collections-ledger-section"]',
      heading: /Collections \/ Ledger/u,
    },
    { path: '/accounting', marker: '[data-ui="accounting-section"]', heading: /Accounting/u },
    { path: '/audit', marker: 'main', heading: /Audit/u },
    { path: '/profile', marker: '.security-panel', heading: /Profile/u },
  ],
};

function assertRequiredProject(projectName: string): void {
  expect(
    requiredProjects.has(projectName),
    `UI matrix must run only in a named Client Essential project; received ${projectName}`,
  ).toBe(true);
}

function captureRuntimeProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text() === knownSvelteKitHistoryWarning) return;
    if (message.type() === 'error' || message.type() === 'warning')
      problems.push(`console ${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) =>
    problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`),
  );
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (
      response.status() >= 400 &&
      (url.pathname.startsWith('/j-aautomation/app') || url.pathname.startsWith('/api/'))
    )
      problems.push(`response ${response.status()}: ${response.url()}`);
  });
  return problems;
}

async function expectNoAxeViolations(page: Page, context: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations, `${context}: ${JSON.stringify(result.violations, null, 2)}`).toEqual(
    [],
  );
}

async function expectNoHorizontalOverflow(page: Page, context: string): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const visibleOffenders = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const box = element.getBoundingClientRect();
        let ancestor = element.parentElement;
        let clippedByIntentionalScrollRegion = false;
        while (ancestor && ancestor !== document.body) {
          const ancestorStyle = getComputedStyle(ancestor);
          const ancestorBox = ancestor.getBoundingClientRect();
          if (
            ['auto', 'scroll', 'hidden', 'clip'].includes(ancestorStyle.overflowX) &&
            ancestorBox.right <= viewport + 1 &&
            box.right > ancestorBox.right + 1
          ) {
            clippedByIntentionalScrollRegion = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        if (clippedByIntentionalScrollRegion) return false;
        // A closed mobile navigation is deliberately translated to the left;
        // only a right-edge escape is visible overflow that can break layout.
        return box.right > viewport + 1;
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: element.className.toString().slice(0, 120),
          left: Math.round(box.left),
          right: Math.round(box.right),
          width: Math.round(box.width),
        };
      })
      .slice(0, 12);
    return {
      viewport,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      visibleOffenders,
    };
  });
  expect(
    dimensions.documentWidth,
    `${context}: ${JSON.stringify(dimensions.visibleOffenders, null, 2)}`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(
    dimensions.bodyWidth,
    `${context}: ${JSON.stringify(dimensions.visibleOffenders, null, 2)}`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.visibleOffenders, `${context}: visible element escaped the viewport`).toEqual(
    [],
  );
}

async function expectNoInteractiveVerticalClipping(page: Page, context: string): Promise<void> {
  const offenders = await page.evaluate(() => {
    const selector =
      'main a[href], main button, main summary, main input, main select, main textarea, main [role="button"], main [role="tab"]';
    const maxScrollY = Math.max(
      0,
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    const overlays = [...document.querySelectorAll<HTMLElement>('body *')].filter((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return (
        (style.position === 'fixed' || style.position === 'sticky') &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none' &&
        box.width > 0 &&
        box.height > 0
      );
    });
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0 &&
          box.bottom > 0 &&
          box.top < innerHeight
        );
      })
      .flatMap((element) => {
        const box = element.getBoundingClientRect();
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== document.body) {
          const style = getComputedStyle(ancestor);
          if (style.overflowY === 'hidden' || style.overflowY === 'clip') {
            const ancestorBox = ancestor.getBoundingClientRect();
            if (box.top < ancestorBox.top - 1 || box.bottom > ancestorBox.bottom + 1) {
              return [
                {
                  kind: 'clipped',
                  tag: element.tagName.toLowerCase(),
                  label: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim(),
                  top: Math.round(box.top),
                  bottom: Math.round(box.bottom),
                  ancestor: ancestor.className.toString().slice(0, 100),
                },
              ];
            }
          }
          ancestor = ancestor.parentElement;
        }
        const overlay = overlays.find((candidate) => {
          if (candidate === element || candidate.contains(element) || element.contains(candidate))
            return false;
          const overlayBox = candidate.getBoundingClientRect();
          const intersects =
            box.left < overlayBox.right - 1 &&
            box.right > overlayBox.left + 1 &&
            box.top < overlayBox.bottom - 1 &&
            box.bottom > overlayBox.top + 1;
          if (!intersects) return false;
          const minPossibleTop = box.top - Math.max(0, maxScrollY - scrollY);
          const maxPossibleTop = box.top + scrollY;
          const canMoveAbove = minPossibleTop + box.height <= overlayBox.top - 1;
          const canMoveBelow = maxPossibleTop >= overlayBox.bottom + 1;
          return !canMoveAbove && !canMoveBelow;
        });
        return overlay
          ? [
              {
                kind: 'overlapped',
                tag: element.tagName.toLowerCase(),
                label: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim(),
                top: Math.round(box.top),
                bottom: Math.round(box.bottom),
                ancestor: overlay.className.toString().slice(0, 100),
              },
            ]
          : [];
      })
      .slice(0, 20);
  });
  expect(offenders, `${context}: vertically clipped or overlapped controls`).toEqual([]);
}

async function expectRoleNavigation(page: Page, role: TestRole): Promise<void> {
  const expectedNavigation = portalNavigationForRole('/j-aautomation', productionRole[role]);
  const expectedLabels = [
    ...expectedNavigation.primary,
    ...expectedNavigation.secondary,
    ...expectedNavigation.admin,
    ...expectedNavigation.security,
  ].map((item) => item.label);
  expectedLabels.push('Company Webmail');
  const navigation = page.locator('#portal-navigation');
  await expect(navigation).toBeVisible();
  const width = page.viewportSize()?.width ?? 0;
  if (width < 1024) {
    const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(navigation).toHaveClass(/(?:^|\s)open(?:\s|$)/u);
    await expectNoAxeViolations(page, `${role} open navigation`);
    await expectNoHorizontalOverflow(page, `${role} open navigation`);
  }
  const labels = (await navigation.locator('.nav-label').allTextContents()).map((item) =>
    item.trim(),
  );
  expect(labels, `${role}: navigation labels must match its allowlist`).toEqual(expectedLabels);
  expect(
    labels.every((label) => label.length > 1),
    `${role}: a nav label was clipped`,
  ).toBe(true);
  if (width < 1024) {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Toggle navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  }
}

async function expectKeyboardFocus(page: Page, context: string): Promise<void> {
  const target = page
    .locator('main a[href], main button, main input, main select, main textarea, main summary')
    .first();
  await expect(target, `${context}: expected at least one keyboard target`).toBeVisible();
  await target.focus();
  await expect(target).toBeFocused();
  const focusStyle = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    };
  });
  const hasOutline = focusStyle.outlineStyle !== 'none' && focusStyle.outlineWidth >= 2;
  const hasShadow =
    focusStyle.boxShadow !== 'none' &&
    [...focusStyle.boxShadow.matchAll(/(-?\d*\.?\d+)px/g)].some(
      (match) => Number.parseFloat(match[1] ?? '0') >= 2,
    );
  expect(hasOutline || hasShadow, `${context}: focus must be visibly rendered`).toBe(true);
}

async function expectPhoneTouchTargets(page: Page, context: string): Promise<void> {
  const targets = await page
    .locator(
      'main a[href], main button, main summary, main input, main select, main textarea, main [role="button"], main [role="tab"]',
    )
    .evaluateAll((items) =>
      items
        .filter((item) => {
          const element = item as HTMLElement;
          const style = getComputedStyle(element);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            element.getClientRects().length > 0 &&
            !element.closest('[aria-hidden="true"]')
          );
        })
        .map((item) => {
          const element = item as HTMLElement;
          const input = element instanceof HTMLInputElement ? element : null;
          const activationTarget =
            input && (input.type === 'checkbox' || input.type === 'radio')
              ? (input.labels?.item(0) ?? input.closest('label') ?? element)
              : element;
          const box = activationTarget.getBoundingClientRect();
          return {
            label: (
              element.getAttribute('aria-label') ??
              activationTarget.textContent ??
              element.textContent ??
              ''
            ).trim(),
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        }),
    );
  expect(targets, `${context}: expected actionable touch targets`).not.toEqual([]);
  expect(
    targets.filter((target) => target.width < 44 || target.height < 44),
    `${context}: touch targets below 44px: ${JSON.stringify(targets)}`,
  ).toEqual([]);
}

async function expectReducedMotion(page: Page, context: string): Promise<void> {
  const violations = await page.evaluate(() => {
    const parseMaxMs = (value: string): number =>
      value
        .split(',')
        .map((entry) => {
          const number = Number.parseFloat(entry.trim());
          return entry.trim().endsWith('s') && !entry.trim().endsWith('ms')
            ? number * 1000
            : number;
        })
        .reduce((max, value) => Math.max(max, Number.isFinite(value) ? value : 0), 0);
    return [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className.toString().slice(0, 80),
          animationMs: parseMaxMs(style.animationDuration),
          transitionMs: parseMaxMs(style.transitionDuration),
        };
      })
      .filter((item) => item.animationMs > 0.01 || item.transitionMs > 0.01)
      .slice(0, 20);
  });
  expect(violations, `${context}: reduced-motion violations`).toEqual([]);
}

for (const role of Object.keys(surfaces) as TestRole[]) {
  test(`${role} Client Essential surfaces pass axe, responsive and keyboard matrix`, async ({
    page,
  }, testInfo) => {
    test.skip(
      !requiredProjects.has(testInfo.project.name),
      'Client Essential matrix is represented at 360/390/768/1440; other configured projects are risk smoke checks.',
    );
    assertRequiredProject(testInfo.project.name);
    const problems = captureRuntimeProblems(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
      .toBe(true);
    await signIn(page, role);
    await expectRoleNavigation(page, role);

    const width = page.viewportSize()?.width ?? 0;
    for (const surface of surfaces[role]) {
      const context = `${role} ${testInfo.project.name} ${surface.path}`;
      await page.goto(portal(surface.path), { waitUntil: 'networkidle' });
      await expect(page.locator(surface.marker), `${context}: route marker`).toBeVisible();
      if (surface.heading)
        await expect(page.getByRole('heading', { name: surface.heading }).first()).toBeVisible();
      await expectNoAxeViolations(page, context);
      await expectNoHorizontalOverflow(page, context);
      await expectNoInteractiveVerticalClipping(page, context);
      await expectKeyboardFocus(page, context);
      if (width <= 390) await expectPhoneTouchTargets(page, context);
      await expectReducedMotion(page, context);
    }
    expect(problems, `${role} ${testInfo.project.name} runtime problems`).toEqual([]);
  });
}
