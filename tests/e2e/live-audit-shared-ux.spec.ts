import { expect, test, type Locator } from '@playwright/test';
import { portal, signIn } from './auth.js';

async function sidebarContrast(control: Locator, property = 'color'): Promise<number> {
  return control.evaluate((element, propertyName) => {
    const sidebar = element.closest('aside')!;
    const rgb = (value: string) => value.match(/[\d.]+/gu)!.map(Number);
    const base = rgb(getComputedStyle(sidebar).backgroundColor);
    const background = rgb(getComputedStyle(element).backgroundColor);
    const alpha = background[3] ?? 1;
    const surface = background
      .slice(0, 3)
      .map((channel, index) => channel * alpha + base[index] * (1 - alpha));
    const ink = rgb(getComputedStyle(element).getPropertyValue(propertyName));
    const luminance = (channels: number[]) => {
      const linear = channels.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const values = [luminance(ink), luminance(surface)].sort((a, b) => a - b);
    return (values[1] + 0.05) / (values[0] + 0.05);
  }, property);
}

test('sidebar dropdown icons, submenu labels and keyboard focus contrast with their surfaces', async ({
  page,
}) => {
  await signIn(page, 'owner');
  await page.goto(portal('/projects?lang=en'), { waitUntil: 'networkidle' });
  const sidebar = page.locator('#portal-navigation');
  const bounds = await sidebar.boundingBox();
  if (!bounds || bounds.x < 0)
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
  const toggle = sidebar.getByRole('button', { name: 'Sections: Projects', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await expect.poll(() => sidebarContrast(toggle)).toBeGreaterThanOrEqual(3);
  await toggle.hover();
  await expect.poll(() => sidebarContrast(toggle)).toBeGreaterThanOrEqual(3);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => sidebarContrast(toggle)).toBeGreaterThanOrEqual(3);
  const submenu = sidebar.locator(`#${await toggle.getAttribute('aria-controls')}`);
  const links = submenu.getByRole('link');
  await expect(links.first()).toBeVisible();
  for (const link of await links.all()) {
    await expect.poll(() => sidebarContrast(link)).toBeGreaterThanOrEqual(4.5);
  }
  await page.keyboard.press('Tab');
  await toggle.focus();
  await expect(toggle).toHaveCSS('outline-style', 'solid');
  await expect.poll(() => sidebarContrast(toggle, 'outline-color')).toBeGreaterThanOrEqual(3);
});

// These regressions were found by interacting with the deployed portal on 29 September.
test('auditors are identified accurately in every chrome and language', async ({ page }) => {
  await signIn(page, 'auditor');
  for (const [lang, label] of [
    ['en', 'Auditor'],
    ['es', 'Auditor'],
    ['pt', 'Auditor'],
  ]) {
    for (const route of ['/profile', '/help']) {
      await page.goto(portal(`${route}?lang=${lang}`));
      const account = page.locator('button.account-trigger');
      await expect(account).toContainText(label);
      await expect(account).not.toContainText(/\bAdmin\b/u);
    }
  }
});

for (const role of ['owner', 'finance'] as const) {
  test(`${role} project workflows keep client and team directories in their dedicated views`, async ({
    page,
  }) => {
    await signIn(page, role);
    for (const action of ['', '?action=new-project']) {
      await page.goto(portal(`/projects${action}`));
      await expect(
        page.getByRole('heading', { name: 'Authorized projects', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Team access', exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Client contacts', exact: true })).toHaveCount(
        0,
      );
      await expect(page.locator('.worker-card')).toHaveCount(0);
      const links = page.locator('main .project-workflow-actions');
      await expect(links.getByRole('link', { name: 'Client contacts', exact: true })).toBeVisible();
      await expect(links.getByRole('link', { name: 'Team access', exact: true })).toBeVisible();
    }
    await page.goto(portal('/projects?view=clients'));
    await expect(page.getByRole('heading', { name: 'Client contacts', exact: true })).toBeVisible();
    await page.goto(portal('/projects?view=team'));
    await expect(page.getByRole('heading', { name: 'Team access', exact: true })).toBeVisible();
  });
}
