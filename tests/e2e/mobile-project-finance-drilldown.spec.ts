import { expect, test, type Locator, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';

const mobileWidths = new Set([360, 390]);
const smokeWidths = new Set([768, 1440]);

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className.toString().slice(0, 100),
          left: Math.round(box.left),
          right: Math.round(box.right),
          width: Math.round(box.width),
        };
      })
      .filter((element) => element.right > viewport + 1)
      .slice(0, 8);
    return {
      viewport,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      offenders,
    };
  });

  expect(dimensions.documentWidth, JSON.stringify(dimensions.offenders)).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
  expect(dimensions.bodyWidth, JSON.stringify(dimensions.offenders)).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
}

async function expectMobileCardAction(
  page: Page,
  region: Locator,
  accessibleName: RegExp,
  hrefForRow: (rowId: string) => string,
): Promise<Locator> {
  await expect(region.locator('[data-table-region-cards]')).toBeVisible();
  await expect(region.locator('[data-table-region-desktop]')).toBeHidden();

  const cards = region.locator('[data-table-region-cards] > article[data-row]');
  await expect(cards).not.toHaveCount(0);

  // The action is intentionally inside its source card. Check every rendered
  // row so an added/filtered row cannot silently lose its authorized detail
  // route or accidentally point at a different project.
  for (let index = 0; index < (await cards.count()); index += 1) {
    const card = cards.nth(index);
    const rowId = await card.getAttribute('data-row');
    expect(rowId).toBeTruthy();
    const actions = card.locator('a[data-card-action]');
    await expect(actions).toHaveCount(1);
    const action = actions.first();
    await expect(action).toBeVisible();
    await expect(action).toHaveAccessibleName(accessibleName);
    await expect(action).toHaveAttribute('href', hrefForRow(rowId!));

    const metrics = await action.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        left: box.left,
        right: box.right,
      };
    });
    expect(metrics.width).toBeGreaterThanOrEqual(44);
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.right).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  }

  const action = cards.first().locator('a[data-card-action]').first();

  const metrics = await action.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      left: box.left,
      right: box.right,
    };
  });
  expect(metrics.width).toBeGreaterThanOrEqual(44);
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);

  await action.focus();
  await expect(action).toBeFocused();
  return action;
}

test.describe('mobile project and finance drill-down cards', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!mobileWidths.has(page.viewportSize()?.width ?? 0), 'Phone-only evidence');
  });

  test('PM project card keeps a keyboard/touch detail link', async ({ page }) => {
    await signIn(page, 'manager');
    await page.goto(portal('/projects'), { waitUntil: 'networkidle' });

    const region = page.locator('[data-ui="table-region"][aria-label="Authorized projects list"]');
    const action = await expectMobileCardAction(
      page,
      region,
      /Open project/i,
      (rowId) => `/j-aautomation/app/projects/${encodeURIComponent(rowId)}`,
    );
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press('Enter');
    await page.waitForURL(/\/j-aautomation\/app\/projects\/[^/?]+$/);
    await expect(page.locator('[data-project-detail]')).toBeVisible();
    await expect(action).not.toBeVisible();
  });

  test('Finance portfolio source card keeps a keyboard/touch authorized-project link', async ({
    page,
  }) => {
    await signIn(page, 'finance');
    await page.goto(portal('/finance'), { waitUntil: 'networkidle' });

    const region = page.locator(
      '[data-ui="table-region"][aria-label="Portfolio finance source table"]',
    );
    const action = await expectMobileCardAction(
      page,
      region,
      /Open source/i,
      (rowId) => `/j-aautomation/app/projects/${encodeURIComponent(rowId)}`,
    );
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press('Enter');
    await page.waitForURL(/\/j-aautomation\/app\/projects\/[^/?]+$/);
    await expect(page.locator('[data-project-detail]')).toBeVisible();
    await expect(action).not.toBeVisible();
  });
});

test.describe('project and finance drill-down table smoke', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!smokeWidths.has(page.viewportSize()?.width ?? 0), 'Tablet/desktop smoke evidence');
  });

  async function expectDesktopTable(page: Page, region: Locator): Promise<void> {
    await expect(region.locator('[data-table-region-desktop]')).toBeVisible();
    await expect(region.locator('[data-table-region-cards]')).toBeHidden();
    await expect(region.locator('table')).toBeVisible();
    const regionBox = await region.boundingBox();
    expect(regionBox).not.toBeNull();
    expect(regionBox!.x).toBeGreaterThanOrEqual(-1);
    expect(regionBox!.x + regionBox!.width).toBeLessThanOrEqual(
      (page.viewportSize()?.width ?? 0) + 1,
    );
  }

  test('PM project table remains readable at tablet and desktop widths', async ({ page }) => {
    await signIn(page, 'manager');
    await page.goto(portal('/projects'), { waitUntil: 'networkidle' });
    const region = page.locator('[data-ui="table-region"][aria-label="Authorized projects list"]');
    await expectDesktopTable(page, region);
    await expectNoHorizontalOverflow(page);
  });

  test('Finance portfolio table remains contained at tablet and desktop widths', async ({
    page,
  }) => {
    await signIn(page, 'finance');
    await page.goto(portal('/finance'), { waitUntil: 'networkidle' });
    const region = page.locator(
      '[data-ui="table-region"][aria-label="Portfolio finance source table"]',
    );
    await expectDesktopTable(page, region);
    await expectNoHorizontalOverflow(page);
  });
});
