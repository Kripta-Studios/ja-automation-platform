import { expect, test } from '@playwright/test';
import { e2eCredentials } from '../../tests/e2e/auth';

const portal = (value: string) => `http://127.0.0.1:4174/j-aautomation/app${value}`;

test('Today façade and navigation remain usable after decomposition', async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('requestfailed', (request) =>
    browserErrors.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`),
  );

  await page.goto(portal('/login'));
  await page.getByLabel('Work email').fill(e2eCredentials.owner.email);
  await page.getByLabel('Password').fill(e2eCredentials.owner.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await expect(page).toHaveURL(portal(''));
  await expect(page.getByRole('heading', { name: 'Field operations overview' })).toBeVisible();

  const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
  const todayLink = primaryNavigation.getByRole('link', { name: 'Today' });
  const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
  if (await menuButton.isVisible()) {
    await menuButton.click();
    await expect(todayLink).toBeVisible();
    await expect(primaryNavigation.getByRole('link', { name: 'Projects' })).toBeVisible();
  } else {
    await expect(todayLink).toBeVisible();
  }

  if ((page.viewportSize()?.width ?? 0) >= 1000) {
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    await expect(dashboardLink).toBeVisible();
    await expect(page.getByRole('link', { name: 'PLC / Technical' })).toBeVisible();
  }

  const layout = await page.evaluate(() => ({
    innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
  testInfo.annotations.push({ type: 'layout', description: JSON.stringify(layout) });
  expect(browserErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('today-parity.png'), fullPage: true });
});

test('worker offline Save draft persists once and refreshes the queue', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');

  await page.goto(portal('/login'));
  await page.getByLabel('Work email').fill(e2eCredentials.worker.email);
  await page.getByLabel('Password').fill(e2eCredentials.worker.password);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await expect(page).toHaveURL(portal(''));
  await page.goto(portal('/time'));
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistrations()).length > 0,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await page.context().setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();

  const time = page.locator('form[action="?/createTime"]');
  await time.locator('select[name="projectId"]').selectOption({ index: 1 });
  await time.locator('input[name="workDate"]').fill('2026-08-20');
  await time.locator('select[name="category"]').selectOption('regular');
  await time.locator('input[name="minutes"]').fill('45');
  await time.locator('textarea[name="summary"]').fill('WP-A1 offline queue regression.');
  await time.getByRole('button', { name: 'Save draft' }).click();

  await expect(page.getByText('Offline — saved on this device')).toBeVisible();
  await expect(page.getByText('Offline draft could not be saved on this device.')).toHaveCount(0);
  await expect(page.getByText(/1 queued/)).toBeVisible();
  await expect(time.locator('textarea[name="summary"]')).toHaveValue('');

  const queuedMutations = await page.evaluate(async () => {
    const request = indexedDB.open('ja-portal-user-cache', 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const countRequest = database.transaction('mutations').objectStore('mutations').count();
    const count = await new Promise<number>((resolve, reject) => {
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });
    database.close();
    return count;
  });
  expect(queuedMutations).toBe(1);

  await page.context().setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect(page.getByText(/1 synced/)).toBeVisible({ timeout: 15_000 });
});
