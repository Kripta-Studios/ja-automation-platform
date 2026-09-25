import { expect, test, type Page } from '@playwright/test';
import { portal, signIn } from './auth.js';

async function destinationIsVisible(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).toBeFocused();
  await expect
    .poll(async () => {
      const box = await page.locator(selector).boundingBox();
      return box?.y ?? -1;
    })
    .toBeGreaterThanOrEqual(0);
  const box = await page.locator(selector).boundingBox();
  expect(box!.y).toBeLessThan(page.viewportSize()!.height / 2);
}

test('project actions reveal their destination and return controls keep the context', async ({
  page,
}, info) => {
  test.skip(!['desktop', 'phone-390'].includes(info.project.name));
  await signIn(page, 'owner');
  await page.goto(portal('/projects'), { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await destinationIsVisible(page, '[data-project-workflow="new-project"]');
  await expect(page).toHaveURL(/action=new-project/);

  await page.locator('.workspace-actions-disclosure summary').click();
  for (const [label, action] of [
    ['New Client', 'new-client'],
    ['Update Client', 'update-client'],
    ['Assign Worker', 'assign-worker'],
    ['Update Assignment', 'update-assignment'],
    ['Remove Assignment', 'remove-assignment'],
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await destinationIsVisible(page, `[data-project-workflow="${action}"]`);
    await expect(page).toHaveURL(new RegExp(`action=${action}`));
  }

  await page.reload({ waitUntil: 'networkidle' });
  await destinationIsVisible(page, '[data-project-workflow="remove-assignment"]');
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await destinationIsVisible(page, '#project-register');
  await expect(page.locator('#project-register > .ui-card-surface > details')).toHaveAttribute(
    'open',
    '',
  );
  await expect(page).not.toHaveURL(/action=/);

  await page.getByRole('link', { name: 'Assignment history', exact: true }).click();
  await destinationIsVisible(page, '#assignment-history');
  await expect(page.locator('#assignment-history > details')).toHaveAttribute('open', '');
  await expect(page).toHaveURL(/#assignment-history$/);
});
