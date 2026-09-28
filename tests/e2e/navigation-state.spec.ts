import { expect, test } from '@playwright/test';
import { portal, signIn } from './auth.js';

test('filtered Clients, Team and Finance views keep the correct navigation destination', async ({
  page,
}) => {
  await signIn(page, 'owner');
  for (const [route, label] of [
    ['/projects?view=clients&status=active&lang=en', 'Clients'],
    ['/projects?view=team&status=active&lang=en', 'Team'],
    ['/finance?view=economic&status=active&lang=en', 'Economic Review'],
    ['/finance?view=commercial&status=active&lang=en', 'Commercial Configuration'],
  ]) {
    await page.goto(portal(route));
    const active = page.locator('#portal-navigation a[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(label);
    if (label === 'Clients' || label === 'Team') {
      await expect(page.locator('.bottom-nav a[aria-current="page"]')).toHaveCount(0);
    }
  }
});

test('personal notifications are reachable through Account and the section navigator', async ({
  page,
}) => {
  await signIn(page, 'worker');
  await page.getByRole('button', { name: 'Account options', exact: true }).click();
  const inbox = page.getByRole('menuitem', { name: 'Notifications', exact: true });
  await expect(inbox).toBeVisible();
  const bounds = await inbox.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await inbox.click();
  await expect(page).toHaveURL(/\/app\/notifications(?:\?|$)/);
  await expect(
    page.getByRole('heading', { name: 'Notifications', exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go to section', exact: true }).click();
  const navigator = page.getByRole('dialog', { name: 'Go to section', exact: true });
  await navigator
    .getByRole('searchbox', { name: 'Find a section', exact: true })
    .fill('Notifications');
  await expect(navigator.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(navigator).not.toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) > 520) {
    const headerInbox = page
      .locator('header')
      .getByRole('link', { name: 'Notifications', exact: true });
    await expect(headerInbox).toHaveAttribute('aria-current', 'page');
    const headerBounds = await headerInbox.boundingBox();
    expect(headerBounds?.width).toBeGreaterThanOrEqual(44);
    expect(headerBounds?.height).toBeGreaterThanOrEqual(44);
  }
});
